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

  it('points the kit-bearing steps at the correct component image', () => {
    // Map: stepNumber → expected first ~20 chars of the base64 body that
    // identifies which physical component the reference photo shows.
    // We don't assert image bytes here; we just confirm a consistent URI was
    // wired in (i.e. the same image is reused as the "wall" backdrop on
    // QR-only steps, and a distinct one on each kit-component step).
    const ref = (n: number) => SEED_STEPS[n - 1]!.referenceImageUrl;

    // QR-only steps all use the same wall scene.
    expect(ref(1)).toBe(ref(2));
    expect(ref(2)).toBe(ref(3));
    expect(ref(3)).toBe(ref(4));
    expect(ref(4)).toBe(ref(6));
    expect(ref(6)).toBe(ref(8));
    expect(ref(8)).toBe(ref(12));

    // Kit-component steps each have a distinct image.
    const componentRefs = new Set([ref(5), ref(7), ref(9), ref(10), ref(11)]);
    expect(componentRefs.size).toBe(5);
    // And none of the component refs is the wall fallback.
    for (const r of componentRefs) expect(r).not.toBe(ref(1));
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
