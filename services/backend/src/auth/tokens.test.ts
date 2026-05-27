import { describe, expect, it } from 'vitest';
import { createMagicLinkToken, signJwt, verifyJwt, verifyMagicLinkToken } from './tokens.js';

const SECRET = 'a'.repeat(64);

describe('JWT', () => {
  it('round-trips claims', () => {
    const token = signJwt({ sub: 'u1', org: 'o1', role: 'technician' }, SECRET, 900, 1000);
    const claims = verifyJwt(token, SECRET, 1000);
    expect(claims.sub).toBe('u1');
    expect(claims.org).toBe('o1');
    expect(claims.exp).toBe(1900);
  });

  it('rejects a tampered payload', () => {
    const token = signJwt({ sub: 'u1', org: 'o1', role: 'technician' }, SECRET);
    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from('{"sub":"admin"}').toString('base64url')}.${s}`;
    expect(() => verifyJwt(forged, SECRET)).toThrow(/invalid signature/);
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'u1', org: 'o1', role: 'technician' }, SECRET, 60, 1000);
    expect(() => verifyJwt(token, SECRET, 2000)).toThrow(/expired/);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'u1', org: 'o1', role: 'technician' }, SECRET);
    expect(() => verifyJwt(token, 'b'.repeat(64))).toThrow(/invalid signature/);
  });
});

describe('magic-link token', () => {
  it('round-trips the email', () => {
    const token = createMagicLinkToken('maya.wu@eonreality.com', SECRET, 900, 1000);
    expect(verifyMagicLinkToken(token, SECRET, 1000).email).toBe('maya.wu@eonreality.com');
  });

  it('rejects expiry', () => {
    const token = createMagicLinkToken('x@y.com', SECRET, 60, 1000);
    expect(() => verifyMagicLinkToken(token, SECRET, 2000)).toThrow(/expired/);
  });

  it('rejects tampering', () => {
    const token = createMagicLinkToken('x@y.com', SECRET, 900, 1000);
    const bad = Buffer.from(
      Buffer.from(token, 'base64url').toString('utf8').replace('x@y.com', 'admin@y.com'),
    ).toString('base64url');
    expect(() => verifyMagicLinkToken(bad, SECRET, 1000)).toThrow(/invalid/);
  });
});
