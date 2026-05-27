# Field IQ — Product

The Field IQ product codebase. This repo turns the frozen Vercel walkthrough into the real shipping product: iPhone Field IQ app, Monitor web console, Genesis Content Studio, Field IQ Cloud, and the shared schema package that keeps them all in lockstep.

---

## How we work

Two roles, one Claude:

| Role | What it does | Where it lives |
|---|---|---|
| **Claude Cowork** | The brain and architect. Writes specs, generates prompts, reviews code, makes design decisions, produces customer artifacts. | Cowork app — desktop conversation with Dan |
| **Claude Code** | The hands. Executes the prompts inside the repo: writes files, runs `npm`/`pnpm`, runs tests, runs dev servers, commits. | Terminal — `claude` CLI inside this repo |

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

- **Phase 0 — Foundation** — IN PROGRESS · canonical schema + Next.js walkthrough refactor
- **Phase 1 — Monitor MVP** — pending
- **Phase 2 — iPhone Field IQ Setup app** — pending
- **Phase 3 — Real AI + Genesis Content Studio** — pending
