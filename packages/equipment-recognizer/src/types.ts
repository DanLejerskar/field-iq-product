/**
 * Equipment recognition contract.
 *
 * The orchestrator runs two paths against a worker's photo:
 *   - vision: Claude Sonnet 4.6 image-recognition against a catalog of known
 *     equipment. Returns confidence in [0, 1].
 *   - qr:     pure-JS QR decode (jsQR + pngjs). Map raw decoded string →
 *     equipmentId via the supplied mapping.
 *
 * The high-confidence vision answer wins. Otherwise QR is consulted. If both
 * miss, a `'none'` recognition is returned so the backend can prompt the
 * worker to scan a code or move closer.
 *
 * Intentionally not coupled to the schema package's branded `EquipmentId` —
 * this package decides what's in the catalog, the consumer maps the loose
 * string into its own domain types.
 */
export type RecognitionSource = 'vision' | 'qr' | 'none';

export interface Recognition {
  /** Matched equipment ID, or null if nothing matched. */
  equipmentId: string | null;
  /** Which path produced the answer. */
  source: RecognitionSource;
  /** 0..1. QR matches are always 1.0; vision matches use Claude's score; 'none' is 0. */
  confidence: number;
  /** Free-form: QR raw decoded string, or short Claude reasoning. Used for debugging + audit log. */
  detail?: string;
}

export interface KnownEquipment {
  equipmentId: string;
  /** Plain-language description Claude reads in the recognition prompt. */
  description: string;
  /** Distinguishing visual markers — components, labels, shapes Claude can look for. */
  visualMarkers: string[];
}

export interface QrMapping {
  /** Map QR raw decoded value → equipmentId. */
  [qrValue: string]: string;
}
