// Queue Consumer 進入點：把 Cloudflare Queue batch 逐則餵給引擎，並依結果 ack / retry。
import type { MessageBatch } from '@cloudflare/workers-types';
import type { AppBindings } from '../app';
import { processCommentEvent, processStoryReplyEvent, type EngineDeps } from '../automation/engine';
import { MetaClient } from '../meta/client';
import { resolveMetaBaseUrl } from '../meta/config';
import { createLogger } from '../monitoring/logger';
import type { CommentEventMessage } from './producer';

export async function consumeCommentEvents(
  batch: MessageBatch<CommentEventMessage>,
  env: AppBindings,
): Promise<void> {
  const { createDb } = await import('../database/client');
  const deps: EngineDeps = {
    db: createDb(env.DB),
    metaClient: new MetaClient({
      accessToken: env.INSTAGRAM_ACCOUNT_ACCESS_TOKEN,
      graphApiVersion: env.META_GRAPH_API_VERSION,
      baseUrl: resolveMetaBaseUrl(env.META_LOGIN_MODE, env.META_BASE_URL),
    }),
  };

  const logger = createLogger(env.LOG_LEVEL as never);
  for (const msg of batch.messages) {
    try {
      const outcome =
        msg.body.eventType === 'story_reply'
          ? await processStoryReplyEvent(deps, msg.body)
          : await processCommentEvent(deps, msg.body);
      if (outcome.kind === 'skipped') {
        // 明確記錄略過原因，避免 Queue 顯示 Ok 卻不知道為什麼沒有 DM。
        logger.info({ action: `automation.skipped.${outcome.reason}`, webhookEventId: msg.body.webhookEventId });
      } else if (outcome.kind === 'no_match') {
        logger.debug({ action: 'automation.no_match', webhookEventId: msg.body.webhookEventId });
      }
      if (outcome.kind === 'retry' && outcome.delaySeconds !== null) {
        msg.retry({ delaySeconds: outcome.delaySeconds });
      } else {
        msg.ack();
      }
    } catch {
      // 不寫出事件 body / Token；重試用盡後由 Dead Letter Queue 留存待人工稽核。
      logger.error({ action: 'queue.consume_failed', webhookEventId: msg.body.webhookEventId });
      msg.retry();
    }
  }
}
