/**
 * Magic-link sign-in card.
 *
 * Production flow: email input → POST /api/auth/request-link → "Check your
 * inbox" success state. The user clicks the email button → backend
 * 302-redirects them back here with `#/auth/verify?session=<jwt>` → AuthGate
 * stores the JWT.
 *
 * Lab flow (when `demoAuthEnabled` is true, fetched from
 * GET /api/auth/config): the paste-token form is shown as a second card
 * below the email form, so devs can skip the email round-trip.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { apiHost } from '../api';
import {
  fetchAuthConfig,
  requestMagicLink,
  storeAuth,
  verifyMagicLink,
} from './auth';

const DEFAULT_EMAIL = 'carlos.romero@eonreality.com';

interface Props {
  /** Optional pre-filled email (e.g. `maya.wu@eonreality.com` for the glasses-webapp variant). */
  defaultEmail?: string;
  /** Header shown above the form. */
  title?: string;
  /** Called after a successful verify so the host can re-render. */
  onSignedIn: () => void;
}

export function SignIn({
  defaultEmail = DEFAULT_EMAIL,
  title = 'Sign in to EON Field IQ',
  onSignedIn,
}: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  const [error, setError] = useState<string | undefined>();
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAuthConfig(apiHost)
      .then((cfg) => {
        if (!cancelled) setDemoEnabled(cfg.demoAuthEnabled);
      })
      .catch(() => {
        /* probe-failure is non-fatal; default to demo-off */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setStatus('sending');
    try {
      await requestMagicLink(apiHost, email.trim());
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('idle');
    }
  }

  async function signInWithToken(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setStatus('verifying');
    try {
      const payload = await verifyMagicLink(apiHost, token.trim());
      storeAuth(payload);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('sent');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-page)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 28,
        }}
        data-testid="signin-card"
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0.4 }}>{title}</h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 8, marginBottom: 20 }}>
          We'll email you a one-time sign-in link. It expires in 15 minutes.
        </p>

        {status === 'sent' ? (
          <div data-testid="signin-sent">
            <div
              style={{
                padding: 12,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid var(--verified)',
                color: 'var(--verified)',
                fontSize: 13,
                borderRadius: 6,
              }}
            >
              Check your inbox. We sent a sign-in link to <strong>{email}</strong>.
            </div>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={{ ...secondaryButton, marginTop: 16 }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--ink-faint)',
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              required
              autoFocus
              onChange={(e) => setEmail(e.currentTarget.value)}
              disabled={status === 'sending' || status === 'verifying'}
              style={inputStyle}
              data-testid="signin-email"
            />
            <button
              type="submit"
              disabled={
                status === 'sending' || status === 'verifying' || email.trim().length === 0
              }
              style={primaryButton}
              data-testid="signin-submit"
            >
              {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}

        {demoEnabled ? (
          <>
            <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
            <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 0, marginBottom: 10 }}>
              Lab: paste the magic-link token from the Railway logs.
            </p>
            <form onSubmit={signInWithToken} data-testid="signin-demo-form">
              <label
                htmlFor="token"
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--ink-faint)',
                  marginBottom: 6,
                }}
              >
                Magic-link token
              </label>
              <textarea
                id="token"
                value={token}
                rows={3}
                onChange={(e) => setToken(e.currentTarget.value)}
                placeholder="paste the `token` query param from the magic-link URL"
                style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              />
              <button
                type="submit"
                disabled={status === 'verifying' || token.trim().length === 0}
                style={secondaryButton}
              >
                {status === 'verifying' ? 'Verifying…' : 'Sign in with token'}
              </button>
            </form>
          </>
        ) : null}

        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(224, 98, 92, 0.12)',
              border: '1px solid var(--error)',
              color: 'var(--error)',
              fontSize: 13,
              borderRadius: 6,
            }}
            data-testid="signin-error"
          >
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--ink)',
  fontSize: 14,
  marginBottom: 12,
  fontFamily: 'inherit',
} as const;

const primaryButton = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--field)',
  color: '#0B1424',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.4,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  ...primaryButton,
  background: 'var(--bg-elev)',
  color: 'var(--ink)',
  border: '1px solid var(--border)',
} as const;
