import { describe, expect, it } from 'vitest';

import { makeExemplarCopier } from './exemplar-copier.js';
import { DataUriStorageAdapter, sha256Hex } from '../services/storage.js';

const SRC = { angle: 'authored', sourceUrl: 'http://genesis.test/step-5-authored.png', width: 1024, height: 1024 };
const CTX = { genesisProcedureId: 'proc-1', sourceVersion: 2, stepNumber: 5 };

function pngResponse(bytes: Buffer, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe('makeExemplarCopier', () => {
  it('downloads, stores as a data URI (S3 disabled), and returns sha256 + dimensions', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG magic-ish
    let seenUrl = '';
    const fetchImpl = (async (url: string) => {
      seenUrl = url;
      return pngResponse(bytes);
    }) as unknown as typeof fetch;

    const copy = makeExemplarCopier(new DataUriStorageAdapter(), { fetchImpl });
    const ref = await copy(SRC, CTX);

    expect(seenUrl).toBe(SRC.sourceUrl);
    expect(ref.s3Key).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
    expect(ref.sha256).toBe(sha256Hex(bytes));
    expect(ref.width).toBe(1024);
    expect(ref.height).toBe(1024);
  });

  it('throws 503 when the download is not OK', async () => {
    const fetchImpl = (async () =>
      pngResponse(Buffer.alloc(0), { ok: false, status: 404 })) as unknown as typeof fetch;
    const copy = makeExemplarCopier(new DataUriStorageAdapter(), { fetchImpl });
    await expect(copy(SRC, CTX)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 503 on an empty body', async () => {
    const fetchImpl = (async () => pngResponse(Buffer.alloc(0))) as unknown as typeof fetch;
    const copy = makeExemplarCopier(new DataUriStorageAdapter(), { fetchImpl });
    await expect(copy(SRC, CTX)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 503 when the network call rejects', async () => {
    const fetchImpl = (async () => {
      throw new Error('ETIMEDOUT');
    }) as unknown as typeof fetch;
    const copy = makeExemplarCopier(new DataUriStorageAdapter(), { fetchImpl });
    await expect(copy(SRC, CTX)).rejects.toMatchObject({ statusCode: 503 });
  });
});
