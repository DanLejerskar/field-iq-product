import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ComponentSpec } from '@field-iq/genesis-bridge';
import { findNamedNode, indexModelNodes } from './model.js';

function named(name: string): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  return o;
}

function tree(...names: string[]): THREE.Group {
  const g = new THREE.Group();
  g.name = '__model_root__';
  for (const n of names) g.add(named(n));
  return g;
}

function spec(id: string, nodeName?: string): ComponentSpec {
  return {
    id,
    label: id,
    geometry: 'box',
    transform: { position: [0, 0, 0] },
    material: { color: '#ffffff' },
    ...(nodeName ? { nodeName } : {}),
  };
}

describe('findNamedNode', () => {
  it('finds an exact node by name', () => {
    const root = tree('BR204', 'V204', 'PN204');
    expect(findNamedNode(root, 'V204')?.name).toBe('V204');
  });

  it('falls back to a case-insensitive match', () => {
    const root = tree('br204', 'valve_v204');
    expect(findNamedNode(root, 'BR204')?.name).toBe('br204');
  });

  it('prefers an exact match over a case-insensitive one', () => {
    const root = new THREE.Group();
    root.add(named('valve'));
    root.add(named('Valve'));
    expect(findNamedNode(root, 'Valve')?.name).toBe('Valve');
  });

  it('returns null when nothing matches or name is empty', () => {
    const root = tree('BR204');
    expect(findNamedNode(root, 'PN204')).toBeNull();
    expect(findNamedNode(root, '')).toBeNull();
  });

  it('searches nested descendants, not just direct children', () => {
    const root = new THREE.Group();
    const mid = new THREE.Group();
    mid.add(named('deep_node'));
    root.add(mid);
    expect(findNamedNode(root, 'deep_node')?.name).toBe('deep_node');
  });
});

describe('indexModelNodes', () => {
  it('maps components to nodes by nodeName, falling back to id', () => {
    const root = tree('BR204', 'gate_valve', 'PN204');
    const components = [
      spec('br', 'BR204'), // via nodeName
      spec('PN204'), // via id fallback
      spec('valve', 'gate_valve'), // via nodeName
    ];
    const { nodeByComponentId, unmatched } = indexModelNodes(root, components);
    expect(unmatched).toEqual([]);
    expect(nodeByComponentId.get('br')?.name).toBe('BR204');
    expect(nodeByComponentId.get('PN204')?.name).toBe('PN204');
    expect(nodeByComponentId.get('valve')?.name).toBe('gate_valve');
  });

  it('tags matched nodes with userData.componentId for the raycaster', () => {
    const root = tree('BR204');
    const { nodeByComponentId } = indexModelNodes(root, [spec('breaker', 'BR204')]);
    expect(nodeByComponentId.get('breaker')?.userData.componentId).toBe('breaker');
  });

  it('collects unmatched component ids instead of throwing', () => {
    const root = tree('BR204');
    const { nodeByComponentId, unmatched } = indexModelNodes(root, [
      spec('breaker', 'BR204'),
      spec('ghost', 'NOT_IN_MODEL'),
    ]);
    expect(nodeByComponentId.has('breaker')).toBe(true);
    expect(unmatched).toEqual(['ghost']);
  });

  it('handles an empty component list', () => {
    const { nodeByComponentId, unmatched } = indexModelNodes(tree('x'), []);
    expect(nodeByComponentId.size).toBe(0);
    expect(unmatched).toEqual([]);
  });
});
