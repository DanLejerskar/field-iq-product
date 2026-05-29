# `@field-iq/e2e`

End-to-end happy-path test for the LOTO v1 stack. Playwright-driven,
HTTP + WebSocket — no browser required.

## Run

```bash
# 1. Bring up infra + backend + verifier + reporter
docker compose up -d
pnpm migrate && pnpm seed
pnpm dev          # backend :3000, glasses-webapp :3001, dashboard :3002

# 2. Run E2E (from repo root)
pnpm test:e2e
```

Without a running stack, `happy-path.spec.ts` skips itself (it pings
`/health` before doing anything). The helpers-level spec (`helpers.spec.ts`)
always runs.

## What it asserts

1. `session.created` lands on the org channel within **2 s** of `POST /api/sessions`.
2. Every step submits its photo, the mock verifier publishes `step.verified`,
   and `session.advanced` follows after the technician taps.
3. After step 10, `complete` fires and `session.completed` is delivered.
4. `POST /api/sessions/:id/report` enqueues on `report-queue` (the reporter
   service drains it).
5. The `audit_log` for the session contains ≥10 `verified` rows.

## Fixture photos

`fixtures/dac811/step-NN.jpg` is the eventual home for real DAC #811 fixture
photos. For the mock-verifier loop the helper sends an inlined 1×1 grey JPEG;
the verifier doesn't look at it.
