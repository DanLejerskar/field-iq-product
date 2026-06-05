/**
 * Raycast test. We construct a viewer in headless mode (no WebGL) on a
 * canvas with a known bounding rect, swap in a tiny two-box scene, and
 * assert that picking at the center of the canvas hits the box at the
 * camera's lookAt target.
 */
import { describe, expect, it } from 'vitest';
import type { SceneManifest } from '@field-iq/genesis-bridge';
import { createViewer } from './viewerCore.js';

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // jsdom getBoundingClientRect returns zeros by default; stub it for the
  // viewer's pickAt math.
  canvas.getBoundingClientRect = (): DOMRect => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {
      return {};
    },
  });
  return canvas;
}

function twoBoxScene(
  cameraPosition: [number, number, number],
  cameraTarget: [number, number, number] = [0, 0, 0],
): SceneManifest {
  return {
    sceneId: 'twobox',
    primitive: 'panel',
    camera: { position: cameraPosition, target: cameraTarget, fov: 50 },
    components: [
      {
        id: 'box-origin',
        label: 'Box at origin',
        geometry: 'box',
        transform: { position: [0, 0, 0], scale: [1, 1, 1] },
        material: { color: '#ff0000' },
      },
      {
        id: 'box-right',
        label: 'Box on the +X side',
        geometry: 'box',
        transform: { position: [3, 0, 0], scale: [1, 1, 1] },
        material: { color: '#00ff00' },
      },
    ],
    annotations: [],
  };
}

describe('pickAt raycast', () => {
  it('hits the box at the camera target when picking at canvas center', () => {
    const canvas = makeCanvas(400, 400);
    const handle = createViewer(canvas, { scene: twoBoxScene([0, 0, 5]) });
    try {
      const hit = handle.pickAt(200, 200);
      expect(hit).toBe('box-origin');
    } finally {
      handle.dispose();
    }
  });

  it('hits the other box once the scene is swapped to a different camera', () => {
    const canvas = makeCanvas(400, 400);
    const handle = createViewer(canvas, { scene: twoBoxScene([0, 0, 5]) });
    try {
      // Swap to a scene whose camera looks straight at the +X box from down
      // the +Z axis at x=3, with the lookAt target matching.
      handle.setScene(twoBoxScene([3, 0, 5], [3, 0, 0]));
      const hit = handle.pickAt(200, 200);
      expect(hit).toBe('box-right');
    } finally {
      handle.dispose();
    }
  });

  it('returns null when picking past the scene at the empty corner', () => {
    const canvas = makeCanvas(400, 400);
    const handle = createViewer(canvas, { scene: twoBoxScene([0, 0, 5]) });
    try {
      // Top-left corner of the canvas — well off both boxes at this camera.
      const hit = handle.pickAt(5, 5);
      expect(hit).toBeNull();
    } finally {
      handle.dispose();
    }
  });
});
