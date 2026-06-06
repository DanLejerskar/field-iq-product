import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimitService.js';

describe('RateLimiter', () => {
  it('allows up to maxRequests in a window', () => {
    const t = 1_000_000;
    const rl = new RateLimiter({ windowMs: 10_000, maxRequests: 3, now: () => t });
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(false);
  });

  it('does not record the rejected hit, so the window slides cleanly', () => {
    let t = 1_000_000;
    const rl = new RateLimiter({ windowMs: 10_000, maxRequests: 3, now: () => t });
    for (let i = 0; i < 3; i++) rl.allow('a');
    expect(rl.allow('a')).toBe(false);
    t += 11_000; // entire window expires
    expect(rl.allow('a')).toBe(true);
  });

  it('isolates keys', () => {
    const t = 1_000_000;
    const rl = new RateLimiter({ windowMs: 10_000, maxRequests: 1, now: () => t });
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('b')).toBe(true);
    expect(rl.allow('a')).toBe(false);
  });

  it('slides forward as oldest hit ages out', () => {
    let t = 0;
    const rl = new RateLimiter({ windowMs: 10_000, maxRequests: 2, now: () => t });
    rl.allow('a'); // t=0
    t = 4_000;
    rl.allow('a'); // t=4000
    expect(rl.allow('a')).toBe(false); // t=4000, 2 in window
    t = 10_001; // first hit (t=0) ages out
    expect(rl.allow('a')).toBe(true);
  });

  it('reset(key) drops only that key', () => {
    const t = 0;
    const rl = new RateLimiter({ windowMs: 10_000, maxRequests: 1, now: () => t });
    rl.allow('a');
    rl.allow('b');
    rl.reset('a');
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('b')).toBe(false);
  });

  it('rejects invalid construction args', () => {
    expect(() => new RateLimiter({ windowMs: 0, maxRequests: 1 })).toThrow();
    expect(() => new RateLimiter({ windowMs: 1, maxRequests: 0 })).toThrow();
  });
});
