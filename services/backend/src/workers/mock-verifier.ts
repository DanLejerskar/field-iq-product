/**
 * Mock verifier (M3): drains the verify-queue Redis Stream and returns verified=true after
 * a short delay, so the full session loop works without Claude. Gated by USE_MOCK_VERIFIER.
 * The real Python worker (M5) consumes the same queue with `claude-sonnet-4-6`.
 */
import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { VERIFY_QUEUE, type VerificationJob } from '../services/bus.js';
import { recordVerdict } from '../services/session-service.js';
import type { VerificationResult } from '@field-iq/schema';

const GROUP = 'mock-verifier';
const CONSUMER = 'mock-1';

export function startMockVerifier(logger: {
  info: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
}): { stop: () => Promise<void> } {
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  let running = true;

  void redis.xgroup('CREATE', VERIFY_QUEUE, GROUP, '$', 'MKSTREAM').catch(() => {
    // BUSYGROUP — group already exists; fine.
  });

  async function loop(): Promise<void> {
    while (running) {
      try {
        const res = (await redis.xreadgroup(
          'GROUP',
          GROUP,
          CONSUMER,
          'COUNT',
          1,
          'BLOCK',
          2000,
          'STREAMS',
          VERIFY_QUEUE,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [entryId, fields] of entries) {
            const jobJson = fields[fields.indexOf('job') + 1];
            if (!jobJson) continue;
            const job = JSON.parse(jobJson) as VerificationJob;
            await new Promise((r) => setTimeout(r, 800));
            const result: VerificationResult = {
              verified: true,
              confidence: 'high',
              message: `Step ${job.stepNumber} verified (mock).`,
              detail: 'USE_MOCK_VERIFIER=true — no Claude call was made.',
            };
            await recordVerdict(job.sessionId, job.stepNumber, result, { mock: true });
            await redis.xack(VERIFY_QUEUE, GROUP, entryId);
            logger.info({ sessionId: job.sessionId, step: job.stepNumber }, 'mock verdict');
          }
        }
      } catch (err) {
        logger.error({ err: String(err) }, 'mock verifier loop error');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  void loop();
  return {
    async stop() {
      running = false;
      await redis.quit();
    },
  };
}
