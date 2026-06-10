/**
 * Real `ExemplarCopier` (B-28 Slice 2).
 *
 * Copies a Genesis-hosted exemplar PNG into Field IQ storage so the snapshot is self-contained:
 * download → store (S3 or, on Railway, an inline `data:` URI) → SHA-256. The snapshot must NOT
 * hot-link Supabase (the source can rotate/expire and a snapshot is meant to be immutable), so the
 * bytes are pulled at import time and the durable key is recorded. Width/height come from the
 * export (Genesis already renders at a fixed size); we trust them rather than re-decoding the PNG.
 *
 * Injected into `importProcedureSnapshot` so the persist path stays unit-testable (Slice 1) and the
 * network/S3 dependency only enters at the trigger. Design: `genesis-integration-architecture.md §7.3`.
 */
import { config } from '../config/env.js';
import { serviceUnavailable } from '../errors.js';
import { exemplarKey, type StorageAdapter } from '../services/storage.js';
import type { ExemplarCopier } from '../services/procedure-import.js';

/** Genesis renders exemplars as PNG; keep the content type explicit for the S3 object. */
const EXEMPLAR_CONTENT_TYPE = 'image/png';
/** Guard a single exemplar download against a runaway/wrong response. */
const MAX_EXEMPLAR_BYTES = 8 * 1024 * 1024;

/**
 * Build an `ExemplarCopier` bound to a storage adapter. `fetchImpl` is injectable for tests.
 */
export function makeExemplarCopier(
  storage: StorageAdapter,
  opts?: { fetchImpl?: typeof fetch },
): ExemplarCopier {
  const doFetch = opts?.fetchImpl ?? fetch;

  return async (src, ctx) => {
    let res: Response;
    try {
      res = await doFetch(src.sourceUrl, { headers: { accept: 'image/png,image/*' } });
    } catch (err) {
      throw serviceUnavailable(
        'Exemplar download failed',
        `step=${ctx.stepNumber} angle=${src.angle}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      throw serviceUnavailable(
        'Exemplar download failed',
        `step=${ctx.stepNumber} angle=${src.angle}: status=${res.status} ${src.sourceUrl}`,
      );
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_EXEMPLAR_BYTES) {
      throw serviceUnavailable(
        'Exemplar size invalid',
        `step=${ctx.stepNumber} angle=${src.angle}: ${bytes.length} bytes (max ${MAX_EXEMPLAR_BYTES})`,
      );
    }

    const key = config.s3.enabled
      ? exemplarKey(ctx.genesisProcedureId, ctx.sourceVersion, ctx.stepNumber, src.angle)
      : '';
    const { key: storedKey, sha256 } = await storage.putObject(
      key,
      bytes,
      EXEMPLAR_CONTENT_TYPE,
    );

    return { s3Key: storedKey, sha256, width: src.width, height: src.height };
  };
}
