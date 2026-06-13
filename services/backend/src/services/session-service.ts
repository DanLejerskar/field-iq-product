/**
 * Session orchestration shared by the HTTP API and the verifier (mock or Python).
 * Loads pure SessionState, applies a transition, persists the delta, and publishes the
 * corresponding WebSocket event. Server-authoritative (VISION_TO_REALIZATION_SPEC §5.1).
 */
import type { VerificationResult } from '@field-iq/schema';
import {
  advance as advanceState,
  applyVerdict,
  complete as completeState,
  abandon as abandonState,
  isComplete,
} from '../domain/session-state.js';
import { conflict, notFound } from '../errors.js';
import {
  getProcedure,
  getSession,
  getStepByNumber,
  loadSessionState,
  updateSession,
  updateSessionStep,
} from '../db/repo.js';
import { AuditLogService } from './audit.js';
import { getRedis, publishSessionEvent } from './bus.js';
import type { SessionEventEnvelope, SessionEventType } from './events.js';

async function nextEventId(sessionId: string): Promise<number> {
  return getRedis().incr(`evtseq:${sessionId}`);
}

async function emit(
  sessionId: string,
  orgId: string,
  type: SessionEventType,
  extra: Partial<SessionEventEnvelope> = {},
): Promise<void> {
  await publishSessionEvent({
    eventId: await nextEventId(sessionId),
    type,
    sessionId,
    orgId,
    ts: new Date().toISOString(),
    ...extra,
  });
}

/** Record a Claude (or mock) verdict for a step. Updates the step + audit + emits events. */
export async function recordVerdict(
  sessionId: string,
  stepNumber: number,
  result: VerificationResult,
  claudeResponse?: Record<string, unknown>,
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw notFound('Session not found');

  const state = applyVerdict(await loadSessionState(sessionId), stepNumber, result.verified);
  const stepState = state.steps.find((s) => s.stepNumber === stepNumber)!;
  const step = await getStepByNumber(session.procedureId, stepNumber);

  await updateSessionStep(sessionId, stepNumber, {
    status: stepState.status,
    retryCount: stepState.retryCount,
    completedAt: result.verified ? new Date() : null,
  });

  await AuditLogService.append({
    sessionId,
    stepId: step?.id,
    stepNumber,
    eventType: result.verified ? 'verified' : stepState.status === 'failed' ? 'error' : 'retry',
    verified: result.verified,
    confidence: result.confidence,
    message: result.message,
    detail: result.detail,
    claudeResponse,
  });

  const type: SessionEventType = result.verified
    ? 'step.verified'
    : stepState.status === 'failed'
      ? 'step.failed'
      : 'step.retry';
  await emit(sessionId, session.orgId, type, {
    stepNumber,
    stepId: step?.id,
    verified: result.verified,
    confidence: result.confidence,
    message: result.message,
    detail: result.detail,
  });
}

/**
 * User taps "continue" (pinch on glasses, tap on phone): advance to the next
 * step once the current is verified. `advanceState` throws 409 if the current
 * step isn't verified yet, so reaching past it means the current step passed.
 * When the current step was the last one, advancing completes the procedure.
 */
export async function advanceSession(
  sessionId: string,
): Promise<{ currentStepNumber: number; completed: boolean }> {
  const session = await getSession(sessionId);
  if (!session) throw notFound('Session not found');
  const before = await loadSessionState(sessionId);
  const after = advanceState(before);

  if (after.currentStepNumber !== before.currentStepNumber) {
    const nextStep = await getStepByNumber(session.procedureId, after.currentStepNumber);
    await updateSessionStep(sessionId, after.currentStepNumber, {
      status: 'in_progress',
      startedAt: new Date(),
    });
    await updateSession(sessionId, { currentStepId: nextStep?.id });
    await emit(sessionId, session.orgId, 'session.advanced', {
      stepNumber: after.currentStepNumber,
      stepId: nextStep?.id,
    });
    return { currentStepNumber: after.currentStepNumber, completed: false };
  }

  // Advance didn't move the pointer: the verified current step was the last
  // one. Tapping "continue" on a fully-verified procedure completes it.
  if (session.status === 'active' && isComplete(after)) {
    await completeSession(sessionId);
    return { currentStepNumber: after.currentStepNumber, completed: true };
  }
  return { currentStepNumber: after.currentStepNumber, completed: false };
}

export async function completeSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw notFound('Session not found');
  const state = await loadSessionState(sessionId);
  completeState(state); // throws if not all verified
  const endedAt = new Date();
  const durationSeconds = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000);
  await updateSession(sessionId, {
    status: 'completed',
    completedAt: endedAt,
    durationSeconds,
  });
  await AuditLogService.append({ sessionId, eventType: 'complete' });
  await emit(sessionId, session.orgId, 'session.completed');
  // Discriminated terminal event for downstream services (cert-generator).
  // A step that fell into 'failed' but is later retried-out still completes;
  // any leftover failed step would have prevented us from reaching this branch
  // because completeState throws.
  const finalOutcome = state.steps.some((s) => s.status === 'failed') ? 'fail' : 'pass';
  await emit(sessionId, session.orgId, 'session.ended', {
    finalOutcome,
    endedAt: endedAt.toISOString(),
  });
}

export async function abandonSession(sessionId: string, reason: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw notFound('Session not found');
  if (session.status === 'completed') throw conflict('Session already completed');
  abandonState(await loadSessionState(sessionId));
  const endedAt = new Date();
  await updateSession(sessionId, { status: 'abandoned', completedAt: endedAt });
  await AuditLogService.append({ sessionId, eventType: 'abandon', detail: reason });
  await emit(sessionId, session.orgId, 'session.abandoned', { detail: reason });
  await emit(sessionId, session.orgId, 'session.ended', {
    finalOutcome: 'incomplete',
    endedAt: endedAt.toISOString(),
    detail: reason,
  });
}

export async function getProcedureVersion(procedureId: string): Promise<string> {
  const proc = await getProcedure(procedureId);
  if (!proc) throw notFound('Procedure not found');
  return proc.version;
}
