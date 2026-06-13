/**
 * Session state machine — pure, server-authoritative transition logic.
 * VISION_TO_REALIZATION_SPEC.md §5.1; API behaviour from 02_Architecture.md §5.4.
 *
 * The Web App and companion never advance state on their own; they request a transition
 * and the backend validates it here. No I/O in this module — fully unit-tested.
 */
import { AppError, badRequest, conflict } from '../errors.js';

export type SessionStatus = 'active' | 'completed' | 'abandoned' | 'failed';
export type StepStatus = 'pending' | 'in_progress' | 'verified' | 'retrying' | 'skipped' | 'failed';

export interface StepState {
  stepNumber: number;
  status: StepStatus;
  retryCount: number;
  retryThreshold: number;
  skippable: boolean;
}

export interface SessionState {
  status: SessionStatus;
  currentStepNumber: number; // 1-indexed; equals steps.length + 1 conceptually when all done
  steps: StepState[];
}

function assertActive(state: SessionState): void {
  if (state.status !== 'active') {
    throw conflict(`Session is ${state.status}, not active`);
  }
}

function step(state: SessionState, stepNumber: number): StepState {
  const s = state.steps.find((x) => x.stepNumber === stepNumber);
  if (!s) throw badRequest(`No step ${stepNumber} in this procedure`);
  return s;
}

/**
 * Reconstruct the 1-indexed current step from persisted step rows.
 *
 * Must mirror the invariant the in-memory transitions maintain: after a
 * verdict, `currentStepNumber` rests ON the verified step until `advance` is
 * explicitly called — verified steps are NOT auto-skipped. A naive
 * "first non-verified step" derivation jumps the pointer to the next
 * (pending) step the instant one is verified, which then makes `advance`
 * read an unverified step and reject the user's "continue" tap with a 409.
 *
 *   1. an actively-worked step (in_progress / retrying) is always current;
 *   2. otherwise we're in the gap right after a verdict, before the user
 *      taps continue — current is the highest verified step (awaiting
 *      advance), or the final step once everything is verified;
 *   3. a brand-new session with nothing started — current is the first step.
 */
export function deriveCurrentStepNumber(
  steps: ReadonlyArray<Pick<StepState, 'stepNumber' | 'status'>>,
): number {
  const active = steps.find((s) => s.status === 'in_progress' || s.status === 'retrying');
  if (active) return active.stepNumber;
  const lastVerified = [...steps].reverse().find((s) => s.status === 'verified');
  return lastVerified?.stepNumber ?? steps[0]?.stepNumber ?? 1;
}

/** Apply a verification verdict to the current step. Returns the updated state. */
export function applyVerdict(
  state: SessionState,
  stepNumber: number,
  verified: boolean,
): SessionState {
  assertActive(state);
  if (stepNumber !== state.currentStepNumber) {
    throw badRequest(
      `Verdict for step ${stepNumber} but current step is ${state.currentStepNumber}`,
    );
  }
  const s = step(state, stepNumber);
  if (verified) {
    s.status = 'verified';
    return state;
  }
  s.retryCount += 1;
  s.status = s.retryCount >= s.retryThreshold ? 'failed' : 'retrying';
  return state;
}

/** Advance to the next step after the current one is verified (the user's pinch). */
export function advance(state: SessionState): SessionState {
  assertActive(state);
  const current = step(state, state.currentStepNumber);
  if (current.status !== 'verified') {
    throw conflict(`Cannot advance: step ${current.stepNumber} is ${current.status}, not verified`);
  }
  if (state.currentStepNumber >= state.steps.length) {
    // Last step verified — ready to complete.
    return state;
  }
  state.currentStepNumber += 1;
  const next = step(state, state.currentStepNumber);
  next.status = 'in_progress';
  return state;
}

export function isComplete(state: SessionState): boolean {
  return state.steps.every((s) => s.status === 'verified' || s.status === 'skipped');
}

export function complete(state: SessionState): SessionState {
  assertActive(state);
  if (!isComplete(state)) {
    throw conflict('Cannot complete: not all steps are verified');
  }
  state.status = 'completed';
  return state;
}

export function abandon(state: SessionState): SessionState {
  if (state.status === 'completed') throw conflict('Session already completed');
  state.status = 'abandoned';
  return state;
}

export function skip(state: SessionState, stepNumber: number): SessionState {
  assertActive(state);
  const s = step(state, stepNumber);
  if (!s.skippable) throw badRequest(`Step ${stepNumber} is not skippable`);
  s.status = 'skipped';
  if (stepNumber === state.currentStepNumber && stepNumber < state.steps.length) {
    state.currentStepNumber += 1;
    step(state, state.currentStepNumber).status = 'in_progress';
  }
  return state;
}

export { AppError };
