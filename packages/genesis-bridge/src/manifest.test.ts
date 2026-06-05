import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAC811_MANIFEST, DAC811_SCENES } from './manifest.js';
import type { SceneManifest } from './types.js';

const ASSETS_ROOT = resolve(import.meta.dirname, '..', 'assets');

describe('DAC811_MANIFEST', () => {
  it('has exactly 10 entries, one per LOTO step', () => {
    expect(DAC811_MANIFEST).toHaveLength(10);
    const numbers = DAC811_MANIFEST.map((e) => e.stepNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every glasses.url is non-empty and ends in .svg', () => {
    for (const entry of DAC811_MANIFEST) {
      expect(entry.glasses.url.length).toBeGreaterThan(0);
      expect(entry.glasses.url.endsWith('.svg')).toBe(true);
    }
  });

  it('every glasses asset file exists on disk', () => {
    for (const entry of DAC811_MANIFEST) {
      // URL is `/assets/dac811/<file>`; strip the leading `/assets/` mount prefix.
      const relPath = entry.glasses.url.replace(/^\/assets\//, '');
      const absPath = resolve(ASSETS_ROOT, relPath);
      expect(existsSync(absPath), `missing asset: ${absPath}`).toBe(true);
    }
  });

  it('steps 5, 7, 8 declare a non-zero gif durationMs', () => {
    for (const step of [5, 7, 8]) {
      const entry = DAC811_MANIFEST.find((e) => e.stepNumber === step)!;
      expect(entry.glasses.kind).toBe('gif');
      expect(entry.glasses.durationMs).toBeGreaterThan(0);
    }
  });
});

function assertSceneManifestShape(scene: SceneManifest, label: string): void {
  expect(scene.sceneId, `${label}.sceneId`).toMatch(/^[a-z0-9-]+$/);
  expect(['panel', 'valve', 'disconnect', 'hasp', 'padlock', 'tag']).toContain(scene.primitive);
  expect(scene.camera.position).toHaveLength(3);
  expect(scene.camera.target).toHaveLength(3);
  expect(scene.camera.fov).toBeGreaterThan(0);
  expect(scene.components.length).toBeGreaterThan(0);
  expect(scene.components.length).toBeLessThanOrEqual(5);
  for (const c of scene.components) {
    expect(c.id, `${label}.${c.id}.id`).toMatch(/^[a-z0-9-]+$/);
    expect(['box', 'cylinder', 'sphere', 'torus']).toContain(c.geometry);
    expect(c.transform.position).toHaveLength(3);
    expect(c.material.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  }
  for (const a of scene.annotations) {
    expect(
      scene.components.some((c) => c.id === a.componentId),
      `${label}: annotation refs known component`,
    ).toBe(true);
    expect(a.text.length).toBeGreaterThan(0);
  }
}

describe('3D scene manifests', () => {
  it('steps 3, 5, 8 pass the SceneManifest shape check', () => {
    assertSceneManifestShape(DAC811_SCENES.step03, 'step03');
    assertSceneManifestShape(DAC811_SCENES.step05, 'step05');
    assertSceneManifestShape(DAC811_SCENES.step08, 'step08');
  });

  it('each .scene.json file deep-equals the canonical TS scene', () => {
    const cases: Array<[SceneManifest, string]> = [
      [DAC811_SCENES.step03, 'dac811/step03_energy_sources.scene.json'],
      [DAC811_SCENES.step05, 'dac811/step05_disconnect.scene.json'],
      [DAC811_SCENES.step08, 'dac811/step08_valve.scene.json'],
    ];
    for (const [scene, rel] of cases) {
      const onDisk = JSON.parse(readFileSync(resolve(ASSETS_ROOT, rel), 'utf8'));
      expect(onDisk, `${rel} drift vs. canonical TS`).toEqual(scene);
    }
  });

  it('manifest.json static copy deep-equals the TS export', () => {
    const onDisk = JSON.parse(readFileSync(resolve(ASSETS_ROOT, 'dac811/manifest.json'), 'utf8'));
    expect(onDisk).toEqual(DAC811_MANIFEST);
  });
});
