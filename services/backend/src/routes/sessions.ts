import { eq as eqOp } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticate, requirePrincipal } from '../auth/plugin.js';
import { badRequest, notFound } from '../errors.js';
import { getDb as getDbDirect } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import {
  createSessionWithSteps,
  getEquipmentById,
  getProcedureSteps,
  getSession,
  getStepByNumber,
  listSessions,
  loadSessionState,
} from '../db/repo.js';
import { AuditLogService } from '../services/audit.js';
import { enqueueVerification, publishSessionEvent } from '../services/bus.js';
import { getRedis } from '../services/bus.js';
import {
  abandonSession,
  advanceSession,
  completeSession,
  getProcedureVersion,
} from '../services/session-service.js';
import { S3StorageAdapter } from '../services/storage.js';

const storage = new S3StorageAdapter();

export function registerSessionRoutes(app: FastifyInstance): void {
  app.post('/api/sessions', { preHandler: authenticate }, async (req) => {
    const p = requirePrincipal(req);
    const { equipmentId, procedureId, testMode } = (req.body ?? {}) as {
      equipmentId?: string;
      procedureId?: string;
      testMode?: boolean;
    };
    if (!equipmentId || !procedureId) throw badRequest('equipmentId and procedureId are required');
    const eq = await getEquipmentById(equipmentId);
    if (!eq) throw notFound('Equipment not found');
    const version = await getProcedureVersion(procedureId);
    const { sessionId, firstStepId } = await createSessionWithSteps({
      orgId: p.org,
      equipmentId,
      procedureId,
      procedureVersion: version,
      technicianUserId: p.sub,
      testMode: testMode ?? false,
    });
    await AuditLogService.append({ sessionId, eventType: 'start' });
    await publishSessionEvent({
      eventId: await getRedis().incr(`evtseq:${sessionId}`),
      type: 'session.created',
      sessionId,
      orgId: p.org,
      ts: new Date().toISOString(),
      stepId: firstStepId,
      stepNumber: 1,
    });
    return { sessionId, firstStepId };
  });

  app.get('/api/sessions', { preHandler: authenticate }, async (req) => {
    const p = requirePrincipal(req);
    const { status } = req.query as { status?: string };
    return { sessions: await listSessions(p.org, status) };
  });

  app.get('/api/sessions/:id', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session) throw notFound('Session not found');
    const steps = await getProcedureSteps(session.procedureId);
    return { session, steps, state: await loadSessionState(id) };
  });

  // Submit a verification photo (base64 JPEG for v1 dev). Enqueues a verification job;
  // the verdict is delivered asynchronously over WebSocket.
  app.post('/api/sessions/:id/verify', { preHandler: authenticate }, async (req) => {
    const p = requirePrincipal(req);
    const { id } = req.params as { id: string };
    const { stepNumber, photoBase64, lat, lng } = (req.body ?? {}) as {
      stepNumber?: number;
      photoBase64?: string;
      lat?: number;
      lng?: number;
    };
    if (!stepNumber || !photoBase64) throw badRequest('stepNumber and photoBase64 are required');
    const session = await getSession(id);
    if (!session) throw notFound('Session not found');
    const step = await getStepByNumber(session.procedureId, stepNumber);
    if (!step) throw badRequest(`No step ${stepNumber} in this procedure`);

    const bytes = Buffer.from(photoBase64, 'base64');
    const { key, sha256 } = await storage.putPhoto(p.org, id, stepNumber, bytes);
    const auditId = await AuditLogService.append({
      sessionId: id,
      stepId: step.id,
      stepNumber,
      eventType: 'photo_submitted',
      photoUrl: key,
      photoSha256: sha256,
      latitude: lat,
      longitude: lng,
    });
    await publishSessionEvent({
      eventId: await getRedis().incr(`evtseq:${id}`),
      type: 'step.verification_started',
      sessionId: id,
      orgId: p.org,
      ts: new Date().toISOString(),
      stepNumber,
      stepId: step.id,
    });
    await enqueueVerification({
      sessionId: id,
      orgId: p.org,
      stepId: step.id,
      stepNumber,
      photoKey: key,
      verificationPrompt: step.verificationPrompt ?? '',
    });
    return { auditId, queuedForVerification: true };
  });

  app.post('/api/sessions/:id/advance', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    return advanceSession(id);
  });

  app.post('/api/sessions/:id/complete', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    await completeSession(id);
    return { ok: true };
  });

  app.post('/api/sessions/:id/abandon', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body ?? {}) as { reason?: string };
    await abandonSession(id, reason ?? 'unspecified');
    return { ok: true };
  });

  // Audit log feed for the trainer dashboard's Session Detail view.
  app.get('/api/sessions/:id/audit', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const session = await getSession(id);
    if (!session) throw notFound('Session not found');
    const rows = await getDbDirect()
      .select()
      .from(auditLog)
      .where(eqOp(auditLog.sessionId, id))
      .orderBy(auditLog.timestamp);
    return { auditLog: rows };
  });

  // Coach note — trainers append observations to the audit log during a session.
  app.post('/api/sessions/:id/notes', { preHandler: authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { text, stepNumber } = (req.body ?? {}) as { text?: string; stepNumber?: number };
    if (!text || text.trim().length === 0) throw badRequest('text is required');
    const auditId = await AuditLogService.append({
      sessionId: id,
      stepNumber,
      eventType: 'note',
      detail: text.trim(),
    });
    return { auditId };
  });
}
