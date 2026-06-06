import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_JWT_KEY,
  AUTH_ORG_KEY,
  AUTH_USER_KEY,
  clearAuth,
  decodeJwtPayload,
  isJwtExpired,
  loadAuth,
  parseSessionFromHash,
  parseTokenFromHash,
  storeAuth,
} from './auth';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

afterEach(() => {
  window.localStorage.clear();
});

describe('parseTokenFromHash', () => {
  it('extracts token from #/auth/verify?token=abc', () => {
    expect(parseTokenFromHash('#/auth/verify?token=abc123')).toBe('abc123');
  });

  it('returns null for other routes', () => {
    expect(parseTokenFromHash('#/live')).toBeNull();
    expect(parseTokenFromHash('')).toBeNull();
    expect(parseTokenFromHash('#/auth/verify')).toBeNull();
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

  it('returns null for unrelated hashes', () => {
    expect(parseSessionFromHash('#/live')).toBeNull();
    expect(parseSessionFromHash('')).toBeNull();
  });

  it('returns null when session= is empty', () => {
    expect(parseSessionFromHash('#/auth/verify?session=')).toBeNull();
  });
});

describe('decodeJwtPayload', () => {
  it('decodes a base64url JWT body', () => {
    const jwt = makeJwt({ sub: 'u1', org: 'o1', role: 'trainer', iat: 0, exp: 999 });
    expect(decodeJwtPayload(jwt)).toMatchObject({ sub: 'u1', org: 'o1', role: 'trainer' });
  });

  it('returns null on malformed token', () => {
    expect(decodeJwtPayload('not.a.jwt.too.many.dots')).toBeNull();
    expect(decodeJwtPayload('abc')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('treats exp in the past as expired', () => {
    expect(isJwtExpired(makeJwt({ exp: 100 }), 200)).toBe(true);
  });
  it('treats exp in the future as fresh', () => {
    expect(isJwtExpired(makeJwt({ exp: 9999 }), 0)).toBe(false);
  });
  it('treats malformed tokens as expired', () => {
    expect(isJwtExpired('garbage')).toBe(true);
  });
});

describe('storeAuth / loadAuth / clearAuth', () => {
  const payload = {
    jwt: makeJwt({ sub: 'u1', org: 'o1', role: 'trainer', exp: 9_999_999_999 }),
    user: { id: 'u1', email: 'a@b.com', fullName: 'A B', role: 'trainer' },
    org: { id: 'o1' },
  };

  it('round-trips through localStorage', () => {
    storeAuth(payload);
    expect(localStorage.getItem(AUTH_JWT_KEY)).toBe(payload.jwt);
    expect(loadAuth()).toEqual(payload);
  });

  it('returns null when no JWT is stored', () => {
    expect(loadAuth()).toBeNull();
  });

  it('returns null when the stored JWT has expired', () => {
    storeAuth({ ...payload, jwt: makeJwt({ exp: 1 }) });
    expect(loadAuth()).toBeNull();
  });

  it('clearAuth removes all three keys', () => {
    storeAuth(payload);
    clearAuth();
    expect(localStorage.getItem(AUTH_JWT_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_ORG_KEY)).toBeNull();
  });
});
