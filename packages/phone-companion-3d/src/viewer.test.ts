/**
 * jsdom smoke test for the viewer. Confirms construction + dispose don't
 * crash in an environment with no WebGL, and that the public handle behaves
 * the way callers expect.
 */
import { describe, expect, it } from 'vitest';
import type { SceneManifest } from '@field-iq/genesis-bridge';
import { createViewer } from './viewerCore.js';

const TINY_SCENE: SceneManifest = {
  sceneId: 'tiny',
  primitive: 'panel',
  camera: { position: [0, 0, 5], target: [0, 0, 0], fov: 50 },
  components: [
    {
      id: 'cube',
      label: 'Cube',
      geometry: 'box',
      transform: { position: [0, 0, 0], scale: [1, 1, 1] },
      material: { color: '#ff8800' },
    },
  ],
  annotations: [],
};

describe('createViewer — jsdom smoke', () => {
  it('constructs without crashing under jsdom (headless mode)', () => {
    const canvas = document.createElement('canvas');
    const handle = createViewer(canvas, { scene: TINY_SCENE });
    expect(handle.isHeadless).toBe(true);
    handle.dispose();
  });

  it('dispose is idempotent', () => {
    const canvas = document.createElement('canvas');
    const handle = createViewer(canvas, { scene: TINY_SCENE });
    expect(() => {
      handle.dispose();
      handle.dispose();
    }).not.toThrow();
  });

  it('setScene swaps scenes without throwing', () => {
    const canvas = document.createElement('canvas');
    const handle = createViewer(canvas, { scene: TINY_SCENE });
    try {
      handle.setScene({
        ...TINY_SCENE,
        sceneId: 'tiny-2',
        components: [
          {
            id: 'sphere',
            label: 'Sphere',
            geometry: 'sphere',
            transform: { position: [0, 0, 0], scale: [1, 1, 1] },
            material: { color: '#00ff00' },
          },
        ],
      });
    } finally {
      handle.dispose();
    }
  });

  it('setBackground / setAutoRotate / setDisabled all run cleanly', () => {
    const canvas = document.createElement('canvas');
    const handle = createViewer(canvas, { scene: TINY_SCENE });
    try {
      handle.setBackground('#123456');
      handle.setAutoRotate(true);
      handle.setAutoRotate(false);
      handle.setDisabled(true);
      handle.setDisabled(false);
    } finally {
      handle.dispose();
    }
  });
});
