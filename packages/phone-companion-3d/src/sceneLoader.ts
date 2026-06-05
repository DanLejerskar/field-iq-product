/**
 * SceneManifest → Three.js Scene + Camera + indexed mesh map.
 *
 * The mesh map is what the viewer hands to its raycaster — taps walk up the
 * intersected object's parents looking for a `userData.componentId`, which
 * `buildMesh()` plants there.
 *
 * `disposeScene()` walks the scene disposing every geometry + material it
 * created. The renderer is disposed separately by the viewer.
 */
import * as THREE from 'three';
import type { SceneManifest } from '@field-iq/genesis-bridge';
import { buildMesh, disposeMesh } from './primitives.js';

export interface LoadedScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Group containing every component mesh — rotated by autoRotate. */
  root: THREE.Group;
  meshByComponentId: ReadonlyMap<string, THREE.Mesh>;
  annotations: SceneManifest['annotations'];
}

export interface Viewport {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT: Viewport = { width: 800, height: 600 };

export function loadScene(
  manifest: SceneManifest,
  viewport: Viewport = DEFAULT_VIEWPORT,
): LoadedScene {
  const scene = new THREE.Scene();

  // Lights — single ambient + one keylight slightly above-right. Industrial
  // subjects read fine without extras; keep this cheap on mobile GPUs.
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(5, 8, 5);
  scene.add(key);

  // Camera.
  const aspect = Math.max(0.01, viewport.width / Math.max(1, viewport.height));
  const camera = new THREE.PerspectiveCamera(manifest.camera.fov, aspect, 0.1, 100);
  camera.position.set(...manifest.camera.position);
  camera.lookAt(...manifest.camera.target);
  // Three.js defers matrixWorld updates to the next render. Headless mode
  // never renders, and the raycaster needs an up-to-date matrix to project
  // NDC into a world ray. Push the update eagerly so picking works without
  // a frame having rendered.
  camera.updateMatrixWorld(true);

  // Component meshes inside a single root group so the viewer can rotate the
  // whole thing (autoRotate) without spinning the camera or the lights.
  const root = new THREE.Group();
  root.name = '__root__';
  scene.add(root);

  const meshByComponentId = new Map<string, THREE.Mesh>();
  for (const spec of manifest.components) {
    const mesh = buildMesh(spec);
    root.add(mesh);
    meshByComponentId.set(spec.id, mesh);
  }

  return {
    scene,
    camera,
    root,
    meshByComponentId,
    annotations: manifest.annotations,
  };
}

export function disposeScene(loaded: LoadedScene): void {
  for (const mesh of loaded.meshByComponentId.values()) {
    loaded.root.remove(mesh);
    disposeMesh(mesh);
  }
  loaded.scene.remove(loaded.root);
}
