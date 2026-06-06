import { describe, expect, it } from 'vitest';
import {
  decodeJwtPayload,
  isJwtExpired,
  parseSessionFromHash,
  parseTokenFromHash,
} from './auth.js';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('parseTokenFromHash', () => {
  it('extracts token from #/auth/verify?token=abc', () => {
    expect(parseTokenFromHash('#/auth/verify?token=abc123')).toBe('abc123');
  });
  it('returns null for unrelated hashes', () => {
    expect(parseTokenFromHash('#/foo')).toBeNull();
    expect(parseTokenFromHash('')).toBeNull();
  });
  it('returns null when token is empty', () => {
    expect(parseTokenFromHash('#/auth/verify?token=')).toBeNull();
  });
  it('returns null when only session is present', () => {
    expect(parseTokenFromHash('#/auth/verify?session=abc')).toBeNull();
  });
});

describe('parseSessionFromHash', () => {
  it('extracts session from #/auth/verify?session=jwt', () => {
    expect(parseSessionFromHash('#/auth/verify?session=eyJ.x.y')).toBe('eyJ.x.y');
  });
  it('returns null on the legacy token URL', () => {
    expect(parseSessionFromHash('#/auth/verify?token=abc')).toBeNull();
  });
  it('returns null when session is empty', () => {
    expect(parseSessionFromHash('#/auth/verify?session=')).toBeNull();
  });
});

describe('decodeJwtPayload', () => {
  it('decodes base64url payload', () => {
    const jwt = makeJwt({ sub: 'u', exp: 1 });
    expect(decodeJwtPayload(jwt)).toMatchObject({ sub: 'u', exp: 1 });
  });
  it('returns null for malformed tokens', () => {
    expect(decodeJwtPayload('a.b')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('past exp → expired', () => {
    expect(isJwtExpired(makeJwt({ exp: 1 }), 2)).toBe(true);
  });
  it('future exp → fresh', () => {
    expect(isJwtExpired(makeJwt({ exp: 9999 }), 0)).toBe(false);
  });
});
