import QRCode from 'qrcode';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATALOG, DEFAULT_QR_MAPPING } from './catalog.js';
import { recognize } from './recognize.js';
import type { AnthropicMessagesClient } from './vision.js';

function textBlock(text: string): unknown {
  return { content: [{ type: 'text', text }] };
}

function mockAnthropic(reply: unknown): AnthropicMessagesClient {
  return { messages: { create: vi.fn().mockResolvedValue(reply) } };
}

async function makeQrDataUri(value: string): Promise<string> {
  const buf = await QRCode.toBuffer(value, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 256,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

describe('recognize — orchestration paths', () => {
  let qrPhoto: string;
  let noCodePhoto: string;

  beforeAll(async () => {
    qrPhoto = await makeQrDataUri('EON-LOTO-DAC811-01');
    // A QR-less PNG: blank canvas.
    const { PNG } = await import('pngjs');
    const png = new PNG({ width: 64, height: 64 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 240;
      png.data[i + 1] = 240;
      png.data[i + 2] = 240;
      png.data[i + 3] = 255;
    }
    noCodePhoto = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
  });

  it('uses the vision result when confidence ≥ threshold; does not consult QR', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: 'DAC-811-01', confidence: 0.92, reasoning: 'ok' })),
    );
    const r = await recognize(qrPhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
    });
    expect(r.source).toBe('vision');
    expect(r.equipmentId).toBe('DAC-811-01');
    expect(r.confidence).toBe(0.92);
    // Spy: the QR path should also work on this image, but the orchestrator
    // doesn't need it because vision was confident. We can't directly spy on
    // jsQR easily, but we can confirm by raising threshold and seeing the
    // outcome change (asserted in the next test).
  });

  it('falls back to QR when vision confidence < threshold and QR has a match', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: null, confidence: 0.3, reasoning: 'too blurry' })),
    );
    const r = await recognize(qrPhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
    });
    expect(r.source).toBe('qr');
    expect(r.equipmentId).toBe('DAC-811-01');
    expect(r.confidence).toBe(1.0);
    expect(r.detail).toBe('EON-LOTO-DAC811-01');
  });

  it('returns the low-confidence vision result when QR is empty', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: null, confidence: 0.3, reasoning: 'too blurry' })),
    );
    const r = await recognize(noCodePhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
    });
    expect(r.source).toBe('vision');
    expect(r.confidence).toBe(0.3);
    expect(r.equipmentId).toBeNull();
    expect(r.detail).toBe('too blurry');
  });

  it('returns source="none" when both paths whiff completely', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: null, confidence: 0, reasoning: '' })),
    );
    const r = await recognize(noCodePhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
    });
    expect(r).toEqual({ equipmentId: null, source: 'none', confidence: 0 });
  });

  it('a stricter confidenceThreshold pushes a 0.92 vision answer through to QR', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: 'DAC-811-01', confidence: 0.92, reasoning: 'ok' })),
    );
    const r = await recognize(qrPhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
      confidenceThreshold: 0.95,
    });
    expect(r.source).toBe('qr');
    expect(r.equipmentId).toBe('DAC-811-01');
    expect(r.confidence).toBe(1.0);
  });

  it('exact-threshold vision result still wins (≥, not >)', async () => {
    const anthropic = mockAnthropic(
      textBlock(JSON.stringify({ equipmentId: 'DAC-811-01', confidence: 0.7, reasoning: 'edge' })),
    );
    const r = await recognize(qrPhoto, {
      vision: { anthropic, catalog: DEFAULT_CATALOG },
      qr: { mapping: DEFAULT_QR_MAPPING },
      confidenceThreshold: 0.7,
    });
    expect(r.source).toBe('vision');
    expect(r.confidence).toBe(0.7);
  });
});
