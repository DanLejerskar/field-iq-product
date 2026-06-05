/**
 * Public viewer + session-view contracts.
 *
 * Re-exports the genesis-bridge scene types so consumers can keep a single
 * import path; this package is the runtime that consumes those manifests.
 */
export type { Annotation, ComponentSpec, SceneManifest } from '@field-iq/genesis-bridge';

import type { SceneManifest } from '@field-iq/genesis-bridge';

export interface ViewerProps {
  scene: SceneManifest;
  /** Called when the user taps a component. componentId may be null if they tap the background. */
  onComponentTap?: (componentId: string | null) => void;
  /** Optional auto-rotate (slow Y-axis spin) when the user is idle. Default false. */
  autoRotate?: boolean;
  /** Background colour. Default '#0B1F4D' (EON navy). */
  background?: string;
  /** Disable interactions (useful when overlaying a modal). Default false. */
  disabled?: boolean;
}

export interface PhoneSessionViewProps {
  sessionId: string;
  procedureId: string;
  currentStepNumber: number;
  /**
   * Fetches the current step's SceneManifest. The integrator wires this
   * against @field-iq/genesis-bridge's getReferenceFor() or the equivalent
   * /api endpoint.
   */
  fetchScene: (procedureId: string, stepNumber: number) => Promise<SceneManifest | null>;
}

export const EON_NAVY_BG = '#0B1F4D';
