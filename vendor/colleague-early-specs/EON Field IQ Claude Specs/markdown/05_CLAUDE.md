# CLAUDE.md — EON Field IQ

> This file is the orientation document Claude Code should read first when starting any session on this repo. Drop it at the repo root as `CLAUDE.md`.

## What this project is

**EON Field IQ** is an AI-powered industrial field operations platform. A field worker wearing Meta Ray-Ban Display smart glasses and the Meta Neural Band is guided step-by-step through a Standard Operating Procedure (SOP) on the in-lens HUD. At each step they capture a verification photo by voice or wrist gesture; Claude Sonnet 4.6 analyzes the photo and either advances the procedure or asks for a retake. Every action is logged with timestamps, GPS, and photo evidence to a real-time supervisor dashboard. A PDF audit report is generated on demand.

The v1 milestone is the **DAC #811 Lockout/Tagout (LOTO) Trainer** procedure — 10 hands-on steps executed by a trainee under trainer observation. See `docs/03_LOTO_Test_Case.md` for the build-ready procedure spec.

## Read these before doing anything

In this order:

1. `docs/01_PRD.md` — what we're building and why.
2. `docs/02_Architecture.md` — system layout, data model, API contracts, Claude prompting strategy.
3. `docs/03_LOTO_Test_Case.md` — the literal seed content + 10-step verification prompts.
4. `docs/04_Implementation_Plan.md` — phased build with concrete prompts for each milestone.

If you have not read all four, stop and read them. The specs are tightly cross-referenced; skimming one in isolation will lead to mistakes.

## High-level architecture

Four tiers, each in its own app:

- `apps/glasses-webapp/` — HTML/CSS/JS Web App that runs **directly on the Meta Ray-Ban Display** (added via the Meta AI app in Developer Mode). Renders step cards on the HUD; handles Neural Band input.
- `apps/mobile/` — React Native (Expo) companion app for iOS + Android. Pairs with the glasses via the **Meta Wearables Device Access Toolkit** (native Swift / Kotlin SDK). Captures photos from the glasses camera, decodes QR codes, mirrors the session UI on the phone, handles offline queueing.
- `apps/api/` — Node.js 22 + Fastify backend. REST + WebSocket. PostgreSQL 16 for data; Redis 7 for queues and pub/sub; S3-compatible object storage for photos.
- `apps/dashboard/` — React 19 + Vite + Tailwind + ShadCN supervisor dashboard and admin UI.

Plus:
- `apps/verifier/` — Python 3.12 worker that drains the verification queue and calls Claude Sonnet 4.6.
- `apps/reporter/` — Node worker that renders PDF audit reports.

The glasses Web App and the companion app **don't talk to each other directly** — they both talk to the backend over WebSocket. The backend is the source of truth for session state.

## Why two SDK paths

As of May 2026, Meta opened the Wearables Device Access Toolkit in developer preview with two non-overlapping capability sets:

- **Web Apps** (HTML/CSS/JS, runs on glasses): display + Neural Band input + motion + GPS + local storage. **No direct camera access in v1 of Web Apps.**
- **Device Access Toolkit** (native iOS/Android SDK called from React Native): camera, microphone, speakers, display UI. Full sensor access. Distribution capped at 100 testers during preview.

We use **both**. The Web App renders the HUD; the companion app captures the camera. The backend stitches them together.

## Tech stack at a glance

| Layer | Stack |
|---|---|
| Glasses Web App | Preact + Vite + TypeScript, < 200 KB bundle |
| Companion app | React Native (Expo SDK 52+ bare workflow), TS, Zustand, TanStack Query, MMKV |
| Native bridges | Swift (iOS) wrapping `meta-wearables-dat-ios`; Kotlin (Android) wrapping `meta-wearables-dat-android` |
| Backend API | Node 22 + Fastify 5, Drizzle ORM, Postgres 16, Redis 7, S3/MinIO |
| Verifier | Python 3.12, `anthropic` SDK, `claude-sonnet-4-6` |
| Reporter | Node + Puppeteer + server-rendered React templates |
| Dashboard | React 19, Vite, Tailwind, ShadCN UI, TanStack Query/Router |
| Monorepo | pnpm workspaces + Turborepo |
| Infra | Terraform + Helm, AWS (us-east-1) for v1 |

## Code conventions

- **TypeScript strict mode everywhere.** No `any` without a TODO comment + justification.
- **Path imports use workspace packages**, never `../../../`. Define a package in `packages/*` if you find yourself reaching across apps.
- **No business logic in route handlers.** Fastify routes parse input, call a domain service, format output. Domain logic lives in `src/domain/`.
- **Domain types are shared.** `packages/shared-types` is the single source of truth for `Session`, `Step`, `AuditLogEntry`, `VerificationResult`, etc. Both backend and React Native import from it.
- **Tests live next to code.** `foo.ts` + `foo.test.ts`. Integration tests in `apps/api/tests/integration/`.
- **Errors are typed.** Use `problem+json` per RFC 7807. Don't throw strings; throw `AppError` subclasses with codes.
- **Logging is structured.** Pino on Node, structlog on Python. Every log line has `trace_id`, `session_id`, `org_id` when available.
- **No `console.log` in committed code** — use the logger.
- **Commits follow Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, etc.). PR titles match.

## Critical do-nots

- **Do not write directly to `audit_log`.** Always go through `AuditLogService.append()`. Direct writes break the append-only guarantee and the `superseded_by` chain.
- **Do not paraphrase the LOTO `verification_prompt` strings.** They are in `packages/prompts/loto-dac811.ts` and must match `docs/03_LOTO_Test_Case.md §4` verbatim. Tuning is fine, but it bumps the procedure version (`1.0.0` → `1.0.1`) and gets a PR note.
- **Do not call the Anthropic API from the Node API process.** All Claude calls go through `apps/verifier/`. This isolates rate limits, retries, and lets us swap models or add fallback providers without touching the API tier.
- **Do not store photos in Postgres.** Photos go to S3/MinIO; `audit_log` stores the S3 key + SHA-256 hash.
- **Do not couple the Web App and companion app.** They communicate via the backend only.
- **Do not implement features outside the v1 PRD scope.** If you think a Phase 2 idea is irresistible, file an issue with the `phase-2` label and keep moving.
- **Do not commit secrets.** `.env` is gitignored; production secrets live in a secrets manager (AWS Secrets Manager / Doppler / 1Password Connect).

## Local dev quickstart

```bash
# clone, install
pnpm install

# bring up local infra (postgres, redis, minio)
docker compose -f infra/docker-compose.yml up -d

# init db + seed DAC #811 + LOTO procedure
pnpm --filter api db:migrate
pnpm seed

# run everything
pnpm turbo dev
```

After that:
- API at `http://localhost:3000`, WebSocket at `ws://localhost:3000/v1/ws`
- Dashboard at `http://localhost:5173`
- Glasses Web App at `https://localhost:5174` (https because Meta requires it for the Web Apps platform; use `mkcert` for a local trusted cert)
- Mobile: `pnpm --filter mobile dev`, then run in Expo Go or a dev build

## Required env vars

See `.env.example` for the canonical list. The critical ones:

- `ANTHROPIC_API_KEY` — Claude access for the verifier.
- `DATABASE_URL` — Postgres connection string.
- `REDIS_URL`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `JWT_SECRET` — backend session tokens.
- `API_HOST` / `WS_HOST` — for the dashboard, Web App, and mobile to find the backend.
- `META_WEARABLES_APP_ID` — once registered in the Meta Wearables Developer Center.

## Working with the Meta Wearables SDK

- iOS SDK: https://github.com/facebook/meta-wearables-dat-ios
- Android SDK: https://github.com/facebook/meta-wearables-dat-android
- Web Apps starter / AI coding skills: https://github.com/facebookexternal/meta-wearables-webapp
- Docs: https://wearables.developer.meta.com/docs/develop/
- Mock Device Kit for testing without hardware: https://wearables.developer.meta.com/docs/mock-device-kit (note: does **not** support Display glasses currently; for HUD testing you need real hardware).

When in doubt about an SDK behavior, **check the docs above, not your training**. The SDK is new (preview opened ~May 2026) and behavior changes; we pin to a tagged SDK version and isolate calls behind the `MetaGlassesModule` native bridge so changes are localized.

## Glossary

- **LOTO** — Lock-Out/Tag-Out. The OSHA-regulated procedure (29 CFR 1910.147) for isolating hazardous energy before maintenance.
- **DAC #811** — DAC Worldwide's heavy-duty desktop LOTO training simulator (Course 811-500). Our v1 hero equipment.
- **HUD** — Heads-Up Display. The 600×600 px in-lens screen on the Meta Ray-Ban Display.
- **Neural Band** — Meta's sEMG wristband. Detects subtle finger movements as input gestures.
- **Web App** (capital W) — the Meta Ray-Ban Display platform feature for HTML/CSS/JS apps that run on the glasses. Not a generic "web application."
- **Device Access Toolkit** / **Wearables SDK** — Meta's native iOS/Android SDK for accessing glasses sensors.
- **Procedure** — a versioned ordered list of Steps tied to an Equipment.
- **Session** — one execution of a Procedure by a Technician.
- **Audit log** — append-only record of every event in a Session. The legal artifact.
- **Genesis** — EON Reality's broader learning platform. Field IQ is the field-execution layer of Genesis.

## Roadmap pointers (for context, not implementation)

- v1 (this build) — LOTO trainer on DAC #811. See `docs/04_Implementation_Plan.md` M0–M8.
- Phase 2 — additional procedures (authored, not coded), SSO, multi-tenant, LMS integration, live remote expert assist.
- Phase 3 — bidirectional integration with EON Genesis VR training.
- Phase 4 — GA publishing on App Store / Play Store / Meta's distribution channels.

Stay focused on v1. Phase 2+ should not influence v1 design decisions unless explicitly called out in `docs/02_Architecture.md`.

## When stuck

- **Spec ambiguity:** the four docs in `docs/` are the source of truth. If they conflict, the more specific doc wins (LOTO test case > architecture > PRD).
- **SDK ambiguity:** trust the linked Meta docs over your training. The SDK is new.
- **Domain ambiguity (LOTO / OSHA):** trust OSHA 29 CFR 1910.147 and the DAC #811 course materials over your training.
- **When all else fails:** open an issue, link the specific lines in the spec that are unclear, and wait for a human review rather than guessing.

Welcome to the team.
