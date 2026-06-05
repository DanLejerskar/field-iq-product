/**
 * QR fallback path. PNG-only — jsQR consumes raw RGBA + width + height; pngjs
 * decodes PNG to that shape with no native deps.
 *
 * v1 accepts PNG data URIs because the camera capture layer encodes to PNG
 * before posting. JPEG support would need an additional pure-JS JPEG decoder;
 * deferred until something asks for it.
 */
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { DEFAULT_QR_MAPPING } from './catalog.js';
import { parseDataUri } from './vision.js';
import type { QrMapping, Recognition } from './types.js';

export interface QrDeps {
  mapping?: QrMapping;
}

function decodePngBuffer(
  buf: Buffer,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    new PNG().parse(buf, (err, png) => {
      if (err) return reject(err);
      resolve({ data: new Uint8Array(png.data), width: png.width, height: png.height });
    });
  });
}

function none(): Recognition {
  return { equipmentId: null, source: 'none', confidence: 0 };
}

export async function decodeQr(photoDataUri: string, deps: QrDeps = {}): Promise<Recognition> {
  const mapping = deps.mapping ?? DEFAULT_QR_MAPPING;
  const parsed = parseDataUri(photoDataUri);
  if (!parsed) return none();

  // We only attempt PNG decode in v1; non-PNG data URIs silently miss to 'none'.
  if (!/^image\/png\b/i.test(parsed.mediaType)) return none();

  let png: { data: Uint8Array; width: number; height: number };
  try {
    png = await decodePngBuffer(Buffer.from(parsed.base64, 'base64'));
  } catch {
    return none();
  }

  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!code) return none();

  const raw = code.data;
  const equipmentId = mapping[raw];
  if (equipmentId) {
    return { equipmentId, source: 'qr', confidence: 1.0, detail: raw };
  }
  // A QR was decoded but its value isn't in our mapping. Source is still
  // 'qr' so the orchestrator knows the photo *did* contain a code — the
  // catalog just doesn't know about it.
  return { equipmentId: null, source: 'qr', confidence: 0, detail: raw };
}
