/**
 * Compact magic-link sign-in card for the glasses-webapp.
 *
 * The Meta companion app's URL contract (token in the fragment) remains the
 * primary auth path. This component renders as a fallback when the user lands
 * on the Vercel URL directly without a token, so manual browser testing
 * doesn't require the companion app.
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { requestMagicLink, storeAuth, verifyMagicLink, type AuthPayload } from './auth.js';

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
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sign in (browser testing)</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>
          Production sign-in is via the Meta companion app. Use the form below for browser testing
          without a paired device.
        </p>

        <form onSubmit={sendLink} style={{ marginTop: 16 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            required
            onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
            disabled={status === 'sending' || status === 'verifying'}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={status === 'sending' || status === 'verifying' || email.trim().length === 0}
            style={primaryButton}
          >
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        {status === 'sent' ? (
          <div
            style={{
              ...noticeStyle,
              borderColor: 'var(--accent-verified)',
              color: 'var(--accent-verified)',
            }}
          >
            Check Railway logs and paste the token below.
          </div>
        ) : null}

        <form onSubmit={signInWithToken} style={{ marginTop: 18 }}>
          <label style={labelStyle}>Magic-link token</label>
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

        {error ? (
          <div
            style={{
              ...noticeStyle,
              borderColor: 'var(--accent-error)',
              color: 'var(--accent-error)',
            }}
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
