/**
 * Data-access for Genesis procedure snapshots (B-28). Keeps SQL out of the import service.
 * The write is a single transaction so a half-built snapshot can never become `active`.
 */
import { and, desc, eq } from 'drizzle-orm';

import { getDb } from './client.js';
import {
  procedureSnapshotExemplars,
  procedureSnapshotSteps,
  procedureSnapshots,
} from './schema.js';

/** A snapshot step plus its copied exemplars, resolved for the runtime hybrid grade (B-29). */
export interface SnapshotGradingStep {
  verificationPrompt: string;
  expectedStateText: string;
  safetyLevel: string;
  exemplars: { angle: string; s3Key: string; sha256: string }[];
}

/**
 * Load a pinned snapshot step's rubric + expected-state + exemplars for grading (B-29).
 * Returns `undefined` when the snapshot has no such step (the caller falls back to the
 * legacy `steps` table). One small query for the step, one for its exemplars.
 */
export async function getSnapshotStepForGrading(
  snapshotId: string,
  stepNumber: number,
): Promise<SnapshotGradingStep | undefined> {
  const [step] = await getDb()
    .select()
    .from(procedureSnapshotSteps)
    .where(
      and(
        eq(procedureSnapshotSteps.snapshotId, snapshotId),
        eq(procedureSnapshotSteps.stepNumber, stepNumber),
      ),
    );
  if (!step) return undefined;
  const exemplars = await getDb()
    .select()
    .from(procedureSnapshotExemplars)
    .where(eq(procedureSnapshotExemplars.stepId, step.id));
  return {
    verificationPrompt: step.verificationPrompt,
    expectedStateText: step.expectedStateText,
    safetyLevel: step.safetyLevel,
    exemplars: exemplars.map((e) => ({ angle: e.angle, s3Key: e.s3Key, sha256: e.sha256 })),
  };
}

export async function getActiveSnapshotByProcedure(genesisProcedureId: string) {
  const [row] = await getDb()
    .select()
    .from(procedureSnapshots)
    .where(
      and(
        eq(procedureSnapshots.genesisProcedureId, genesisProcedureId),
        eq(procedureSnapshots.status, 'active'),
      ),
    )
    .orderBy(desc(procedureSnapshots.importedAt));
  return row;
}

/** Step row to insert, with its exemplars already copied into Field IQ S3. */
export interface NewSnapshotStep {
  stepNumber: number;
  title: string;
  description: string;
  verificationPrompt: string;
  expectedStateText: string;
  safetyLevel: string;
  interactionType: string | null;
  componentLabel: string | null;
  promptHash: string;
  durationSec: number | null;
  exemplars: NewSnapshotExemplar[];
}

export interface NewSnapshotExemplar {
  angle: string;
  s3Key: string;
  sha256: string;
  width: number;
  height: number;
}

export interface NewSnapshot {
  genesisProjectId: string;
  genesisProcedureId: string;
  title: string;
  sourceVersion: number;
  contentHash: string;
  steps: NewSnapshotStep[];
}

/**
 * Atomically write a new `active` snapshot (+ its steps + exemplars) and, if `supersedeId` is
 * given, flip that prior snapshot to `superseded` and link it forward. Returns the new id.
 */
export async function persistNewSnapshot(
  snap: NewSnapshot,
  supersedeId: string | null,
): Promise<string> {
  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(procedureSnapshots)
      .values({
        genesisProjectId: snap.genesisProjectId,
        genesisProcedureId: snap.genesisProcedureId,
        title: snap.title,
        sourceVersion: snap.sourceVersion,
        contentHash: snap.contentHash,
        status: 'active',
      })
      .returning({ id: procedureSnapshots.id });
    const snapshotId = created!.id;

    for (const step of snap.steps) {
      const [stepRow] = await tx
        .insert(procedureSnapshotSteps)
        .values({
          snapshotId,
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
        })
        .returning({ id: procedureSnapshotSteps.id });
      const stepId = stepRow!.id;

      if (step.exemplars.length > 0) {
        await tx.insert(procedureSnapshotExemplars).values(
          step.exemplars.map((ex) => ({
            stepId,
            angle: ex.angle,
            s3Key: ex.s3Key,
            sha256: ex.sha256,
            width: ex.width,
            height: ex.height,
          })),
        );
      }
    }

    if (supersedeId) {
      await tx
        .update(procedureSnapshots)
        .set({ status: 'superseded', supersededBy: snapshotId })
        .where(eq(procedureSnapshots.id, supersedeId));
    }

    return snapshotId;
  });
}
