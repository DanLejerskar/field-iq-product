import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildSnapshotFromExport,
  computeFallbackContentHash,
  resolveContentHash,
} from './build-snapshot.js';
import type { FieldIqExport } from './export-contract.js';

function loadFixture(): FieldIqExport {
  const path = resolve(import.meta.dirname, '__fixtures__/fieldiq-export-loto.json');
  return JSON.parse(readFileSync(path, 'utf8')) as FieldIqExport;
}

describe('buildSnapshotFromExport (against the real captured LOTO export)', () => {
  const exp = loadFixture();

  it('carries procedure identity + version through to the plan', () => {
    const plan = buildSnapshotFromExport(exp);
    expect(plan.genesisProcedureId).toBe(exp.procedure.id);
    expect(plan.genesisProjectId).toBe(exp.procedure.project_id);
    expect(plan.sourceVersion).toBe(exp.procedure.version);
    expect(plan.title).toBe(exp.procedure.title);
  });

  it('uses the Genesis-provided content_hash verbatim', () => {
    const plan = buildSnapshotFromExport(exp);
    expect(plan.contentHash).toBe(exp.procedure.content_hash);
  });

  it('produces one step per export step, ordered by step_number', () => {
    const plan = buildSnapshotFromExport(exp);
    expect(plan.steps).toHaveLength(exp.steps.length);
    const numbers = plan.steps.map((s) => s.stepNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('raises critical steps to CRITICAL and others to the procedure safety level', () => {
    const plan = buildSnapshotFromExport(exp);
    // Procedure-level safety is "critical" in the fixture; non-critical steps inherit it upper-cased.
    const step2 = plan.steps.find((s) => s.stepNumber === 2)!; // critical_step: true
    const step1 = plan.steps.find((s) => s.stepNumber === 1)!; // critical_step: false
    expect(step2.safetyLevel).toBe('CRITICAL');
    expect(step1.safetyLevel).toBe('CRITICAL'); // procedure safety_level === critical → upper-cased
  });

  it('maps expected_views to exemplar sources only on rendered steps', () => {
    const plan = buildSnapshotFromExport(exp);
    const withViews = plan.steps.filter((s) => s.exemplars.length > 0).map((s) => s.stepNumber);
    expect(withViews).toEqual([5, 7]);
    const step5 = plan.steps.find((s) => s.stepNumber === 5)!;
    expect(step5.exemplars.map((e) => e.angle)).toEqual(['authored', 'front', 'iso']);
    expect(step5.exemplars[0]!.sourceUrl).toContain('step-5-authored.png');
    expect(step5.exemplars[0]!.width).toBe(1024);
  });

  it('expected_state_text equals the export expected_outcome', () => {
    const plan = buildSnapshotFromExport(exp);
    const step5 = plan.steps.find((s) => s.stepNumber === 5)!;
    const src = exp.steps.find((s) => s.step_number === 5)!;
    expect(step5.expectedStateText).toBe(src.expected_outcome);
  });

  it('is deterministic — identical input yields identical prompt hashes', () => {
    const a = buildSnapshotFromExport(exp);
    const b = buildSnapshotFromExport(exp);
    expect(a.steps.map((s) => s.promptHash)).toEqual(b.steps.map((s) => s.promptHash));
  });
});

describe('content hash resolution', () => {
  it('falls back to a Field-IQ canonical hash when the export omits content_hash', () => {
    const exp = loadFixture();
    delete exp.procedure.content_hash;
    const hash = resolveContentHash(exp);
    expect(hash.startsWith('fieldiq-sha256:')).toBe(true);
    expect(hash).toBe(computeFallbackContentHash(exp.steps));
  });

  it('fallback only changes when a semantic field changes', () => {
    const exp = loadFixture();
    const base = computeFallbackContentHash(exp.steps);
    // Reordering input must not change the hash (sorted canonicalization).
    const reversed = computeFallbackContentHash([...exp.steps].reverse());
    expect(reversed).toBe(base);
    // Editing an expected_outcome must change it.
    const edited = structuredClone(exp.steps);
    edited[0]!.expected_outcome = `${edited[0]!.expected_outcome} (changed)`;
    expect(computeFallbackContentHash(edited)).not.toBe(base);
  });
});
