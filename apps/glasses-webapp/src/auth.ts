/**
 * Glasses-webapp magic-link auth — mirrors the dashboard helpers byte-for-byte.
 *
 * The primary auth path in production is still the URL-fragment token supplied
 * by the Meta companion app. This module backs the "Sign in manually" fallback
 * we expose to make browser testing tractable without a paired Meta device.
 *
 * Pure functions, DOM-safe — Preact has no test render harness configured.
 */
export const AUTH_JWT_KEY = 'field_iq_jwt';
export const AUTH_USER_KEY = 'field_iq_user';
export const AUTH_ORG_KEY = 'field_iq_org';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface AuthOrg {
  id: string;
}

export interface AuthPayload {
  jwt: string;
  user: AuthUser;
  org: AuthOrg;
}

interface JwtClaims {
  sub: string;
  org: string;
  role: string;
  iat: number;
  exp: number;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function storeAuth(payload: AuthPayload): void {
  const s = safeStorage();
  if (!s) return;
  s.setItem(AUTH_JWT_KEY, payload.jwt);
  s.setItem(AUTH_USER_KEY, JSON.stringify(payload.user));
  s.setItem(AUTH_ORG_KEY, JSON.stringify(payload.org));
}

export function loadAuth(): AuthPayload | null {
  const s = safeStorage();
  if (!s) return null;
  const jwt = s.getItem(AUTH_JWT_KEY);
  const userRaw = s.getItem(AUTH_USER_KEY);
  const orgRaw = s.getItem(AUTH_ORG_KEY);
  if (!jwt || !userRaw || !orgRaw) return null;
  if (isJwtExpired(jwt)) return null;
  try {
    return { jwt, user: JSON.parse(userRaw) as AuthUser, org: JSON.parse(orgRaw) as AuthOrg };
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  const s = safeStorage();
  if (!s) return;
  s.removeItem(AUTH_JWT_KEY);
  s.removeItem(AUTH_USER_KEY);
  s.removeItem(AUTH_ORG_KEY);
}

function decodeBase64Url(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  if (typeof atob === 'function') return atob(padded);
  return Buffer.from(padded, 'base64').toString('binary');
}

export function decodeJwtPayload(jwt: string): JwtClaims | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]!)) as JwtClaims;
  } catch {
    return null;
  }
}

export function isJwtExpired(jwt: string, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  const claims = decodeJwtPayload(jwt);
  if (!claims || typeof claims.exp !== 'number') return true;
  return claims.exp <= nowSec;
}

export function parseTokenFromHash(hash: string): string | null {
  const trimmed = hash.replace(/^#/, '');
  if (!trimmed.startsWith('/auth/verify')) return null;
  const qIdx = trimmed.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(trimmed.slice(qIdx + 1));
  const token = params.get('token');
  return token && token.length > 0 ? token : null;
}

export async function requestMagicLink(apiHost: string, email: string): Promise<void> {
  const res = await fetch(`${apiHost}/api/auth/magic-link/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok && res.status !== 204) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new Error(problem.title ?? `Request failed (${res.status})`);
  }
}

export async function verifyMagicLink(apiHost: string, token: string): Promise<AuthPayload> {
  const res = await fetch(`${apiHost}/api/auth/magic-link/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new Error(problem.title ?? `Verify failed (${res.status})`);
  }
  return (await res.json()) as AuthPayload;
}
