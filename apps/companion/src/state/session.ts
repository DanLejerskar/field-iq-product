/**
 * Phone-side session state. Pure reducer over the same event envelope the
 * backend bus emits; consumed both by Zustand (live) and tests.
 */
import type { SessionEventEnvelope } from '../api/types';

export type CardState =
  | 'pending'
  | 'processing'
  | 'verified'
  | 'retry'
  | 'error'
  | 'complete'
  | 'paused';

export interface MirrorState {
  sessionId?: string;
  currentStep?: number;
  totalSteps: number;
  cardState: CardState;
  message?: string;
  verified: Set<number>;
  lastEventId: number;
  connection: 'connecting' | 'open' | 'paused';
}

export const initialMirror: MirrorState = {
  totalSteps: 0,
  cardState: 'pending',
  verified: new Set(),
  lastEventId: 0,
  connection: 'connecting',
};

function cardForEvent(type: SessionEventEnvelope['type']): CardState | undefined {
  switch (type) {
    case 'step.verification_started':
      return 'processing';
    case 'step.verified':
      return 'verified';
    case 'step.retry':
      return 'retry';
    case 'step.failed':
      return 'error';
    case 'session.completed':
      return 'complete';
    default:
      return undefined;
  }
}

export type Action =
  | { kind: 'event'; event: SessionEventEnvelope }
  | { kind: 'connection'; status: MirrorState['connection'] }
  | { kind: 'hydrate'; sessionId: string; currentStep: number; totalSteps: number };

export function reduce(state: MirrorState, action: Action): MirrorState {
  switch (action.kind) {
    case 'hydrate':
      return {
        ...state,
        sessionId: action.sessionId,
        currentStep: action.currentStep,
        totalSteps: action.totalSteps,
        cardState: 'pending',
      };

    case 'connection': {
      const isPaused = action.status === 'paused';
      return {
        ...state,
        connection: action.status,
        cardState: isPaused ? 'paused' : state.cardState === 'paused' ? 'pending' : state.cardState,
      };
    }

    case 'event': {
      const e = action.event;
      if (e.eventId <= state.lastEventId) return state;
      const next: MirrorState = { ...state, lastEventId: e.eventId };

      if (e.type === 'session.created' && e.stepNumber !== undefined) {
        next.sessionId = e.sessionId;
        next.currentStep = e.stepNumber;
        next.cardState = 'pending';
        return next;
      }
      if (e.type === 'session.advanced' && e.stepNumber !== undefined) {
        next.currentStep = e.stepNumber;
        next.cardState = 'pending';
        return next;
      }

      const mapped = cardForEvent(e.type);
      if (mapped) {
        next.cardState = mapped;
        next.message = e.message;
        if (e.type === 'step.verified' && e.stepNumber !== undefined) {
          next.verified = new Set(state.verified).add(e.stepNumber);
        }
      }
      return next;
    }
  }
}
