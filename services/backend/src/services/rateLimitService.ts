/**
 * In-memory sliding-window rate limiter.
 *
 * Per-key (e.g. one email address) we track the timestamps of the last
 * `maxRequests` allowed calls; on each `allow()` we prune anything outside
 * the window and decide. This is fine for a single backend process during
 * the pilot — the limit exists to discourage stuffing, not to harden
 * against a distributed attacker. Swap to Redis when we scale.
 */

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  /** Override `Date.now` for tests. */
  now?: () => number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly nowFn: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor({ windowMs, maxRequests, now }: RateLimiterOptions) {
    if (windowMs <= 0) throw new Error('windowMs must be > 0');
    if (maxRequests <= 0) throw new Error('maxRequests must be > 0');
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.nowFn = now ?? (() => Date.now());
  }

  /**
   * Returns true and records the hit if the key is under the cap; returns
   * false (and does NOT record) otherwise. The non-recording behaviour
   * matters: rejected hits don't push the window forward, so a hammered
   * key recovers cleanly once the oldest valid hit ages out.
   */
  allow(key: string): boolean {
    const now = this.nowFn();
    const cutoff = now - this.windowMs;
    const existing = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (existing.length >= this.maxRequests) {
      this.hits.set(key, existing);
      return false;
    }
    existing.push(now);
    this.hits.set(key, existing);
    return true;
  }

  /** Test helper: drop the entire window for a key. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Test helper: clear everything. */
  clear(): void {
    this.hits.clear();
  }
}
