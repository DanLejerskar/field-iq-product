import { describe, expect, it } from 'vitest';
import {
  abandon,
  advance,
  applyVerdict,
  complete,
  deriveCurrentStepNumber,
  isComplete,
  skip,
  type SessionState,
  type StepStatus,
} from './session-state.js';

function freshSession(stepCount = 10, retryThreshold = 3): SessionState {
  return {
    status: 'active',
    currentStepNumber: 1,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      stepNumber: i + 1,
      status: i === 0 ? 'in_progress' : 'pending',
      retryCount: 0,
      retryThreshold,
      skippable: false,
    })),
  };
}

describe('applyVerdict', () => {
  it('marks the current step verified on success', () => {
    const s = applyVerdict(freshSession(), 1, true);
    expect(s.steps[0]!.status).toBe('verified');
  });

  it('increments retry and sets retrying below the threshold', () => {
    const s = applyVerdict(freshSession(), 1, false);
    expect(s.steps[0]!.retryCount).toBe(1);
    expect(s.steps[0]!.status).toBe('retrying');
  });

  it('fails the step once the retry threshold is reached', () => {
    let s = freshSession(10, 2);
    s = applyVerdict(s, 1, false);
    s = applyVerdict(s, 1, false);
    expect(s.steps[0]!.status).toBe('failed');
  });

  it('rejects a verdict for a step that is not current', () => {
    expect(() => applyVerdict(freshSession(), 2, true)).toThrow(/current step is 1/);
  });
});

describe('advance', () => {
  it('moves to the next step after the current is verified', () => {
    let s = applyVerdict(freshSession(), 1, true);
    s = advance(s);
    expect(s.currentStepNumber).toBe(2);
    expect(s.steps[1]!.status).toBe('in_progress');
  });

  it('refuses to advance an unverified step', () => {
    expect(() => advance(freshSession())).toThrow(/not verified/);
  });

  it('stays on the last step when it is verified (ready to complete)', () => {
    let s = freshSession(1);
    s = applyVerdict(s, 1, true);
    s = advance(s);
    expect(s.currentStepNumber).toBe(1);
  });
});

describe('complete', () => {
  it('completes only when every step is verified', () => {
    let s = freshSession(2);
    s = advance(applyVerdict(s, 1, true));
    s = applyVerdict(s, 2, true);
    s = complete(s);
    expect(s.status).toBe('completed');
    expect(isComplete(s)).toBe(true);
  });

  it('refuses to complete with unverified steps', () => {
    expect(() => complete(freshSession(2))).toThrow(/not all steps/);
  });
});

describe('full 10-step happy path', () => {
  it('verifies and advances through all 10 steps then completes', () => {
    let s = freshSession(10);
    for (let n = 1; n <= 10; n++) {
      s = applyVerdict(s, n, true);
      s = advance(s);
    }
    expect(complete(s).status).toBe('completed');
  });
});

describe('abandon / skip / inactive guards', () => {
  it('abandons an active session', () => {
    expect(abandon(freshSession()).status).toBe('abandoned');
  });

  it('rejects transitions on a non-active session', () => {
    const done = complete(
      (() => {
        let s = freshSession(1);
        s = advance(applyVerdict(s, 1, true));
        return s;
      })(),
    );
    expect(() => applyVerdict(done, 1, true)).toThrow(/not active/);
    expect(() => abandon(done)).toThrow(/already completed/);
  });

  it('skips a skippable step and advances', () => {
    const s = freshSession(3);
    s.steps[0]!.skippable = true;
    const after = skip(s, 1);
    expect(after.steps[0]!.status).toBe('skipped');
    expect(after.currentStepNumber).toBe(2);
  });

  it('rejects skipping a non-skippable step', () => {
    expect(() => skip(freshSession(3), 1)).toThrow(/not skippable/);
  });
});

describe('deriveCurrentStepNumber', () => {
  const rows = (statuses: StepStatus[]) =>
    statuses.map((status, i) => ({ stepNumber: i + 1, status }));

  it('points at the in_progress step at the start', () => {
    expect(deriveCurrentStepNumber(rows(['in_progress', 'pending', 'pending']))).toBe(1);
  });

  it('rests on the just-verified step while the next is still pending (the advance gap)', () => {
    // This is the exact state that produced the 409: step 1 verified, step 2
    // not yet started. Current must stay 1 so `advance` can promote step 2.
    expect(deriveCurrentStepNumber(rows(['verified', 'pending', 'pending']))).toBe(1);
  });

  it('follows the pointer onto the next step once it is in_progress', () => {
    expect(deriveCurrentStepNumber(rows(['verified', 'in_progress', 'pending']))).toBe(2);
  });

  it('uses the highest verified step in the gap after several steps', () => {
    expect(deriveCurrentStepNumber(rows(['verified', 'verified', 'pending']))).toBe(2);
  });

  it('returns the last step when everything is verified (ready to complete)', () => {
    expect(deriveCurrentStepNumber(rows(['verified', 'verified', 'verified']))).toBe(3);
  });

  it('points at a retrying step', () => {
    expect(deriveCurrentStepNumber(rows(['verified', 'retrying', 'pending']))).toBe(2);
  });

  it('round-trips with advance: a verified gap state advances cleanly', () => {
    const s: SessionState = {
      status: 'active',
      currentStepNumber: deriveCurrentStepNumber(rows(['verified', 'pending', 'pending'])),
      steps: [
        { stepNumber: 1, status: 'verified', retryCount: 0, retryThreshold: 3, skippable: false },
        { stepNumber: 2, status: 'pending', retryCount: 0, retryThreshold: 3, skippable: false },
        { stepNumber: 3, status: 'pending', retryCount: 0, retryThreshold: 3, skippable: false },
      ],
    };
    const after = advance(s);
    expect(after.currentStepNumber).toBe(2);
    expect(after.steps[1]!.status).toBe('in_progress');
  });
});
