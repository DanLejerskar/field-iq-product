/**
 * OSHA 29 CFR 1910.147 mapping for the DAC #811 10-step LOTO procedure.
 * Each step satisfies one or more standard paragraphs; the compliance summary
 * page of the audit report renders this side-by-side with the verdict.
 *
 * Sources: 29 CFR 1910.147 (public domain) + DAC Course 811-500 reference matrix
 * (`03_LOTO_Test_Case.md §7`).
 */
export interface OshaCitation {
  paragraph: string;
  title: string;
}

export const OSHA_MAPPING: Record<number, OshaCitation[]> = {
  1: [
    { paragraph: '29 CFR 1910.132(a)', title: 'PPE — general requirements' },
    { paragraph: '29 CFR 1910.147(c)(7)', title: 'Training and communication — PPE preparation' },
  ],
  2: [
    {
      paragraph: '29 CFR 1910.147(c)(4)(ii)(A)',
      title: 'Identification of the equipment to be locked out',
    },
  ],
  3: [
    {
      paragraph: '29 CFR 1910.147(c)(4)(ii)(A)',
      title: 'Identification of all hazardous energy sources',
    },
  ],
  4: [{ paragraph: '29 CFR 1910.147(d)(2)', title: 'Machine or equipment shutdown' }],
  5: [
    {
      paragraph: '29 CFR 1910.147(d)(3)',
      title: 'Machine or equipment isolation (electrical disconnect)',
    },
  ],
  6: [
    {
      paragraph: '29 CFR 1910.147(d)(4)(i)',
      title: 'Lockout — physical application of the lockout device',
    },
  ],
  7: [
    {
      paragraph: '29 CFR 1910.147(d)(4)(i)',
      title: 'Personal padlock — authorized employee identification',
    },
  ],
  8: [{ paragraph: '29 CFR 1910.147(d)(3)', title: 'Isolation of stored fluid energy' }],
  9: [
    {
      paragraph: '29 CFR 1910.147(d)(4)(ii)',
      title: 'Tagout — warning device application',
    },
    {
      paragraph: '29 CFR 1910.147(c)(5)(ii)(D)',
      title: 'Tag legibility and warning content',
    },
  ],
  10: [
    {
      paragraph: '29 CFR 1910.147(d)(6)',
      title: 'Verification of de-energization (zero-energy test)',
    },
  ],
};

export function citationsFor(stepNumber: number): OshaCitation[] {
  return OSHA_MAPPING[stepNumber] ?? [];
}

/** Header statement printed on the compliance summary page. */
export const COMPLIANCE_HEADER =
  'This document constitutes a photographic verification record of LOTO compliance per OSHA 29 CFR 1910.147(c)(4)(i).';
