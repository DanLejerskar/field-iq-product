import { describe, expect, it } from 'vitest';
import { buildHashChain, chainStep, signReport, verifyReport } from '../src/signing.js';

const KEY = 'a'.repeat(64);

describe('hash chain', () => {
  it('is deterministic — same input → same final link', () => {
    const input = [{ stepNumber: 1, verified: true }];
    expect(buildHashChain(input).finalLink).toBe(buildHashChain(input).finalLink);
  });

  it('changes when ANY step changes (tamper detection)', () => {
    const a = buildHashChain([
      { stepNumber: 1, verified: true },
      { stepNumber: 2, verified: true },
    ]);
    const b = buildHashChain([
      { stepNumber: 1, verified: true },
      { stepNumber: 2, verified: false },
    ]);
    expect(a.finalLink).not.toBe(b.finalLink);
  });

  it('changes when step ORDER changes (chain ordering)', () => {
    const a = buildHashChain([
      { stepNumber: 1, verified: true },
      { stepNumber: 2, verified: true },
    ]);
    const b = buildHashChain([
      { stepNumber: 2, verified: true },
      { stepNumber: 1, verified: true },
    ]);
    expect(a.finalLink).not.toBe(b.finalLink);
  });

  it('chainStep is associative with buildHashChain', () => {
    const ZERO = '0'.repeat(64);
    const manual = chainStep(chainStep(ZERO, { stepNumber: 1 }), { stepNumber: 2 });
    const built = buildHashChain([{ stepNumber: 1 }, { stepNumber: 2 }]).finalLink;
    expect(manual).toBe(built);
  });

  it('returns one link per step', () => {
    const chain = buildHashChain([
      { stepNumber: 1, verified: true },
      { stepNumber: 2, verified: false },
      { stepNumber: 3, verified: true },
    ]);
    expect(chain.links).toHaveLength(3);
    expect(chain.finalLink).toBe(chain.links[2]);
  });
});

describe('signature', () => {
  it('round-trips signReport / verifyReport', () => {
    const final = 'a'.repeat(64);
    const sig = signReport(final, KEY);
    expect(verifyReport(final, sig, KEY)).toBe(true);
    expect(verifyReport(final, sig, 'b'.repeat(64))).toBe(false);
  });

  it('signature changes if the final link changes', () => {
    expect(signReport('a'.repeat(64), KEY)).not.toBe(signReport('b'.repeat(64), KEY));
  });
});
