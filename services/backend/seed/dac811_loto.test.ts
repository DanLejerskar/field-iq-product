import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_EQUIPMENT, SEED_PROCEDURE, SEED_STEPS } from './dac811_loto.js';

const VENDOR_DOC = resolve(
  import.meta.dirname,
  '../../../vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/03_LOTO_Test_Case.md',
);

/**
 * Extract the 10 verification_prompt fenced code blocks from the vendor markdown.
 * Each block follows a line containing `verification_prompt` and its content lines are
 * indented by 2 spaces of markdown list continuation, which we strip.
 */
function extractVendorPrompts(): string[] {
  const lines = readFileSync(VENDOR_DOC, 'utf8').split('\n');
  const prompts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes('verification_prompt')) continue;
    // Advance to the opening fence.
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() !== '```') j++;
    if (j >= lines.length) continue;
    const body: string[] = [];
    j++; // first content line
    while (j < lines.length && lines[j]!.trim() !== '```') {
      body.push(lines[j]!.startsWith('  ') ? lines[j]!.slice(2) : lines[j]!);
      j++;
    }
    prompts.push(body.join('\n'));
    i = j;
  }
  return prompts;
}

describe('DAC #811 seed — verbatim prompt fidelity', () => {
  const vendorPrompts = extractVendorPrompts();

  it('extracts exactly 10 verification prompts from the vendor doc', () => {
    expect(vendorPrompts).toHaveLength(10);
  });

  it.each(SEED_STEPS.map((s, i) => [s.stepNumber, i] as const))(
    'step %i prompt matches the vendor doc character-for-character',
    (_stepNumber, index) => {
      expect(SEED_STEPS[index]!.verificationPrompt).toBe(vendorPrompts[index]);
    },
  );
});

describe('DAC #811 seed — integrity', () => {
  it('has 10 steps numbered 1..10 in order', () => {
    expect(SEED_STEPS).toHaveLength(10);
    expect(SEED_STEPS.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(SEED_PROCEDURE.steps).toBe(SEED_STEPS);
  });

  it('every step has the required fields populated', () => {
    for (const step of SEED_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(0);
      expect(step.verificationPrompt.length).toBeGreaterThan(0);
      expect(step.successCriteria.length).toBeGreaterThan(0);
      expect(step.verificationRequired).toBe(true);
      expect(step.retryThreshold).toBe(3);
    }
  });

  it('binds the canonical DAC #811 equipment identifiers', () => {
    expect(SEED_EQUIPMENT.qrCodeValue).toBe('EON-LOTO-DAC811-01');
    expect(SEED_EQUIPMENT.assetTag).toBe('DAC-811-01');
    expect(SEED_PROCEDURE.version).toBe('1.0.0');
  });
});
