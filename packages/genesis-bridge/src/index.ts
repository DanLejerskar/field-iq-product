/**
 * @field-iq/genesis-bridge — Reference content for any (procedureId,
 * stepNumber, deviceKind).
 *
 * Today: mock provider backed by the DAC811_MANIFEST and bundled SVG / scene
 * JSON assets. Tomorrow (Phase 2F+): the same interface returns
 * server-rendered Genesis content via a one-line swap in `lookup.ts`.
 */
export * from './types.js';
export type { ReferenceProvider } from './provider.js';
export { mockProvider } from './mock.js';
export { getReferenceFor, currentProvider } from './lookup.js';
export { DAC811_MANIFEST, DAC811_SCENES, type ManifestEntry } from './manifest.js';
