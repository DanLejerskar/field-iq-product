/**
 * Email transport. Single public function: `sendSignInEmail`.
 *
 * - With `RESEND_API_KEY` set: posts to the Resend HTTP API.
 * - Without it: logs the link to the request logger so dev workflows
 *   ("click the link the backend logged") keep working.
 *
 * The Resend send is done with a small `fetch`-based client so we don't
 * import the `resend` package at module load time — it pulls in a chunk
 * of TLS plumbing we don't want sitting in the cold path.
 */
import type { FastifyBaseLogger } from 'fastify';
import { renderSignInHtml, renderSignInText } from '../emails/signin.js';

export interface SendSignInEmailInput {
  to: string;
  magicUrl: string;
  expiresInMinutes?: number;
}

export interface EmailServiceConfig {
  resendApiKey: string | undefined;
  fromAddress: string;
}

/** Pluggable transport for tests. Default sends via Resend's REST API. */
export type EmailTransport = (req: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<void>;

export const defaultResendTransport: EmailTransport = async ({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
}) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed: status=${res.status} body=${body.slice(0, 200)}`);
  }
};

export interface EmailService {
  sendSignInEmail(input: SendSignInEmailInput): Promise<void>;
}

export function makeEmailService(
  cfg: EmailServiceConfig,
  log: FastifyBaseLogger,
  transport: EmailTransport = defaultResendTransport,
): EmailService {
  return {
    async sendSignInEmail({ to, magicUrl, expiresInMinutes = 15 }) {
      const subject = 'Sign in to Field IQ';
      const html = renderSignInHtml({ magicUrl, expiresInMinutes });
      const text = renderSignInText({ magicUrl, expiresInMinutes });
      if (!cfg.resendApiKey) {
        log.info(
          { event: 'email.dev_stub', to, subject, magicUrl, expiresInMinutes },
          'magic-link email (no RESEND_API_KEY — dev stub)',
        );
        return;
      }
      await transport({
        apiKey: cfg.resendApiKey,
        from: cfg.fromAddress,
        to,
        subject,
        html,
        text,
      });
      log.info({ event: 'email.sent', to, subject }, 'magic-link email sent');
    },
  };
}
