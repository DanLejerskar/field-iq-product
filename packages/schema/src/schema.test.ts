import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIDENCE_THRESHOLD } from './common.js';
import { type Procedure, type Step, verificationRequired } from './procedure.js';
import type { Session } from './session.js';
import type { AuditLog, VerificationResult } from './audit.js';

/** Deep round-trip through JSON, the contract every persisted type must satisfy. */
function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// DAC #811 LOTO — Step 1 (DON PPE). Verification prompt verbatim from
// VISION_TO_REALIZATION_SPEC.md §4 / 03_LOTO_Test_Case.md §4.
const STEP_1_PROMPT = `Look at this photo of a technician. Confirm BOTH of the following:
(1) Protective gloves are clearly visible on the technician's hands.
(2) Safety glasses are clearly visible on the technician's face.
Both must be present to verify. If either is absent, partially visible,
or ambiguous, return verified=false and ask for a retake showing both
gloves and safety glasses clearly.`;

const step1: Step = {
  id: 'step-1',
  order: 1,
  title: 'DON PPE',
  instruction:
    'Put on safety glasses and gloves. Take a selfie-style photo of your face and hands.',
  targetComponentId: 'technician',
  referenceAssets: [
    { id: 'ref_step01_ppe', type: 'image', url: 's3://field-iq/seed/dac811/ref_step01_ppe.jpg' },
  ],
  verificationRule: {
    kind: 'claude-photo',
    prompt: STEP_1_PROMPT,
    successCriteria: 'Gloves and safety glasses both clearly visible.',
    retryThreshold: 3,
  },
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
};

describe('Step round-trip', () => {
  it('survives JSON serialization with the verbatim prompt intact', () => {
    const parsed = roundTrip(step1);
    expect(parsed).toEqual(step1);
    expect(parsed.verificationRule.kind).toBe('claude-photo');
    if (parsed.verificationRule.kind === 'claude-photo') {
      expect(parsed.verificationRule.prompt).toBe(STEP_1_PROMPT);
    }
  });

  it('verificationRequired reflects the rule kind', () => {
    expect(verificationRequired(step1)).toBe(true);
    expect(verificationRequired({ ...step1, verificationRule: { kind: 'none' } })).toBe(false);
  });
});

describe('Procedure round-trip', () => {
  const procedure: Procedure = {
    id: 'proc_loto_dac811_v1',
    workspaceId: 'eon-training',
    version: '1.0.0',
    status: 'published',
    title: 'LOTO Procedure for DAC #811 Trainer',
    equipmentId: 'eq_dac811_001',
    siteIds: ['eon-training-bay-1'],
    workforceGroupIds: [],
    steps: [step1],
    authoredBy: [{ userId: 'seed', role: 'seed' }],
    estimatedDurationMs: 13 * 60_000,
  };

  it('round-trips a single-step procedure', () => {
    expect(roundTrip(procedure)).toEqual(procedure);
  });
});

describe('Session round-trip', () => {
  const session: Session = {
    id: 'sess_001',
    workerId: 'user_maya',
    deviceId: 'dev_glasses_01',
    procedureId: 'proc_loto_dac811_v1',
    procedureVersion: '1.0.0',
    startedAt: '2026-05-27T10:00:00.000Z',
    status: 'active',
    mode: 'walk-through',
    currentStepId: 'step-1',
    events: [
      {
        id: 'evt_1',
        sessionId: 'sess_001',
        at: '2026-05-27T10:00:01.000Z',
        source: 'field-iq-glasses',
        kind: 'step-started',
        stepId: 'step-1',
        confidence: 1,
      },
    ],
  };

  it('round-trips with a session event', () => {
    expect(roundTrip(session)).toEqual(session);
  });
});

describe('AuditLog round-trip', () => {
  const result: VerificationResult = {
    verified: true,
    confidence: 'high',
    message: 'Gloves and safety glasses both visible.',
    detail: 'Standard nitrile gloves on both hands, polycarbonate safety glasses on face.',
  };

  const entry: AuditLog = {
    id: 'audit_1',
    sessionId: 'sess_001',
    stepId: 'step-1',
    stepNumber: 1,
    eventType: 'verified',
    photoUrl: 's3://field-iq/eon/sess_001/1-abc.jpg',
    photoSha256: 'a'.repeat(64),
    verified: result.verified,
    confidence: result.confidence,
    message: result.message,
    detail: result.detail,
    timestamp: '2026-05-27T10:00:05.000Z',
  };

  it('round-trips an append-only verdict row', () => {
    expect(roundTrip(entry)).toEqual(entry);
  });
});
