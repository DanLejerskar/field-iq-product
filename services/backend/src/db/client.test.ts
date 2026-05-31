import { describe, expect, it } from 'vitest';
import { sanitizeDatabaseUrl } from './client.js';

describe('sanitizeDatabaseUrl', () => {
  it('strips channel_binding=require so postgres-js does not choke', () => {
    const out = sanitizeDatabaseUrl(
      'postgresql://u:p@h/db?sslmode=require&channel_binding=require',
    );
    expect(out).not.toContain('channel_binding');
    expect(out).toContain('sslmode=require');
  });

  it('preserves the rest of the URL byte-for-byte (modulo URL normalisation)', () => {
    const out = sanitizeDatabaseUrl('postgresql://u:p@h:5432/db?sslmode=require');
    expect(out).toContain('postgresql://u:p@h:5432/db');
    expect(out).toContain('sslmode=require');
  });

  it('returns the raw string when the URL is unparseable (caller surfaces the error)', () => {
    expect(sanitizeDatabaseUrl('not-a-url')).toBe('not-a-url');
  });

  it('is a no-op when channel_binding is absent', () => {
    const url = 'postgresql://u:p@h/db?sslmode=require';
    expect(sanitizeDatabaseUrl(url)).toContain('sslmode=require');
  });
});
