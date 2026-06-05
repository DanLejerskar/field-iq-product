/**
 * Default equipment catalog + QR mapping for the DAC #811 LOTO trainer.
 *
 * To add a second equipment family, append a `KnownEquipment` row to
 * `DEFAULT_CATALOG` and a `qrValue → equipmentId` row to `DEFAULT_QR_MAPPING`.
 * Consumers can supply their own arrays via `recognize(..., { vision: { catalog }, qr: { mapping } })`.
 */
import type { KnownEquipment, QrMapping } from './types.js';

export const DEFAULT_CATALOG: readonly KnownEquipment[] = [
  {
    equipmentId: 'DAC-811-01',
    description: 'DAC Worldwide #811 Lockout/Tagout Trainer — a desktop industrial training panel.',
    visualMarkers: [
      'fused disconnect box (gray rectangular enclosure with a vertical handle)',
      'local manual starter switch',
      'three-drain manifold with two or three ball valves',
      'three-way ball valves with red handles',
      'in-line GFCI protector',
      'tank vent covers',
      'small bench-top mounted training panel rather than a full-size industrial cabinet',
      'visible asset tag reading "DAC-811-01" or "EON-LOTO-DAC811-01"',
    ],
  },
];

export const DEFAULT_QR_MAPPING: QrMapping = {
  'EON-LOTO-DAC811-01': 'DAC-811-01',
};
