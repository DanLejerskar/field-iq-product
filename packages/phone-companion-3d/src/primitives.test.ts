import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGeometry, buildMaterial, buildMesh } from './primitives.js';
import type { ComponentSpec } from '@field-iq/genesis-bridge';

function spec(over: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    id: 'test-id',
    label: 'Test component',
    geometry: 'box',
    transform: { position: [0, 0, 0], scale: [2, 3, 4] },
    material: { color: '#ff8800', metalness: 0.4, roughness: 0.7 },
    ...over,
  };
}

describe('buildGeometry', () => {
  it('box → BoxGeometry with the right parameters', () => {
    const g = buildGeometry(
      spec({ geometry: 'box', transform: { position: [0, 0, 0], scale: [2, 3, 4] } }),
    );
    expect(g).toBeInstanceOf(THREE.BoxGeometry);
    const p = (g as THREE.BoxGeometry).parameters;
    expect(p.width).toBe(2);
    expect(p.height).toBe(3);
    expect(p.depth).toBe(4);
  });

  it('cylinder → CylinderGeometry with sx as radius + sy as height', () => {
    const g = buildGeometry(
      spec({ geometry: 'cylinder', transform: { position: [0, 0, 0], scale: [0.5, 1.5, 0.5] } }),
    );
    expect(g).toBeInstanceOf(THREE.CylinderGeometry);
    const p = (g as THREE.CylinderGeometry).parameters;
    expect(p.radiusTop).toBe(0.5);
    expect(p.radiusBottom).toBe(0.5);
    expect(p.height).toBe(1.5);
  });

  it('sphere → SphereGeometry with sx as radius', () => {
    const g = buildGeometry(
      spec({ geometry: 'sphere', transform: { position: [0, 0, 0], scale: [0.8, 0.8, 0.8] } }),
    );
    expect(g).toBeInstanceOf(THREE.SphereGeometry);
    expect((g as THREE.SphereGeometry).parameters.radius).toBe(0.8);
  });

  it('torus → TorusGeometry with sx radius + sy tube', () => {
    const g = buildGeometry(
      spec({ geometry: 'torus', transform: { position: [0, 0, 0], scale: [1, 0.2, 1] } }),
    );
    expect(g).toBeInstanceOf(THREE.TorusGeometry);
    const p = (g as THREE.TorusGeometry).parameters;
    expect(p.radius).toBe(1);
    expect(p.tube).toBe(0.2);
  });

  it('defaults scale to [1, 1, 1] when omitted', () => {
    const g = buildGeometry(spec({ geometry: 'box', transform: { position: [0, 0, 0] } }));
    expect(g).toBeInstanceOf(THREE.BoxGeometry);
    const p = (g as THREE.BoxGeometry).parameters;
    expect(p.width).toBe(1);
    expect(p.height).toBe(1);
    expect(p.depth).toBe(1);
  });
});

describe('buildMaterial', () => {
  it('honours color + clamped PBR values', () => {
    const m = buildMaterial(
      spec({ material: { color: '#ff0000', metalness: 0.42, roughness: 0.69 } }),
    );
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.color.getHexString()).toBe('ff0000');
    expect(m.metalness).toBe(0.42);
    expect(m.roughness).toBe(0.69);
  });

  it('defaults metalness 0.3 and roughness 0.6 when absent', () => {
    const m = buildMaterial(spec({ material: { color: '#00ff00' } }));
    expect(m.metalness).toBe(0.3);
    expect(m.roughness).toBe(0.6);
  });

  it('clamps out-of-range metalness/roughness into [0, 1]', () => {
    const high = buildMaterial(spec({ material: { color: '#fff', metalness: 5, roughness: -2 } }));
    expect(high.metalness).toBe(1);
    expect(high.roughness).toBe(0);

    const nan = buildMaterial(
      spec({ material: { color: '#fff', metalness: Number.NaN, roughness: Number.NaN } }),
    );
    expect(nan.metalness).toBe(0.3);
    expect(nan.roughness).toBe(0.6);
  });
});

describe('buildMesh', () => {
  it('plants the componentId on userData for raycasting', () => {
    const mesh = buildMesh(spec({ id: 'disconnect-handle' }));
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.userData.componentId).toBe('disconnect-handle');
    expect(mesh.name).toBe('disconnect-handle');
  });

  it('positions the mesh from transform.position', () => {
    const mesh = buildMesh(spec({ transform: { position: [1, 2, 3] } }));
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
  });

  it('applies optional rotation', () => {
    const mesh = buildMesh(spec({ transform: { position: [0, 0, 0], rotation: [0.1, 0.2, 0.3] } }));
    expect(mesh.rotation.x).toBeCloseTo(0.1, 5);
    expect(mesh.rotation.y).toBeCloseTo(0.2, 5);
    expect(mesh.rotation.z).toBeCloseTo(0.3, 5);
  });
});
