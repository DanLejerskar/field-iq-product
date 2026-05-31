/**
 * Renders the dashboard only when an unexpired JWT is in localStorage.
 *
 * Handles three boot paths:
 *  - Hash route `#/auth/verify?token=…` (clicked from a magic-link URL):
 *    we verify the token, persist the auth payload, then `history.replaceState`
 *    to clear the hash and fall through to the authenticated app.
 *  - Existing valid JWT: render children immediately.
 *  - No JWT: render <SignIn />.
 *
 * Mock mode short-circuits the whole thing — the Phase-2A demo never talks to
 * a backend so it doesn't need a session.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { MOCK_MODE, apiHost } from '../api';
import {
  clearAuth,
  loadAuth,
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
  | { kind: 'verifying' }
  | { kind: 'authed'; auth: AuthPayload }
  | { kind: 'anon'; error?: string };

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<GateState>(() => (MOCK_MODE ? { kind: 'mock' } : initial()));

  useEffect(() => {
    if (state.kind !== 'verifying') return;
    const token = parseTokenFromHash(window.location.hash);
    if (!token) {
      setState({ kind: 'anon' });
      return;
    }
    let cancelled = false;
    verifyMagicLink(apiHost, token)
      .then((payload) => {
        if (cancelled) return;
        storeAuth(payload);
        // Strip the magic-link token from the address bar before rendering.
        const url = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', url || '/');
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
  }, [state.kind]);

  if (state.kind === 'mock' || state.kind === 'authed') return <>{children}</>;
  if (state.kind === 'verifying') {
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

function initial(): GateState {
  if (typeof window !== 'undefined' && parseTokenFromHash(window.location.hash)) {
    return { kind: 'verifying' };
  }
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
