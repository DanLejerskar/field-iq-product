/**
 * Magic-link sign-in card. Three states: idle → submitting → sent.
 *
 * The "Sign in with token" textarea is a deliberate v1 affordance — the
 * backend logs the magic link to Railway and Dan pastes the token here
 * without round-tripping through email. Real email (Resend) lands in 2E.
 */
import { useState, type FormEvent } from 'react';
import { apiHost } from '../api';
import { requestMagicLink, storeAuth, verifyMagicLink } from './auth';

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
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0.4 }}>{title}</h1>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 8, marginBottom: 20 }}>
          Magic-link auth. v1 logs the link to Railway — paste the token below to skip email.
        </p>

        <form onSubmit={sendLink}>
          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: 12, color: 'var(--ink-faint)', marginBottom: 6 }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.currentTarget.value)}
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
              marginTop: 16,
              padding: 12,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid var(--verified)',
              color: 'var(--verified)',
              fontSize: 13,
              borderRadius: 6,
            }}
          >
            Check your email (or the Railway backend logs — v1 only).
          </div>
        ) : null}

        <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

        <form onSubmit={signInWithToken}>
          <label
            htmlFor="token"
            style={{ display: 'block', fontSize: 12, color: 'var(--ink-faint)', marginBottom: 6 }}
          >
            Or paste the magic-link token
          </label>
          <textarea
            id="token"
            value={token}
            rows={3}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder="eyJ…  (the `token` query param from the magic-link URL)"
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
