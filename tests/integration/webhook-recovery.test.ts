import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/database/schema';
import { recoverPendingWebhooks } from '../../src/webhook/recover-pending';
import { applyMigrations, createD1Shim } from '../helpers/d1-shim';

let sqlite: Database.Database;
let enqueued: unknown[];
let env: Parameters<typeof recoverPendingWebhooks>[0];

beforeEach(() => {
  sqlite = new Database(':memory:');
  applyMigrations(sqlite, join(__dirname, '../../drizzle/migrations'));
  enqueued = [];
  env = {
    DB: createD1Shim(sqlite),
    COMMENT_QUEUE: { send: async (m: unknown) => { enqueued.push(m); } },
  } as unknown as Parameters<typeof recoverPendingWebhooks>[0];
});

function seed(status: string, lastReceivedAt?: string) {
  return drizzle(sqlite, { schema }).insert(schema.webhookEvents).values({
    id: status,
    eventKey: 'event:' + status,
    eventType: 'comments',
    instagramAccountId: 'account-1',
    instagramMediaId: 'media-1',
    instagramCommentId: 'comment-1',
    rawPayload: '{}',
    signatureValid: 1,
    status,
    lastReceivedAt,
  }).run();
}

describe('recoverPendingWebhooks', () => {
  it('dispatches previously received events and marks them queued', async () => {
    await seed('received');
    expect(await recoverPendingWebhooks(env)).toBe(1);
    expect(enqueued).toHaveLength(1);
    expect((await drizzle(sqlite, { schema }).select().from(schema.webhookEvents))[0].status).toBe('queued');
    expect(await recoverPendingWebhooks(env)).toBe(0);
    expect(enqueued).toHaveLength(1);
  });

  it('does not take over a fresh dispatching lease', async () => {
    await seed('dispatching', new Date().toISOString());
    expect(await recoverPendingWebhooks(env)).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it('recovers a stale dispatching lease after 2 minutes', async () => {
    await seed('dispatching', '2026-01-01T00:00:00.000Z');
    expect(await recoverPendingWebhooks(env)).toBe(1);
    expect(enqueued).toHaveLength(1);
  });

  it('keeps failed Queue delivery recoverable', async () => {
    await seed('received');
    env.COMMENT_QUEUE = { send: async () => { throw new Error('simulated queue outage'); } } as never;
    await expect(recoverPendingWebhooks(env)).rejects.toThrow('simulated queue outage');
    const rows = await drizzle(sqlite, { schema }).select().from(schema.webhookEvents);
    expect(rows[0].status).toBe('received');
  });
});
