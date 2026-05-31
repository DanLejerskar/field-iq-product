import type { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { badRequest, unauthorized } from '../errors.js';
import { createMagicLinkToken, signJwt, verifyMagicLinkToken } from '../auth/tokens.js';
import { findUserByEmail } from '../db/repo.js';

/** v1: dashboard + glasses-webapp keep the JWT in localStorage; rotation is Phase 2E. */
const JWT_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Build the magic-link URL that lands in a browser. Technicians sign in on the
 * glasses-webapp; everyone else (trainer, supervisor, admin) on the dashboard.
 * Both apps handle `#/auth/verify?token=…` via their AuthGate.
 */
export function magicLinkUrl(role: string, token: string): string {
  const fallback = role === 'technician' ? 'http://localhost:3002' : 'http://localhost:3001';
  const envVar = role === 'technician' ? process.env.GLASSES_ORIGIN : process.env.DASHBOARD_ORIGIN;
  const origin = (envVar && !envVar.startsWith('<') ? envVar : fallback).replace(/\/+$/, '');
  return `${origin}/#/auth/verify?token=${token}`;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/magic-link/request', async (req, reply) => {
    const { email } = (req.body ?? {}) as { email?: string };
    if (!email) throw badRequest('email is required');
    const user = await findUserByEmail(email);
    // Always 204 (don't leak which emails exist). Only send if the user exists.
    if (user) {
      const token = createMagicLinkToken(email, config.jwtSigningSecret);
      const link = magicLinkUrl(user.role, token);
      // Dev transport: log the link. Production swaps in Resend/Postmark.
      req.log.info({ email, link }, 'magic-link issued');
    }
    return reply.code(204).send();
  });

  app.post('/api/auth/magic-link/verify', async (req) => {
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
