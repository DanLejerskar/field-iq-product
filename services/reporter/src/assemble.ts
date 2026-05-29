/** Stitches DB rows + photo presigns + hash chain + signature into ReportData. */
import type { ReportSessionRow } from './data.js';
import { buildHashChain, signReport, type StepHashInput } from './signing.js';
import { presignGet } from './storage.js';
import type { ReportData, ReportStep, ReportTrainerNote } from './templates/SessionReport.js';

interface AssembleOptions {
  format: 'letter' | 'a4';
  signingKey: string;
}

export async function assembleReport(
  row: ReportSessionRow,
  options: AssembleOptions,
): Promise<ReportData> {
  // Latest non-superseded verdict per step.
  const verdictsByStep = new Map<number, ReportSessionRow['audit'][number]>();
  for (const a of row.audit) {
    if (a.stepNumber === null) continue;
    if (a.supersededBy) continue;
    if (a.eventType !== 'verified' && a.eventType !== 'error' && a.eventType !== 'retry') continue;
    const existing = verdictsByStep.get(a.stepNumber);
    if (!existing || a.timestamp > existing.timestamp) verdictsByStep.set(a.stepNumber, a);
  }
  const retryCountByStep = new Map<number, number>();
  for (const a of row.audit) {
    if (a.stepNumber === null || a.eventType !== 'retry') continue;
    retryCountByStep.set(a.stepNumber, (retryCountByStep.get(a.stepNumber) ?? 0) + 1);
  }

  const steps: ReportStep[] = [];
  const chainInputs: StepHashInput[] = [];

  for (const s of row.steps) {
    const verdict = verdictsByStep.get(s.stepNumber);
    const photoUrl = verdict?.photoUrl ?? null;
    const photoSignedUrl = photoUrl ? await presignGet(photoUrl).catch(() => undefined) : undefined;

    steps.push({
      stepNumber: s.stepNumber,
      title: s.title,
      instruction: s.instruction,
      photoSignedUrl: photoSignedUrl ?? undefined,
      retryCount: retryCountByStep.get(s.stepNumber) ?? 0,
      verdict: verdict
        ? {
            verified: !!verdict.verified,
            confidence: verdict.confidence ?? undefined,
            message: verdict.message ?? undefined,
            detail: verdict.detail ?? undefined,
            timestamp: verdict.timestamp.toISOString(),
          }
        : undefined,
    });

    chainInputs.push({
      stepNumber: s.stepNumber,
      photoSha256: verdict?.photoSha256 ?? undefined,
      verified: verdict?.verified ?? undefined,
      confidence: verdict?.confidence ?? undefined,
      message: verdict?.message ?? undefined,
      detail: verdict?.detail ?? undefined,
      timestamp: verdict?.timestamp.toISOString(),
    });
  }

  const trainerNotes: ReportTrainerNote[] = row.audit
    .filter((a) => a.eventType === 'note' && a.detail)
    .map((a) => ({
      timestamp: a.timestamp.toISOString(),
      stepNumber: a.stepNumber ?? undefined,
      text: a.detail!,
    }));

  const { links, finalLink } = buildHashChain(chainInputs);
  const signature = signReport(finalLink, options.signingKey);

  return {
    sessionId: row.sessionId,
    procedureTitle: row.procedureTitle,
    procedureVersion: row.procedureVersion,
    equipmentName: row.equipmentName,
    assetTag: row.assetTag,
    technicianName: row.technicianName,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    durationMs: row.completedAt.getTime() - row.startedAt.getTime(),
    steps,
    trainerNotes,
    hashChain: links.map((link, i) => ({ stepNumber: row.steps[i]!.stepNumber, link })),
    finalLink,
    signature,
    signedAt: new Date().toISOString(),
    format: options.format,
  };
}
