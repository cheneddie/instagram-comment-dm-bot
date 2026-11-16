// 資料清理排程（spec.md 第 20 節「資料清理」）：
// - 超過 30 天的原始 Webhook Payload：清空 raw_payload（保留列與統計欄位）。
// - 超過 180 天的詳細 API Attempt：整列刪除（彙總統計在 automation_runs 上，不受影響）。
// - 過期的登入限流窗口：全域刪除（rate-limit.ts 的機會性清理只涵蓋當前 IP）。
// - 過去日窗的送出限額計數（send_counters）。
// 皆以有界批次執行，避免單次 cron 撞上 D1 逐語句限制。
import { inArray, lt, ne, and, isNotNull, or } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from '../database/schema';
import { apiAttempts, auditLogs, automationRuns, loginRateLimits, sendCounters, webhookEvents } from '../database/schema';
import { loginWindowStart } from '../security/rate-limit';
import { taipeiDayWindowStart } from '../automation/send-gate';

type SchemaDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;

export const WEBHOOK_PAYLOAD_RETENTION_DAYS = 30;
export const API_ATTEMPT_RETENTION_DAYS = 180;
export const AUTOMATION_RUN_PII_RETENTION_DAYS = 90;
export const AUDIT_IP_RETENTION_DAYS = 180;
// 03:00 Asia/Taipei = 19:00 UTC（台灣無日光節約時間）。
export const CLEANUP_CRON = '0 19 * * *';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;
// 單類資料每次 cron 最多處理的批次數；清不完的留給下一天（避免無界執行時間）。
const MAX_BATCHES = 20;

export interface CleanupResult {
  webhookPayloadsCleared: number;
  apiAttemptsDeleted: number;
  automationRunPiiRedacted: number;
  auditIpsRedacted: number;
  loginRateLimitRowsDeleted: number;
  sendCounterRowsDeleted: number;
}

export function scheduledJobForCron(cron: string): 'cleanup' | 'sync' {
  return cron === CLEANUP_CRON ? 'cleanup' : 'sync';
}

export async function runDataCleanup(
  db: SchemaDb,
  nowMs: number = Date.now(),
  opts: { batchSize?: number } = {},
): Promise<CleanupResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const payloadCutoff = new Date(nowMs - WEBHOOK_PAYLOAD_RETENTION_DAYS * DAY_MS).toISOString();
  const attemptCutoff = new Date(nowMs - API_ATTEMPT_RETENTION_DAYS * DAY_MS).toISOString();
  const piiCutoff = new Date(nowMs - AUTOMATION_RUN_PII_RETENTION_DAYS * DAY_MS).toISOString();
  const auditCutoff = new Date(nowMs - AUDIT_IP_RETENTION_DAYS * DAY_MS).toISOString();

  // 1. 清空過期 webhook payload（保留列）。
  let webhookPayloadsCleared = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(and(lt(webhookEvents.receivedAt, payloadCutoff), ne(webhookEvents.rawPayload, '{}')))
      .limit(batchSize);
    if (batch.length === 0) break;
    const ids = batch.map((r) => r.id);
    await db
      .update(webhookEvents)
      .set({ rawPayload: '{}' })
      .where(inArray(webhookEvents.id, ids));
    webhookPayloadsCleared += ids.length;
    if (batch.length < batchSize) break;
  }

  // 2. 刪除過期 api_attempts。
  let apiAttemptsDeleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await db
      .select({ id: apiAttempts.id })
      .from(apiAttempts)
      .where(lt(apiAttempts.startedAt, attemptCutoff))
      .limit(batchSize);
    if (batch.length === 0) break;
    const ids = batch.map((r) => r.id);
    await db.delete(apiAttempts).where(inArray(apiAttempts.id, ids));
    apiAttemptsDeleted += ids.length;
    if (batch.length < batchSize) break;
  }

  // 3. 自動化歷史仍保留狀態與統計，但超過 90 天的留言者資料不可永久落地。
  let automationRunPiiRedacted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await db
      .select({ id: automationRuns.id })
      .from(automationRuns)
      .where(and(
        lt(automationRuns.createdAt, piiCutoff),
        or(isNotNull(automationRuns.commenterId), isNotNull(automationRuns.commenterUsername),
          isNotNull(automationRuns.originalCommentText), isNotNull(automationRuns.normalizedCommentText)),
      ))
      .limit(batchSize);
    if (batch.length === 0) break;
    await db.update(automationRuns).set({
      commenterId: null,
      commenterUsername: null,
      originalCommentText: null,
      normalizedCommentText: null,
    }).where(inArray(automationRuns.id, batch.map((r) => r.id)));
    automationRunPiiRedacted += batch.length;
    if (batch.length < batchSize) break;
  }

  // 4. 超過 180 天的登入/設定稽核 IP 匿名化，避免長期保存可識別資訊。
  let auditIpsRedacted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await db.select({ id: auditLogs.id }).from(auditLogs)
      .where(and(lt(auditLogs.createdAt, auditCutoff), isNotNull(auditLogs.ipAddress)))
      .limit(batchSize);
    if (batch.length === 0) break;
    await db.update(auditLogs).set({ ipAddress: null })
      .where(inArray(auditLogs.id, batch.map((r) => r.id)));
    auditIpsRedacted += batch.length;
    if (batch.length < batchSize) break;
  }

  // 5. 全域刪除過期登入限流窗口（單條 DELETE 即可，表很小且有 window 上限語意）。
  const currentLoginWindow = loginWindowStart(nowMs);
  const loginDeleted = await db
    .delete(loginRateLimits)
    .where(lt(loginRateLimits.windowStart, currentLoginWindow))
    .returning({ id: loginRateLimits.id });
  const loginRateLimitRowsDeleted = loginDeleted.length;

  // 6. 刪除過去日窗的送出限額計數（含舊分鐘窗；今日日窗與今日分鐘窗保留）。
  const todayStart = taipeiDayWindowStart(nowMs);
  const counterDeleted = await db
    .delete(sendCounters)
    .where(lt(sendCounters.windowStart, todayStart))
    .returning({ id: sendCounters.id });
  const sendCounterRowsDeleted = counterDeleted.length;

  console.log(
    `[cleanup] payloads=${webhookPayloadsCleared} attempts=${apiAttemptsDeleted} ` +
      `runPii=${automationRunPiiRedacted} auditIPs=${auditIpsRedacted} ` +
      `loginBuckets=${loginRateLimitRowsDeleted} sendCounters=${sendCounterRowsDeleted}`,
  );
  return { webhookPayloadsCleared, apiAttemptsDeleted, automationRunPiiRedacted, auditIpsRedacted, loginRateLimitRowsDeleted, sendCounterRowsDeleted };
}
