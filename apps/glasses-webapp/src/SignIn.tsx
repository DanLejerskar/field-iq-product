/**
 * Glasses-webapp magic-link sign-in card.
 *
 * Production flow: the user signs in via the Meta companion app and lands
 * here with `#/auth/verify?session=<jwt>` already on the URL — handled by
 * the app shell, not this component. This form exists for browser-only
 * testing without a paired device: email → "check your inbox" → click the
 * emailed button → backend 302s here with the JWT.
 *
 * The paste-token form is rendered only when the backend reports
 * `demoAuthEnabled=true` via /api/auth/config.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  fetchAuthConfig,
  requestMagicLink,
  storeAuth,
  verifyMagicLink,
  type AuthPayload,
} from './auth.js';

const DEFAULT_EMAIL = 'maya.wu@eonreality.com';

interface Props {
  apiHost: string;
  onSignedIn: (payload: AuthPayload) => void;
}

export function SignIn({ apiHost, onSignedIn }: Props): JSX.Element {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
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
        /* probe-failure is non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [apiHost]);

  async function sendLink(e: JSX.TargetedEvent<HTMLFormElement>): Promise<void> {
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

  async function signInWithToken(e: JSX.TargetedEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(undefined);
    setStatus('verifying');
    try {
      const payload = await verifyMagicLink(apiHost, token.trim());
      storeAuth(payload);
      onSignedIn(payload);
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
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(360px, 100%)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid #2c3853',
          borderRadius: 8,
          padding: 24,
          color: 'var(--ink)',
        }}
        data-testid="signin-card"
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sign in to Field IQ</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>
          We'll email you a sign-in link. It expires in 15 minutes.
        </p>

        {status === 'sent' ? (
          <div data-testid="signin-sent" style={{ marginTop: 16 }}>
            <div
              style={{
                ...noticeStyle,
                borderColor: 'var(--accent-verified)',
                color: 'var(--accent-verified)',
              }}
            >
              Check your inbox. We sent a sign-in link to <strong>{email}</strong>.
            </div>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={{ ...secondaryButton, marginTop: 12 }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink} style={{ marginTop: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              required
              onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
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
          <form onSubmit={signInWithToken} style={{ marginTop: 18 }} data-testid="signin-demo-form">
            <label style={labelStyle}>Lab: paste magic-link token</label>
            <textarea
              value={token}
              rows={3}
              onInput={(e) => setToken((e.currentTarget as HTMLTextAreaElement).value)}
              placeholder="paste the token from the magic-link URL"
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            />
            <button
              type="submit"
              disabled={status === 'verifying' || token.trim().length === 0}
              style={secondaryButton}
            >
              {status === 'verifying' ? 'Verifying…' : 'Sign in with token'}
            </button>
          </form>
        ) : null}

        {error ? (
          <div
            style={{
              ...noticeStyle,
              borderColor: 'var(--accent-error)',
              color: 'var(--accent-error)',
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

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--ink-dim)',
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid #2c3853',
  borderRadius: 4,
  color: 'var(--ink)',
  fontSize: 13,
  marginBottom: 10,
  fontFamily: 'inherit',
};

const primaryButton = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--accent-verified)',
  color: '#000',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButton = {
  ...primaryButton,
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--ink)',
  border: '1px solid #2c3853',
};

const noticeStyle = {
  marginTop: 12,
  padding: '8px 10px',
  fontSize: 12,
  border: '1px solid',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.2)',
};
