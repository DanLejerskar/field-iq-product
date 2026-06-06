/**
 * WebSocket / pub-sub event payloads. Shared by the API, the mock verifier, and the
 * WebSocket gateway (M4). Channel naming: `session:<id>` and `org:<orgId>:sessions`.
 * Event set per PHASE_1 prompt M4 + 02_Architecture.md §6.
 */
import type { VerificationConfidence } from '@field-iq/schema';

export type SessionEventType =
  | 'session.created'
  | 'session.advanced'
  | 'step.verification_started'
  | 'step.verified'
  | 'step.retry'
  | 'step.failed'
  | 'session.completed'
  | 'session.abandoned'
  | 'session.ended'
  | 'error';

/** Final outcome carried by `session.ended`. */
export type SessionFinalOutcome = 'pass' | 'fail' | 'incomplete';

export interface SessionEventEnvelope {
  /** Monotonic per-session id for reconnect replay (last_event_id). */
  eventId: number;
  type: SessionEventType;
  sessionId: string;
  orgId: string;
  ts: string;
  stepNumber?: number;
  stepId?: string;
  verified?: boolean;
  confidence?: VerificationConfidence;
  message?: string;
  detail?: string;
  reportUrl?: string;
  /** Set on `session.ended` so cert-generator and the dashboard can filter. */
  finalOutcome?: SessionFinalOutcome;
  /** Set on `session.ended` so consumers don't need a follow-up query. */
  endedAt?: string;
}

export function sessionChannel(sessionId: string): string {
  return `session:${sessionId}`;
}

export function orgChannel(orgId: string): string {
  return `org:${orgId}:sessions`;
}
