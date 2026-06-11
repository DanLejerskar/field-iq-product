/**
 * Snapshot materializer — the bridge's last mile.
 *
 * `importProcedureSnapshot` (B-28) writes an immutable *snapshot*; sessions, however, run
 * off the live `equipment` / `procedures` / `steps` tables. This module converts a Genesis
 * export (+ its compiled snapshot plan) into those live rows so the glasses/phone
 * "Start LOTO session" flow can actually pick the imported procedure up.
 *
 * Shape: a pure mapping core (`buildMaterializePlan`) that is unit-tested against the
 * captured Genesis fixture, plus a thin idempotent DB writer (`materializePlan`).
 *
 * Idempotency: equipment upserts on its deterministic `qrCodeValue`
 * (`GENESIS-<project_id>`), and a procedure that already exists for the same equipment +
 * version is returned untouched — re-running an import is safe.
 *
 * DEMO-SAFETY NOTE: `/api/admin/equipment` orders newest-first and the glasses webapp
 * starts sessions on index 0, so materializing makes the Genesis procedure the default
 * demo. That is the point — but it's why materialization is opt-in (`?materialize=true`)
 * rather than part of every import. Rollback: DELETE /api/admin/equipment/:id.
 */
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '../db/client.js';
import { equipment, organizations, procedures, steps } from '../db/schema.js';
import type { SnapshotPlan } from '../genesis/build-snapshot.js';
import type { FieldIqExport } from '../genesis/export-contract.js';

export interface MaterializeStepPlan {
  stepNumber: number;
  title: string;
  instruction: string;
  verificationRequired: boolean;
  verificationPrompt: string | null;
  successCriteria: string | null;
  referenceImageUrl: string | null;
  expectedDurationSeconds: number | null;
}

export interface MaterializePlanResult {
  equipment: {
    name: string;
    assetTag: string;
    qrCodeValue: string;
    description: string;
    photoUrl: string | null;
    metadata: Record<string, unknown>;
  };
  procedure: {
    name: string;
    version: string;
    description: string | null;
    totalSteps: number;
  };
  steps: MaterializeStepPlan[];
}

/** Absolutize a Genesis-relative image URL against the configured Genesis base. */
export function resolveImageUrl(imageUrl: string, genesisBaseUrl?: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (!genesisBaseUrl) return imageUrl;
  const base = genesisBaseUrl.replace(/\/$/, '');
  return imageUrl.startsWith('/') ? `${base}${imageUrl}` : `${base}/${imageUrl}`;
}

/** Prefer the deliberately authored render; fall back to the first available view. */
export function pickReferenceView(
  views: { angle: string; image_url: string }[] | undefined,
): string | null {
  if (!views || views.length === 0) return null;
  const authored = views.find((v) => v.angle === 'authored');
  return (authored ?? views[0]!).image_url;
}

/**
 * Pure mapping: Genesis export + compiled snapshot plan → live-table row plans.
 * The snapshot plan supplies the compiled verification prompts (single source of truth for
 * prompt text); the export supplies everything the snapshot doesn't carry (image URLs,
 * safety notes).
 */
export function buildMaterializePlan(
  exp: FieldIqExport,
  plan: SnapshotPlan,
  opts: { genesisBaseUrl?: string } = {},
): MaterializePlanResult {
  const exportByNumber = new Map(exp.steps.map((s) => [s.step_number, s]));

  const stepPlans: MaterializeStepPlan[] = plan.steps.map((s) => {
    const src = exportByNumber.get(s.stepNumber);
    const reference = pickReferenceView(src?.expected_views);
    const safetyNote = src?.safety_note;
    return {
      stepNumber: s.stepNumber,
      title: s.title,
      instruction: safetyNote ? `${s.description}\n⚠ ${safetyNote}` : s.description,
      // Every step carries its compiled prompt and is photo-verified. The webapp's
      // step card always offers the camera; a null prompt here meant Claude received
      // an empty instruction and returned the safe retry verdict on every photo
      // (live failure, 2026-06-11). compile-prompt already produces a sensible
      // "component clearly visible" rubric for read-style steps, so use it.
      verificationRequired: true,
      verificationPrompt: s.verificationPrompt,
      successCriteria: s.expectedStateText || null,
      referenceImageUrl: reference ? resolveImageUrl(reference, opts.genesisBaseUrl) : null,
      expectedDurationSeconds: s.durationSec,
    };
  });

  const headlinePhoto = stepPlans.find((s) => s.referenceImageUrl)?.referenceImageUrl ?? null;

  return {
    equipment: {
      name: plan.title,
      assetTag: `GEN-${plan.genesisProjectId.slice(0, 8).toUpperCase()}`,
      qrCodeValue: `GENESIS-${plan.genesisProjectId}`,
      description: `Imported from EON Genesis (project ${plan.genesisProjectId})`,
      photoUrl: headlinePhoto,
      metadata: {
        genesisProjectId: plan.genesisProjectId,
        genesisProcedureId: plan.genesisProcedureId,
        genesisSourceVersion: plan.sourceVersion,
        genesisContentHash: plan.contentHash,
      },
    },
    procedure: {
      name: plan.title,
      version: `genesis-v${plan.sourceVersion}`,
      description: exp.procedure.source ?? null,
      totalSteps: stepPlans.length,
    },
    steps: stepPlans,
  };
}

export interface MaterializeResult {
  orgId: string;
  equipmentId: string;
  procedureId: string;
  /** false when the procedure for this equipment+version already existed (no-op re-run). */
  procedureCreated: boolean;
  stepsInserted: number;
  /** Steps updated in place on a `refreshSteps` re-run of an existing procedure. */
  stepsUpdated: number;
}

/** Oldest org wins — that's the seeded demo org. Callers may override via `orgId`. */
async function resolveOrgId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const [org] = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) throw new Error('No organization exists — run the seed first');
  return org.id;
}

/**
 * Idempotent write of a materialize plan into the live tables. With `refreshSteps`, an
 * existing procedure's step rows are updated in place (matched by step number) instead of
 * being skipped — used to repair/retune an already-materialized procedure without bumping
 * its version. Updates rather than delete+reinsert so `session_steps` FK references from
 * past sessions stay intact.
 */
export async function materializePlan(
  result: MaterializePlanResult,
  opts: { orgId?: string; refreshSteps?: boolean } = {},
): Promise<MaterializeResult> {
  const db = getDb();
  const orgId = await resolveOrgId(opts.orgId);

  const [eqRow] = await db
    .insert(equipment)
    .values({ orgId, ...result.equipment })
    .onConflictDoUpdate({
      target: equipment.qrCodeValue,
      set: {
        name: result.equipment.name,
        description: result.equipment.description,
        photoUrl: result.equipment.photoUrl,
        metadata: result.equipment.metadata,
      },
    })
    .returning({ id: equipment.id });
  const equipmentId = eqRow!.id;

  const [existing] = await db
    .select({ id: procedures.id })
    .from(procedures)
    .where(
      and(
        eq(procedures.equipmentId, equipmentId),
        eq(procedures.version, result.procedure.version),
      ),
    );
  if (existing) {
    let stepsUpdated = 0;
    if (opts.refreshSteps) {
      stepsUpdated = await db.transaction(async (tx) => {
        let updated = 0;
        for (const s of result.steps) {
          const { stepNumber, ...fields } = s;
          const rows = await tx
            .update(steps)
            .set(fields)
            .where(and(eq(steps.procedureId, existing.id), eq(steps.stepNumber, stepNumber)))
            .returning({ id: steps.id });
          if (rows.length === 0) {
            await tx.insert(steps).values({ procedureId: existing.id, ...s });
          }
          updated += 1;
        }
        return updated;
      });
    }
    return {
      orgId,
      equipmentId,
      procedureId: existing.id,
      procedureCreated: false,
      stepsInserted: 0,
      stepsUpdated,
    };
  }

  const procedureId = await db.transaction(async (tx) => {
    const [proc] = await tx
      .insert(procedures)
      .values({ equipmentId, ...result.procedure })
      .returning({ id: procedures.id });
    const procId = proc!.id;
    await tx.insert(steps).values(result.steps.map((s) => ({ procedureId: procId, ...s })));
    return procId;
  });

  return {
    orgId,
    equipmentId,
    procedureId,
    procedureCreated: true,
    stepsInserted: result.steps.length,
    stepsUpdated: 0,
  };
}
