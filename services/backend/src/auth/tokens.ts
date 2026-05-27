/**
 * HS256 JWTs and magic-link tokens, built on node:crypto (no external JWT dep).
 * Pure functions — unit-tested in tokens.test.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  sub: string; // user id
  org: string; // org id
  role: string;
  /** seconds since epoch */
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 15 * 60,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const full: JwtClaims = { ...claims, iat: now, exp: now + ttlSeconds };
  const payload = b64url(JSON.stringify(full));
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, payload, signature] = parts as [string, string, string];
  const expected = sign(`${header}.${payload}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('invalid signature');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
  if (typeof claims.exp !== 'number' || claims.exp < now) throw new Error('token expired');
  return claims;
}

/** Opaque single-use magic-link token (random) + its HMAC for stateless verification. */
export function createMagicLinkToken(
  email: string,
  secret: string,
  ttlSeconds = 15 * 60,
  now = Math.floor(Date.now() / 1000),
): string {
  const nonce = randomBytes(16).toString('hex');
  const exp = now + ttlSeconds;
  const body = `${email}:${exp}:${nonce}`;
  const mac = sign(body, secret);
  return b64url(`${body}:${mac}`);
}

export function verifyMagicLinkToken(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): { email: string } {
  const decoded = Buffer.from(token, 'base64url').toString('utf8');
  const segments = decoded.split(':');
  if (segments.length !== 4) throw new Error('malformed magic-link token');
  const [email, expStr, nonce, mac] = segments as [string, string, string, string];
  const body = `${email}:${expStr}:${nonce}`;
  const expected = sign(body, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('invalid magic-link token');
  if (Number(expStr) < now) throw new Error('magic-link token expired');
  return { email };
}
