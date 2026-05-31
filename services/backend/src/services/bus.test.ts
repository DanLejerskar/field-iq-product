import { describe, expect, it } from 'vitest';
import { buildRedisOptions } from './bus.js';

describe('buildRedisOptions', () => {
  it('enables TLS explicitly for rediss:// URLs (Upstash)', () => {
    const opts = buildRedisOptions('rediss://default:secret@x.upstash.io:6379');
    expect(opts.tls).toEqual({});
  });

  it('does not set TLS for plain redis:// URLs (local dev)', () => {
    const opts = buildRedisOptions('redis://localhost:6379');
    expect(opts.tls).toBeUndefined();
  });

  it('keeps maxRetriesPerRequest=null and bounds connectTimeout', () => {
    const opts = buildRedisOptions('redis://localhost:6379');
    expect(opts.maxRetriesPerRequest).toBeNull();
    expect(opts.connectTimeout).toBeGreaterThan(0);
    expect(opts.connectTimeout).toBeLessThanOrEqual(30_000);
  });
});
