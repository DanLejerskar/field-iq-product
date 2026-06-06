/**
 * Renders the dashboard only when an unexpired JWT is in localStorage.
 *
 * Handles four boot paths:
 *  - Hash `#/auth/verify?session=<jwt>` (the new clickable-email redirect
 *    path): the backend has already minted the JWT, we just need to hydrate
 *    user+org via GET /api/auth/me, then strip the hash.
 *  - Hash `#/auth/verify?token=…` (the demo paste-token / legacy URL path):
 *    POST to /api/auth/magic-link/verify (gated by demoAuthEnabled on the
 *    backend) to mint and persist.
 *  - Existing valid JWT in localStorage: render children immediately.
 *  - No JWT: render <SignIn />.
 *
 * Mock mode short-circuits the whole thing — the Phase-2A demo never talks
 * to a backend so it doesn't need a session.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { MOCK_MODE, apiHost } from '../api';
import {
  clearAuth,
  hydrateAuthFromJwt,
  loadAuth,
  parseSessionFromHash,
  parseTokenFromHash,
  storeAuth,
  verifyMagicLink,
  type AuthPayload,
} from './auth';
import { SignIn } from './SignIn';

interface Props {
  children: ReactNode;
}

type GateState =
  | { kind: 'mock' }
  | { kind: 'verifying-token'; token: string }
  | { kind: 'hydrating-session'; jwt: string }
  | { kind: 'authed'; auth: AuthPayload }
  | { kind: 'anon'; error?: string };

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<GateState>(() => (MOCK_MODE ? { kind: 'mock' } : initial()));

  useEffect(() => {
    if (state.kind === 'verifying-token') {
      let cancelled = false;
      verifyMagicLink(apiHost, state.token)
        .then((payload) => {
          if (cancelled) return;
          storeAuth(payload);
          stripHash();
          setState({ kind: 'authed', auth: payload });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          clearAuth();
          setState({ kind: 'anon', error: err instanceof Error ? err.message : String(err) });
        });
      return () => {
        cancelled = true;
      };
    }
    if (state.kind === 'hydrating-session') {
      let cancelled = false;
      hydrateAuthFromJwt(apiHost, state.jwt)
        .then((payload) => {
          if (cancelled) return;
          storeAuth(payload);
          stripHash();
          setState({ kind: 'authed', auth: payload });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          clearAuth();
          setState({ kind: 'anon', error: err instanceof Error ? err.message : String(err) });
        });
      return () => {
        cancelled = true;
      };
    }
    return;
  }, [state.kind, state.kind === 'verifying-token' ? state.token : '', state.kind === 'hydrating-session' ? state.jwt : '']);

  if (state.kind === 'mock' || state.kind === 'authed') return <>{children}</>;
  if (state.kind === 'verifying-token' || state.kind === 'hydrating-session') {
    return (
      <div style={fullScreen}>
        <div style={{ color: 'var(--ink-dim)' }}>
          <span className="spinner" /> Signing you in…
        </div>
      </div>
    );
  }
  return (
    <>
      {state.error ? (
        <div
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(224, 98, 92, 0.18)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            borderRadius: 6,
            fontSize: 13,
            zIndex: 100,
          }}
        >
          {state.error}
        </div>
      ) : null}
      <SignIn
        onSignedIn={() => {
          const auth = loadAuth();
          if (auth) setState({ kind: 'authed', auth });
        }}
      />
    </>
  );
}

function stripHash(): void {
  if (typeof window === 'undefined') return;
  const url = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', url || '/');
}

function initial(): GateState {
  if (typeof window === 'undefined') {
    const existing = loadAuth();
    return existing ? { kind: 'authed', auth: existing } : { kind: 'anon' };
  }
  const session = parseSessionFromHash(window.location.hash);
  if (session) return { kind: 'hydrating-session', jwt: session };
  const token = parseTokenFromHash(window.location.hash);
  if (token) return { kind: 'verifying-token', token };
  const existing = loadAuth();
  if (existing) return { kind: 'authed', auth: existing };
  return { kind: 'anon' };
}

const fullScreen = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg-page)',
} as const;
