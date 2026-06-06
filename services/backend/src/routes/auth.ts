/**
 * Sign-in routes.
 *
 * Prompt #10 finishes the magic-link flow: the production path is
 * "click the email link → backend GET → 302 redirect into the app with
 * a fresh JWT in the hash." Three legacy paths remain for back-compat
 * and lab convenience, gated by `DEMO_AUTH_ENABLED`:
 *
 *   - POST /api/auth/magic-link/request      — kept (still 204, now sends
 *                                                via Resend when configured)
 *   - POST /api/auth/magic-link/verify       — kept, but 404 when
 *                                                demoAuthEnabled is off
 *   - POST /api/auth/demo-login              — admin@eon.ai/Demo1234! shortcut,
 *                                                404 when demoAuthEnabled is off
 *
 * The new production endpoints:
 *
 *   - POST /api/auth/request-link            — alias for /magic-link/request
 *   - GET  /api/auth/verify?token=<uuid>     — clicked from the email; 302s
 *                                                into the appropriate app with
 *                                                ?session=<jwt>
 *   - POST /api/auth/signout                 — clears the bearer cookie if
 *                                                present (we don't set one
 *                                                today, but the endpoint exists)
 *   - GET  /api/auth/me                      — bearer-authed; returns user+org
 *                                                so the frontend can hydrate
 *                                                after the redirect.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requirePrincipal } from '../auth/plugin.js';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';
import { findUserByEmail, findUserById } from '../db/repo.js';
import { badRequest, notFound, unauthorized } from '../errors.js';
import { createMagicLinkToken, signJwt, verifyMagicLinkToken } from '../auth/tokens.js';
import { makeEmailService, type EmailService } from '../services/emailService.js';
import {
  consumeLink,
  createLink,
  isValidEmail,
  type Db,
} from '../services/magicLinkService.js';
import { RateLimiter } from '../services/rateLimitService.js';

/** v1 JWT TTL: 30 days. */
const JWT_TTL_SECONDS = 30 * 24 * 60 * 60;

const DEMO_EMAIL = 'admin@eon.ai';
const DEMO_PASSWORD = 'Demo1234!';

/**
 * Build the in-app URL that the email-click redirect lands on. Same
 * destination as the existing paste-token path (`#/auth/verify`) but
 * carries a fully-minted JWT in `session=` so the AuthGate skips the
 * verify POST.
 */
export function appRedirectUrl(role: string, jwt: string): string {
  const fallback = role === 'technician' ? 'http://localhost:3002' : 'http://localhost:3001';
  const envVar = role === 'technician' ? process.env.GLASSES_ORIGIN : process.env.DASHBOARD_ORIGIN;
  const origin = (envVar && !envVar.startsWith('<') ? envVar : fallback).replace(/\/+$/, '');
  return `${origin}/#/auth/verify?session=${encodeURIComponent(jwt)}`;
}

/** Build the BACKEND URL the email body points at. */
export function buildMagicLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

/** v1 dev affordance: the existing paste-the-token URL the dev path emits. */
export function magicLinkUrl(role: string, token: string): string {
  const fallback = role === 'technician' ? 'http://localhost:3002' : 'http://localhost:3001';
  const envVar = role === 'technician' ? process.env.GLASSES_ORIGIN : process.env.DASHBOARD_ORIGIN;
  const origin = (envVar && !envVar.startsWith('<') ? envVar : fallback).replace(/\/+$/, '');
  return `${origin}/#/auth/verify?token=${token}`;
}

export interface AuthRoutesDeps {
  emailService?: EmailService;
  rateLimiter?: RateLimiter;
  db?: Db;
}

/** Default rate limit: 3 sign-in requests per 10 minutes per email. */
function defaultRateLimiter(): RateLimiter {
  return new RateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 3 });
}

async function handleRequestLink(
  app: FastifyInstance,
  deps: Required<Pick<AuthRoutesDeps, 'emailService' | 'rateLimiter' | 'db'>>,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { email } = (req.body ?? {}) as { email?: string };
  // Always 204, even on invalid input — we don't want to leak whether an
  // address is registered, and we don't want to leak whether it parsed.
  if (!email || !isValidEmail(email)) {
    req.log.info({ event: 'auth.request_link.invalid' }, 'request-link: invalid email');
    return reply.code(204).send();
  }

  if (!deps.rateLimiter.allow(email.toLowerCase().trim())) {
    req.log.info({ event: 'auth.request_link.rate_limited', email }, 'request-link: rate limited');
    return reply.code(204).send();
  }

  const ip = req.ip ?? null;
  const ua = (req.headers['user-agent'] as string | undefined) ?? null;
  const token = await createLink(deps.db, { email, ipAddress: ip, userAgent: ua });
  const magicUrl = buildMagicLinkUrl(config.magicLinkBaseUrl, token);

  try {
    await deps.emailService.sendSignInEmail({ to: email.toLowerCase().trim(), magicUrl });
  } catch (err) {
    // Email failure shouldn't 500 — we still 204. Log so ops sees it.
    req.log.error({ err, event: 'auth.email_send_failed' }, 'magic-link email send failed');
  }
  return reply.code(204).send();
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps = {}): void {
  const emailService =
    deps.emailService ??
    makeEmailService(
      { resendApiKey: config.resendApiKey, fromAddress: config.emailFromAddress },
      app.log,
    );
  const rateLimiter = deps.rateLimiter ?? defaultRateLimiter();
  const dbAccessor = deps.db ?? getDb();
  const wired = { emailService, rateLimiter, db: dbAccessor };

  // Production: the new endpoint the frontend will call.
  app.post('/api/auth/request-link', (req, reply) =>
    handleRequestLink(app, wired, req, reply),
  );

  // Back-compat: existing endpoint kept working. Same handler.
  app.post('/api/auth/magic-link/request', (req, reply) =>
    handleRequestLink(app, wired, req, reply),
  );

  // Clickable-email path. Consumes the DB token, mints a JWT, redirects.
  app.get('/api/auth/verify', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) {
      return reply.code(400).type('text/plain').send('Token expired or invalid');
    }
    const consumed = await consumeLink(wired.db, token, {
      defaultOrgId: config.defaultOrgId,
    });
    if (!consumed) {
      return reply.code(400).type('text/plain').send('Token expired or invalid');
    }
    const jwt = signJwt(
      { sub: consumed.userId, org: consumed.orgId, role: consumed.role },
      config.jwtSigningSecret,
      JWT_TTL_SECONDS,
    );
    return reply.redirect(appRedirectUrl(consumed.role, jwt), 302);
  });

  // Bearer-authed: returns the principal's user + org so the frontend can
  // hydrate after the email-click redirect (which only carries the JWT).
  app.get('/api/auth/me', { preHandler: authenticate }, async (req) => {
    const principal = requirePrincipal(req);
    const user = await findUserById(principal.sub);
    if (!user) throw unauthorized('Unknown user');
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      org: { id: user.orgId },
    };
  });

  // No cookies in v1, but expose the endpoint so the frontend can call it
  // when we add httpOnly sessions later. Safe to call repeatedly.
  app.post('/api/auth/signout', async () => {
    return { ok: true };
  });

  // Front-end config probe. The dashboard + glasses pages render the
  // paste-token form iff demoAuthEnabled is true.
  app.get('/api/auth/config', async () => {
    return { demoAuthEnabled: config.demoAuthEnabled };
  });

  // Demo password endpoint (lab only). Always 404 in prod.
  app.post('/api/auth/demo-login', async (req, reply) => {
    if (!config.demoAuthEnabled) return reply.code(404).send();
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      throw unauthorized('Invalid credentials');
    }
    const user = await findUserByEmail(DEMO_EMAIL);
    if (!user) throw notFound('Demo user not seeded');
    const jwt = signJwt(
      { sub: user.id, org: user.orgId, role: user.role },
      config.jwtSigningSecret,
      JWT_TTL_SECONDS,
    );
    return {
      jwt,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      org: { id: user.orgId },
    };
  });

  // Paste-the-token flow (HMAC stateless). Stays available for fast lab
  // iteration but disappears in prod.
  app.post('/api/auth/magic-link/verify', async (req, reply) => {
    if (!config.demoAuthEnabled) return reply.code(404).send();
    const { token } = (req.body ?? {}) as { token?: string };
    if (!token) throw badRequest('token is required');
    let email: string;
    try {
      ({ email } = verifyMagicLinkToken(token, config.jwtSigningSecret));
    } catch {
      throw unauthorized('Invalid or expired magic link');
    }
    const user = await findUserByEmail(email);
    if (!user) throw unauthorized('No such user');
    const jwt = signJwt(
      { sub: user.id, org: user.orgId, role: user.role },
      config.jwtSigningSecret,
      JWT_TTL_SECONDS,
    );
    return {
      jwt,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      org: { id: user.orgId },
    };
  });
}

// Re-export so existing imports continue to work.
export { createMagicLinkToken };
