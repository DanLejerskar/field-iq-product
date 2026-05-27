# Phase 1 — LOTO v1 · Claude Code Handoff Prompt

**Audience:** Claude Code, running in the `field-iq-product/` repo root via `claude` CLI.
**Written by:** Claude Cowork · for Dan Lejerskar, EON AI Ventures.
**Estimated effort:** 10–15 milestone-sized Claude Code sessions across 1–2 weeks of intensive work.
**Supersedes:** `PHASE_0_CLAUDE_CODE_PROMPT.md` (Next.js walkthrough refactor — deferred indefinitely; Phase 1 is now the critical path).

---

## How to use this prompt

Dan: open Claude Code in this folder (`cd field-iq-product && claude`). Paste this entire file as your first message. Claude Code will read the referenced files, propose a milestone plan, then execute milestone by milestone with checkpoints back to Cowork.

---

## Your role

You are Claude Code working on **EON Field IQ — LOTO v1**, the first shipping product of the EON AI Ventures Field IQ platform. The first test case is the **DAC #811 Lockout/Tagout Trainer**, a heavy-duty industrial training simulator. The product runs on Meta Ray-Ban Display + Meta Neural Band + a paired iPhone or Android phone, with a server-side backend and a trainer dashboard.

You are not building tactical throwaway code. You are building the foundation of a production product that will run live in industrial training bays and (in Phase 2) operational refineries.

## Required reading before you start

All paths below are **relative to the repo root** (the directory containing this prompt). You're already there if you opened Claude Code with `cd field-iq-product && claude`.

### Mandatory file-discovery checklist

Read these nine files in order. After each one, post to chat a single line in the form:
`✓ [N/9] <filename> — <≤20 word summary of what the file is>`

If a file is missing or unreadable, stop and report the exact filename + error. Do not proceed to writing code until all nine summaries are posted.

1. `./FIELD_IQ_PRODUCT_SPEC.md` — master architectural spec. Section 4 (canonical schema) and section 5 (design system) are non-negotiable contracts.
2. `./VISION_TO_REALIZATION_SPEC.md` — marriage of user-journey vision with Meta hardware realization. **Sections 4 (the 10 LOTO steps with verification prompts) and 5 (cross-step concerns) are your single source of truth for what to build.**
3. `./META_SDK_LANDSCAPE.md` — confirmed Meta SDK landscape and access plan. Two SDKs: Wearables Device Access Toolkit (DAT) + Web Apps Starter Kit.
4. `./ROADMAP.md` — six-phase plan from foundation to shipping product. Phase 1 detailed in section 3.
5. `./vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/01_PRD.md` — colleague's PRD with personas, KPIs, FR/NFR.
6. `./vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/02_Architecture.md` — colleague's technical architecture. Four-tier system (Glasses · Phone · Backend · Dashboard) and SDK split rationale are authoritative.
7. `./vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/03_LOTO_Test_Case.md` — **the 10 LOTO steps with verbatim verification prompts.** You will copy these prompts into seed data, character-for-character.
8. `./vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/04_Implementation_Plan.md` — colleague's milestone breakdown. Sanity-check your own plan against it.
9. `./vendor/colleague-early-specs/EON Field IQ Claude Specs/markdown/05_CLAUDE.md` — colleague's CLAUDE.md (tech stack, conventions, do-nots). Adopt its conventions; copy it to repo root as `./CLAUDE.md` during M0.

### After the checklist

State your milestone plan in 8–12 bullets. Reference the colleague's M0–M8 plan in your reasoning but you may diverge with justification. Post the plan to chat.

**Then wait for Dan's go-ahead before touching the filesystem.** Dan's "go" is one word. If he asks to adjust the plan, adjust it and re-post.

---

## Target file tree (this is what you build)

All new files go inside `./` (the repo root, already at `field-iq-product/`). Existing spec/notes Markdown files stay where they are.

```
field-iq-product/
├── package.json              ← root, pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.json             ← shared TS base
├── .gitignore
├── .editorconfig
├── .env.local                ← created by `pnpm setup`, NEVER committed
├── .env.example              ← committed template, no secrets
├── prettier.config.cjs
├── eslint.config.js
├── docker-compose.yml        ← local Postgres + Redis + MinIO
├── CLAUDE.md                 ← adapted from colleague's 05_CLAUDE.md
├── README.md                 ← already exists, append a "How to run" section
│
├── (existing spec/notes Markdown files — DO NOT MODIFY)
│   FIELD_IQ_PRODUCT_SPEC.md
│   VISION_TO_REALIZATION_SPEC.md
│   META_SDK_LANDSCAPE.md
│   ROADMAP.md
│   PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md  ← this file
│   PHASE_2_PRECONTEXT_NOTES.md
│
├── packages/
│   └── schema/                          ← @field-iq/schema
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── procedure.ts
│           ├── session.ts
│           ├── audit.ts
│           └── *.test.ts
│
├── services/
│   ├── backend/                         ← Node.js + Fastify API
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   ├── websocket/
│   │   │   ├── auth/
│   │   │   └── db/                      ← Prisma or Drizzle
│   │   └── seed/
│   │       └── dac811_loto.ts           ← THE 10 LOTO STEPS, VERBATIM
│   ├── verifier/                        ← Python Claude worker
│   │   ├── pyproject.toml
│   │   ├── src/
│   │   │   ├── worker.py
│   │   │   └── prompts/
│   │   │       └── system.txt
│   │   └── tests/
│   └── reporter/                        ← PDF audit generator
│       └── src/
│
├── apps/
│   ├── glasses-webapp/                  ← Preact + Vite, runs on glasses
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   ├── companion/                       ← React Native (iOS + Android)
│   │   ├── package.json
│   │   ├── app.json
│   │   ├── ios/                         ← native Swift bridge
│   │   ├── android/                     ← native Kotlin bridge
│   │   └── src/
│   └── dashboard/                       ← React + Vite trainer dashboard
│       ├── package.json
│       └── src/
│
├── tests/
│   └── e2e/                             ← Playwright
│
├── docs/
│   └── hardware-integration.md          ← M11 deliverable
│
└── vendor/                              ← read-only, DO NOT MODIFY
    └── colleague-early-specs/
```

**Rules for file placement, non-negotiable:**

- Anything you write goes inside one of the directories above. No files at the repo root except the ones explicitly listed (configs, README, CLAUDE.md, .env files).
- The `vendor/` directory is **read-only**. Never modify, never delete, never reorganize.
- Existing Markdown specs at the repo root are **read-only** for you. They are the source of truth Cowork maintains.
- When you create a new file, **first run `ls <target-dir>` to confirm the directory exists**; if not, create it explicitly. Don't assume.
- After every milestone, post a quick `tree` (max 2 levels deep) of any directories you touched, so Cowork can verify placement.

---

## Setup script — credentials and infrastructure (M0 deliverable)

**Dan does not pre-collect credentials.** You handle this interactively.

Write `./scripts/setup.ts` (callable as `pnpm setup`) that does the following on first run:

1. Check whether `.env.local` already exists at the repo root. If yes: load it, exit successfully.
2. Print: "I need to collect some credentials. You can either (a) point me at an existing `.env` file from another EON project, and I'll pick what I need, or (b) I'll prompt you for each credential one by one. Which do you prefer? (a/b)"
3. If (a): prompt for the absolute path to the existing `.env` file. Read it. Map known key names (ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL, etc.) to our schema. For any keys we need but don't find, fall back to interactive prompts for those specifically.
4. If (b): interactively prompt for each key listed below, one at a time, with a short description of what each is for. Mask input for keys (no echo).
5. Write `.env.local` at the repo root with all collected values. Set file permissions to 600 (owner read/write only).
6. Print a one-line summary of what was collected and what's still pending (e.g. "8 of 10 keys collected; 2 deferred until M5/M7").

**Keys to collect (deferred ones are flagged):**

| Key | Used by | Deferred until |
|---|---|---|
| `ANTHROPIC_API_KEY` | verifier (Python) | Required by M5; collect at M0 if available |
| `DATABASE_URL` | backend | Required by M2; collect at M0 |
| `REDIS_URL` | backend, verifier | Required by M3; collect at M0 |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | backend | Required by M3; default to local MinIO if not provided |
| `EMAIL_API_KEY` (Resend or Postmark) | backend (magic-link auth) | Required by M3; can defer if dev uses console-log fallback |
| `JWT_SIGNING_SECRET` | backend | Generate with `openssl rand -hex 32` if not provided |
| `REPORT_SIGNING_KEY` | reporter | Generate with `openssl rand -hex 32` if not provided |
| `APPLE_DEVELOPER_TEAM_ID` | companion (iOS) | M7 |
| `ANDROID_KEYSTORE_*` | companion (Android) | M7 |

**Genesis project lookup:** Dan mentioned the Anthropic API key (and possibly others) exists in EON's Genesis project. If option (a) above is used and Dan provides the path to Genesis's `.env`, your script should:
- Read Genesis's `.env`
- Extract any of: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL`, S3 keys, email keys
- Copy ONLY those values into our `.env.local`
- Never modify Genesis's `.env`

If Dan doesn't know the Genesis path, prompt him for it once. If he doesn't have it handy, fall back to interactive prompts (option b).

**Hosted infra setup:** If `DATABASE_URL` or `REDIS_URL` are not provided, the script should print a one-line note: "No Postgres URL provided. Defaulting to local Docker Compose Postgres. To use Neon, set DATABASE_URL in `.env.local` and re-run." Same for Redis (defaults to local Docker Compose) and S3 (defaults to local MinIO). Local Docker Compose is fully sufficient for M0–M10. Hosted infra is needed only for M11+ deployment.

You may also generate a `.env.example` at the same time, with all keys listed but values redacted to `<your-key-here>`. That file is committed.

---

## Mission

Build the complete LOTO v1 stack — schema package, backend API + WebSocket gateway, Python verification worker, glasses Web App, React Native companion (iOS + Android), trainer dashboard, admin authoring UI, PDF audit report generator, seed data — to the point where a trainee can complete the 10-step DAC #811 LOTO procedure end-to-end on real hardware (or a high-fidelity simulator) and a trainer can watch live + download an OSHA-compliant audit report.

## Acceptance criteria (you are done with Phase 1 when all are true)

1. `pnpm install` at the repo root succeeds. Workspaces include `packages/schema`, `services/backend`, `services/verifier` (Python — separate venv), `services/reporter`, `apps/glasses-webapp`, `apps/companion` (React Native), `apps/dashboard`.
2. `docker-compose up` brings up local Postgres + Redis + S3-compatible object storage (MinIO is fine) for development.
3. `pnpm dev` (or equivalent root script) starts: backend on :3000, verifier worker, reporter worker, glasses-webapp on :3001, dashboard on :3002. Companion app boots in Expo dev mode separately.
4. **Schema:** `pnpm --filter @field-iq/schema build` succeeds; ESM + types emitted. Round-trip test passes.
5. **Backend:** REST endpoints documented in colleague's spec §3.3 all return 200 on happy path. WebSocket gateway broadcasts `step.verified` events to all subscribed clients within 500 ms of verdict.
6. **Verifier:** Submits a sample photo + step prompt to the queue, gets back structured JSON `{verified, confidence, message, detail}` within 8 s p95 in dev (calling real Anthropic API with `claude-sonnet-4-6`).
7. **Seed data:** The DAC #811 equipment record + the 10-step LOTO procedure (with all 10 verification prompts verbatim from `03_LOTO_Test_Case.md`) are seeded by `pnpm seed`. A list call returns the procedure with all 10 steps in order.
8. **Glasses Web App:** Loads at `http://localhost:3001/?token=<dev-token>`. Renders Step 1 of 10 as a HUD card sized for 600×600. Simulated Neural Band pinch (click for dev) advances to next step after verification fires.
9. **Companion app:** Boots in Expo on iOS + Android. Stub `MetaGlassesModule` returns mock photo URI on `capturePhoto()`. Uploads to backend, receives verdict, mirrors HUD state on phone screen.
10. **Dashboard:** Shows active sessions list (left), live step feed for selected session (center), coach notes panel (right). Updates within 2 s of any backend event.
11. **PDF report:** `POST /sessions/:id/complete` triggers report generation. Returned PDF includes all 10 step photos, timestamps, Claude verdicts, retry counts, OSHA 29 CFR 1910.147 compliance mapping, SHA-256 hash chain.
12. **Tests:** Vitest unit tests for schema round-trip + backend handlers. Playwright smoke test that runs the full 10-step happy path against the running stack with mock photos.
13. `pnpm build` (production build) succeeds for backend, glasses-webapp, dashboard. Companion produces a TestFlight-able iOS build and a Firebase App Distribution Android build.

---

## Tech stack (confirmed by Dan — do not deviate without asking)

| Component | Choice | Notes |
|---|---|---|
| Mobile companion | **React Native 0.76+** with new architecture | Native iOS Swift + Android Kotlin bridges to Meta Wearables DAT SDK. Shared TS module interface `MetaGlassesModule`. |
| Glasses HUD | **Web App** (HTML/CSS/JS or Preact + Vite) | Sub-200 KB bundle. Hosted at password-protected URL. Onboards via QR in Meta AI app's App Connections panel. |
| Backend API | **Node.js 22 + Fastify** | TypeScript strict. Stateless. REST + WebSocket. |
| AI verification | **Python 3.12 worker** | Anthropic Messages API with `claude-sonnet-4-6`. Subscribes to Redis queue. Isolated process. |
| Database | **PostgreSQL** (Neon for managed) | Use Prisma or Drizzle (your choice — propose in your plan). |
| Cache + queues | **Redis** (Upstash for managed) | ioredis client. BullMQ for queues. |
| Object storage | **S3** (AWS) or **R2** (Cloudflare) | Abstract behind a `StorageAdapter` interface. MinIO for local dev. |
| Trainer dashboard | **React + Vite + TypeScript** | TanStack Query for server state, Recharts for analytics. |
| PDF generator | **Node.js worker** with Puppeteer | Renders a server-rendered React template, exports PDF. |
| Auth | **Magic-link email** (v1) | JWT bearer tokens. SSO deferred to Phase 2. |
| Local dev | **Docker Compose** | Postgres + Redis + MinIO. |
| Monorepo | **pnpm workspaces** | Already initialized. |

---

## Milestone structure (your proposed plan should follow this shape)

Work in order. Commit at each milestone. Pause and report back to Cowork in chat at each milestone boundary so Dan can review and Cowork can write any follow-up correction before you continue.

### M0 — Repo plumbing, tooling, and setup script
- Root `package.json` with pnpm workspaces (`packages/*`, `apps/*`, `services/*`).
- Root `tsconfig.json`, `.gitignore`, `.editorconfig`, `prettier.config.cjs`, ESLint config.
- `docker-compose.yml` for local Postgres + Redis + MinIO. Test that `docker-compose up` brings all three up cleanly.
- `CLAUDE.md` at repo root (copy and adapt from `vendor/colleague-early-specs/.../05_CLAUDE.md`).
- Root scripts: `pnpm setup` (the interactive credentials script described above), `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm seed`. Use Turbo or just shell scripts — propose in your plan.
- `.env.example` committed at the root with all keys listed and values redacted.
- `.env.local` is in `.gitignore`. Never commit it.
- After everything lands, run `pnpm setup` interactively with Dan once (it'll prompt him for credentials or for a path to the Genesis project's `.env` file). Confirm `.env.local` is generated correctly.
- Final M0 checkpoint: post the tree (max 2 levels) of the repo root + confirm `pnpm install` and `docker-compose up` both succeed.

### M1 — `@field-iq/schema` package
- TypeScript types per `FIELD_IQ_PRODUCT_SPEC.md` §4 and the LOTO subset from `VISION_TO_REALIZATION_SPEC.md`.
- Specifically: `Organization`, `User`, `Device`, `Equipment`, `Procedure`, `Step`, `VerificationRule`, `Session`, `SessionEvent` (StepStarted, StepCompleted, Intervention, Escalation, Recognition), `AuditLog`, `AuditPack`.
- For LOTO v1 you may simplify: drop `Interaction`, `SafetyGate`, `HapticPattern` for now if not needed; document the deferral.
- Vitest round-trip test using one slide from the colleague's seed data.
- `tsup` build emitting ESM + .d.ts.

### M2 — Database schema + migrations
- Pick Prisma or Drizzle. Propose in your plan; default to Prisma if undecided.
- Tables per colleague's spec §3.3.2 (Organization, User, Device, Equipment, Procedure, Step, Session, SessionEvent, AuditLog).
- Migrations runnable via `pnpm migrate`.
- Seed script at `services/backend/seed/dac811_loto.ts` that loads the equipment + procedure + 10 steps with **verbatim verification prompts copied character-for-character from `vendor/.../03_LOTO_Test_Case.md`**.

### M3 — Backend API (REST)
- Node 22 + Fastify + TypeScript strict.
- Auth: magic-link email + JWT bearer.
- Endpoints per colleague's spec §3.3:
  - `POST /api/auth/magic-link/request`, `POST /api/auth/magic-link/verify`
  - `GET /api/equipment/:id`, `POST /api/equipment/resolve` (by QR value)
  - `GET /api/procedures/:id`, `GET /api/procedures/:id/steps`
  - `POST /api/sessions` (start), `GET /api/sessions/:id`, `POST /api/sessions/:id/verify`, `POST /api/sessions/:id/advance`, `POST /api/sessions/:id/complete`, `POST /api/sessions/:id/abandon`
  - `GET /api/sessions` (list, filterable)
  - `POST /api/sessions/:id/report` (triggers PDF generation, returns signed URL)
  - Admin CRUD: `POST/GET/PUT/DELETE /api/admin/equipment`, `/api/admin/procedures`, `/api/admin/steps`
- Audit-log writes are append-only; never UPDATE or DELETE.

### M4 — WebSocket gateway
- Subscribed clients receive `session.*` events scoped to their org.
- Events: `session.created`, `session.advanced`, `step.verification_started`, `step.verified`, `step.retry`, `step.failed`, `session.completed`, `session.abandoned`.
- Use Fastify WebSocket plugin or `socket.io` (propose choice).
- Reconnection-safe: client passes `last_event_id` on reconnect, server replays.

### M5 — Python verification worker
- `services/verifier/` with Python 3.12, `uv` or `poetry` for deps.
- Subscribes to Redis queue `verify-queue`.
- Job payload: `{session_id, step_id, photo_url, verification_prompt, system_prompt}`.
- Calls Anthropic Messages API with `claude-sonnet-4-6`, image attached, `response_format` requesting structured JSON.
- Returns `{verified: bool, confidence: float, message: str, detail: str}`.
- Writes verdict row to `audit_log` and publishes `step.verified` (or `step.retry`) on Redis pub/sub.
- Retries on transient errors (3x with exponential backoff). Fails the verification job (not the worker) on hard errors.
- System prompt is in `services/verifier/prompts/system.txt` — adapt from colleague's spec §8.1.

### M6 — Glasses Web App
- `apps/glasses-webapp/` — Preact + Vite + TypeScript, target bundle < 200 KB gzipped.
- Routes: `/` (home card "Tap to scan equipment"), `/session/:id` (active session view).
- Renders the current step's HUD card (600×600). State: pending / processing / verified / retry / error. Indicator on right edge.
- WebSocket connection on load (token from URL fragment `#token=...`).
- Neural Band gesture handlers — for dev, map to keyboard: Enter = pinch, Esc = middle pinch (cancel), Arrow keys = swipes.
- Production: real Neural Band events come via the Meta AI app's app-injection layer; mock for now.
- Auto-reconnect on disconnect with "session paused" state.

### M7 — React Native companion
- `apps/companion/` — React Native 0.76+, TypeScript strict, Expo Router, Zustand, TanStack Query, react-native-mmkv.
- Pages: Login (magic link), Session Mirror (active session view), Settings.
- Native bridges in `ios/` (Swift) and `android/` (Kotlin):
  - **iOS bridge** wraps `meta-wearables-dat-ios` (clone from `https://github.com/facebook/meta-wearables-dat-ios` as a Pod or vendored source).
  - **Android bridge** wraps `meta-wearables-dat-android` (clone from `https://github.com/facebook/meta-wearables-dat-android`).
  - Shared TS interface `MetaGlassesModule` with methods: `pairDevice()`, `getPairedDevice()`, `capturePhoto()`, `startVideoStream()`, `getBatteryLevel()`.
  - For dev mode, ship a stub `MetaGlassesModule.mock.ts` that returns canned photo URIs from a fixture directory.
- QR decoding via `react-native-vision-camera` for fallback when glasses unavailable.
- Photo upload to backend via signed S3 URL (`POST /api/sessions/:id/verify` returns presigned upload URL + verification job ID).
- Offline queue using MMKV; drains on network reconnect.

### M8 — Trainer dashboard
- `apps/dashboard/` — React + Vite + TypeScript, TanStack Query, Recharts.
- Pages: Login, Live Sessions (default), Session Detail (10-step strip + step feed + coach notes), History, Workers, Admin.
- Live Sessions list updates via WebSocket within 2 s of any session event.
- Session Detail shows 10-dot step strip (gray/blue/green/amber/red), live photo feed with Claude verdicts, coach notes textarea (appends to audit log).
- Admin pages: CRUD for Equipment, Procedure, Step. Verification prompt editor with "test on sample photo" sandbox that calls Claude directly.

### M9 — PDF report generator
- `services/reporter/` — Node.js worker with Puppeteer.
- Subscribes to `report-queue` on Redis.
- Renders a server-side React template (one component per audit pack section: cover, step-by-step record, trainer notes, compliance summary, signature block).
- OSHA 29 CFR 1910.147 paragraph references mapped to steps that satisfy them (see colleague's spec §7).
- SHA-256 hashes of each photo + overall report hash, signed with platform signing key (env-var `REPORT_SIGNING_KEY`).
- Letter + A4 layouts.
- Stored to S3 with signed URL returned to caller.

### M10 — End-to-end happy-path test
- Playwright test in `tests/e2e/` that:
  - Spins up the full stack via Docker Compose.
  - Boots glasses-webapp + dashboard.
  - Simulates magic-link login.
  - Submits 10 mock photos (from `fixtures/dac811/step-XX.jpg` — placeholder photos for now) through the companion app's mock module.
  - Asserts each step verifies (using a Claude mock that returns canned verdicts).
  - Asserts dashboard updates within 2 s.
  - Asserts PDF generates and contains expected sections.
- Run via `pnpm test:e2e`.

### M11 — Hardware integration prep (no real hardware yet)
- Document `docs/hardware-integration.md` with: glasses pairing flow, BLE service UUIDs (from Meta SDK), the QR onboarding flow for the Web App via Meta AI app's App Connections panel, password-protected URL deployment for `glasses-webapp`.
- Stub the actual Meta SDK calls behind feature flags so the real integration is a flip-the-flag exercise when hardware lands.
- Document the Wearables Developer Center registration steps for an EON AI Ventures organization.

---

## Constraints (non-negotiable)

- **Schema fidelity:** types in `packages/schema/src/` must match `FIELD_IQ_PRODUCT_SPEC.md` §4 exactly. Deviations require explicit justification in commit message.
- **Verification prompt fidelity:** the 10 LOTO verification prompts in seed data must be **character-for-character verbatim** from `vendor/colleague-early-specs/.../03_LOTO_Test_Case.md`. Do not paraphrase, summarize, or "improve" them.
- **TypeScript strict.** No `any` without a `// @reason:` comment. No `@ts-ignore`.
- **Audit log immutability.** `audit_log` rows are append-only. Schema enforces this via DB trigger if possible.
- **No production publishing.** This is dev-only distribution: password-protected URL for the Web App, TestFlight + Firebase for mobile. Meta SDK is in developer preview through 2026.
- **No real hardware required for M0–M10.** Use mocks. M11 documents hardware integration but doesn't require it.
- **Commit at every milestone boundary** with conventional commit messages. Author yourself as `Claude <claude@eonreality.com>`. Include the milestone ID (`M5: glasses Web App scaffold`) in the commit subject.

## Out of scope for Phase 1 (deferred to Phase 2)

- Multi-tenant organization isolation beyond a simple `org_id` foreign key. Full SSO, role-based access, tenant data partitioning come in Phase 2.
- Operational deployment (Joe + Sara workflows). Phase 1 is training-bay only (Maya + Carlos + Priya).
- Procedures beyond DAC #811 LOTO. Pump alignment, confined space prep, customer-specific procedures are Phase 2.
- Real-time HUD overlays anchored to physical components (waiting on DAT SDK continuous-frame access).
- LMS integration (xAPI / Tin Can to EON Genesis).
- Multi-user collaborative LOTO (group lockout scenarios).
- Self-guided certification (unsupervised trainee + competency credential).
- Production publishing (App Store, Play Store, public Web App distribution).

If you find yourself implementing any of these, stop and ask.

---

## When you've completed a milestone

At the end of each milestone (M0 through M11), post in chat to Dan:

> Milestone `<MN>` landed.
>
> **Files touched (tree, 2 levels):**
> ```
> <output of `tree -L 2` for any directory you wrote to>
> ```
>
> **Commits:** `<git log --oneline since-last-milestone>`
>
> **Acceptance items passing:** `<list>`
>
> **Open questions for Cowork (if any):** `<list>`
>
> Ready for Cowork review.

Then wait. Dan will paste your message back to Cowork. Cowork will write any correction prompt or next-step prompt and Dan will paste it back to you.

**Always include the tree output.** Cowork uses it to verify file placement. If a file landed in the wrong directory or a milestone created files outside the target tree, Cowork will catch it from the tree output and write a correction.

## When you genuinely need Dan (and only then)

Dan is a high-level decision-maker. **Do not ask him to do technical chores** (sign up for Neon, generate signing keys, locate API keys, run shell commands, set environment variables). Handle all of that yourself via `pnpm setup` and interactive prompts as described above.

There are three categories where Dan's input is genuinely required:

**Category A — High-level direction.** Things Cowork couldn't pre-decide. Examples:
- "Should authentication use magic-link or also SSO from day 1?" (We already decided magic-link for v1.)
- "Should the dashboard support multi-tenant from day 1?" (We already decided no.)
- "Should we deploy backend to Vercel or AWS for M11?" (Open question; ask when M11 starts.)

If you hit a real Category-A question, post it concisely in chat with your recommendation and two alternatives, and wait. Don't dump 20 questions at once — batch them by milestone.

**Category B — Credentials Dan must provide.** Through `pnpm setup`'s interactive prompts. The script is your interface to Dan, not a chat message. The script may ask Dan for: an Anthropic API key, a path to a Genesis `.env` file, a Neon/Upstash URL if he wants hosted infra instead of local Docker, an email transport key for magic-link, code-signing details at M7.

**Category C — Hardware access.** When the project needs a real Meta Ray-Ban Display or a real DAC #811 trainer for end-to-end verification (M11+), tell Dan in chat what you need and why. He'll coordinate procurement separately.

**What NOT to ask Dan:**
- Don't ask him to "make sure you have X before Phase 1 starts." Build the dependency check into your setup script and prompt him at the exact moment you need the value.
- Don't ask him to run shell commands. You have a terminal; use it.
- Don't ask him to read documentation or "verify the plan looks right." He approves your plan once at the start; after that, post results, not questions.
- Don't ask him to create folders, copy files, or move things around. You have file tools.

## Things you should know but might not see

- The frozen Vercel walkthrough at `https://field-iq-walkthrough.vercel.app/` is the **visual reference**, not a code reference. Read its data model (49 slides, 4 journeys, 33 steps) for context, but **do not pull from its codebase**. Phase 1 is a different stack.
- The user-facing names from the walkthrough cast (Joe Mendez, Aisha Patel, Diego Romero, Maya Wu, Olu Bakari, etc.) — use these as seed workers in the DB. The first trainee in our seed data is **Maya Wu** (matching the colleague's spec); the trainer is **Carlos Romero**; the supervisor is **Priya Patel** (Priya is in the master spec, surname picked to match the EON cast).
- The brand is **EON AI Ventures** — verbatim. Not "EON AI", not "EON Reality" (the legacy name).

---

## Phase 1 closes when

- All 13 acceptance items pass.
- M11 docs are written.
- The team can demo: a trainee on the glasses simulator + a trainer on the dashboard + a supervisor on a second dashboard, all running through one DAC #811 LOTO session live, with the AI verifying each photo and a signed PDF report at the end.
- Dan signs off.

Cowork then writes Phase 2's prompt, incorporating lessons learned from Phase 1 (which is why we deliberately did not write Phase 2's prompt today — Phase 1 will surface real constraints we can't fully predict).

End of prompt.
