/**
 * Pure ComponentSpec → Three.js conversion.
 *
 * `buildMesh()` is the only function callers normally need; the named
 * `buildGeometry` and `buildMaterial` exports exist for test isolation and
 * for future consumers that want to drive the material/geometry layers
 * separately (e.g. instanced meshes).
 *
 * No global side effects; nothing here touches the scene graph.
 */
import * as THREE from 'three';
import type { ComponentSpec } from '@field-iq/genesis-bridge';

const DEFAULT_SCALE: readonly [number, number, number] = [1, 1, 1];
const DEFAULT_METALNESS = 0.3;
const DEFAULT_ROUGHNESS = 0.6;

function clamp01(n: number | undefined, fallback: number): number {
  if (n === undefined || !Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function scaleOf(spec: ComponentSpec): readonly [number, number, number] {
  return spec.transform.scale ?? DEFAULT_SCALE;
}

export function buildGeometry(spec: ComponentSpec): THREE.BufferGeometry {
  const [sx, sy, sz] = scaleOf(spec);
  switch (spec.geometry) {
    case 'box':
      return new THREE.BoxGeometry(sx, sy, sz);
    case 'cylinder':
      // Three.js takes (radiusTop, radiusBottom, height, radialSegments).
      // We use sx for both radii (uniform cylinder) and sy for height.
      return new THREE.CylinderGeometry(sx, sx, sy, 24);
    case 'sphere':
      return new THREE.SphereGeometry(sx, 24, 16);
    case 'torus':
      return new THREE.TorusGeometry(sx, sy, 16, 32);
  }
}

export function buildMaterial(spec: ComponentSpec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.material.color),
    metalness: clamp01(spec.material.metalness, DEFAULT_METALNESS),
    roughness: clamp01(spec.material.roughness, DEFAULT_ROUGHNESS),
  });
}

export function buildMesh(spec: ComponentSpec): THREE.Mesh {
  const mesh = new THREE.Mesh(buildGeometry(spec), buildMaterial(spec));
  const [px, py, pz] = spec.transform.position;
  mesh.position.set(px, py, pz);
  if (spec.transform.rotation) {
    const [rx, ry, rz] = spec.transform.rotation;
    mesh.rotation.set(rx, ry, rz);
  }
  mesh.userData.componentId = spec.id;
  mesh.userData.label = spec.label;
  mesh.name = spec.id;
  return mesh;
}

export function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const m = mesh.material;
  if (Array.isArray(m)) {
    for (const sub of m) sub.dispose();
  } else {
    m.dispose();
  }
}
