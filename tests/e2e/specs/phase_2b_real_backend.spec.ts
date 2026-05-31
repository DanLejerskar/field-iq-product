/**
 * Phase 2B real-backend smoke test.
 *
 * Runs ONLY when PHASE_2B_BACKEND_URL points at a deployed Railway backend.
 * Skips cleanly otherwise so CI doesn't flake without infra.
 *
 *   PHASE_2B_BACKEND_URL=https://field-iq-backend-XXX.up.railway.app \
 *   pnpm --filter @field-iq/e2e exec playwright test phase_2b_real_backend
 *
 * The test:
 *   1. Calls /health and asserts db + redis are up.
 *   2. Resolves seed IDs (Maya, DAC #811, the LOTO procedure) via /api/equipment/resolve.
 *   3. Signs a JWT for Maya and creates a real session.
 *   4. Submits the same 1×1 base64 JPEG fixture used everywhere else in the repo.
 *   5. Polls /api/sessions/:id/audit for a `verified` row within 15 s (Claude
 *      Vision is slower than the mock — that's expected).
 *   6. Asserts the verdict shape `{verified, confidence, message, detail}`.
 */
import { expect, test } from '@playwright/test';
import { ApiClient, backendUp } from '../helpers/api';
import { env } from '../helpers/env';
import { photoForStep } from '../helpers/fixtures';
import { signJwt } from '../helpers/jwt';

interface VerdictRow {
  eventType: string;
  verified: boolean | null;
  confidence: string | null;
  message: string | null;
  detail: string | null;
}

const BACKEND = process.env.PHASE_2B_BACKEND_URL;

test('Phase 2B: real backend + real Claude verdict round-trip', async () => {
  test.setTimeout(60_000);
  if (!BACKEND) {
    test.skip(true, 'PHASE_2B_BACKEND_URL not set — set to your Railway backend URL to run');
    return;
  }
  if (!(await backendUp(BACKEND, 5_000))) {
    test.skip(true, `Backend not reachable at ${BACKEND}`);
    return;
  }

  // 1. Health: confirm db + redis are wired.
  const healthRes = await fetch(`${BACKEND}/health`);
  const health = (await healthRes.json()) as { ok: boolean; db: boolean; redis: boolean };
  expect(health.db, 'db reachable').toBe(true);
  expect(health.redis, 'redis reachable').toBe(true);

  // 2 & 3. Sign a JWT for Maya and create a session.
  // Re-uses the helpers/seed-lookup approach but goes through HTTP since the
  // smoke runner doesn't have direct Postgres access in this mode.
  const jwtSecret = env.jwtSigningSecret || process.env.JWT_SIGNING_SECRET || '';
  expect(jwtSecret, 'JWT_SIGNING_SECRET (must match the backend) is required').not.toBe('');

  const seed = await resolveSeedViaApi(BACKEND, jwtSecret);
  const mayaJwt = signJwt(
    { sub: seed.technicianUserId, org: seed.orgId, role: 'technician' },
    jwtSecret,
  );

  const api = new ApiClient(BACKEND, mayaJwt);
  const { sessionId } = await api.request<{ sessionId: string }>('POST', '/api/sessions', {
    equipmentId: seed.equipmentId,
    procedureId: seed.procedureId,
    testMode: true,
  });
  expect(sessionId).toBeTruthy();

  // 4. Submit a verification photo for step 1.
  await api.request('POST', `/api/sessions/${sessionId}/verify`, {
    stepNumber: 1,
    photoBase64: photoForStep(1),
  });

  // 5. Poll for a verdict row. Real Claude Vision is slower than the mock;
  //    the M3 spec gives p95 ≤ 8 s, we allow 15 s here for tail latency.
  const start = Date.now();
  let verdict: VerdictRow | undefined;
  while (Date.now() - start < 15_000) {
    const audit = await api.request<{ auditLog: VerdictRow[] }>(
      'GET',
      `/api/sessions/${sessionId}/audit`,
    );
    verdict = audit.auditLog.find((a) => a.eventType === 'verified' || a.eventType === 'retry');
    if (verdict) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(verdict, 'verdict landed within 15s').toBeDefined();

  // 6. Verdict shape.
  expect(typeof verdict!.verified).toBe('boolean');
  expect(['high', 'medium', 'low']).toContain(verdict!.confidence);
  expect(verdict!.message, 'message non-empty').toBeTruthy();
  expect(verdict!.detail, 'detail non-empty').toBeTruthy();
});

/** Use the public REST surface to find Maya / DAC #811 / the procedure. */
async function resolveSeedViaApi(
  backend: string,
  jwtSecret: string,
): Promise<{
  orgId: string;
  technicianUserId: string;
  equipmentId: string;
  procedureId: string;
}> {
  // Issue an admin JWT so we can list equipment without knowing IDs ahead of
  // time. (We don't have Maya's user_id yet; resolve via /api/equipment/resolve
  // which requires *any* authenticated user — the org_id is what we need.)
  // We sign a temporary admin token using a known org placeholder, but the
  // server will reject if the user doesn't exist. So instead we query
  // /api/equipment/resolve with a known QR value and read the equipment row.
  // Then we look up the procedure via /api/procedures/:id from the equipment.
  // For the technician user, we need either the seeded UUID or a magic-link
  // login. The simplest browser-only path: hand Dan the UUID by reading it
  // from Railway logs once. For the smoke test, env-override is acceptable.
  const orgIdEnv = process.env.PHASE_2B_ORG_ID;
  const userIdEnv = process.env.PHASE_2B_USER_ID;
  if (!orgIdEnv || !userIdEnv) {
    throw new Error(
      'Set PHASE_2B_ORG_ID and PHASE_2B_USER_ID after the first deploy — Railway logs print both on startup. They never change for the seeded EON / Maya rows.',
    );
  }

  // Use a temporary JWT to fetch the equipment + procedure by QR.
  const tempJwt = signJwt({ sub: userIdEnv, org: orgIdEnv, role: 'admin' }, jwtSecret);
  const api = new ApiClient(backend, tempJwt);
  const { equipment, activeProcedure } = await api.request<{
    equipment: { id: string };
    activeProcedure: { id: string } | null;
  }>('POST', '/api/equipment/resolve', { qrValue: 'EON-LOTO-DAC811-01' });
  if (!activeProcedure) throw new Error('No active procedure for DAC #811 — did seed run?');
  return {
    orgId: orgIdEnv,
    technicianUserId: userIdEnv,
    equipmentId: equipment.id,
    procedureId: activeProcedure.id,
  };
}
