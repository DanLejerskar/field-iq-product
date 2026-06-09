/**
 * P-204 acceptance-test seed sanity checks.
 *
 * The verification prompts here are NOT vendor-document-anchored (unlike the
 * DAC #811 seed), so the tests just enforce structural invariants: 12 steps,
 * expected titles in expected order, kit-component-bearing steps carry an
 * inlined JPEG data URI, and the procedure metadata is consistent.
 */

import { describe, expect, it } from 'vitest';
import {
  SEED_EQUIPMENT,
  SEED_ORG,
  SEED_PROCEDURE,
  SEED_STEPS,
  SEED_USERS,
} from './p204_acceptance.js';

describe('P-204 acceptance test seed', () => {
  it('declares EON AI Ventures as the org with 365-day photo retention', () => {
    expect(SEED_ORG.name).toBe('EON AI Ventures');
    expect(SEED_ORG.settings).toMatchObject({ photoRetentionDays: 365 });
  });

  it('seeds the three canonical users in the cast', () => {
    const emails = SEED_USERS.map((u) => u.email).sort();
    expect(emails).toEqual([
      'carlos.romero@eonreality.com',
      'maya.wu@eonreality.com',
      'priya.patel@eonreality.com',
    ]);
  });

  it('describes Pump Skid P-204 with the run-book QR value', () => {
    expect(SEED_EQUIPMENT.qrCodeValue).toBe('EON-LOTO-P204-01');
    expect(SEED_EQUIPMENT.assetTag).toBe('P-204');
    expect(SEED_EQUIPMENT.name).toContain('P-204');
  });

  it('has exactly 12 steps in the right order with the expected titles', () => {
    const titles = SEED_STEPS.map((s) => s.title);
    expect(titles).toEqual([
      'NOTIFY',
      'IDENTIFY THE SKID',
      'SHUTDOWN',
      'IDENTIFY ELECTRICAL',
      'LOCKOUT THE BREAKER',
      'IDENTIFY VALVE',
      'LOCKOUT THE VALVE',
      'IDENTIFY PNEUMATIC',
      'LOCKOUT THE PLUG',
      'APPLY GROUP HASP',
      'PERSONAL LOCK + TAG',
      'VERIFY ZERO ENERGY',
    ]);
    expect(SEED_STEPS.map((s) => s.stepNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('embeds a JPEG data URI on every step (so the glasses HUD can render a reference photo)', () => {
    for (const step of SEED_STEPS) {
      expect(step.referenceImageUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
      // A non-trivial body — guards against accidental empty/placeholder URIs.
      expect(step.referenceImageUrl.length).toBeGreaterThan(1024);
    }
  });

  it('wires the right site photo into the right step (identify-style steps + overview)', () => {
    const ref = (n: number) => SEED_STEPS[n - 1]!.referenceImageUrl;

    // P-204 overview shot used on the bookend / context steps.
    expect(ref(1)).toBe(ref(2)); // NOTIFY + IDENTIFY SKID share the overview
    expect(ref(2)).toBe(ref(3)); // IDENTIFY SKID + SHUTDOWN
    expect(ref(3)).toBe(ref(12)); // SHUTDOWN + VERIFY ZERO ENERGY

    // The three IDENTIFY-this-isolation-point steps each get a DISTINCT
    // industrial scene photo (BR, V, PN — not the overview, not each other).
    const identifyRefs = [ref(4), ref(6), ref(8)];
    expect(new Set(identifyRefs).size).toBe(3);
    for (const r of identifyRefs) expect(r).not.toBe(ref(2));

    // Kit-component steps each have a distinct kit photo, separate from any
    // of the site photos.
    const componentRefs = new Set([ref(5), ref(7), ref(9), ref(10), ref(11)]);
    expect(componentRefs.size).toBe(5);
    for (const r of componentRefs) {
      expect(r).not.toBe(ref(2)); // not the overview
      expect(r).not.toBe(ref(4)); // not BR
      expect(r).not.toBe(ref(6)); // not V
      expect(r).not.toBe(ref(8)); // not PN
    }
  });

  it('marks every step as verificationRequired with retryThreshold=3', () => {
    for (const step of SEED_STEPS) {
      expect(step.verificationRequired).toBe(true);
      expect(step.retryThreshold).toBe(3);
    }
  });

  it('declares the procedure as the active 12-step LOTO acceptance test', () => {
    expect(SEED_PROCEDURE.isActive).toBe(true);
    expect(SEED_PROCEDURE.steps.length).toBe(12);
    expect(SEED_PROCEDURE.version).toMatch(/^1\.\d+\.\d+$/);
    expect(SEED_PROCEDURE.name).toContain('P-204');
  });
});
