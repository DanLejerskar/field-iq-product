/**
 * Full 10-step LOTO happy path against a running stack.
 *
 *   docker compose up -d
 *   pnpm migrate && pnpm seed
 *   pnpm dev               # backend on :3000, glasses webapp on :3001, dashboard on :3002
 *   pnpm test:e2e
 *
 * The spec skips itself when the backend isn't reachable so the test command
 * never falsely fails in a no-stack environment.
 */
import { expect, test } from '@playwright/test';
import { ApiClient, backendUp } from '../helpers/api';
import { env } from '../helpers/env';
import { photoForStep } from '../helpers/fixtures';
import { signJwt } from '../helpers/jwt';
import { resolveSeed } from '../helpers/seed-lookup';
import { TestSocket } from '../helpers/ws';

test('10-step LOTO happy path', async () => {
  test.setTimeout(120_000);
  if (!(await backendUp(env.apiHost))) {
    test.skip(true, `backend not reachable at ${env.apiHost} — bring up the stack`);
    return;
  }
  expect(env.jwtSigningSecret, 'JWT_SIGNING_SECRET').not.toBe('');

  const seed = await resolveSeed();
  const jwt = signJwt(
    { sub: seed.technicianUserId, org: seed.orgId, role: 'technician' },
    env.jwtSigningSecret,
  );
  const api = new ApiClient(env.apiHost, jwt);

  // Subscribe to the org channel (what the dashboard sees) before creating
  // anything so we can assert sub-2s update latency.
  const ws = new TestSocket(env.wsHost, jwt);
  await ws.ready();
  ws.subscribe(`org:${seed.orgId}:sessions`);

  // Start a fresh session.
  const t0 = Date.now();
  const { sessionId } = await api.request<{ sessionId: string; firstStepId: string }>(
    'POST',
    '/api/sessions',
    { equipmentId: seed.equipmentId, procedureId: seed.procedureId, testMode: true },
  );
  const created = await ws.await((e) => e.type === 'session.created' && e.sessionId === sessionId);
  expect(Date.now() - t0, 'session.created within 2s of POST /sessions').toBeLessThan(2000);
  expect(created.stepNumber).toBe(1);

  // Drive all 10 steps: verify → verified → advance.
  for (let step = 1; step <= 10; step++) {
    await api.request('POST', `/api/sessions/${sessionId}/verify`, {
      stepNumber: step,
      photoBase64: photoForStep(step),
    });

    const verdict = await ws.await(
      (e) => e.type === 'step.verified' && e.sessionId === sessionId && e.stepNumber === step,
      8000, // verifier p95 budget per VISION_TO_REALIZATION §5.2
    );
    expect(verdict.message).toBeTruthy();

    if (step < 10) {
      await api.request('POST', `/api/sessions/${sessionId}/advance`);
      await ws.await(
        (e) =>
          e.type === 'session.advanced' && e.sessionId === sessionId && e.stepNumber === step + 1,
      );
    } else {
      // Final step: advance is a no-op; just complete.
      await api.request('POST', `/api/sessions/${sessionId}/advance`);
    }
  }

  await api.request('POST', `/api/sessions/${sessionId}/complete`);
  await ws.await((e) => e.type === 'session.completed' && e.sessionId === sessionId);

  // Trigger the PDF report.
  const report = await api.request<{ queued: true }>('POST', `/api/sessions/${sessionId}/report`, {
    format: 'letter',
  });
  expect(report.queued).toBe(true);

  // Audit log should contain at least 10 verified entries.
  const audit = await api.request<{
    auditLog: Array<{ eventType: string; verified: boolean | null }>;
  }>('GET', `/api/sessions/${sessionId}/audit`);
  expect(audit.auditLog.filter((a) => a.eventType === 'verified').length).toBeGreaterThanOrEqual(
    10,
  );

  ws.close();
});
