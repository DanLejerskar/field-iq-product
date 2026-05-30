/** Pure reducer mapping (state, event) → state. Unit-tested in state.test.ts. */
import type { CardState, HudState, SessionEventEnvelope } from './types.js';

export type Action =
  | { kind: 'event'; event: SessionEventEnvelope }
  | { kind: 'connection'; status: HudState['connection'] }
  | { kind: 'hydrate'; sessionId: string; steps: HudState['steps']; currentStep: number }
  | { kind: 'toggle-reference' };

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

export function reduce(state: HudState, action: Action): HudState {
  switch (action.kind) {
    case 'connection': {
      const isPaused = action.status === 'paused';
      return {
        ...state,
        connection: action.status,
        cardState: isPaused ? 'paused' : state.cardState === 'paused' ? 'pending' : state.cardState,
      };
    }

    case 'hydrate':
      return {
        ...state,
        sessionId: action.sessionId,
        steps: action.steps,
        totalSteps: action.steps.length,
        currentStep: action.currentStep,
        cardState: 'pending',
      };

    case 'toggle-reference':
      return { ...state, showingReference: !state.showingReference };

    case 'event': {
      const e = action.event;
      if (e.eventId <= state.lastEventId) return state; // dedupe replays
      const next: HudState = { ...state, lastEventId: e.eventId };

      if (e.type === 'session.created' && e.stepNumber !== undefined) {
        next.sessionId = e.sessionId;
        next.currentStep = e.stepNumber;
        next.cardState = 'pending';
        return next;
      }

      if (e.type === 'session.advanced' && e.stepNumber !== undefined) {
        next.currentStep = e.stepNumber;
        next.cardState = 'pending';
        next.showingReference = false;
        return next;
      }

      const mapped = cardForEvent(e.type);
      if (mapped) {
        next.cardState = mapped;
        next.message = e.message;
        if (e.type === 'step.verified' && e.stepNumber !== undefined) {
          next.verified = new Set(state.verified).add(e.stepNumber);
        }
        return next;
      }
      return next;
    }
  }
}
