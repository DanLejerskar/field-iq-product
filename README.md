# Field IQ — Product

The Field IQ product codebase. This repo turns the frozen Vercel walkthrough into the real shipping product: iPhone Field IQ app, Monitor web console, Genesis Content Studio, Field IQ Cloud, and the shared schema package that keeps them all in lockstep.

---

## How we work

Two roles, one Claude:

| Role              | What it does                                                                                                                 | Where it lives                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Claude Cowork** | The brain and architect. Writes specs, generates prompts, reviews code, makes design decisions, produces customer artifacts. | Cowork app — desktop conversation with Dan |
| **Claude Code**   | The hands. Executes the prompts inside the repo: writes files, runs `npm`/`pnpm`, runs tests, runs dev servers, commits.     | Terminal — `claude` CLI inside this repo   |

**The frozen UI reference** lives in the sibling folder `../4b Code Html Field_IQ_Walkthrough/` (mirrored on Vercel at <https://field-iq-walkthrough.vercel.app/>). It is the visual spec — read it, do not modify it.

---

## Where to start

1. **Read** [`FIELD_IQ_PRODUCT_SPEC.md`](./FIELD_IQ_PRODUCT_SPEC.md) — the master architecture document. Every Claude Code session should start by reading this.
2. **Run the Phase 0 prompt** — open Claude Code in this folder and feed it the contents of [`PHASE_0_CLAUDE_CODE_PROMPT.md`](./PHASE_0_CLAUDE_CODE_PROMPT.md). That builds the foundation.
3. **Iterate** — when something new is needed, ask Cowork for a fresh prompt, then run it through Claude Code.

---

## Repo layout (after Phase 0 lands)

```
field-iq-product/
├── README.md                          ← you are here
├── FIELD_IQ_PRODUCT_SPEC.md           ← master spec (read first)
├── PHASE_0_CLAUDE_CODE_PROMPT.md      ← first handoff
├── package.json                        ← monorepo root (workspaces)
├── tsconfig.json
├── packages/
│   └── schema/                         ← @field-iq/schema — the canonical types
└── apps/
    └── walkthrough/                    ← Next.js refactor of the Vercel walkthrough
        ├── app/
        ├── components/
        ├── data/
        └── public/assets/
```

Later phases add `apps/monitor`, `apps/genesis`, `apps/ios` (Swift), `services/cloud`.

---

## Status

- **Phase 0 — Foundation** — deferred (Next.js walkthrough refactor; superseded by Phase 1)
- **Phase 1 — LOTO v1 (DAC #811)** — IN PROGRESS · the critical path. See [`PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md`](./PHASE_1_LOTO_V1_CLAUDE_CODE_PROMPT.md)
- **Phase 2 — Multi-procedure + operational deployment** — pending

> Phase 1 builds the full LOTO v1 stack (schema · backend + WebSocket · Python verifier ·
> glasses Web App · React Native companion · trainer dashboard · PDF reporter). The
> directory layout below replaces the Phase 0 walkthrough layout above.

---

## How to run (Phase 1 — LOTO v1)

**Prerequisites:** Node 22+, pnpm 10+, Docker (for local Postgres/Redis/MinIO),
Python 3.12 + [uv](https://github.com/astral-sh/uv) (for the verifier).

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Start local infrastructure (Postgres 16 + Redis 7 + MinIO, with the field-iq bucket)
docker-compose up -d

# 3. Collect credentials / generate dev secrets → writes .env.local (never committed)
# NB: `pnpm run setup` — `setup` is a reserved pnpm built-in, so the `run` is required.
pnpm run setup

# 4. Create the database schema and seed the DAC #811 LOTO procedure
pnpm migrate
pnpm seed

# 5. Run the stack (backend :3000, glasses-webapp :3001, dashboard :3002)
pnpm dev
```

The React Native companion boots separately in Expo dev mode (`pnpm --filter @field-iq/companion start`).

Other useful scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

### Phase 1 directory layout

```
field-iq-product/
├── packages/schema/        @field-iq/schema — canonical TypeScript types
├── services/
│   ├── backend/            Node 22 + Fastify — REST + WebSocket, Drizzle/Postgres
│   ├── verifier/           Python 3.12 — Claude Sonnet 4.6 photo verification
│   └── reporter/           Node + Puppeteer — PDF audit report generator
├── apps/
│   ├── glasses-webapp/     Preact + Vite — HUD Web App (runs on the glasses)
│   ├── companion/          React Native (Expo) — iOS + Android
│   └── dashboard/          React + Vite — trainer dashboard + admin
├── tests/e2e/              Playwright — full 10-step happy-path test
└── docs/                   hardware-integration.md (M11) + build docs
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions, architecture, and critical do-nots.
