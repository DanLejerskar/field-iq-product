/**
 * Shared primitives used across the canonical schema.
 * Source of truth: FIELD_IQ_PRODUCT_SPEC.md §4.
 */

/** ISO 8601 timestamp string, ms precision. */
export type IsoTimestamp = string;

// --- Identifier aliases (string-based; see FIELD_IQ_PRODUCT_SPEC.md §4.1) ---
export type OrganizationId = string;
export type UserId = string;
export type DeviceId = string;
export type EquipmentId = string; // e.g. "eq_dac811_001"
export type ProcedureId = string; // e.g. "proc_loto_dac811_v1"
export type StepId = string; // e.g. "step-5"
export type ComponentId = string; // e.g. "fused_disconnect_box"
export type SessionId = string;
export type WorkspaceId = string;
export type SiteId = string;
export type AuditLogId = string;

/** A media asset attached to a step (reference image, clip, etc.). FIELD_IQ_PRODUCT_SPEC.md §4.1. */
export interface AssetRef {
  id: string;
  type: 'image' | 'gif' | 'clip' | '3d-overlay' | 'voice';
  url: string;
  alt?: string;
  durationMs?: number;
}

/** Confidence routing thresholds for a step. FIELD_IQ_PRODUCT_SPEC.md §4.1. */
export interface ConfidenceThreshold {
  /** >= this → silent auto-verify (default 0.85). */
  proceedSilent: number;
  /** < this → prompt the worker (default 0.6). */
  prompt: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD: ConfidenceThreshold = {
  proceedSilent: 0.85,
  prompt: 0.6,
};
