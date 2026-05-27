# EON Field IQ — Implementation Plan (for Claude Code)

**Document owner:** EON Reality
**Status:** Build-ready (v1.0)
**Last updated:** May 19, 2026
**Audience:** Engineers driving Claude Code through the v1 build of EON Field IQ.
**Reading order:** Read `01_PRD.md` → `02_Architecture.md` → `03_LOTO_Test_Case.md` → this doc → `05_CLAUDE.md`.

---

## 1. How to use this doc

Each milestone below is a self-contained chunk of work, sized to a single Claude Code session. Each milestone has:

- **Goal** — the outcome.
- **Prerequisites** — what must already exist.
- **Deliverables** — the files / endpoints / UI that should exist when the milestone is done.
- **Claude Code prompt** — paste this into Claude Code as the starting prompt for the session.
- **Acceptance test** — concrete, runnable check.

Work the milestones in order. Each one builds on the previous. Don't skip ahead even if a later milestone looks more interesting — the dependencies are real.

## 2. Repo layout (target)

```
eon-field-iq/
├── CLAUDE.md                        # repo orientation for Claude Code
├── README.md
├── docs/                            # this spec package, committed for reference
│   ├── 01_PRD.md
│   ├── 02_Architecture.md
│   ├── 03_LOTO_Test_Case.md
│   ├── 04_Implementation_Plan.md
│   └── 05_CLAUDE.md
├── apps/
│   ├── api/                         # Node.js Fastify backend
│   ├── verifier/                    # Python Claude verification worker
│   ├── reporter/                    # Node PDF generator
│   ├── dashboard/                   # React + Vite supervisor dashboard
│   ├── glasses-webapp/              # HTML/CSS/JS Web App for Meta Ray-Ban Display
│   └── mobile/                      # React Native (Expo) companion app
├── packages/
│   ├── shared-types/                # TypeScript types shared across web/mobile/api
│   ├── ui-kit/                      # shared React components (dashboard + admin)
│   └── prompts/                     # versioned system + per-step prompts (TS modules)
├── infra/
│   ├── docker-compose.yml           # local dev: postgres, redis, minio
│   ├── terraform/                   # cloud infra
│   └── k8s/                         # helm charts
├── scripts/
│   ├── seed.ts                      # seed DAC #811 equipment + LOTO procedure
│   └── replay-session.ts            # E2E test harness using saved photos
├── package.json                     # pnpm workspaces root
├── pnpm-workspace.yaml
└── turbo.json
```

Toolchain: **pnpm workspaces + Turborepo** for monorepo orchestration. Node 22 LTS. Python 3.12. React Native via Expo SDK 52+. PostgreSQL 16, Redis 7, MinIO (local) / S3 (prod).

## 3. Milestones

### M0 — Repo skeleton, tooling, local dev environment

**Goal:** A clean monorepo that boots Postgres, Redis, MinIO locally; lints; tests; commits.

**Prerequisites:** Empty `eon-field-iq` directory; Node 22, pnpm, Docker, Python 3.12 installed.

**Deliverables:**
- pnpm workspace with the directories from §2 (empty `index.ts` stubs OK).
- Turborepo `turbo.json` with `build`, `lint`, `test`, `dev` pipelines.
- `infra/docker-compose.yml` starting Postgres 16, Redis 7, MinIO with a healthy bucket.
- `.env.example` documenting every env var the system needs.
- GitHub Actions workflow that runs lint + tests on PR.
- `docs/` directory with this spec package committed.
- `CLAUDE.md` at repo root (see `05_CLAUDE.md`).

**Claude Code prompt:**
```
You are bootstrapping the EON Field IQ monorepo per docs/04_Implementation_Plan.md §2 and §3 (M0).

Tasks:
1. Initialize pnpm workspace at the repo root with Turborepo.
2. Create empty stub packages in apps/* and packages/* per the layout.
3. Configure TypeScript 5.6 with strict mode; share a base tsconfig.json from packages/tsconfig.
4. Set up ESLint (typescript-eslint, react, react-native) + Prettier with consistent config.
5. Add infra/docker-compose.yml that brings up Postgres 16 (port 5432, db=field_iq), Redis 7 (6379), MinIO (9000 API, 9001 console) with a "field-iq" bucket auto-created.
6. Add .env.example documenting all env vars referenced in docs/02_Architecture.md.
7. Add a basic GitHub Actions workflow at .github/workflows/ci.yml: install pnpm, install deps, lint, type-check, test, on PRs to main.
8. Commit docs/ with the spec files (assume they already exist on disk; do not regenerate them).
9. Write a README.md at repo root with: project description (1 paragraph), local setup (4-5 commands), pointer to docs/CLAUDE.md.

Acceptance: `docker compose up -d && pnpm install && pnpm turbo build lint test` succeeds.
Do not implement application code yet.
```

**Acceptance test:** `docker compose up -d && pnpm install && pnpm turbo build lint test` exits 0.

---

### M1 — Backend foundation: API, DB schema, seed

**Goal:** Fastify backend boots, connects to Postgres + Redis + MinIO, exposes `/health`, runs the migration that creates the schema in `02_Architecture.md §3.3.2`, seeds the DAC #811 equipment + LOTO procedure + 10 steps from `03_LOTO_Test_Case.md §4`.

**Prerequisites:** M0 complete.

**Deliverables:**
- `apps/api/src/server.ts` Fastify server with health check.
- Drizzle ORM (or Prisma) schema matching `02_Architecture.md §3.3.2`.
- `scripts/seed.ts` that inserts the DAC #811 equipment + procedure + 10 steps with the verification_prompts from `03_LOTO_Test_Case.md`.
- `packages/prompts/loto-dac811.ts` exporting the seed data as typed structures (so the seed script imports from there, not duplicates).
- Unit tests for the seed script's idempotency.

**Claude Code prompt:**
```
Implement M1 from docs/04_Implementation_Plan.md.

Read docs/02_Architecture.md §3.3 for the data model and docs/03_LOTO_Test_Case.md
§§2-4 for the seed content (DAC #811 equipment + 10 LOTO steps with their exact
verification_prompts — do NOT rewrite or paraphrase the prompts; use them verbatim).

Tasks:
1. apps/api: Fastify 5 + TypeScript. Routes: GET /health (returns {ok: true, db: bool, redis: bool, s3: bool}).
2. Use Drizzle ORM with a migration that creates every table in 02_Architecture.md §3.3.2.
   Include the enum types and indexes implied by the read paths in the API contract.
3. packages/prompts: export typed seed data for DAC #811 equipment + LOTO procedure +
   the 10 steps. Each step is { stepNumber, title, instruction, referenceImageUrl,
   verificationRequired, verificationPrompt, successCriteria, retryThreshold }.
   The verificationPrompt text MUST match docs/03_LOTO_Test_Case.md exactly.
4. scripts/seed.ts: idempotent seed (UPSERT by qr_code_value for equipment, by name+version
   for procedure, by procedure_id+step_number for steps). `pnpm seed` runs it.
5. Tests: seed runs twice, second run is a no-op; all 10 steps present and correctly ordered.

Acceptance: `pnpm --filter api dev` boots cleanly; `pnpm seed` populates the DB;
GET /health returns ok:true for all dependencies.
```

**Acceptance test:** `curl http://localhost:3000/health` → `{"ok":true,"db":true,"redis":true,"s3":true}`; `psql -c "SELECT count(*) FROM steps;"` returns 10.

---

### M2 — Session API + WebSocket gateway

**Goal:** Implement the session lifecycle endpoints from `02_Architecture.md §5.4` plus the WebSocket contract in §6. No Claude integration yet — verification is mocked to always return `verified:true` after a 1 s delay.

**Prerequisites:** M1.

**Deliverables:**
- Endpoints: `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/photo`, `POST /sessions/:id/advance`, `POST /sessions/:id/retry`, `POST /sessions/:id/abandon`, `POST /sessions/:id/complete`, plus `GET /equipment/by-qr/:qrValue` and `GET /procedures/:id`.
- WebSocket gateway at `/v1/ws` supporting `subscribe` to `session:<id>` and `org:<orgId>:sessions` channels.
- Photo upload writes to MinIO; `audit_log` row with event `photo_submitted`.
- Mocked verifier publishes `verification.result` + `step.advanced` events.
- Contract tests (Pact-style) covering all endpoints.

**Claude Code prompt:**
```
Implement M2 from docs/04_Implementation_Plan.md. Follow docs/02_Architecture.md
§5 (REST contract) and §6 (WebSocket contract) exactly.

Scope:
1. Implement all routes in /api/v1/sessions/* and /api/v1/equipment/*, /api/v1/procedures/*
   per docs/02_Architecture.md §§5.3-5.4. Use JSON schemas for request/response validation
   (Fastify's TypeBox).
2. Implement the session state machine: status transitions active → completed | abandoned,
   current_step_id advances only on verified result, retry_count tracked on session_steps.
   Reject advance attempts when current step is not yet verified.
3. POST /sessions/:id/photo: upload to MinIO at the path scheme in 02_Architecture.md §3.3.3,
   compute SHA-256, insert audit_log row with event=photo_submitted, enqueue a mock
   verification job to Redis Streams "verification_queue".
4. Mocked verifier: a small worker inside apps/api/src/workers/mock-verifier.ts that drains
   verification_queue, waits 1000ms, inserts audit_log row with verified=true,
   publishes session.verification.result + step.advanced events via Redis pub/sub.
5. WebSocket gateway at /v1/ws using Fastify-WebSocket. Auth via ?token query param
   (validate JWT). On subscribe, replay the last 10 events for that channel from a
   short-lived Redis list cache.
6. Contract tests using @pact-foundation/pact for every endpoint; both happy paths and
   the key error cases (advance without verification, retry on completed session, photo
   for the wrong step_id).

Do NOT implement Claude integration yet — that is M3.

Acceptance: integration test creates a session, uploads 10 photos, advances through
all steps, completes the session, and asserts the full WebSocket event sequence
matches docs/02_Architecture.md §6.
```

**Acceptance test:** The integration test described above passes.

---

### M3 — Claude verification worker (Python)

**Goal:** Replace the mock verifier with a real Python worker that calls Anthropic `claude-sonnet-4-6` with the system prompt and per-step `verification_prompt`, parses JSON, persists to `audit_log`.

**Prerequisites:** M2; `ANTHROPIC_API_KEY` available.

**Deliverables:**
- `apps/verifier/` Python 3.12 service.
- Drains `verification_queue` from Redis; calls Claude per `02_Architecture.md §8.3`.
- Resilient: retries on transient API errors (exponential backoff, max 3); structured logging; OpenTelemetry tracing.
- Regression test harness with 5 known-good photos per step (use the DAC #811 reference images) plus 5 known-bad photos that should fail. Reports per-step accuracy.
- The mock verifier from M2 is gated behind `USE_MOCK_VERIFIER=true` env var (kept for offline dev).

**Claude Code prompt:**
```
Implement M3. Build the Python verification worker per docs/02_Architecture.md §§7-8.

Tasks:
1. apps/verifier: Python 3.12. Use poetry or uv for deps. Required deps: anthropic,
   redis, psycopg, boto3 (for signed S3 URLs), opentelemetry-api, structlog, pydantic.
2. Implement a long-running worker that consumes Redis Stream "verification_queue" using
   consumer groups (so multiple instances can run in parallel without duplicate processing).
3. For each job: fetch the photo via signed S3 URL, call anthropic.Messages.create with:
   model="claude-sonnet-4-6", system=SYSTEM_PROMPT from docs/02_Architecture.md §8.1,
   message[0].content = [image (base64 jpeg), text (the step's verification_prompt)].
   Use max_tokens=400. Expect strict JSON output per the system prompt; if parsing fails,
   retry once with a clarifying user turn, then fail the job.
4. Persist result to audit_log (event='verified' or 'retry' depending on response.verified).
   Publish session.verification.result event to Redis pub/sub channel session:<id>.
5. Retries: on 5xx / 429 / network errors, retry with exponential backoff (500ms, 2s, 8s).
   Max 3 attempts. After that, write audit_log with event='error', publish error event.
6. Tests: tests/regression/ contains pairs of (photo, step_prompt, expected_verdict)
   for each of the 10 LOTO steps. Run them against the live API in a "regression" pytest
   marker; report per-step accuracy. Aim for ≥90% per-step accuracy.
7. Update apps/api: gate the mock verifier behind USE_MOCK_VERIFIER=true. Default off.

Acceptance: docker-compose up brings up Postgres+Redis+MinIO+api+verifier. The M2
integration test still passes with the real verifier and real Claude API.
The regression test reports ≥90% accuracy across all 10 LOTO steps.
```

**Acceptance test:** Regression suite reports ≥90% accuracy; M2 integration test still passes against real Claude.

---

### M4 — Glasses Web App

**Goal:** The HTML/CSS/JS app that runs on Meta Ray-Ban Display. Subscribes to WebSocket events for the active session; renders step cards; handles Neural Band input.

**Prerequisites:** M2 (M3 not required — Web App is verifier-agnostic).

**Deliverables:**
- `apps/glasses-webapp/` — vanilla HTML/CSS/JS or Preact + Vite, bundle < 200 KB.
- Hosted locally during dev via Vite dev server with HTTPS (`mkcert`).
- Renders the 6 card states from `03_LOTO_Test_Case.md §5`.
- Handles Neural Band gestures per the FAQ: index pinch = enter, middle pinch = cancel, swipes for navigation within a card. (Web Apps platform delivers these as standard keyboard/synthetic events — check Meta docs for the exact event names; abstract behind an `input.ts` module.)
- Connects to `wss://api.../v1/ws`, subscribes to `session:<id>` (session id passed via URL hash).
- Documented "Add to glasses" flow in the package's README.

**Claude Code prompt:**
```
Implement M4. Build the Meta Ray-Ban Display Web App per docs/02_Architecture.md §3.1
and the card spec in docs/03_LOTO_Test_Case.md §5.

Tasks:
1. apps/glasses-webapp using Preact + Vite + TypeScript. Bundle size budget: < 200 KB
   gzipped. No third-party trackers. No localStorage of sensitive data.
2. Single-page app with one component: <StepCard>. Render the 6 state variants from
   docs/03_LOTO_Test_Case.md §5 (pending, processing, verified, retry, error, complete).
   Card dimensions and contrast tuned for 600x600 px @ 5000 nits.
3. Input handling in src/input.ts: abstract the Neural Band events to a small API:
   onEnter (index pinch), onCancel (middle pinch), onSwipeLeft/Right/Up/Down. Look up
   the actual event names in Meta's Web Apps docs at
   https://wearables.developer.meta.com/docs/develop/webapps/ and implement against them.
   Fall back to keyboard equivalents (Enter, Escape, arrows) for browser dev.
4. WebSocket client: connect to wss://${API_HOST}/v1/ws?token=<jwt>, subscribe to
   session:<sessionId>. Render based on incoming events:
   - step.advanced  → render new step card in 'pending' state
   - verification.start → switch to 'processing'
   - verification.result with verified=true → 'verified' state, await user pinch
   - verification.result with verified=false → 'retry' state with claude's message
   - session.completed → 'complete' state with summary
5. URL contract: load with #token=<jwt>&session=<sessionId>. Reject with a friendly
   error if either is missing.
6. Reference image viewing: tap-thumbnail expands to full card view; swipe to dismiss.
7. README.md in apps/glasses-webapp explaining how to add it to a Meta Ray-Ban Display
   in Developer Mode (Meta AI app → App Settings → App connections → Add a Web App,
   paste the password-protected staging URL).

Acceptance: open the dev URL in Chrome desktop, fake a sequence of WebSocket events,
confirm all card states render correctly. On real glasses, add the staging URL via the
Meta AI app; confirm the home card appears on the HUD.
```

**Acceptance test:** Browser test of all card states passes; glasses smoke test renders home card.

---

### M5 — React Native companion app (mobile)

**Goal:** Expo-managed React Native app that pairs with the glasses via Wearables Device Access Toolkit, decodes QR codes from the camera, runs the session, mirrors UI on the phone.

**Prerequisites:** M2; iOS Mac or Android device for testing; Meta Wearables Device Access Toolkit SDK installed.

**Deliverables:**
- `apps/mobile/` Expo SDK 52+, TypeScript, expo-router, Zustand, TanStack Query, MMKV.
- iOS native module wrapping `meta-wearables-dat-ios` (Swift); Android wrapping `meta-wearables-dat-android` (Kotlin). Shared TS API `MetaGlassesModule`.
- Screens: Pair device, Home (start a session), QR scan (uses glasses camera if paired, phone camera fallback), Active session mirror, Session complete summary.
- Offline queue: photos written to MMKV with metadata; uploader drains on reconnect.
- TestFlight + Firebase Internal Testing distribution configured.

**Claude Code prompt:**
```
Implement M5. Build the React Native companion app per docs/02_Architecture.md §3.2.

Tasks:
1. apps/mobile with Expo SDK 52+ (new architecture, bare workflow for native modules),
   TypeScript, expo-router, Zustand (session state), TanStack Query (server state),
   react-native-mmkv (offline storage).
2. Native modules:
   - ios/MetaGlassesModule.swift wrapping the Swift Meta Wearables Device Access
     Toolkit SDK (github.com/facebook/meta-wearables-dat-ios). Methods:
     pairDevice(), getPairedDevice(), capturePhoto() → returns base64 JPEG,
     onConnectionChange(callback).
   - android/MetaGlassesModule.kt equivalent using github.com/facebook/meta-wearables-dat-android.
   - TS interface at src/native/MetaGlassesModule.ts so screens are platform-agnostic.
   If the SDK isn't installable in this environment, build against a TS interface
   that matches the SDK's documented surface and stub the native side; leave clear
   TODO markers for the native build step.
3. Screens (expo-router):
   - /pair: detect glasses, walk through pairing.
   - /: home; lists recent sessions; large "Start procedure" button.
   - /scan: if glasses paired, call capturePhoto() and decode QR via expo-barcode-scanner
     in headless mode; if no glasses, use the phone camera. Resolve via
     GET /equipment/by-qr/:qrValue. POST /sessions to start.
   - /session/[id]: mirror of the HUD card. Shows current step, status, photo button,
     retry / cancel controls. Subscribes to the same WebSocket channel as the Web App.
   - /session/[id]/complete: summary + "Generate report" link.
4. Photo capture flow: when the user taps "Take verification photo" in the session
   screen, call MetaGlassesModule.capturePhoto(); upload via POST /sessions/:id/photo
   with step_id, captured_at, lat/lng (from expo-location).
5. Offline queue: if upload fails (no network), persist the photo + metadata to MMKV
   under a "pending_uploads" key. On NetInfo state change to connected, drain the queue.
6. Auth: magic-link via POST /auth/magic-link; deep link handler at /auth/exchange
   that calls /auth/magic-link/exchange and stores JWT + refresh in MMKV.
7. Distribution: configure eas.json for TestFlight (iOS) and Firebase Internal Testing
   (Android). Document the dev build steps in apps/mobile/README.md.

Acceptance: in the Expo dev client on iOS, with stubbed native module returning a
pre-saved photo, run an entire session end-to-end against the local backend.
The session state on the phone matches the WebSocket events.
```

**Acceptance test:** Stubbed end-to-end session on simulator; manual hardware test deferred until full SDK install.

---

### M6 — Supervisor dashboard + admin

**Goal:** React web app that shows live sessions, drills into a session, generates PDF reports, and provides admin CRUD for equipment/procedures/steps.

**Prerequisites:** M2 (M3 for real verdicts).

**Deliverables:**
- `apps/dashboard/` React 19 + Vite + Tailwind + ShadCN UI + TanStack Query/Router.
- Routes: `/` (live), `/sessions/:id` (drill-in), `/history` (filters), `/admin/*` (CRUD).
- Real-time updates via WebSocket subscription to `org:<orgId>:sessions`.
- Inline "test verification prompt on a sample photo" tool in the step editor.
- PDF report download integrated.

**Claude Code prompt:**
```
Implement M6. Build the supervisor dashboard + admin per docs/02_Architecture.md §3.4
and docs/03_LOTO_Test_Case.md §6 (the trainer's view of an active LOTO session).

Tasks:
1. apps/dashboard with Vite + React 19 + TypeScript, Tailwind, ShadCN UI, TanStack
   Query, TanStack Router. Auth via the same magic-link flow as mobile (shared client
   in packages/auth).
2. Pages:
   - / (Live): list active sessions on the left; selected session shows the
     step-strip (10 dots per docs/03_LOTO_Test_Case.md §6), live feed of verified
     steps with photo thumbnails, trainer coach panel (notes field, autosaved),
     override-last-verdict button (calls a new admin endpoint POST /sessions/:id/override
     — implement in apps/api as well, audit-logged).
   - /sessions/:id (Detail): historical view of a single session with full audit timeline.
   - /history: filterable table (date, technician, equipment, status); bulk PDF export.
   - /admin/equipment, /admin/procedures, /admin/steps: standard CRUD.
   - /admin/steps/:id/test-prompt: an inline tool that uploads a sample photo and calls
     POST /admin/steps/:id/test-prompt; shows Claude's raw response. Makes prompt
     iteration tight.
3. Real-time: TanStack Query + a custom WebSocket hook that subscribes to
   org:<orgId>:sessions; incoming events trigger query invalidation for visible session lists
   and append to the live feed for the selected session.
4. PDF download: dashboard "Generate report" button → GET /reports/session/:id → trigger
   browser download.
5. KPI strip on the / page: completion rate, first-pass verification rate, average duration,
   active session count. Live counters, refreshed via WebSocket events.
6. Accessibility: WCAG 2.1 AA. Keyboard navigable. Color choices that work for the most
   common color vision deficiencies (avoid red/green-only signals — use icons + color).

Acceptance: with M2 + M3 running and a session in progress on the mobile app, the
dashboard's live feed updates within 2 s of each step verification. PDF report
downloads for a completed session.
```

**Acceptance test:** Hand-driven smoke: start a session in the mobile app, watch the dashboard, complete the session, download the PDF; PDF contains all 10 steps with photos.

---

### M7 — PDF reporter

**Goal:** Standalone worker that renders the PDF audit report per `03_LOTO_Test_Case.md §7` from a session's data + audit log.

**Prerequisites:** M2.

**Deliverables:**
- `apps/reporter/` Node service that exposes a queue handler + an HTTP endpoint.
- Puppeteer-based; uses a server-rendered React template at `apps/reporter/templates/session-report.tsx`.
- Generates PDF in < 5 s for a 10-step session.

**Claude Code prompt:**
```
Implement M7 per docs/03_LOTO_Test_Case.md §7.

Tasks:
1. apps/reporter: Node 22 + TypeScript. Two entry points:
   - HTTP endpoint POST /render { session_id } (called by apps/api when the user hits
     GET /reports/session/:id and no cached PDF exists).
   - Queue worker that drains a "report_queue" Redis Stream for bulk export jobs.
2. Render strategy: build the report HTML using server-rendered React (renderToString)
   from a template at templates/session-report.tsx, then headless Chrome (puppeteer) →
   PDF with letter and A4 stylesheets.
3. Report content per docs/03_LOTO_Test_Case.md §7: cover page, step-by-step with
   photos + Claude detail, trainer notes, OSHA 1910.147 compliance summary, signature
   block, audit chain integrity hashes.
4. Optimization: cache rendered PDFs in MinIO under reports/<session_id>.pdf with a
   24h signed URL; on subsequent GET, return the cached URL unless invalidated by an
   audit override.
5. Tests: golden-file test for a deterministic seed session; visual diff threshold 1%.

Acceptance: render a 10-step session report in <5 s. Output PDF passes a hash check
against a committed golden file.
```

**Acceptance test:** Golden file diff < 1%; render time p95 < 5 s.

---

### M8 — End-to-end hardware test + dogfooding

**Goal:** Run the full LOTO procedure on the DAC #811 trainer with real glasses, real Neural Band, real backend. Capture session for replay testing.

**Prerequisites:** M0–M7 complete; hardware: Meta Ray-Ban Display + Neural Band + DAC #811 trainer + paired phone with companion app installed.

**Deliverables:**
- 5+ recorded sessions on hardware, photos archived.
- Bug list with severity, filed as issues.
- Regression corpus updated with real photos (replacing seed reference images).
- `scripts/replay-session.ts` that replays a saved session against staging for CI.

**Claude Code prompt:**
```
Implement M8 per docs/04_Implementation_Plan.md M8.

This milestone is human-in-the-loop. Your job is to (a) prep the replay harness and
docs, then (b) collate findings after the human test.

Tasks (do these now):
1. scripts/replay-session.ts: given a directory of {step_N.jpg} files for a session,
   POST them in order to a staging environment as if they were real captures. Useful
   for regression testing without donning the glasses.
2. apps/api: ensure a session can be created in a "test_mode" that flags every audit_log
   row, so test sessions don't pollute KPIs.
3. docs/HARDWARE_TEST.md: a runbook for the human operator covering pre-flight checklist,
   pairing steps, the 10-step LOTO procedure expectations, common failure modes, and
   how to capture photos to disk for replay.
4. .github/workflows/replay.yml: nightly job that runs scripts/replay-session.ts against
   the committed regression session, asserts ≥90% verification accuracy per step.

Tasks (do these AFTER the human reports findings):
5. File one GitHub issue per bug/observation from the hardware test, labeled by severity.
6. Update docs/03_LOTO_Test_Case.md §4 verification_prompts based on real-photo behavior
   (e.g., if Step 6's hasp prompt has false negatives on a side angle, refine the prompt).
   Bump procedure version to 1.0.1 and re-seed.

Acceptance: nightly replay job runs green; 5+ recorded sessions in the regression corpus.
```

**Acceptance test:** Nightly replay job passes; hardware regression corpus has ≥5 sessions.

---

## 4. Phase 2 backlog (post-v1, sized for planning)

Each is ~1–2 weeks scoped against the v1 platform.

- **P2-1:** Additional procedures (Pump Alignment, Confined Space prep, Tank Inspection) authored via admin UI — no engineering changes, just content.
- **P2-2:** SSO via SAML / OIDC for enterprise customers.
- **P2-3:** Multi-tenant org administration: invite flows, role management, per-org branding.
- **P2-4:** xAPI / Tin Can integration to push session completion to EON Genesis LMS.
- **P2-5:** Live remote expert assist — supervisor joins the session via 720p video stream from the glasses (uses the Wearables SDK video API).
- **P2-6:** Group lockout — multiple technicians lock the same equipment in a coordinated session.
- **P2-7:** Self-guided certification flow — a trainee can complete unsupervised and be awarded a credential after N successful runs.
- **P2-8:** Offline AI fallback — small on-phone model for binary visual checks (valve open/closed) when no connectivity.

## 5. Phase 3 / 4 (sketch only)

- **P3:** Bidirectional Genesis loop — retry patterns surface as VR retraining recommendations; competency from VR gates Field IQ access.
- **P3:** Equipment auto-identification via on-glasses CV when SDK exposes it; QR becomes fallback.
- **P4:** GA publishing on App Store / Play Store / Meta's app catalog when Meta opens distribution.

## 6. Working with Claude Code — operating norms

- **Always start a session by reading `CLAUDE.md` + the relevant milestone in this doc.** Don't assume context from prior sessions.
- **Commit at milestone boundaries.** Each milestone should leave the tree green (build + lint + test) and be a single coherent PR.
- **Write tests as you go.** The acceptance test for each milestone is the floor, not the ceiling.
- **When prompts surprise you, capture the diff.** If you tune a `verification_prompt` based on real photos, bump the procedure version and commit the change with a note in the PR body explaining why.
- **Honor the spec's non-goals.** If Claude Code proposes adding a feature outside the v1 scope, push back and file it as Phase 2 backlog instead.
- **Keep secrets out of git.** Use `.env`, a secrets manager in prod, and ensure `apps/*/.env` is gitignored.

---

*Cross-reference: `01_PRD.md`, `02_Architecture.md`, `03_LOTO_Test_Case.md`, `05_CLAUDE.md`.*
