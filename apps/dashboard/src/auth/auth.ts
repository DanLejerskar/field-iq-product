/**
 * Magic-link auth helpers.
 *
 * Phase 2D wires a minimal sign-in flow on top of the backend's existing
 * `/api/auth/magic-link/{request,verify}` endpoints. The dashboard stores the
 * resulting JWT in localStorage so the WebSocket + REST clients can pick it
 * up. Rotation/refresh is deferred to Phase 2E — these JWTs are issued with a
 * 30-day TTL by the backend's auth route.
 *
 * Everything here is a pure function (DOM-safe, no React) so the helpers can
 * be unit-tested without a render harness.
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
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(AUTH_JWT_KEY, payload.jwt);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(payload.user));
  storage.setItem(AUTH_ORG_KEY, JSON.stringify(payload.org));
}

export function loadAuth(): AuthPayload | null {
  const storage = safeStorage();
  if (!storage) return null;
  const jwt = storage.getItem(AUTH_JWT_KEY);
  const userRaw = storage.getItem(AUTH_USER_KEY);
  const orgRaw = storage.getItem(AUTH_ORG_KEY);
  if (!jwt || !userRaw || !orgRaw) return null;
  if (isJwtExpired(jwt)) return null;
  try {
    return {
      jwt,
      user: JSON.parse(userRaw) as AuthUser,
      org: JSON.parse(orgRaw) as AuthOrg,
    };
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(AUTH_JWT_KEY);
  storage.removeItem(AUTH_USER_KEY);
  storage.removeItem(AUTH_ORG_KEY);
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

/**
 * Extract `token` from a hash route like `#/auth/verify?token=…`.
 * Returns null for any other hash (so callers can no-op cheaply).
 */
export function parseTokenFromHash(hash: string): string | null {
  const trimmed = hash.replace(/^#/, '');
  if (!trimmed.startsWith('/auth/verify')) return null;
  const qIdx = trimmed.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(trimmed.slice(qIdx + 1));
  const token = params.get('token');
  return token && token.length > 0 ? token : null;
}

/**
 * Extract `session=<jwt>` from `#/auth/verify?session=…`. This is the
 * post-redirect path: the backend has already minted a JWT for us and
 * sent us here. Returns null when the hash isn't an auth verify URL or
 * the param is missing.
 */
export function parseSessionFromHash(hash: string): string | null {
  const trimmed = hash.replace(/^#/, '');
  if (!trimmed.startsWith('/auth/verify')) return null;
  const qIdx = trimmed.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(trimmed.slice(qIdx + 1));
  const session = params.get('session');
  return session && session.length > 0 ? session : null;
}

export async function requestMagicLink(apiHost: string, email: string): Promise<void> {
  const res = await fetch(`${apiHost}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok && res.status !== 204) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new Error(problem.title ?? `Request failed (${res.status})`);
  }
}

export interface AuthConfig {
  demoAuthEnabled: boolean;
}

export async function fetchAuthConfig(apiHost: string): Promise<AuthConfig> {
  const res = await fetch(`${apiHost}/api/auth/config`);
  if (!res.ok) return { demoAuthEnabled: false };
  return (await res.json()) as AuthConfig;
}

export interface AuthMeResponse {
  user: AuthUser;
  org: AuthOrg;
}

export async function fetchAuthMe(apiHost: string, jwt: string): Promise<AuthMeResponse> {
  const res = await fetch(`${apiHost}/api/auth/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw new Error(problem.title ?? `Fetch /api/auth/me failed (${res.status})`);
  }
  return (await res.json()) as AuthMeResponse;
}

/**
 * Hydrate a freshly-minted JWT (delivered via the email-click redirect)
 * into a full AuthPayload by asking the backend who we are.
 */
export async function hydrateAuthFromJwt(
  apiHost: string,
  jwt: string,
): Promise<AuthPayload> {
  const { user, org } = await fetchAuthMe(apiHost, jwt);
  return { jwt, user, org };
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
