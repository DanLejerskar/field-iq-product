/**
 * Local copies of the relevant event-envelope shapes from
 * @field-iq/backend src/services/events.ts.  We intentionally don't import the
 * Node package — the glasses Web App ships independently and the envelope is a
 * stable wire format.
 */
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
  reportUrl?: string;
}

export type CardState =
  | 'pending'
  | 'processing'
  | 'verified'
  | 'retry'
  | 'error'
  | 'complete'
  | 'paused';

/** Minimal step info — fetched once from the backend on session start. */
export interface StepInfo {
  stepNumber: number;
  title: string;
  instruction: string;
  referenceImageUrl?: string;
}

export interface HudState {
  sessionId?: string;
  totalSteps: number;
  /** 1..totalSteps; undefined on home. */
  currentStep?: number;
  cardState: CardState;
  message?: string;
  steps: StepInfo[];
  /** Per-step verified mark, for the step-strip dots. */
  verified: Set<number>;
  /** WebSocket connection liveness. */
  connection: 'connecting' | 'open' | 'paused';
  /** Last delivered event id for replay on reconnect. */
  lastEventId: number;
  /** Toggled by left/right swipes to peek at the reference image. */
  showingReference: boolean;
}

export const initialState: HudState = {
  totalSteps: 0,
  cardState: 'pending',
  steps: [],
  verified: new Set(),
  connection: 'connecting',
  lastEventId: 0,
  showingReference: false,
};
