import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticate, requirePrincipal } from '../auth/plugin.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { getDb } from '../db/client.js';
import { equipment, procedures, steps } from '../db/schema.js';
import { AuditLogService } from '../services/audit.js';

function requireAdminOrTrainer(req: Parameters<typeof requirePrincipal>[0]): void {
  const role = requirePrincipal(req).role;
  if (role !== 'admin' && role !== 'trainer') throw forbidden('Admin or trainer role required');
}

export function registerAdminRoutes(app: FastifyInstance): void {
  // --- Equipment ---
  app.get('/api/admin/equipment', { preHandler: authenticate }, async (req) => {
    const p = requirePrincipal(req);
    return getDb().select().from(equipment).where(eq(equipment.orgId, p.org));
  });

  app.post('/api/admin/equipment', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const p = requirePrincipal(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!body.name || !body.qrCodeValue) throw badRequest('name and qrCodeValue are required');
    const [row] = await getDb()
      .insert(equipment)
      .values({ ...body, orgId: p.org } as typeof equipment.$inferInsert)
      .returning();
    return row;
  });

  app.delete('/api/admin/equipment/:id', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const { id } = req.params as { id: string };
    await getDb().delete(equipment).where(eq(equipment.id, id));
    return { ok: true };
  });

  // --- Procedures ---
  app.post('/api/admin/procedures', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!body.equipmentId || !body.name || !body.version) {
      throw badRequest('equipmentId, name, version are required');
    }
    const [row] = await getDb()
      .insert(procedures)
      .values({ totalSteps: 0, ...body } as typeof procedures.$inferInsert)
      .returning();
    return row;
  });

  // --- Steps ---
  app.post('/api/admin/steps', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!body.procedureId || body.stepNumber === undefined) {
      throw badRequest('procedureId and stepNumber are required');
    }
    const [row] = await getDb()
      .insert(steps)
      .values(body as typeof steps.$inferInsert)
      .returning();
    return row;
  });

  app.put('/api/admin/steps/:id', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const [row] = await getDb()
      .update(steps)
      .set(body as Partial<typeof steps.$inferInsert>)
      .where(eq(steps.id, id))
      .returning();
    if (!row) throw notFound('Step not found');
    return row;
  });

  // --- Supervisor override of a verdict (audited) ---
  app.post('/api/sessions/:id/override', { preHandler: authenticate }, async (req) => {
    const role = requirePrincipal(req).role;
    if (role !== 'supervisor' && role !== 'trainer' && role !== 'admin') {
      throw forbidden('Override requires supervisor, trainer, or admin');
    }
    const { id } = req.params as { id: string };
    const { priorAuditId, stepNumber, verified, message } = (req.body ?? {}) as {
      priorAuditId?: string;
      stepNumber?: number;
      verified?: boolean;
      message?: string;
    };
    if (!priorAuditId || stepNumber === undefined || verified === undefined) {
      throw badRequest('priorAuditId, stepNumber, verified are required');
    }
    const newId = await AuditLogService.override(priorAuditId, {
      sessionId: id,
      stepNumber,
      eventType: 'override',
      verified,
      confidence: 'high',
      message: message ?? 'Supervisor override',
      detail: `Override by ${role}`,
    });
    return { auditId: newId };
  });
}
