# CLAUDE.md — EON Field IQ (LOTO v1)

> Orientation document. Read this first when starting any session on this repo.
> Adapted from `vendor/colleague-early-specs/.../05_CLAUDE.md` and reconciled with
> `PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md` (the authoritative Phase 1 handoff).

## What this project is

**EON Field IQ** is an AI-powered industrial field-operations platform. A worker wearing
Meta Ray-Ban Display glasses + the Meta Neural Band is guided step-by-step through a
Standard Operating Procedure on the in-lens HUD. At each step they capture a verification
photo by voice or wrist gesture; **Claude Sonnet 4.6** analyzes the photo and either
advances the procedure or asks for a retake. Every action is logged with timestamps and
photo evidence to a real-time trainer dashboard. A signed PDF audit report is generated on
completion.

The v1 milestone is the **DAC #811 Lockout/Tagout (LOTO) Trainer** procedure — 10 hands-on
steps executed by a trainee (Maya) under a trainer's (Carlos) observation, with a supervisor
(Priya). The brand is **EON AI Ventures** — verbatim.

## Read these before doing anything

Repo-root specs are the source of truth and are **read-only** (Cowork maintains them):

1. `FIELD_IQ_PRODUCT_SPEC.md` — master spec. §4 canonical schema, §5 design system.
2. `VISION_TO_REALIZATION_SPEC.md` — §4 the 10 LOTO steps + verbatim verification prompts; §5 cross-step concerns.
3. `META_SDK_LANDSCAPE.md` — Meta SDK landscape (DAT + Web Apps Starter Kit).
4. `ROADMAP.md` — six-phase plan.
5. `vendor/colleague-early-specs/.../01–05_*.md` — colleague's PRD, architecture, LOTO test case, plan, CLAUDE.md.

If specs conflict, the more specific wins: **LOTO test case > architecture > PRD**, and the
Phase 1 prompt's target file tree is authoritative over the colleague's layout.

## Architecture — directory layout (this repo)

```
packages/schema/        @field-iq/schema — canonical TS types, imported everywhere
services/backend/       Node 22 + Fastify — REST + WebSocket, Drizzle/Postgres, Redis, S3
services/verifier/      Python 3.12 worker — Claude Sonnet 4.6 photo verification
services/reporter/      Node + Puppeteer — PDF audit report generator
apps/glasses-webapp/    Preact + Vite — HUD Web App that runs ON the glasses (<200 KB)
apps/companion/         React Native (Expo) — iOS + Android, DAT SDK bridges
apps/dashboard/         React + Vite — trainer dashboard + admin authoring
tests/e2e/              Playwright — full 10-step happy path
docs/                   hardware-integration.md (M11) and other build docs
```

The glasses Web App and the companion app **do not talk to each other directly** — both talk
to the backend over WebSocket. The backend is the source of truth for session state.

## Why two SDK paths

Meta ships two non-overlapping toolkits: **Web Apps** (HTML/CSS/JS on glasses: display +
Neural Band input, **no camera in v1**) and the **Device Access Toolkit** (native iOS/Android:
camera + sensors). We use both — Web App renders the HUD, companion captures photos, backend
stitches them together.

## Tech stack at a glance

| Layer           | Stack                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| Schema          | `@field-iq/schema` — TypeScript, `tsup` (ESM + .d.ts)                           |
| Backend         | Node 22 + Fastify, Drizzle ORM, Postgres 16, Redis 7 (ioredis/BullMQ), S3/MinIO |
| Verifier        | Python 3.12 (`uv`), `anthropic`, `claude-sonnet-4-6`                            |
| Reporter        | Node + Puppeteer + server-rendered React templates                              |
| Glasses Web App | Preact + Vite + TS, < 200 KB gzipped                                            |
| Companion       | React Native (Expo SDK 52+), Zustand, TanStack Query, MMKV                      |
| Dashboard       | React + Vite + TS, TanStack Query, Recharts                                     |
| Monorepo        | pnpm workspaces + Turborepo                                                     |
| Local infra     | Docker Compose: Postgres + Redis + MinIO                                        |

## Code conventions

- **TypeScript strict everywhere.** No `any` without a `// @reason:` comment. No `@ts-ignore`.
- **No duplicating types across apps.** Shared domain types live in `@field-iq/schema`.
- **No business logic in route handlers.** Routes parse input, call a domain service, format output.
- **Tests live next to code** (`foo.ts` + `foo.test.ts`); integration tests under each service's `tests/`.
- **Structured logging** (Pino on Node, structlog on Python); no `console.log` in committed code.
- **Conventional Commits.** Commit at every milestone boundary; include the milestone id (e.g. `M2: database schema + seed`). Author as `Claude <claude@eonreality.com>`.

## Critical do-nots

- **Do not write directly to `audit_log`.** Go through `AuditLogService.append()` — preserves the append-only + `superseded_by` chain.
- **Do not paraphrase the 10 LOTO `verification_prompt` strings.** They must be character-for-character verbatim from `VISION_TO_REALIZATION_SPEC.md §4` / `03_LOTO_Test_Case.md §4`. Tuning bumps the procedure version and gets a commit note.
- **Do not call the Anthropic API from the Node backend.** All Claude calls go through `services/verifier/`.
- **Do not store photos in Postgres.** Photos go to S3/MinIO; `audit_log` stores the S3 key + SHA-256.
- **Do not couple the Web App and companion app.** They communicate via the backend only.
- **Do not implement Phase 2 features.** If an idea is irresistible, note it and keep moving.
- **Do not commit secrets.** `.env.local` is gitignored; `pnpm setup` generates it.

## Local dev quickstart

```bash
pnpm install
docker-compose up -d           # Postgres + Redis + MinIO
pnpm run setup                 # writes .env.local (generates signing secrets)
                               # NB: `pnpm run setup`, not `pnpm setup` —
                               # `setup` is a reserved pnpm built-in command.
pnpm migrate                   # create DB schema
pnpm seed                      # DAC #811 equipment + 10-step LOTO procedure
pnpm dev                       # backend :3000, glasses-webapp :3001, dashboard :3002
```

Companion app boots separately in Expo. See each package's README for specifics.

## When stuck

- **Spec ambiguity:** the more specific doc wins (LOTO test case > architecture > PRD).
- **SDK ambiguity:** trust the linked Meta docs over training; the SDK is new (preview ~May 2026).
- **Domain (LOTO/OSHA):** trust OSHA 29 CFR 1910.147 and DAC #811 course materials.
