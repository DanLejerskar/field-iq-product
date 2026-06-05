/**
 * Mock ReferenceProvider — reads from the bundled DAC811_MANIFEST and
 * synthesises a Reference for the requested (procedureId, stepNumber,
 * deviceKind). No I/O; pure-function-shaped behind an async signature so it
 * matches the real provider's contract.
 */
import { DAC811_MANIFEST } from './manifest.js';
import type { ReferenceProvider } from './provider.js';
import type { DeviceKind, Reference } from './types.js';

export const mockProvider: ReferenceProvider = {
  async get(
    procedureId: string,
    stepNumber: number,
    deviceKind: DeviceKind,
  ): Promise<Reference | null> {
    const entry = DAC811_MANIFEST.find(
      (e) => e.procedureId === procedureId && e.stepNumber === stepNumber,
    );
    if (!entry) return null;
    const surface = entry[deviceKind];
    if (!surface) return null;
    return {
      stepId: `${procedureId}-step${stepNumber}`,
      ...surface,
    };
  },
};
