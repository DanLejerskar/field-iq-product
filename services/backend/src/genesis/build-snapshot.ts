/**
 * Pure transform: a Genesis `format=fieldiq` export → an in-memory **snapshot plan**.
 *
 * "Pure" is the point — no DB, no clock, no network, no S3. Given the same export it always
 * produces the same plan, so it can be unit-tested against the captured fixture and its
 * content/prompt hashes are stable version anchors. The DB write (drift detection, versioning,
 * exemplar S3 copy) lives in `../services/procedure-import.ts` and consumes this plan.
 *
 * Schema target: `docs/live/genesis-integration-architecture.md §7.3`
 * (`procedure_snapshots` / `_steps` / `_exemplars`).
 */
import { createHash } from 'node:crypto';

import { compileVerificationPrompt, promptHash } from './compile-prompt.js';
import type { ExportStep, FieldIqExport } from './export-contract.js';

export interface SnapshotPlan {
  genesisProjectId: string;
  genesisProcedureId: string;
  title: string;
  /** procedures.version from Genesis — the snapshot's source version. */
  sourceVersion: number;
  /**
   * Drift key. Prefer Genesis's own `content_hash`; fall back to a Field-IQ-computed canonical
   * hash (prefixed `fieldiq-sha256:`) so older exports without a hash still get drift detection.
   */
  contentHash: string;
  steps: SnapshotStepPlan[];
}

export interface SnapshotStepPlan {
  stepNumber: number;
  title: string;
  description: string;
  verificationPrompt: string;
  /** = Genesis expected_outcome. */
  expectedStateText: string;
  /** CRITICAL when critical_step, else the procedure safety_level upper-cased (or UNSPECIFIED). */
  safetyLevel: string;
  interactionType: string | null;
  componentLabel: string | null;
  promptHash: string;
  durationSec: number | null;
  /** Source exemplars to copy into Field IQ S3 (the copy itself is done at persist time). */
  exemplars: ExemplarSource[];
}

export interface ExemplarSource {
  angle: string;
  sourceUrl: string;
  width: number;
  height: number;
}

function stepSafetyLevel(step: ExportStep, procedureSafetyLevel: string | null): string {
  if (step.critical_step) return 'CRITICAL';
  return procedureSafetyLevel ? procedureSafetyLevel.toUpperCase() : 'UNSPECIFIED';
}

/**
 * Canonical hash fallback over the fields that define a step's meaning. Stable key order +
 * step ordering so the digest only changes when the semantic payload changes.
 */
export function computeFallbackContentHash(steps: ExportStep[]): string {
  const canonical = [...steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => ({
      step_number: s.step_number,
      title: s.title,
      description: s.description,
      expected_outcome: s.expected_outcome,
      safety_note: s.safety_note ?? null,
      critical_step: s.critical_step,
      interaction_type: s.interaction_config?.type ?? null,
      component_label: s.component_label ?? null,
    }));
  const digest = createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
  return `fieldiq-sha256:${digest}`;
}

/** Resolve the drift key: Genesis hash if present, else the Field-IQ canonical fallback. */
export function resolveContentHash(exp: FieldIqExport): string {
  const provided = exp.procedure.content_hash;
  if (provided && provided.trim()) return provided.trim();
  return computeFallbackContentHash(exp.steps);
}

export function buildSnapshotFromExport(exp: FieldIqExport): SnapshotPlan {
  const procSafety = exp.procedure.safety_level;

  const steps: SnapshotStepPlan[] = [...exp.steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => {
      const prompt = compileVerificationPrompt(s);
      return {
        stepNumber: s.step_number,
        title: s.title,
        description: s.description,
        verificationPrompt: prompt,
        expectedStateText: s.expected_outcome,
        safetyLevel: stepSafetyLevel(s, procSafety),
        interactionType: s.interaction_config?.type ?? null,
        componentLabel: s.component_label ?? null,
        promptHash: promptHash(prompt),
        durationSec: s.duration_sec ?? null,
        exemplars: (s.expected_views ?? []).map((v) => ({
          angle: v.angle,
          sourceUrl: v.image_url,
          width: v.width,
          height: v.height,
        })),
      };
    });

  return {
    genesisProjectId: exp.procedure.project_id,
    genesisProcedureId: exp.procedure.id,
    title: exp.procedure.title,
    sourceVersion: exp.procedure.version,
    contentHash: resolveContentHash(exp),
    steps,
  };
}
