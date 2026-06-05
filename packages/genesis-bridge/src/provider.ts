/**
 * The ReferenceProvider interface — the single seam between the lookup API
 * and any backing implementation. Today: the in-process mock. Tomorrow
 * (Phase 2F+): a `genesisApiProvider` that fetches from the Genesis HTTP API.
 * Callers never know which.
 */
import type { DeviceKind, Reference } from './types.js';

export interface ReferenceProvider {
  get(procedureId: string, stepNumber: number, deviceKind: DeviceKind): Promise<Reference | null>;
}
