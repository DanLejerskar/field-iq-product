/**
 * Client-side photo downscaling for the verify upload.
 *
 * iPhone camera files are 3–6 MB; the backend caps photo bodies at ~1 MB
 * (PHOTO_SIZE_LIMIT_BYTES + Fastify's body limit), so raw uploads 413. Claude
 * doesn't need more than ~1280 px to judge a lockout, so we re-encode through a
 * canvas before upload: longest edge ≤ MAX_DIMENSION, JPEG q0.72 — typically
 * 150–400 KB. The backend stores photos as `data:image/jpeg` URIs already, so
 * always emitting JPEG matches the storage contract.
 */

export const MAX_DIMENSION = 1280;
export const JPEG_QUALITY = 0.72;

/** Scale (w, h) to fit within maxDim on the longest edge; never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downscale + re-encode a camera file to an upload-sized JPEG. Throws when the
 * browser lacks canvas/createImageBitmap support — callers fall back to the
 * original file.
 */
export async function downscalePhoto(
  file: File,
  maxDim: number = MAX_DIMENSION,
  quality: number = JPEG_QUALITY,
): Promise<Blob> {
  // from-image: respect EXIF orientation so portrait shots stay upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new Error('canvas toBlob produced no data');
    return blob;
  } finally {
    bitmap.close();
  }
}
