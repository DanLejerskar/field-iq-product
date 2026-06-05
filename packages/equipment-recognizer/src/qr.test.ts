import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_QR_MAPPING } from './catalog.js';
import { decodeQr } from './qr.js';

async function makeQrDataUri(value: string): Promise<string> {
  const buf = await QRCode.toBuffer(value, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 256,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function solidPngDataUri(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      png.data[idx] = rgba[0];
      png.data[idx + 1] = rgba[1];
      png.data[idx + 2] = rgba[2];
      png.data[idx + 3] = rgba[3];
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

describe('decodeQr', () => {
  let knownQr: string;
  let unknownQr: string;
  let solid: string;

  beforeAll(async () => {
    knownQr = await makeQrDataUri('EON-LOTO-DAC811-01');
    unknownQr = await makeQrDataUri('EON-UNKNOWN-XYZ');
    solid = solidPngDataUri(64, 64, [200, 200, 200, 255]);
  });

  it('decodes the DAC #811 QR sticker to its mapped equipmentId', async () => {
    const r = await decodeQr(knownQr);
    expect(r).toEqual({
      equipmentId: 'DAC-811-01',
      source: 'qr',
      confidence: 1.0,
      detail: 'EON-LOTO-DAC811-01',
    });
  });

  it('reads an unmapped QR value as source="qr" + null equipmentId + raw detail', async () => {
    const r = await decodeQr(unknownQr);
    expect(r.equipmentId).toBeNull();
    expect(r.source).toBe('qr');
    expect(r.confidence).toBe(0);
    expect(r.detail).toBe('EON-UNKNOWN-XYZ');
  });

  it('returns source="none" on a photo with no QR', async () => {
    const r = await decodeQr(solid);
    expect(r).toEqual({ equipmentId: null, source: 'none', confidence: 0 });
  });

  it('accepts a custom mapping override', async () => {
    const r = await decodeQr(unknownQr, {
      mapping: { 'EON-UNKNOWN-XYZ': 'CUSTOM-EQ-42', ...DEFAULT_QR_MAPPING },
    });
    expect(r).toEqual({
      equipmentId: 'CUSTOM-EQ-42',
      source: 'qr',
      confidence: 1.0,
      detail: 'EON-UNKNOWN-XYZ',
    });
  });

  it('returns "none" for a non-PNG data URI (v1 PNG-only support)', async () => {
    const r = await decodeQr('data:image/jpeg;base64,/9j/AAQSkZJRg==');
    expect(r).toEqual({ equipmentId: null, source: 'none', confidence: 0 });
  });

  it('returns "none" for malformed data URI', async () => {
    const r = await decodeQr('not-a-data-uri');
    expect(r).toEqual({ equipmentId: null, source: 'none', confidence: 0 });
  });

  it('returns "none" when the PNG payload is corrupt', async () => {
    const r = await decodeQr('data:image/png;base64,AAAA');
    expect(r).toEqual({ equipmentId: null, source: 'none', confidence: 0 });
  });
});
