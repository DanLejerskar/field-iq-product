/** Event envelope shape both apps already consume from the real backend bus. */
export type TimelineEventType =
  | 'session.created'
  | 'session.advanced'
  | 'step.verification_started'
  | 'step.verified'
  | 'step.retry'
  | 'step.failed'
  | 'session.completed';

export interface TimelineEvent {
  eventId: number;
  type: TimelineEventType;
  sessionId: string;
  orgId: string;
  ts: string;
  stepNumber?: number;
  stepId?: string;
  verified?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  message?: string;
  detail?: string;
}

export type TimelineCallback = (event: TimelineEvent) => void;

export type CardState =
  | 'pending'
  | 'processing'
  | 'verified'
  | 'retry'
  | 'error'
  | 'complete'
  | 'paused';

export type SessionStatus = 'active' | 'completed' | 'abandoned' | 'failed';
