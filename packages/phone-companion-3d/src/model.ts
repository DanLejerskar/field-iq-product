/**
 * Mapping a loaded glTF / GLB digital-twin model onto our component specs.
 *
 * When a SceneManifest carries a real `modelUrl` (a Genesis-exported model)
 * instead of primitive shapes, the viewer still needs to know which node in
 * that model is "BR204", which is "V204", etc. — so it can attach labels,
 * reflect state, and resolve taps. Genesis names its nodes; each
 * ComponentSpec points at one via `nodeName` (falling back to `id`).
 *
 * These helpers are pure: they walk a Three.js object tree and never touch a
 * renderer, so they unit-test in jsdom without WebGL.
 */
import type { Object3D } from 'three';
import type { ComponentSpec } from '@field-iq/genesis-bridge';

/**
 * Find the descendant whose name matches `name` — exact match first, then a
 * single case-insensitive fallback (glTF exporters vary on casing). Returns
 * null when nothing matches.
 */
export function findNamedNode(root: Object3D, name: string): Object3D | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  let exact: Object3D | null = null;
  let ci: Object3D | null = null;
  root.traverse((o: Object3D) => {
    if (exact) return;
    if (o.name === name) exact = o;
    else if (!ci && o.name && o.name.toLowerCase() === lower) ci = o;
  });
  return exact ?? ci;
}

export interface ModelIndex {
  /** componentId → the matched model node. */
  nodeByComponentId: Map<string, Object3D>;
  /** componentIds whose node could not be found in the model. */
  unmatched: string[];
}

/**
 * Index a loaded model tree by component. For each spec we look up
 * `spec.nodeName ?? spec.id`; on a hit we tag the node with
 * `userData.componentId` (so the existing raycaster resolves taps the same
 * way it does for primitive meshes) and record it. Misses are collected in
 * `unmatched` so the caller can warn rather than fail silently.
 */
export function indexModelNodes(
  root: Object3D,
  components: readonly ComponentSpec[],
): ModelIndex {
  const nodeByComponentId = new Map<string, Object3D>();
  const unmatched: string[] = [];
  for (const spec of components) {
    const node = findNamedNode(root, spec.nodeName ?? spec.id);
    if (!node) {
      unmatched.push(spec.id);
      continue;
    }
    node.userData.componentId = spec.id;
    nodeByComponentId.set(spec.id, node);
  }
  return { nodeByComponentId, unmatched };
}
