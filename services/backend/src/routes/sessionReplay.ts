/**
 * GET /api/sessions/:id/replay
 *
 * Returns the session metadata (worker + procedure joins) plus the ordered,
 * projected ReplayEvent stream the dashboard timeline renders. Read-only;
 * mirrors the existing /api/sessions/:id/audit route's auth + 404 pattern.
 */
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/plugin.js';
import { notFound } from '../errors.js';
import { getDb } from '../db/client.js';
import { auditLog, procedures, sessions, users } from '../db/schema.js';
import {
  mapAuditRowToReplayEvent,
  type AuditRow,
  type ReplayEvent,
} from '../services/replayMapper.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReplayResponse {
  session: {
    id: string;
    workerId: string;
    workerName: string;
    procedureId: string;
    procedureTitle: string;
    startedAt: string;
    endedAt: string | null;
    status: 'active' | 'completed' | 'aborted';
    finalOutcome: 'pass' | 'fail' | 'incomplete' | null;
  };
  events: ReplayEvent[];
}

function normalizeStatus(s: string): 'active' | 'completed' | 'aborted' {
  switch (s) {
    case 'completed':
      return 'completed';
    case 'abandoned':
    case 'failed':
      return 'aborted';
    default:
      return 'active';
  }
}

function finalOutcomeFor(
  status: 'active' | 'completed' | 'aborted',
  events: ReplayEvent[],
): 'pass' | 'fail' | 'incomplete' | null {
  if (status === 'active') return null;
  if (status === 'aborted') return 'incomplete';
  const hadFail = events.some((e) => e.type === 'step.verified' && e.payload.verdict === 'fail');
  return hadFail ? 'fail' : 'pass';
}

function toIsoMaybe(d: Date | string | null): string | null {
  if (d === null) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

export function registerSessionReplayRoutes(app: FastifyInstance): void {
  app.get(
    '/api/sessions/:id/replay',
    { preHandler: authenticate },
    async (req): Promise<ReplayResponse> => {
      const { id } = req.params as { id: string };
      if (!UUID_RE.test(id)) throw notFound('Session not found');

      const db = getDb();

      const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
      if (!session) throw notFound('Session not found');

      const [worker] = await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, session.technicianUserId));

      const [procedure] = await db
        .select({ id: procedures.id, name: procedures.name })
        .from(procedures)
        .where(eq(procedures.id, session.procedureId));

      const auditRows = (await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.sessionId, id))
        .orderBy(asc(auditLog.timestamp))) as unknown as AuditRow[];

      const events: ReplayEvent[] = [];
      for (const row of auditRows) {
        const ev = mapAuditRowToReplayEvent(row);
        if (ev) events.push(ev);
      }

      const status = normalizeStatus(session.status as string);
      const finalOutcome = finalOutcomeFor(status, events);

      return {
        session: {
          id: session.id,
          workerId: session.technicianUserId,
          workerName: worker?.fullName ?? 'Unknown worker',
          procedureId: session.procedureId,
          procedureTitle: procedure?.name ?? 'Unknown procedure',
          startedAt: toIsoMaybe(session.startedAt as Date | string) ?? '',
          endedAt: toIsoMaybe(session.completedAt as Date | string | null),
          status,
          finalOutcome,
        },
        events,
      };
    },
  );
}
