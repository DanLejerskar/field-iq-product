/**
 * Audit types.
 *  - `VerificationResult` — Claude's structured verdict (02_Architecture.md §8.1).
 *  - `AuditLog`           — append-only persisted row (02_Architecture.md §3.3.2).
 *  - `AuditPack`          — regulator-formatted export to PDF (FIELD_IQ_PRODUCT_SPEC.md §4.3).
 *
 * AuditLog rows are append-only. Corrections write a NEW row and set `supersededBy` on the
 * prior row; the PDF report walks the chain. Never UPDATE/DELETE an audit_log row.
 */
import type { AuditLogId, IsoTimestamp, SessionId, StepId } from './common.js';
import type { SessionEvent } from './session.js';

/** Claude verdict confidence band (02_Architecture.md §8.1). */
export type VerificationConfidence = 'high' | 'medium' | 'low';

/** Structured JSON returned by the verifier for every photo. */
export interface VerificationResult {
  verified: boolean;
  confidence: VerificationConfidence;
  /** One short sentence shown to the technician on the HUD. */
  message: string;
  /** One sentence technical explanation persisted to the audit log. */
  detail: string;
}

export type AuditEventType =
  | 'photo_submitted'
  | 'verified'
  | 'retry'
  | 'skip'
  | 'start'
  | 'complete'
  | 'abandon'
  | 'error'
  | 'override'
  | 'note';

export interface AuditLog {
  id: AuditLogId;
  sessionId: SessionId;
  stepId?: StepId;
  stepNumber?: number;
  eventType: AuditEventType;
  photoUrl?: string;
  /** SHA-256 hex of the photo bytes for tamper detection. */
  photoSha256?: string;
  claudeRequestId?: string;
  /** Raw Claude response, preserved verbatim. */
  claudeResponse?: Record<string, unknown>;
  verified?: boolean;
  confidence?: VerificationConfidence;
  message?: string;
  detail?: string;
  timestamp: IsoTimestamp;
  latitude?: number;
  longitude?: number;
  /** Set on a row when a later row supersedes it (e.g. a supervisor override). */
  supersededBy?: AuditLogId;
}

/** Regulator-formatted derivative of a Session — exported to PDF. FIELD_IQ_PRODUCT_SPEC.md §4.3. */
export interface AuditPack {
  sessionId: string;
  workerName: string;
  workerCertifications: string[];
  procedureTitle: string;
  procedureVersion: string;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  durationMs: number;
  stepCount: number;
  verifiedStepCount: number;
  interventions: number;
  edgeCasesFlagged: number;
  /** Tamper-evident signature over the pack contents. */
  signedHashSha256: string;
  events: SessionEvent[];
}
