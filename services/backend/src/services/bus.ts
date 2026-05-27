/**
 * Redis-backed event bus + verification queue.
 *  - Publishes session events on pub/sub (consumed by the WebSocket gateway, M4).
 *  - Keeps a short, capped per-channel history list for reconnect replay (last_event_id).
 *  - Enqueues verification jobs onto a Redis Stream consumed by the Python verifier (M5)
 *    or the in-process mock verifier (M3).
 */
import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { orgChannel, sessionChannel, type SessionEventEnvelope } from './events.js';

export const VERIFY_QUEUE = 'verify-queue';
const HISTORY_MAX = 50;

export interface VerificationJob {
  sessionId: string;
  orgId: string;
  stepId: string;
  stepNumber: number;
  photoKey: string;
  verificationPrompt: string;
}

let pub: Redis | undefined;

function redis(): Redis {
  if (!pub) pub = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  return pub;
}

export async function publishSessionEvent(event: SessionEventEnvelope): Promise<void> {
  const r = redis();
  const payload = JSON.stringify(event);
  await Promise.all([
    r.publish(sessionChannel(event.sessionId), payload),
    r.publish(orgChannel(event.orgId), payload),
    r.rpush(`history:${sessionChannel(event.sessionId)}`, payload),
    r.ltrim(`history:${sessionChannel(event.sessionId)}`, -HISTORY_MAX, -1),
  ]);
}

/** Events after `lastEventId` for reconnect replay. */
export async function replaySessionEvents(
  sessionId: string,
  lastEventId: number,
): Promise<SessionEventEnvelope[]> {
  const raw = await redis().lrange(`history:${sessionChannel(sessionId)}`, 0, -1);
  return raw
    .map((s) => JSON.parse(s) as SessionEventEnvelope)
    .filter((e) => e.eventId > lastEventId);
}

export async function enqueueVerification(job: VerificationJob): Promise<void> {
  await redis().xadd(VERIFY_QUEUE, '*', 'job', JSON.stringify(job));
}

export function getRedis(): Redis {
  return redis();
}

export async function closeBus(): Promise<void> {
  if (pub) {
    await pub.quit();
    pub = undefined;
  }
}
