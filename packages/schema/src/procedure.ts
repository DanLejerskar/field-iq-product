/**
 * Procedure + Step + VerificationRule.
 * Source of truth: FIELD_IQ_PRODUCT_SPEC.md §4.1.
 *
 * LOTO v1 simplifications (authorized by PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md M1):
 *  - `Interaction`, `SafetyGate`, `HapticPattern` are DEFERRED. They remain present as
 *    optional fields on `Step` so the §4 shape is preserved, but LOTO v1 does not populate
 *    them. See `deferred.ts` for the placeholder type definitions.
 *  - `VerificationRule` gains a `claude-photo` variant (not in §4). This is the LOTO
 *    subset from VISION_TO_REALIZATION_SPEC.md §4: each step's photo is verified by Claude
 *    against a verbatim prompt. The variant carries the prompt + success criteria + retry
 *    threshold that the seed data and verifier require. This is a documented deviation.
 */
import type {
  AssetRef,
  ComponentId,
  ConfidenceThreshold,
  EquipmentId,
  IsoTimestamp,
  ProcedureId,
  SiteId,
  StepId,
  WorkspaceId,
} from './common.js';
import type { HapticPattern, Interaction, SafetyGate } from './deferred.js';

export type ProcedureStatus = 'draft' | 'review' | 'published' | 'deprecated';

export interface Procedure {
  id: ProcedureId;
  workspaceId: WorkspaceId;
  /** semver, e.g. "1.0.0". Tuning a verification prompt bumps this. */
  version: string;
  status: ProcedureStatus;
  title: string;
  subtitle?: string;
  equipmentId: EquipmentId;
  siteIds: SiteId[];
  workforceGroupIds: string[];
  steps: Step[];
  authoredBy: ProcedureAuthor[];
  publishedAt?: IsoTimestamp;
  estimatedDurationMs: number;
}

export interface ProcedureAuthor {
  userId: string;
  role: 'content-author' | 'master-technician' | 'ai-assist' | 'seed';
}

export interface Step {
  id: StepId;
  /** 1-indexed position in the procedure. */
  order: number;
  title: string;
  instruction: string;
  targetComponentId: ComponentId;
  referenceAssets: AssetRef[];
  verificationRule: VerificationRule;
  confidenceThreshold: ConfidenceThreshold;
  expectedBeforeState?: AssetRef;
  expectedAfterState?: AssetRef;
  voiceCue?: string;

  // --- Deferred for LOTO v1 (see module header) ---
  interaction?: Interaction;
  safetyGate?: SafetyGate;
  hapticPattern?: HapticPattern;
}

export type VerificationRule =
  | { kind: 'auto-photo-match'; threshold: number }
  | { kind: 'voice-confirm'; phrase: string }
  | { kind: 'manual-photo'; instruction: string }
  /**
   * LOTO v1: a photo verified by Claude Sonnet 4.6 against `prompt` (verbatim from the
   * LOTO spec). `retryThreshold` retries before the trainer is paged.
   */
  | { kind: 'claude-photo'; prompt: string; successCriteria: string; retryThreshold: number }
  | { kind: 'none' };

/** True when the step requires a verification photo (anything but `none`). */
export function verificationRequired(step: Step): boolean {
  return step.verificationRule.kind !== 'none';
}
