import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSnapshotFromExport } from '../genesis/build-snapshot.js';
import type { FieldIqExport } from '../genesis/export-contract.js';
import {
  buildMaterializePlan,
  pickReferenceView,
  resolveImageUrl,
} from './snapshot-materializer.js';

const FIXTURE = resolve(import.meta.dirname, '../genesis/__fixtures__/fieldiq-export-loto.json');

function loadExport(): FieldIqExport {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as FieldIqExport;
}

describe('resolveImageUrl', () => {
  it('passes absolute URLs through', () => {
    expect(resolveImageUrl('https://x.test/a.png', 'https://genesis.test')).toBe(
      'https://x.test/a.png',
    );
  });

  it('absolutizes a relative path against the Genesis base', () => {
    expect(resolveImageUrl('/renders/a.png', 'https://genesis.test/')).toBe(
      'https://genesis.test/renders/a.png',
    );
  });

  it('returns the raw path when no base is configured', () => {
    expect(resolveImageUrl('/renders/a.png')).toBe('/renders/a.png');
  });
});

describe('pickReferenceView', () => {
  it('prefers the authored angle', () => {
    expect(
      pickReferenceView([
        { angle: 'front', image_url: 'f.png' },
        { angle: 'authored', image_url: 'a.png' },
      ]),
    ).toBe('a.png');
  });

  it('falls back to the first view', () => {
    expect(
      pickReferenceView([
        { angle: 'front', image_url: 'f.png' },
        { angle: 'side', image_url: 's.png' },
      ]),
    ).toBe('f.png');
  });

  it('returns null for no views', () => {
    expect(pickReferenceView(undefined)).toBeNull();
    expect(pickReferenceView([])).toBeNull();
  });
});

describe('buildMaterializePlan (against the captured Genesis fixture)', () => {
  const exp = loadExport();
  const plan = buildSnapshotFromExport(exp);
  const result = buildMaterializePlan(exp, plan, { genesisBaseUrl: 'https://genesis.test' });

  it('derives deterministic equipment from the Genesis project', () => {
    expect(result.equipment.qrCodeValue).toBe(`GENESIS-${exp.procedure.project_id}`);
    expect(result.equipment.name).toBe(exp.procedure.title);
    expect(result.equipment.metadata.genesisProcedureId).toBe(exp.procedure.id);
  });

  it('pins the procedure version to the Genesis source version', () => {
    expect(result.procedure.version).toBe(`genesis-v${exp.procedure.version}`);
    expect(result.procedure.totalSteps).toBe(exp.steps.length);
  });

  it('maps every step, in order', () => {
    expect(result.steps.map((s) => s.stepNumber)).toEqual(
      [...exp.steps].map((s) => s.step_number).sort((a, b) => a - b),
    );
  });

  it('appends safety notes to the instruction', () => {
    const src = exp.steps.find((s) => s.safety_note);
    expect(src).toBeDefined();
    const mapped = result.steps.find((s) => s.stepNumber === src!.step_number)!;
    expect(mapped.instruction).toContain(src!.safety_note!);
    expect(mapped.instruction).toContain(src!.description);
  });

  it('every step requires verification and carries a non-empty compiled prompt', () => {
    // A null/empty prompt means Claude gets an empty instruction and returns the
    // safe retry verdict for every photo (live failure, 2026-06-11) — guard it.
    for (const mapped of result.steps) {
      expect(mapped.verificationRequired).toBe(true);
      expect(mapped.verificationPrompt).toBeTruthy();
      expect(mapped.verificationPrompt!.length).toBeGreaterThan(20);
    }
  });

  it('gives rendered steps a reference image', () => {
    const rendered = exp.steps.filter((s) => (s.expected_views?.length ?? 0) > 0);
    expect(rendered.length).toBeGreaterThan(0);
    for (const src of rendered) {
      const mapped = result.steps.find((s) => s.stepNumber === src.step_number)!;
      expect(mapped.referenceImageUrl).toBeTruthy();
    }
  });

  it('uses the first available reference image as the equipment headline photo', () => {
    const firstWithImage = result.steps.find((s) => s.referenceImageUrl);
    expect(result.equipment.photoUrl).toBe(firstWithImage!.referenceImageUrl);
  });

  it('carries durations through', () => {
    const src = exp.steps.find((s) => s.duration_sec != null)!;
    const mapped = result.steps.find((s) => s.stepNumber === src.step_number)!;
    expect(mapped.expectedDurationSeconds).toBe(src.duration_sec);
  });
});
