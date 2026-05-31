/**
 * Redis-backed event bus + verification queue.
 *  - Publishes session events on pub/sub (consumed by the WebSocket gateway, M4).
 *  - Keeps a short, capped per-channel history list for reconnect replay (last_event_id).
 *  - Enqueues verification jobs onto a Redis Stream consumed by the Python verifier (M5)
 *    or the in-process mock verifier (M3).
 */
import { Redis, type RedisOptions } from 'ioredis';
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

/**
 * Build the ioredis options Upstash + local Redis both need.
 *
 *  - `maxRetriesPerRequest: null` keeps commands queued until the client
 *    eventually connects (matches Phase-1 behaviour, doesn't 500 mid-request).
 *  - `connectTimeout: 10_000` fails fast when the network can't reach Upstash
 *    so /health surfaces a real error instead of hanging.
 *  - For `rediss://` URLs we pass `tls: {}` explicitly even though ioredis
 *    auto-enables TLS on the scheme — belt-and-braces against any version
 *    where URL parsing drops the flag.
 */
export function buildRedisOptions(url: string): RedisOptions {
  const tls = url.startsWith('rediss://') ? {} : undefined;
  return {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    ...(tls ? { tls } : {}),
  };
}

let pub: Redis | undefined;

function redis(): Redis {
  if (!pub) pub = new Redis(config.redisUrl, buildRedisOptions(config.redisUrl));
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

/** A dedicated connection for pub/sub subscription (ioredis enters subscriber mode). */
export function createSubscriber(): Redis {
  return new Redis(config.redisUrl, buildRedisOptions(config.redisUrl));
}

export async function closeBus(): Promise<void> {
  if (pub) {
    await pub.quit();
    pub = undefined;
  }
}
