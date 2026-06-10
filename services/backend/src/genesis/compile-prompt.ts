/**
 * Deterministic compile of a per-step `verification_prompt` from the Genesis export fields.
 *
 * Decision (2026-06-05, captain): the prompt-authoring home is a **pure TS template** — no
 * Anthropic call at import time. This honors CLAUDE.md's "do not call the Anthropic API from
 * the Node backend", keeps the compile fully unit-testable, and is reproducible byte-for-byte
 * (so `prompt_hash` is a stable version anchor). Claude-assisted authoring can come later as a
 * separate authoring-time tool; it is explicitly out of scope here. See
 * `docs/live/genesis-integration-architecture.md §9` (open sub-Q "prompt-authoring home").
 *
 * The output voice matches the seeded LOTO prompts (`seed/dac811_loto.ts`): an imperative
 * grading instruction that ends by telling the grader to return `verified=true` only when the
 * expected state is unambiguous, and to ask for a retake otherwise. The verifier grades on the
 * `verified` boolean, so the compiled prompt must speak that language.
 */
import { createHash } from 'node:crypto';

import type { ExportStep } from './export-contract.js';

/** Maps a Genesis interaction type to a short clause naming what the photo should evidence. */
function interactionClause(type: string | undefined, component: string | null): string | null {
  const what = component ? `the ${component}` : 'the relevant component';
  switch ((type ?? '').toLowerCase()) {
    case 'rotate':
      return `${what} has been moved/rotated into the required position`;
    case 'press':
      return `${what} has been pressed, engaged, or fastened`;
    case 'read':
      return `${what} is clearly visible so its state/reading can be confirmed`;
    case '':
      return null;
    default:
      return `${what} is in the expected state for this "${type}" interaction`;
  }
}

/**
 * Compile the grading prompt. Pure and deterministic: the same `ExportStep` always yields the
 * same string (no clocks, randomness, or external calls), so `promptHash` is a stable anchor.
 */
export function compileVerificationPrompt(step: ExportStep): string {
  const lines: string[] = [];

  lines.push(`Look at this photo taken by a field technician performing the step "${step.title}".`);
  lines.push('');
  if (step.description.trim()) {
    lines.push(`Step instruction: ${step.description.trim()}`);
    lines.push('');
  }

  lines.push('PASS CRITERIA — the photo must clearly show:');
  let criterion = 1;
  lines.push(`(${criterion}) ${step.expected_outcome.trim()}`);

  const clause = interactionClause(step.interaction_config?.type, step.component_label);
  if (clause) {
    criterion += 1;
    lines.push(`(${criterion}) ${capitalize(clause)}.`);
  }

  lines.push('');
  if (step.critical_step) {
    lines.push('⚠ CRITICAL STEP — verification gates worker safety.');
    if (step.safety_note?.trim()) {
      lines.push(step.safety_note.trim());
    }
    lines.push(
      'Return verified=true ONLY if every criterion above is unambiguously met. If anything is ' +
        'absent, partial, obscured, or uncertain, return verified=false and ask for a retake that ' +
        'shows the required state clearly.',
    );
  } else {
    if (step.safety_note?.trim()) {
      lines.push(`Safety note: ${step.safety_note.trim()}`);
    }
    lines.push(
      'Return verified=true only if the criteria above are met. If anything is absent, partial, ' +
        'or ambiguous, return verified=false and ask for a retake.',
    );
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** sha256 hex of the compiled prompt — the per-step version anchor (`prompt_hash`). */
export function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}
