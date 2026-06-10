import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fetchFieldIqExport } from './genesis-client.js';

/** A minimal Response-like stub for the injected fetch. */
function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const VALID_EXPORT = {
  version: '3.0',
  procedure: { id: 'p1', project_id: 'proj1', title: 'LOTO', version: 2, total_steps: 1 },
  components: [],
  steps: [{ step_number: 1 }],
};

describe('fetchFieldIqExport', () => {
  beforeEach(() => {
    process.env.GENESIS_BASE_URL = 'http://genesis.test/';
    process.env.FIELDIQ_M2M_SECRET = 'm2m-secret';
  });
  afterEach(() => {
    delete process.env.GENESIS_BASE_URL;
    delete process.env.FIELDIQ_M2M_SECRET;
  });

  it('GETs the fieldiq export with the M2M key and returns the parsed body', async () => {
    let seenUrl = '';
    let seenKey: string | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seenUrl = url;
      seenKey = (init?.headers as Record<string, string>)['X-API-Key'];
      return jsonResponse(VALID_EXPORT);
    }) as unknown as typeof fetch;

    const exp = await fetchFieldIqExport('proj1', { fetchImpl });

    expect(seenUrl).toBe('http://genesis.test/api/scenes/proj1/export?format=fieldiq');
    expect(seenKey).toBe('m2m-secret');
    expect(exp.procedure.id).toBe('p1');
  });

  it('throws 400 when GENESIS_BASE_URL is missing', async () => {
    delete process.env.GENESIS_BASE_URL;
    await expect(fetchFieldIqExport('proj1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when the M2M secret is missing', async () => {
    delete process.env.FIELDIQ_M2M_SECRET;
    await expect(fetchFieldIqExport('proj1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 503 on a non-OK response', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'nope' }, { ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(fetchFieldIqExport('proj1', { fetchImpl })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('throws 503 when the body is not a valid export shape', async () => {
    const fetchImpl = (async () => jsonResponse({ nope: true })) as unknown as typeof fetch;
    await expect(fetchFieldIqExport('proj1', { fetchImpl })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('throws 503 when the network call rejects', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(fetchFieldIqExport('proj1', { fetchImpl })).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
