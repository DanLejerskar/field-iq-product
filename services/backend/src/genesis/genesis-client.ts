/**
 * EON Genesis 3.0 M2M client (B-28 Slice 2).
 *
 * Pulls a published procedure as a `format=fieldiq` export over the negotiated machine-to-machine
 * auth (B-27/G1): `GET {GENESIS_BASE_URL}/api/scenes/:projectId/export?format=fieldiq` with the
 * shared secret in the `X-API-Key` header. Returns the raw export typed as `FieldIqExport`; the
 * pure transform into a snapshot plan lives in `build-snapshot.ts`, the orchestration in
 * `../services/procedure-import.ts`. Contract: `docs/live/genesis-integration-architecture.md §7.1`.
 */
import { config } from '../config/env.js';
import { badRequest, serviceUnavailable } from '../errors.js';
import type { FieldIqExport } from './export-contract.js';

/** Resolved Genesis connection settings, or a clear error naming the missing var. */
function resolveGenesis(): { baseUrl: string; m2mSecret: string } {
  const baseUrl = config.genesis.baseUrl;
  const m2mSecret = config.genesis.m2mSecret;
  if (!baseUrl) throw badRequest('Genesis import not configured: set GENESIS_BASE_URL.');
  if (!m2mSecret) throw badRequest('Genesis import not configured: set FIELDIQ_M2M_SECRET.');
  return { baseUrl, m2mSecret };
}

/** Minimal shape guard — enough to fail fast on a wrong/HTML response before the pure transform. */
function assertLooksLikeExport(body: unknown, projectId: string): asserts body is FieldIqExport {
  const b = body as Partial<FieldIqExport> | null;
  if (!b || typeof b !== 'object' || !b.procedure || !Array.isArray(b.steps)) {
    throw serviceUnavailable(
      'Genesis export malformed',
      `project=${projectId}: expected {procedure, steps[]}`,
    );
  }
}

/**
 * Fetch a single project's procedure as a fieldiq export. Network/HTTP/parse failures surface as
 * 503 (the trigger surfaces them to the operator); a missing secret/base URL is a 400 (misconfig).
 */
export async function fetchFieldIqExport(
  projectId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<FieldIqExport> {
  const { baseUrl, m2mSecret } = resolveGenesis();
  const doFetch = opts?.fetchImpl ?? fetch;
  const url = `${baseUrl}/api/scenes/${encodeURIComponent(projectId)}/export?format=fieldiq`;

  let res: Response;
  try {
    res = await doFetch(url, { headers: { 'X-API-Key': m2mSecret, accept: 'application/json' } });
  } catch (err) {
    throw serviceUnavailable(
      'Genesis unreachable',
      `project=${projectId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw serviceUnavailable(
      'Genesis export failed',
      `project=${projectId}: status=${res.status} ${text.slice(0, 200)}`,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw serviceUnavailable(
      'Genesis export not JSON',
      `project=${projectId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  assertLooksLikeExport(body, projectId);
  return body;
}
