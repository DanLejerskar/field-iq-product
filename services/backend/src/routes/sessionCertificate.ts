/**
 * GET /api/sessions/:sessionId/certificate
 *
 * Returns the issued PDF completion certificate for a session.
 * - 404 if the session doesn't exist or no certificate has been generated.
 * - 403 if the caller is neither the worker who ran the session nor a
 *   supervisor/trainer/admin in the same org.
 *
 * Cert generation itself happens asynchronously in services/cert-generator/
 * when the backend publishes a `session.ended` event with finalOutcome=pass
 * — this route is read-only.
 */
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticate, requirePrincipal } from '../auth/plugin.js';
import { getDb } from '../db/client.js';
import { certificates, sessions } from '../db/schema.js';
import { forbidden, notFound } from '../errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPERVISORY_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'trainer',
  'supervisor',
]);

/** Pure access-control decision, extracted for unit testing. */
export function canAccessCertificate(
  principal: { sub: string; org: string; role: string },
  session: { orgId: string; technicianUserId: string },
): boolean {
  if (session.technicianUserId === principal.sub) return true;
  return SUPERVISORY_ROLES.has(principal.role) && session.orgId === principal.org;
}

export interface CertificateResponse {
  certId: string;
  certUrl: string;
  issuedAt: string;
}

function toIso(d: Date | string): string {
  return typeof d === 'string' ? d : d.toISOString();
}

export function registerSessionCertificateRoutes(app: FastifyInstance): void {
  app.get(
    '/api/sessions/:sessionId/certificate',
    { preHandler: authenticate },
    async (req): Promise<CertificateResponse> => {
      const { sessionId } = req.params as { sessionId: string };
      if (!UUID_RE.test(sessionId)) throw notFound('Session not found');

      const principal = requirePrincipal(req);
      const db = getDb();

      const [session] = await db
        .select({
          id: sessions.id,
          orgId: sessions.orgId,
          technicianUserId: sessions.technicianUserId,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId));
      if (!session) throw notFound('Session not found');

      if (!canAccessCertificate(principal, session)) {
        throw forbidden('You do not have access to this certificate');
      }

      const [cert] = await db
        .select({
          certId: certificates.certId,
          certUrl: certificates.certUrl,
          issuedAt: certificates.issuedAt,
        })
        .from(certificates)
        .where(eq(certificates.sessionId, sessionId))
        .orderBy(desc(certificates.issuedAt))
        .limit(1);
      if (!cert) throw notFound('Certificate not yet generated');

      return {
        certId: cert.certId,
        certUrl: cert.certUrl,
        issuedAt: toIso(cert.issuedAt as Date | string),
      };
    },
  );
}
