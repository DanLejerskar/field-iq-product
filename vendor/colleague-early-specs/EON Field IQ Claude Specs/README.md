# EON Field IQ — Specification Package

This bundle is the implementation-ready specification for **EON Field IQ**, an AI-powered industrial field operations platform delivered on Meta Ray-Ban Display smart glasses + Meta Neural Band. The first test case is the DAC #811 Lockout/Tagout Trainer.

## What's in the box

### For Claude Code (`markdown/`)

Drop these into your repo at `docs/` and put `05_CLAUDE.md` at the repo root as `CLAUDE.md`. Claude Code will pick them up automatically.

| File | Purpose |
|---|---|
| `01_PRD.md` | Product Requirements — vision, personas, goals, journeys, FR/NFR, KPIs, phasing. |
| `02_Architecture.md` | System architecture, data model, full REST + WebSocket API contract, Claude prompting strategy, security, observability. |
| `03_LOTO_Test_Case.md` | The 10-step LOTO procedure with exact `verification_prompt` text for Claude Sonnet 4.6 — seed content for v1. |
| `04_Implementation_Plan.md` | Phased build plan, M0–M8 milestones, each with a ready-to-paste Claude Code prompt and an acceptance test. |
| `05_CLAUDE.md` | Repo-root orientation: tech stack, conventions, do-nots, glossary, dev quickstart. **Goes at the repo root, not in `docs/`.** |

### For stakeholders (`word/`)

Same content, formatted as Word documents for sharing with non-technical reviewers.

| File | Companion to |
|---|---|
| `EON_Field_IQ_PRD.docx` | `01_PRD.md` |
| `EON_Field_IQ_Architecture.docx` | `02_Architecture.md` |
| `EON_Field_IQ_LOTO_Test_Case.docx` | `03_LOTO_Test_Case.md` |
| `EON_Field_IQ_Implementation_Plan.docx` | `04_Implementation_Plan.md` |

The `CLAUDE.md` handoff is deliberately markdown-only — it's a developer artifact.

## Suggested reading order

- **For Claude Code / engineers:** `05_CLAUDE.md` → `01_PRD.md` → `02_Architecture.md` → `03_LOTO_Test_Case.md` → `04_Implementation_Plan.md` (then start at M0).
- **For executives / sponsors:** `EON_Field_IQ_PRD.docx` only.
- **For product / pilot customers:** `EON_Field_IQ_PRD.docx` + `EON_Field_IQ_LOTO_Test_Case.docx`.
- **For engineering leads / architects:** `EON_Field_IQ_Architecture.docx` + `EON_Field_IQ_Implementation_Plan.docx`.

## Key design decisions baked into this spec

1. **Two SDK paths used together.** Meta opened the Wearables Device Access Toolkit in developer preview (May 2026) with two non-overlapping capability sets: a Web Apps path (HTML/CSS/JS on the glasses, display + Neural Band but no camera) and a Native Mobile path (iOS/Android with full camera/mic/speaker/display access). EON Field IQ uses **both** — the Web App renders the HUD, the React Native companion app captures the camera, and the backend stitches them together over WebSocket.
2. **The backend is the source of truth.** The glasses Web App and the phone companion app never talk directly. Every state change flows through the backend, which keeps the data model clean and makes audit immutability tractable.
3. **Claude verification runs in Python, not Node.** The verifier worker is isolated so we can swap models, add fallbacks, or add preprocessing later without touching the API tier.
4. **Procedures are versioned content, not code.** Adding new procedures (pump alignment, confined space prep, customer-specific SOPs) is an admin-UI operation, not an engineering project. The LOTO procedure is the v1 hero; Phase 2 adds more without code changes.
5. **First test case is a real, purchasable simulator.** The DAC #811 LOTO Trainer is a standard industrial training device. Building v1 against it means we can dogfood internally and ship the same artifact to pilot customers.

## What we deliberately did NOT do

- No WhatsApp bot. The original Field IQ spec used WhatsApp as the HUD delivery channel because the SDK wasn't open. That's now obsolete — we have direct display access via the Web Apps platform.
- No spatial AR. Meta Ray-Ban Display is a monocular HUD, not a passthrough AR headset. The UX is designed around step cards on the HUD, not anchored overlays.
- No custom wake word. We stay with Meta's native "Hey Meta, take a photo" voice command in v1.
- No production publishing. The Meta Wearables SDK is in developer preview; v1 distributes via release channels (≤100 testers) and password-protected Web App URLs.

## Status

- **Spec status:** v1.0, ready to start M0 in `04_Implementation_Plan.md`.
- **Open questions:** see `01_PRD.md §11` (4 questions for product/engineering to resolve during build).
- **Next deliverable from EON side before build:** 10 reference photos per LOTO step (good and bad examples) for the verification regression corpus.
