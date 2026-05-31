import { describe, expect, it } from 'vitest';
import { auditEnv, describeEnv, formatEntry } from './env-audit.js';

describe('describeEnv', () => {
  it('marks an absent var', () => {
    const e = describeEnv('FOO', undefined);
    expect(e.present).toBe(false);
    expect(e.length).toBe(0);
    expect(e.prefix).toBe('');
    expect(e.suffix).toBe('');
  });

  it('shows prefix and suffix for a present var without leaking the middle', () => {
    const e = describeEnv('DATABASE_URL', 'postgresql://user:supersecret@host/db?sslmode=require');
    expect(e.present).toBe(true);
    expect(e.length).toBe(53);
    expect(e.prefix).toBe('postgres');
    expect(e.suffix).toBe('uire');
    expect(JSON.stringify(e)).not.toContain('supersecret');
  });

  it('detects a placeholder', () => {
    const e = describeEnv('FOO', '<your-key-here>');
    expect(e.placeholder).toBe(true);
  });

  it('handles short values without exposing more than length allows', () => {
    const e = describeEnv('PORT', '3000');
    expect(e.prefix).toBe('3000');
    expect(e.suffix).toBe('');
  });
});

describe('auditEnv', () => {
  it('returns an entry for every critical key', () => {
    const audit = auditEnv({});
    const names = audit.map((e) => e.name);
    expect(names).toContain('DATABASE_URL');
    expect(names).toContain('REDIS_URL');
    expect(names).toContain('JWT_SIGNING_SECRET');
    expect(names).toContain('USE_MOCK_VERIFIER');
    expect(names).toContain('ADMIN_SETUP_TOKEN');
  });
});

describe('formatEntry', () => {
  it('prints MISSING for an absent key', () => {
    expect(formatEntry(describeEnv('X', undefined))).toBe('X: MISSING');
  });

  it('prints PLACEHOLDER for a `<...>` value', () => {
    expect(formatEntry(describeEnv('X', '<your-key-here>'))).toContain('PLACEHOLDER');
  });

  it('prints prefix+suffix for a real value', () => {
    const line = formatEntry(describeEnv('FOO', 'abcdefghijklmnop'));
    expect(line).toContain('prefix="abcdefgh"');
    expect(line).toContain('suffix="mnop"');
  });
});
