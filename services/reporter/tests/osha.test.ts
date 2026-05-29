import { describe, expect, it } from 'vitest';
import { citationsFor, COMPLIANCE_HEADER, OSHA_MAPPING } from '../src/osha.js';

describe('OSHA 1910.147 mapping', () => {
  it('covers every step 1..10', () => {
    for (let n = 1; n <= 10; n++) {
      expect(citationsFor(n).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array for unknown steps', () => {
    expect(citationsFor(99)).toEqual([]);
  });

  it('every citation cites the 1910.147 (or 1910.132 PPE) subpart', () => {
    for (const cites of Object.values(OSHA_MAPPING)) {
      for (const c of cites) {
        expect(c.paragraph).toMatch(/29 CFR 1910\.(132|147)/);
        expect(c.title.length).toBeGreaterThan(4);
      }
    }
  });

  it('includes the verbatim compliance header statement', () => {
    expect(COMPLIANCE_HEADER).toContain('29 CFR 1910.147(c)(4)(i)');
  });
});
