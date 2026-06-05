/**
 * Reference content contract for the Field IQ Genesis bridge.
 *
 * One bridge serves three rendering surfaces (glasses HUD, phone companion,
 * dashboard) from a single keyed lookup: (procedureId, stepNumber,
 * deviceKind). The bridge is mocked today against static SVG / animated SVG
 * placeholders bundled at `assets/dac811/…`; the Genesis API swap-in lands
 * in Phase 2F+ without changing this contract.
 */

export type DeviceKind = 'glasses' | 'phone' | 'dashboard';

export type ReferenceKind = 'image' | 'gif' | 'scene3d';

export interface Reference {
  /** Stable per-procedure-per-step identifier, e.g. `dac811-loto-step5`. */
  stepId: string;
  /** Which medium this reference is. */
  kind: ReferenceKind;
  /** URL the consumer renders. For image/gif: an <img src=…> works. For scene3d: a JSON manifest URL. */
  url: string;
  /** GIF/animation duration in ms. Undefined for static images. */
  durationMs?: number;
  /** Voice-over caption text for screen readers and the future TTS layer. */
  captionVoice?: string;
  /** Only set for kind === 'scene3d'. Pre-parsed manifest the phone-companion-3d package consumes directly. */
  sceneManifest?: SceneManifest;
}

export interface SceneManifest {
  sceneId: string;
  primitive: 'panel' | 'valve' | 'disconnect' | 'hasp' | 'padlock' | 'tag';
  components: ComponentSpec[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  annotations: Annotation[];
}

export interface ComponentSpec {
  id: string;
  label: string;
  /** Procedurally-described geometry — Three.js consumer translates into meshes. */
  geometry: 'box' | 'cylinder' | 'sphere' | 'torus';
  /** Position + rotation + scale in scene-space units. */
  transform: {
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
  /** Hex colour + optional PBR-ish modifiers. */
  material: { color: string; metalness?: number; roughness?: number };
  /** Optional state ("on/off", "open/closed", …). Used by phone-companion-3d for the right visual cue. */
  state?: string;
}

export interface Annotation {
  componentId: string;
  text: string;
  /** Anchor offset relative to the component. */
  offset?: [number, number, number];
}
