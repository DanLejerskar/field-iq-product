import { describe, expect, it } from 'vitest';

import { compileVerificationPrompt, promptHash } from './compile-prompt.js';
import type { ExportStep } from './export-contract.js';

function step(overrides: Partial<ExportStep> = {}): ExportStep {
  return {
    step_number: 1,
    title: 'Apply padlock',
    description: 'Lock your personal padlock through the hasp and confirm it is engaged.',
    expected_outcome: 'A padlock is threaded through the hasp and the shackle is fully closed.',
    safety_note: 'An open or merely-hanging padlock does not constitute a lockout.',
    critical_step: false,
    phase_name: null,
    phase_level: null,
    interaction_config: { type: 'press' },
    component_id: null,
    component_label: 'Padlock',
    camera_config: null,
    duration_sec: 45,
    ...overrides,
  };
}

describe('compileVerificationPrompt', () => {
  it('opens with the photo framing and the expected outcome as criterion 1', () => {
    const p = compileVerificationPrompt(step());
    expect(p).toContain('Look at this photo taken by a field technician performing the step "Apply padlock".');
    expect(p).toContain('(1) A padlock is threaded through the hasp');
  });

  it('adds an interaction clause as a second criterion naming the component', () => {
    const p = compileVerificationPrompt(step({ interaction_config: { type: 'press' } }));
    expect(p).toContain('(2) The Padlock has been pressed, engaged, or fastened.');
  });

  it('omits the second criterion when there is no interaction type', () => {
    const p = compileVerificationPrompt(step({ interaction_config: null }));
    expect(p).not.toContain('(2)');
  });

  it('emits a CRITICAL gate + safety note for critical steps', () => {
    const p = compileVerificationPrompt(step({ critical_step: true }));
    expect(p).toContain('⚠ CRITICAL STEP');
    expect(p).toContain('An open or merely-hanging padlock');
    expect(p).toContain('verified=true ONLY if');
  });

  it('uses the softer wording for non-critical steps', () => {
    const p = compileVerificationPrompt(step({ critical_step: false }));
    expect(p).not.toContain('⚠ CRITICAL STEP');
    expect(p).toContain('Safety note:');
    expect(p).toContain('verified=true only if');
  });

  it('handles a read interaction with no component label gracefully', () => {
    const p = compileVerificationPrompt(
      step({ interaction_config: { type: 'read' }, component_label: null }),
    );
    expect(p).toContain('The relevant component is clearly visible');
  });

  it('is deterministic and the hash tracks the text', () => {
    const a = compileVerificationPrompt(step());
    const b = compileVerificationPrompt(step());
    expect(a).toBe(b);
    expect(promptHash(a)).toBe(promptHash(b));
    expect(promptHash(a)).not.toBe(promptHash(compileVerificationPrompt(step({ critical_step: true }))));
  });
});
