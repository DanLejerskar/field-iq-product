import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneManifest } from '@field-iq/genesis-bridge';
import { disposeScene, loadScene } from './sceneLoader.js';

const SCENE_JSON_PATH = resolve(
  import.meta.dirname,
  '..',
  '..',
  'genesis-bridge',
  'assets',
  'dac811',
  'step05_disconnect.scene.json',
);

function step05(): SceneManifest {
  return JSON.parse(readFileSync(SCENE_JSON_PATH, 'utf8')) as SceneManifest;
}

describe('loadScene — step05_disconnect fixture', () => {
  it('produces a scene with the three expected component meshes', () => {
    const loaded = loadScene(step05(), { width: 400, height: 400 });
    expect(loaded.scene).toBeInstanceOf(THREE.Scene);
    expect(loaded.root).toBeInstanceOf(THREE.Group);
    expect(loaded.meshByComponentId.size).toBe(3);
    expect(loaded.meshByComponentId.get('disconnect-enclosure')).toBeInstanceOf(THREE.Mesh);
    expect(loaded.meshByComponentId.get('lockout-tab')).toBeInstanceOf(THREE.Mesh);
    expect(loaded.meshByComponentId.get('disconnect-handle')).toBeInstanceOf(THREE.Mesh);

    const handle = loaded.meshByComponentId.get('disconnect-handle')!;
    expect(handle.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect((handle.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('b85042');
  });

  it('matches the manifest camera position + fov exactly', () => {
    const loaded = loadScene(step05(), { width: 400, height: 400 });
    expect(loaded.camera.position.x).toBe(2);
    expect(loaded.camera.position.y).toBe(1.5);
    expect(loaded.camera.position.z).toBe(3);
    expect(loaded.camera.fov).toBe(50);
  });

  it('parents component meshes under the rotating root group', () => {
    const loaded = loadScene(step05(), { width: 400, height: 400 });
    for (const mesh of loaded.meshByComponentId.values()) {
      expect(mesh.parent).toBe(loaded.root);
    }
    // The root group is parented to the scene.
    expect(loaded.root.parent).toBe(loaded.scene);
  });

  it('carries the manifest annotations through unchanged', () => {
    const loaded = loadScene(step05(), { width: 400, height: 400 });
    expect(loaded.annotations).toHaveLength(1);
    expect(loaded.annotations[0]!.componentId).toBe('disconnect-handle');
    expect(loaded.annotations[0]!.text).toContain('OPEN');
  });
});

describe('disposeScene', () => {
  it('removes meshes from the root and frees their geometry', () => {
    const loaded = loadScene(step05(), { width: 400, height: 400 });
    const handle = loaded.meshByComponentId.get('disconnect-handle')!;
    const geo = handle.geometry;
    const disposed = vi.spyOn(geo, 'dispose');
    disposeScene(loaded);
    expect(loaded.root.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalled();
  });
});

// Need vi from vitest above; importing inline keeps the test file self-contained
// because vitest hoists imports anyway.
import { vi } from 'vitest';
