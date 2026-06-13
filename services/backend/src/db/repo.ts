/**
 * Data-access helpers. Route handlers call these; no SQL leaks into the HTTP layer.
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { equipment, procedures, sessions, sessionSteps, steps, users } from './schema.js';
import { deriveCurrentStepNumber } from '../domain/session-state.js';
import type { SessionState, StepState } from '../domain/session-state.js';
import { notFound } from '../errors.js';

export async function findUserByEmail(email: string) {
  const [row] = await getDb().select().from(users).where(eq(users.email, email));
  return row;
}

export async function findUserById(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row;
}

export async function getEquipmentByQr(qr: string) {
  const [row] = await getDb().select().from(equipment).where(eq(equipment.qrCodeValue, qr));
  return row;
}

export async function getEquipmentById(id: string) {
  const [row] = await getDb().select().from(equipment).where(eq(equipment.id, id));
  return row;
}

export async function getActiveProcedureForEquipment(equipmentId: string) {
  const [row] = await getDb()
    .select()
    .from(procedures)
    .where(and(eq(procedures.equipmentId, equipmentId), eq(procedures.isActive, true)));
  return row;
}

export async function getProcedure(id: string) {
  const [row] = await getDb().select().from(procedures).where(eq(procedures.id, id));
  return row;
}

export async function getProcedureSteps(procedureId: string) {
  return getDb()
    .select()
    .from(steps)
    .where(eq(steps.procedureId, procedureId))
    .orderBy(steps.stepNumber);
}

export async function listSessions(orgId: string, status?: string) {
  const where = status
    ? and(eq(sessions.orgId, orgId), eq(sessions.status, status as 'active'))
    : eq(sessions.orgId, orgId);
  return getDb().select().from(sessions).where(where).orderBy(desc(sessions.startedAt));
}

export async function getSession(id: string) {
  const [row] = await getDb().select().from(sessions).where(eq(sessions.id, id));
  return row;
}

export async function getStepByNumber(procedureId: string, stepNumber: number) {
  const [row] = await getDb()
    .select()
    .from(steps)
    .where(and(eq(steps.procedureId, procedureId), eq(steps.stepNumber, stepNumber)));
  return row;
}

export async function updateSession(
  id: string,
  fields: Partial<typeof sessions.$inferInsert>,
): Promise<void> {
  await getDb().update(sessions).set(fields).where(eq(sessions.id, id));
}

export async function updateSessionStep(
  sessionId: string,
  stepNumber: number,
  fields: Partial<typeof sessionSteps.$inferInsert>,
): Promise<void> {
  await getDb()
    .update(sessionSteps)
    .set(fields)
    .where(and(eq(sessionSteps.sessionId, sessionId), eq(sessionSteps.stepNumber, stepNumber)));
}

export async function createSessionWithSteps(input: {
  orgId: string;
  equipmentId: string;
  procedureId: string;
  procedureVersion: string;
  technicianUserId: string;
  testMode: boolean;
}): Promise<{ sessionId: string; firstStepId: string }> {
  const db = getDb();
  const procStepRows = await getProcedureSteps(input.procedureId);
  if (procStepRows.length === 0) throw notFound('Procedure has no steps');

  const [session] = await db
    .insert(sessions)
    .values({
      orgId: input.orgId,
      equipmentId: input.equipmentId,
      procedureId: input.procedureId,
      procedureVersion: input.procedureVersion,
      technicianUserId: input.technicianUserId,
      status: 'active',
      currentStepId: procStepRows[0]!.id,
      testMode: input.testMode,
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error('Failed to create session');

  await db.insert(sessionSteps).values(
    procStepRows.map((s, i) => ({
      sessionId: session.id,
      stepId: s.id,
      stepNumber: s.stepNumber,
      status: (i === 0 ? 'in_progress' : 'pending') as 'in_progress' | 'pending',
      startedAt: i === 0 ? new Date() : null,
    })),
  );

  return { sessionId: session.id, firstStepId: procStepRows[0]!.id };
}

/** Build the pure SessionState for a session from its session_steps + steps. */
export async function loadSessionState(sessionId: string): Promise<SessionState> {
  const session = await getSession(sessionId);
  if (!session) throw notFound('Session not found');
  const rows = await getDb()
    .select({
      stepNumber: sessionSteps.stepNumber,
      status: sessionSteps.status,
      retryCount: sessionSteps.retryCount,
      retryThreshold: steps.retryThreshold,
      skippable: steps.skippable,
    })
    .from(sessionSteps)
    .innerJoin(steps, eq(sessionSteps.stepId, steps.id))
    .where(eq(sessionSteps.sessionId, sessionId))
    .orderBy(sessionSteps.stepNumber);

  const stepStates: StepState[] = rows.map((r) => ({
    stepNumber: r.stepNumber,
    status: r.status,
    retryCount: r.retryCount,
    retryThreshold: r.retryThreshold,
    skippable: r.skippable,
  }));

  // Reconstruct the current step to match the in-memory domain model: the
  // pointer rests on a verified step until `advance` is called, so verified
  // steps are NOT skipped (see deriveCurrentStepNumber for why a naive
  // "first non-verified" derivation breaks the advance/continue tap).
  const currentStepNumber = deriveCurrentStepNumber(stepStates);

  return { status: session.status, currentStepNumber, steps: stepStates };
}
