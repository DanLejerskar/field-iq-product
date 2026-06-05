/**
 * Orchestrator. Vision first; QR fallback when vision is missing or
 * low-confidence; otherwise return `'none'`.
 *
 * Preserves vision's non-zero-confidence result over 'none' so the audit log
 * captures Claude's reasoning even when we couldn't confirm an equipmentId —
 * useful when the backend wants to show "We saw something that looked like
 * X but weren't sure" rather than a blank.
 */
import { decodeQr, type QrDeps } from './qr.js';
import { recognizeFromPhoto, type VisionDeps } from './vision.js';
import type { Recognition } from './types.js';

export interface RecognizeDeps {
  vision: VisionDeps;
  qr?: QrDeps;
  /** Below this, fall back to QR. Default 0.7. */
  confidenceThreshold?: number;
}

const DEFAULT_THRESHOLD = 0.7;

export async function recognize(photoDataUri: string, deps: RecognizeDeps): Promise<Recognition> {
  const threshold = deps.confidenceThreshold ?? DEFAULT_THRESHOLD;
  const v = await recognizeFromPhoto(photoDataUri, deps.vision);
  if (v.equipmentId && v.confidence >= threshold) return v;

  const q = await decodeQr(photoDataUri, deps.qr);
  if (q.equipmentId) return q;

  // No QR equipmentId. Prefer vision's data over an empty 'none' if vision
  // had any signal at all.
  if (v.confidence > 0 || v.detail) return v;
  return { equipmentId: null, source: 'none', confidence: 0 };
}
