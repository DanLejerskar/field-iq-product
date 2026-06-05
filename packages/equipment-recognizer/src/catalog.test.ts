import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG, DEFAULT_QR_MAPPING } from './catalog.js';

describe('DEFAULT_CATALOG', () => {
  it('has at least one entry', () => {
    expect(DEFAULT_CATALOG.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty description and at least 3 visual markers', () => {
    for (const e of DEFAULT_CATALOG) {
      expect(e.equipmentId.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.visualMarkers.length).toBeGreaterThanOrEqual(3);
      for (const m of e.visualMarkers) expect(m.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a unique equipmentId', () => {
    const seen = new Set<string>();
    for (const e of DEFAULT_CATALOG) {
      expect(seen.has(e.equipmentId), `duplicate ${e.equipmentId}`).toBe(false);
      seen.add(e.equipmentId);
    }
  });

  it('seeds the DAC #811 trainer', () => {
    expect(DEFAULT_CATALOG.find((e) => e.equipmentId === 'DAC-811-01')).toBeTruthy();
  });
});

describe('DEFAULT_QR_MAPPING', () => {
  it('has at least one entry', () => {
    expect(Object.keys(DEFAULT_QR_MAPPING).length).toBeGreaterThan(0);
  });

  it('every mapped equipmentId is present in DEFAULT_CATALOG', () => {
    const catalogIds = new Set(DEFAULT_CATALOG.map((e) => e.equipmentId));
    for (const [qrValue, equipmentId] of Object.entries(DEFAULT_QR_MAPPING)) {
      expect(qrValue.length, 'qr key non-empty').toBeGreaterThan(0);
      expect(catalogIds.has(equipmentId), `${equipmentId} (from QR ${qrValue}) in catalog`).toBe(
        true,
      );
    }
  });

  it('maps the DAC #811 QR sticker to its equipmentId', () => {
    expect(DEFAULT_QR_MAPPING['EON-LOTO-DAC811-01']).toBe('DAC-811-01');
  });
});
