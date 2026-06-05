import { describe, expect, it } from 'vitest';
import { currentProvider, getReferenceFor, mockProvider } from './index.js';

const PROC = 'dac811-loto';

describe('getReferenceFor — glasses surface', () => {
  it('returns a Reference for every step 1..10', async () => {
    for (let step = 1; step <= 10; step++) {
      const ref = await getReferenceFor(PROC, step, 'glasses');
      expect(ref, `glasses ref for step ${step}`).not.toBeNull();
      expect(ref!.stepId).toBe(`${PROC}-step${step}`);
      expect(ref!.url).toMatch(/\.svg$/);
      expect(['image', 'gif']).toContain(ref!.kind);
    }
  });

  it('marks the three animated steps as kind="gif" with a durationMs', async () => {
    for (const step of [5, 7, 8]) {
      const ref = await getReferenceFor(PROC, step, 'glasses');
      expect(ref!.kind, `glasses kind for step ${step}`).toBe('gif');
      expect(ref!.durationMs, `durationMs for step ${step}`).toBeGreaterThan(0);
    }
  });
});

describe('getReferenceFor — phone surface', () => {
  it('returns a 3D scene Reference for steps 3, 5, 8', async () => {
    for (const step of [3, 5, 8]) {
      const ref = await getReferenceFor(PROC, step, 'phone');
      expect(ref, `phone ref for step ${step}`).not.toBeNull();
      expect(ref!.kind).toBe('scene3d');
      expect(ref!.sceneManifest).toBeTruthy();
      expect(ref!.sceneManifest!.sceneId).toContain(`step${step.toString().padStart(2, '0')}`);
      expect(ref!.sceneManifest!.components.length).toBeGreaterThan(0);
    }
  });

  it('returns null for steps without a phone surface', async () => {
    for (const step of [1, 2, 4, 6, 7, 9, 10]) {
      const ref = await getReferenceFor(PROC, step, 'phone');
      expect(ref, `phone ref for step ${step}`).toBeNull();
    }
  });
});

describe('getReferenceFor — dashboard surface', () => {
  it('returns an image Reference for every step 1..10', async () => {
    for (let step = 1; step <= 10; step++) {
      const ref = await getReferenceFor(PROC, step, 'dashboard');
      expect(ref, `dashboard ref for step ${step}`).not.toBeNull();
      expect(ref!.kind).toBe('image');
      expect(ref!.url).toMatch(/\.svg$/);
    }
  });
});

describe('getReferenceFor — failure modes', () => {
  it('returns null for a step outside 1..10', async () => {
    expect(await getReferenceFor(PROC, 0, 'glasses')).toBeNull();
    expect(await getReferenceFor(PROC, 11, 'glasses')).toBeNull();
    expect(await getReferenceFor(PROC, -1, 'glasses')).toBeNull();
    expect(await getReferenceFor(PROC, 999, 'glasses')).toBeNull();
  });

  it('returns null for an unknown procedureId', async () => {
    expect(await getReferenceFor('not-a-procedure', 1, 'glasses')).toBeNull();
    expect(await getReferenceFor('', 1, 'glasses')).toBeNull();
  });

  it('does not crash on a typo deviceKind; returns null', async () => {
    // Cast through unknown — type system already prevents this at the call site;
    // we're confirming the runtime is defensive.
    const bad = 'tablet' as unknown as 'glasses';
    expect(await getReferenceFor(PROC, 1, bad)).toBeNull();
  });
});

describe('default provider', () => {
  it('is the mock provider', () => {
    expect(currentProvider()).toBe(mockProvider);
  });
});
