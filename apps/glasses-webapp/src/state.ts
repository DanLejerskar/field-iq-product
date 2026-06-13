/** Pure reducer mapping (state, event) → state. Unit-tested in state.test.ts. */
import type { CardState, HudState, SessionEventEnvelope } from './types.js';

export type Action =
  | { kind: 'event'; event: SessionEventEnvelope }
  | { kind: 'connection'; status: HudState['connection'] }
  | { kind: 'hydrate'; sessionId: string; steps: HudState['steps']; currentStep: number }
  | { kind: 'toggle-reference' }
  // Optimistic local feedback: the photo left the device — show "reviewing"
  // immediately instead of waiting for the server's verification_started
  // event, which is lost when iOS suspends the WebSocket during camera capture.
  | { kind: 'photo-sent' }
  | { kind: 'photo-failed'; message: string }
  // Reconciliation from the REST poll that runs while cardState is
  // 'processing' — the safety net for verdicts whose WS events were missed.
  | { kind: 'poll-sync'; sessionStatus: string; currentStep: number; stepStatus?: string }
  // Local acknowledgement of a successful POST /advance: the REST response
  // carries the new step number, so we can move forward without waiting on
  // the `session.advanced` WS event (which dies when iOS suspends the page
  // while the verified banner is left sitting).
  | { kind: 'advance-ack'; stepNumber: number };

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

    case 'photo-sent':
      return { ...state, cardState: 'processing', message: undefined };

    case 'photo-failed':
      return { ...state, cardState: 'retry', message: action.message };

    case 'advance-ack': {
      // Only act on advances that actually move the user forward; treating a
      // same-step ack as movement would clobber a fresh verdict.
      const current = state.currentStep ?? 0;
      if (action.stepNumber <= current) return state;
      const verifiedThru =
        state.currentStep !== undefined
          ? new Set(state.verified).add(state.currentStep)
          : new Set(state.verified);
      return {
        ...state,
        currentStep: action.stepNumber,
        cardState: 'pending',
        message: undefined,
        showingReference: false,
        verified: verifiedThru,
      };
    }

    case 'poll-sync': {
      // Only reconcile while we're waiting on a verdict; never clobber a
      // state the WS already delivered (its events carry richer messages).
      if (state.cardState !== 'processing') return state;
      if (action.sessionStatus === 'completed') {
        return { ...state, cardState: 'complete' };
      }
      const current = state.currentStep ?? 0;
      if (action.currentStep > current) {
        return {
          ...state,
          currentStep: action.currentStep,
          cardState: 'pending',
          showingReference: false,
          verified: new Set(state.verified).add(current),
        };
      }
      if (action.stepStatus === 'retrying') {
        return { ...state, cardState: 'retry', message: 'Please retake the photo' };
      }
      if (action.stepStatus === 'failed') {
        return { ...state, cardState: 'error', message: 'Verification failed — call trainer' };
      }
      return state;
    }

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
