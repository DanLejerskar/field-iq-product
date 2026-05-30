/** Event envelope mirrored from the backend bus — same shape as the glasses Web App. */
export type SessionEventType =
  | 'session.created'
  | 'session.advanced'
  | 'step.verification_started'
  | 'step.verified'
  | 'step.retry'
  | 'step.failed'
  | 'session.completed'
  | 'session.abandoned'
  | 'error';

export type Confidence = 'high' | 'medium' | 'low';

export interface SessionEventEnvelope {
  eventId: number;
  type: SessionEventType;
  sessionId: string;
  orgId: string;
  ts: string;
  stepNumber?: number;
  stepId?: string;
  verified?: boolean;
  confidence?: Confidence;
  message?: string;
  detail?: string;
}
