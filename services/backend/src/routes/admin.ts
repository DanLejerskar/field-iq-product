import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requirePrincipal } from '../auth/plugin.js';
import { config } from '../config/env.js';
import { badRequest, forbidden, notFound, unauthorized } from '../errors.js';
import { getDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { equipment, procedures, steps } from '../db/schema.js';
import { AuditLogService } from '../services/audit.js';
import { fetchFieldIqExport } from '../genesis/genesis-client.js';

function requireAdminOrTrainer(req: Parameters<typeof requirePrincipal>[0]): void {
  const role = requirePrincipal(req).role;
  if (role !== 'admin' && role !== 'trainer') throw forbidden('Admin or trainer role required');
}

export function registerAdminRoutes(app: FastifyInstance): void {
  // --- Equipment ---
  // Newest first so the most recently seeded equipment wins for the
  // glasses-webapp "Start LOTO session" flow (which picks index 0).
  app.get('/api/admin/equipment', { preHandler: authenticate }, async (req) => {
    const p = requirePrincipal(req);
    return getDb()
      .select()
      .from(equipment)
      .where(eq(equipment.orgId, p.org))
      .orderBy(desc(equipment.createdAt));
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

  // Test-prompt sandbox — admins iterate on a step's verification prompt against
  // a sample photo. The Node API never calls Claude directly (CLAUDE.md "do-nots"),
  // so v1 returns a deterministic mock verdict shaped exactly like the live verifier
  // output. The real Claude call goes via services/verifier when an
  // ANTHROPIC_API_KEY is configured.
  app.post('/api/admin/steps/:id/test-prompt', { preHandler: authenticate }, async (req) => {
    requireAdminOrTrainer(req);
    const { id } = req.params as { id: string };
    const { prompt } = (req.body ?? {}) as { prompt?: string; photoBase64?: string };
    return {
      stepId: id,
      mode: 'mock' as const,
      result: {
        verified: true,
        confidence: 'high' as const,
        message: 'Sandbox verdict (mock).',
        detail:
          prompt && prompt.length > 0
            ? `Mock pass for prompt of length ${prompt.length}. Set ANTHROPIC_API_KEY and run services/verifier for a live verdict.`
            : 'Mock pass — no prompt provided.',
      },
    };
  });

  // --- Browser-triggerable migration (Phase 2C) ---
  // Gated by the ADMIN_SETUP_TOKEN env var. Set the var in Railway, then
  // `POST /api/admin/migrate` with header `X-Admin-Setup-Token: <value>`.
  // Add `?seed=true` to also run the DAC #811 seed.
  app.post('/api/admin/migrate', async (req) => {
    const expected = config.adminSetupToken;
    if (!expected) {
      // Route disabled — no token configured.
      throw notFound('Setup route not enabled. Set ADMIN_SETUP_TOKEN to enable.');
    }
    const provided = headerToken(req);
    if (!provided || provided !== expected) {
      throw unauthorized('Invalid or missing X-Admin-Setup-Token');
    }
    const seed = (req.query as { seed?: string }).seed === 'true';

    const startedAt = Date.now();
    req.log.info('admin/migrate: running migrations');
    await runMigrations();
    let seedRan = false;
    if (seed) {
      req.log.info('admin/migrate: running DAC #811 seed');
      const { runSeed } = await import('../../seed/index.js');
      await runSeed();
      seedRan = true;
    }
    return { ok: true, seedRan, durationMs: Date.now() - startedAt };
  });

  // --- Genesis connectivity probe ---
  // Read-only: calls Genesis's fieldiq export with the M2M secret and returns a
  // small summary, so we can confirm reachability + the secret + the real data
  // shape from the DEPLOYED backend (which can reach Genesis; the dev sandbox
  // cannot). Gated by ADMIN_SETUP_TOKEN. Writes nothing to the database.
  //   GET /api/admin/genesis-ping?projectId=<genesis project id>
  app.get('/api/admin/genesis-ping', async (req) => {
    const expected = config.adminSetupToken;
    if (!expected) throw notFound('Setup route not enabled. Set ADMIN_SETUP_TOKEN to enable.');
    const provided = headerToken(req);
    if (!provided || provided !== expected) {
      throw unauthorized('Invalid or missing X-Admin-Setup-Token');
    }
    const projectId = (req.query as { projectId?: string }).projectId;
    if (!projectId) throw badRequest('projectId query param is required');

    const startedAt = Date.now();
    try {
      const exp = await fetchFieldIqExport(projectId);
      const stepsWithImages = (exp.steps ?? []).filter(
        (s) => (s.expected_views?.length ?? 0) > 0,
      ).length;
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        summary: {
          version: exp.version,
          procedureTitle: exp.procedure?.title,
          safetyLevel: exp.procedure?.safety_level ?? null,
          totalSteps: exp.procedure?.total_steps ?? exp.steps?.length ?? 0,
          componentCount: exp.components?.length ?? 0,
          stepsWithRenderedImages: stepsWithImages,
          firstStep: exp.steps?.[0]
            ? { number: exp.steps[0].step_number, title: exp.steps[0].title }
            : null,
        },
      };
    } catch (err) {
      // Surface the failure as a readable payload rather than a 4xx/5xx so the
      // browser-console caller can see exactly what went wrong.
      const message = err instanceof Error ? err.message : String(err);
      const detail =
        err && typeof err === 'object' && 'detail' in err
          ? String((err as { detail?: unknown }).detail)
          : undefined;
      return { ok: false, durationMs: Date.now() - startedAt, error: message, detail };
    }
  });
}

function headerToken(req: FastifyRequest): string | undefined {
  const raw = req.headers['x-admin-setup-token'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
