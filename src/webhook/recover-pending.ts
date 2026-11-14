// 每五分鐘修復 Webhook → Queue 非原子操作留下的 pending 事件。
// 只重排尚未入列，或 dispatching 超過兩分鐘（前一個 Worker 已中斷）的事件。
import { and, eq, lt, or } from 'drizzle-orm';
import type { AppBindings } from '../app';
import { createDb } from '../database/client';
import { webhookEvents } from '../database/schema';
import { enqueueCommentEvent } from '../queue/producer';

export async function recoverPendingWebhooks(env: AppBindings, nowMs = Date.now()): Promise<number> {
  const db = createDb(env.DB);
  const staleBefore = new Date(nowMs - 120_000).toISOString();
  const pending = await db.select().from(webhookEvents)
    .where(or(eq(webhookEvents.status, 'received'),
      and(eq(webhookEvents.status, 'dispatching'), lt(webhookEvents.lastReceivedAt, staleBefore))))
    .limit(100);
  let recovered = 0;
  for (const ev of pending) {
    const claimed = await db.update(webhookEvents)
      .set({ status: 'dispatching', lastReceivedAt: new Date(nowMs).toISOString() })
      .where(and(eq(webhookEvents.id, ev.id), eq(webhookEvents.status, ev.status)))
      .returning({ id: webhookEvents.id });
    if (!claimed[0]) continue;
    try {
      await enqueueCommentEvent(env.COMMENT_QUEUE, {
        webhookEventId: ev.id,
        eventKey: ev.eventKey,
        instagramAccountId: ev.instagramAccountId,
        instagramMediaId: ev.instagramMediaId,
        instagramCommentId: ev.instagramCommentId,
        eventType: ev.eventType === 'story_reply' ? 'story_reply' : 'comments',
      });
      await db.update(webhookEvents).set({ status: 'queued' }).where(eq(webhookEvents.id, ev.id));
      recovered += 1;
    } catch (error) {
      await db.update(webhookEvents).set({ status: 'received' })
        .where(and(eq(webhookEvents.id, ev.id), eq(webhookEvents.status, 'dispatching')));
      throw error;
    }
  }
  return recovered;
}
