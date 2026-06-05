/**
 * Public lookup API.
 *
 * `provider` is the one-line swap point: replace `mockProvider` with the real
 * `genesisApiProvider` in Phase 2F+ and every consumer picks up the live
 * Genesis-rendered content with no other code change anywhere in the repo.
 */
import { mockProvider } from './mock.js';
import type { ReferenceProvider } from './provider.js';
import type { DeviceKind, Reference } from './types.js';

// ↓↓↓ Phase 2F+ swaps this line. Nothing else in this file changes. ↓↓↓
const provider: ReferenceProvider = mockProvider;

export function getReferenceFor(
  procedureId: string,
  stepNumber: number,
  deviceKind: DeviceKind,
): Promise<Reference | null> {
  return provider.get(procedureId, stepNumber, deviceKind);
}

/** Test seam: assert which provider is currently wired. */
export function currentProvider(): ReferenceProvider {
  return provider;
}
