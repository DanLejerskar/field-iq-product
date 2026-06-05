import { describe, expect, it } from 'vitest';
import { behaviorFor, isValidMode } from './policy.js';
import { SESSION_MODES } from './types.js';

describe('behaviorFor', () => {
  it('walkthrough → 5 expected booleans/enums', () => {
    const b = behaviorFor('walkthrough');
    expect(b.showReferenceProactively).toBe(true);
    expect(b.verifyEveryStep).toBe(true);
    expect(b.voiceAlwaysListening).toBe(false);
    expect(b.hudPowerProfile).toBe('high');
    expect(b.autoAdvanceOnVerified).toBe(false);
  });

  it('standby → 5 expected booleans/enums', () => {
    const b = behaviorFor('standby');
    expect(b.showReferenceProactively).toBe(false);
    expect(b.verifyEveryStep).toBe(false);
    expect(b.voiceAlwaysListening).toBe(true);
    expect(b.hudPowerProfile).toBe('low');
    expect(b.autoAdvanceOnVerified).toBe(true);
  });

  it('is referentially transparent — same input → same output (100 calls)', () => {
    for (const mode of SESSION_MODES) {
      const first = behaviorFor(mode);
      for (let i = 0; i < 100; i++) {
        const next = behaviorFor(mode);
        expect(next).toEqual(first);
      }
    }
  });

  it('returns a fresh object each call (no shared mutable singleton)', () => {
    const a = behaviorFor('walkthrough');
    const b = behaviorFor('walkthrough');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('isValidMode', () => {
  it('accepts the two valid modes', () => {
    expect(isValidMode('walkthrough')).toBe(true);
    expect(isValidMode('standby')).toBe(true);
  });

  it('rejects everything else', () => {
    const negatives: unknown[] = [
      null,
      undefined,
      '',
      'Walkthrough',
      'WALKTHROUGH',
      'walk-through',
      'walk through',
      'walkthrough ',
      ' standby',
      'standby ',
      'stand-by',
      'standy',
      'walthrough',
      'guided',
      'expert',
      0,
      1,
      true,
      false,
      [],
      ['walkthrough'],
      {},
      { mode: 'walkthrough' },
      Symbol('walkthrough'),
      () => 'walkthrough',
    ];
    for (const n of negatives) expect(isValidMode(n)).toBe(false);
  });

  it('narrows the type when true', () => {
    const v: unknown = 'walkthrough';
    if (isValidMode(v)) {
      // Type-level check: at this point `v` is a SessionMode, so behaviorFor accepts it.
      const b = behaviorFor(v);
      expect(b.showReferenceProactively).toBe(true);
    } else {
      throw new Error('isValidMode should have narrowed');
    }
  });
});
