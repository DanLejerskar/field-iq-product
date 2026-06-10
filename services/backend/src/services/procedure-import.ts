/**
 * Procedure Import & Snapshot Service (B-28).
 *
 * Pulls a published Genesis procedure (as a `format=fieldiq` export), compiles each step's
 * `verification_prompt`, copies the pre-rendered exemplars into Field IQ S3, and writes an
 * **immutable, version-pinned snapshot**. Re-import is content-hash gated: an unchanged
 * procedure is a no-op; a changed one creates a new version and supersedes the prior, so
 * in-flight sessions stay pinned. Design: `docs/live/genesis-integration-architecture.md §7.3`.
 *
 * SLICE 1 (this file): the pure decision + the snapshot write are complete and exercised
 * against the captured fixture. The live M2M pull and the real exemplar S3 copy are SLICE 2 —
 * here the exemplar copy is an injected `ExemplarCopier`; with none supplied, exemplar rows are
 * skipped (the snapshot + compiled prompts still persist), and the count is reported so callers
 * can see the gap.
 */
import { buildSnapshotFromExport, type ExemplarSource, type SnapshotPlan } from '../genesis/build-snapshot.js';
import type { FieldIqExport } from '../genesis/export-contract.js';
import {
  getActiveSnapshotByProcedure,
  persistNewSnapshot,
  type NewSnapshotStep,
} from '../db/snapshot-repo.js';

/** Whether re-import should write a new version or no-op. Pure — the testable core of drift. */
export type ImportAction = 'unchanged' | 'create';

export function decideImportAction(
  existing: { contentHash: string } | undefined,
  incoming: { contentHash: string },
): ImportAction {
  if (existing && existing.contentHash === incoming.contentHash) return 'unchanged';
  return 'create';
}

/**
 * Copies one Genesis-hosted exemplar into Field IQ S3 and returns the durable reference.
 * Real implementation (download + put + SHA-256) is Slice 2; injected so the persist path is
 * unit-testable and the slices stay decoupled.
 */
export type ExemplarCopier = (
  src: ExemplarSource,
  ctx: { genesisProcedureId: string; sourceVersion: number; stepNumber: number },
) => Promise<{ s3Key: string; sha256: string; width: number; height: number }>;

export interface ImportResult {
  status: 'unchanged' | 'imported' | 'reimported';
  snapshotId: string;
  version: number;
  /** Exemplars actually copied + persisted (0 when no copier is wired — Slice 1). */
  exemplarsCopied: number;
  /** Exemplars present in the export but not copied because no copier was supplied. */
  exemplarsSkipped: number;
}

async function resolveSteps(
  plan: SnapshotPlan,
  copyExemplar: ExemplarCopier | undefined,
): Promise<{ steps: NewSnapshotStep[]; copied: number; skipped: number }> {
  let copied = 0;
  let skipped = 0;
  const steps: NewSnapshotStep[] = [];

  for (const step of plan.steps) {
    const exemplars = [];
    for (const src of step.exemplars) {
      if (!copyExemplar) {
        skipped += 1;
        continue;
      }
      const ref = await copyExemplar(src, {
        genesisProcedureId: plan.genesisProcedureId,
        sourceVersion: plan.sourceVersion,
        stepNumber: step.stepNumber,
      });
      exemplars.push({ angle: src.angle, ...ref });
      copied += 1;
    }
    steps.push({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      verificationPrompt: step.verificationPrompt,
      expectedStateText: step.expectedStateText,
      safetyLevel: step.safetyLevel,
      interactionType: step.interactionType,
      componentLabel: step.componentLabel,
      promptHash: step.promptHash,
      durationSec: step.durationSec,
      exemplars,
    });
  }
  return { steps, copied, skipped };
}

/**
 * Import (or re-import) a Genesis procedure into an immutable snapshot. Idempotent by
 * content hash: an unchanged procedure returns the existing active snapshot untouched.
 */
export async function importProcedureSnapshot(
  exp: FieldIqExport,
  opts?: { copyExemplar?: ExemplarCopier },
): Promise<ImportResult> {
  const plan = buildSnapshotFromExport(exp);

  const existing = await getActiveSnapshotByProcedure(plan.genesisProcedureId);
  if (decideImportAction(existing, plan) === 'unchanged') {
    return {
      status: 'unchanged',
      snapshotId: existing!.id,
      version: existing!.sourceVersion,
      exemplarsCopied: 0,
      exemplarsSkipped: 0,
    };
  }

  // Copy exemplars (network/S3 I/O) BEFORE opening the DB transaction, so the write stays short.
  const { steps, copied, skipped } = await resolveSteps(plan, opts?.copyExemplar);

  const snapshotId = await persistNewSnapshot(
    {
      genesisProjectId: plan.genesisProjectId,
      genesisProcedureId: plan.genesisProcedureId,
      title: plan.title,
      sourceVersion: plan.sourceVersion,
      contentHash: plan.contentHash,
      steps,
    },
    existing?.id ?? null,
  );

  return {
    status: existing ? 'reimported' : 'imported',
    snapshotId,
    version: plan.sourceVersion,
    exemplarsCopied: copied,
    exemplarsSkipped: skipped,
  };
}
