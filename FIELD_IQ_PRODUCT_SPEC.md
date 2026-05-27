# Field IQ — Product Specification

**Author:** Claude Cowork (architect) · for Dan Lejerskar, EON AI Ventures
**Status:** Living document. Updated when the architecture changes.
**Implementation:** Claude Code, reading from this spec.

---

## 0. How to read this document

This is the **master spec**. Claude Code reads it at the start of every session to ground itself before touching files. Cowork updates it when the architecture changes. Humans review it when they want to understand the system.

Three layers, in this order:

1. **Product** (sections 1–2) — what Field IQ is, who uses it, what shipping means.
2. **Architecture** (sections 3–5) — the five codebases, how they talk, the canonical schema.
3. **Execution** (sections 6–9) — phases, norms, design tokens, what's frozen.

Skip ahead by section. Anchor links match the headings.

---

## 1. Product overview

**Field IQ** is an AI copilot for industrial field workers, delivered through Meta Ray-Ban Display smart glasses paired with an iPhone, with a Monitor web console for supervisors and Genesis Content Studio for procedure authoring. The product is *powered by Genesis*, EON AI Ventures' spatial-intelligence platform.

It serves four user journeys, 33 steps end to end:

| # | Journey | Persona | Steps | Surface |
|---|---|---|---|---|
| 1 | **System Setup** | Priya — IT admin | 7 | iPhone Field IQ Setup app |
| 2 | **Training Setup** | Maya + Carlos — content author + master technician | 9 (Genesis 1–7, Field IQ 8–9) | Genesis Content Studio (desktop web) |
| 3 | **Field Use** | Joe — field technician | 10 | Ray-Ban Display HUD + iPhone mirror + Neural Band haptic |
| 4 | **Monitor** | Sara — process-safety supervisor | 7 | Monitor web console (desktop) |

The architectural thesis is the **11-step round-trip loop** (Capture → Think → Guide), running in under three seconds end to end, with the AI as the connective tissue between Genesis (authoring) and Field IQ (execution).

Reference artifacts (frozen, do not modify):

- Vision deck: `../1 Field IQ Vision/#7829 v2 0 field-iq-on-genesis-restyled.pptx`
- User Journeys deck: `../2 Field IQ User Journeys/0 All Field-IQ-Genesis-Restyle.pptx`
- UI Mockup decks: `../3 Field IQ UI Mockups/` (one pptx per journey)
- HTML walkthrough (UI spec): `../4b Code Html Field_IQ_Walkthrough/` and <https://field-iq-walkthrough.vercel.app/>

---

## 2. The product as a procedure manifest

Every screen in the walkthrough corresponds to **one step in one procedure**. Strip the visual chrome and the data model is a procedure manifest:

- A **procedure** is a sequence of steps authored in Genesis (e.g., "LOTO V-204", 12 steps).
- A **step** has a target component, an instruction, an expected before-state, an expected after-state, a verification rule, and a confidence threshold.
- A **session** is one worker running one procedure on one device at one time. It accumulates events, confidence scores, and verification proofs.
- **Field IQ** reads the procedure and writes the session. **Genesis** writes the procedure and reads (anonymized) session telemetry for refinement. **Monitor** reads sessions live and archives them for compliance.

This is the spine. Section 4 defines it in TypeScript.

---

## 3. Architecture — five codebases

```
                    ┌────────────────────────┐
                    │  @field-iq/schema      │
                    │  TypeScript types       │
                    │  (Procedure, Session)   │
                    └────────────┬────────────┘
                                 │ imported by all
       ┌─────────────────────────┼─────────────────────────┐
       ▼                         ▼                         ▼
┌──────────────┐         ┌──────────────┐         ┌────────────────┐
│ iPhone app   │         │ Monitor      │         │ Genesis        │
│ (Swift)      │         │ (Next.js)    │         │ Content Studio │
│ Field Use    │         │ Sara         │         │ (Next.js)      │
│ + Setup      │         │ supervisor   │         │ Maya + Carlos  │
└──────┬───────┘         └──────┬───────┘         └────────┬───────┘
       │                        │                          │
       └────────────┬───────────┴──────────────┬───────────┘
                    ▼                          ▼
              ┌────────────────────────────────────┐
              │  Field IQ Cloud                    │
              │  (Next.js API routes + Postgres)   │
              │  procedure registry · session state │
              │  audit log · AI pipeline           │
              └────────────────────────────────────┘
```

| Codebase | Lives at | Stack | Phase |
|---|---|---|---|
| `packages/schema` | this repo | TypeScript, published as `@field-iq/schema` | Phase 0 |
| `apps/walkthrough` | this repo | Next.js 14 (App Router), TS, Tailwind | Phase 0 |
| `apps/monitor` | this repo | Next.js 14, TS, Tailwind, Recharts, SSE | Phase 1 |
| `apps/genesis` | this repo | Next.js 14, TS, Tailwind, React Three Fiber | Phase 3 (interleaved) |
| `apps/ios` | this repo, Swift sub-tree | Swift / SwiftUI, native iOS 17+ | Phase 2 |
| `services/cloud` | this repo | Next.js API routes (or tRPC), Postgres (Neon), Redis (Upstash) | Phase 1 |

Monorepo tooling: **pnpm workspaces** (lighter than Nx, faster than Yarn). The Swift app is in the same git repo but outside the pnpm workspace.

---

## 4. The canonical schema — `@field-iq/schema`

This is the single source of truth. Every codebase imports from this package. Schema changes require a version bump and a migration plan.

### 4.1 Procedure (authored in Genesis, consumed by Field IQ)

```typescript
// packages/schema/src/procedure.ts

export type ProcedureId = string;       // e.g., "loto-v204"
export type StepId = string;            // e.g., "step-5"
export type ComponentId = string;       // e.g., "valve-v204", "breaker-br-04"
export type EquipmentId = string;       // e.g., "skd-104"
export type WorkspaceId = string;       // e.g., "production-2026"
export type SiteId = string;            // e.g., "refinery-east-loop-2"

export interface Procedure {
  id: ProcedureId;
  workspaceId: WorkspaceId;
  version: string;                      // semver, e.g., "2.7.1"
  status: "draft" | "review" | "published" | "deprecated";
  title: string;                        // "LOTO V-204"
  subtitle?: string;                    // "Lockout-Tagout · Valve V-204"
  equipmentId: EquipmentId;
  siteIds: SiteId[];                    // sites where this is assigned
  workforceGroupIds: string[];          // worker groups certified for this
  steps: Step[];
  authoredBy: {
    userId: string;
    role: "content-author" | "master-technician" | "ai-assist";
  }[];
  publishedAt?: string;                 // ISO 8601
  estimatedDurationMs: number;          // total ~minutes × 60_000
}

export interface Step {
  id: StepId;
  order: number;                        // 1-indexed
  title: string;                        // "Open breaker BR-04"
  instruction: string;                  // "On the panel to your left. Switch to OFF position."
  targetComponentId: ComponentId;
  interaction: Interaction;
  safetyGate: SafetyGate;
  expectedBeforeState?: AssetRef;       // reference image of the before state
  expectedAfterState?: AssetRef;        // proof image used for auto-verification
  referenceAssets: AssetRef[];          // images, gifs, 3-second clips
  verificationRule: VerificationRule;
  confidenceThreshold: ConfidenceThreshold;
  voiceCue?: string;                    // what the calm voice says
  hapticPattern?: HapticPattern;
}

export type Interaction =
  | { kind: "observe" }
  | { kind: "rotate"; axis: "x" | "y" | "z"; degrees: number }
  | { kind: "press"; force?: "light" | "firm" }
  | { kind: "lift" }
  | { kind: "attach"; tagId?: string }   // e.g., lockout tag
  | { kind: "detach" }
  | { kind: "scan"; method: "qr" | "nfc" | "ocr" }
  | { kind: "free-form"; description: string };

export type SafetyGate =
  | { kind: "none" }
  | { kind: "ppe-required"; items: ("hardhat" | "gloves" | "goggles" | "respirator")[] }
  | { kind: "ai-verified-before-next" }
  | { kind: "human-witness-required"; role: "supervisor" | "master-technician" };

export interface AssetRef {
  id: string;
  type: "image" | "gif" | "clip" | "3d-overlay" | "voice";
  url: string;                           // CDN path or local asset path
  alt?: string;
  durationMs?: number;                   // for clips / gifs
}

export type VerificationRule =
  | { kind: "auto-photo-match"; threshold: number }
  | { kind: "voice-confirm"; phrase: string }
  | { kind: "manual-photo"; instruction: string }
  | { kind: "none" };

export interface ConfidenceThreshold {
  proceedSilent: number;                 // >= → silent auto-verify (default 0.85)
  prompt: number;                        // < → prompt worker (default 0.6)
  // anything in between → low-key check
}

export type HapticPattern =
  | "single-pulse"
  | "double-pulse"
  | "long-buzz"
  | "warning-triple";
```

### 4.2 Session (written by Field IQ, read by Monitor)

```typescript
// packages/schema/src/session.ts
import type { ProcedureId, StepId, ComponentId } from "./procedure";

export type SessionId = string;
export type WorkerId = string;
export type DeviceId = string;

export interface Session {
  id: SessionId;
  workerId: WorkerId;
  deviceId: DeviceId;
  procedureId: ProcedureId;
  procedureVersion: string;
  startedAt: string;                     // ISO 8601
  completedAt?: string;
  status: "active" | "completed" | "aborted" | "supervisor-intervened";
  mode: "walk-through" | "stand-by";
  currentStepId?: StepId;
  events: SessionEvent[];                // append-only log
}

export type SessionEvent =
  | StepStartedEvent
  | StepCompletedEvent
  | InterventionEvent
  | EscalationEvent
  | RecognitionEvent;

export interface BaseEvent {
  id: string;
  sessionId: SessionId;
  at: string;                            // ISO 8601, ms precision
  source: "field-iq-glasses" | "field-iq-phone" | "monitor" | "ai-pipeline";
}

export interface StepStartedEvent extends BaseEvent {
  kind: "step-started";
  stepId: StepId;
  confidence: number;
}

export interface StepCompletedEvent extends BaseEvent {
  kind: "step-completed";
  stepId: StepId;
  proofAssetUrl?: string;
  confidence: number;
  verificationMethod: "auto-photo" | "voice-confirm" | "manual" | "supervisor-override";
}

export interface InterventionEvent extends BaseEvent {
  kind: "intervention";
  reason: "wrong-target" | "missed-step" | "hazard" | "low-confidence";
  detectedTargetComponentId?: ComponentId;
  expectedTargetComponentId?: ComponentId;
  resolvedBy: "self-corrected" | "supervisor" | "session-aborted";
  latencyMs: number;                     // how long from detection to alert delivery
}

export interface EscalationEvent extends BaseEvent {
  kind: "escalation";
  toRole: "supervisor" | "master-technician" | "safety-officer";
  reason: string;
}

export interface RecognitionEvent extends BaseEvent {
  kind: "recognition";
  equipmentId: string;
  confidence: number;
  detectionMethod: "qr" | "nfc" | "computer-vision";
}
```

### 4.3 AuditEvent — derived view for compliance

```typescript
// packages/schema/src/audit.ts
import type { Session, SessionEvent } from "./session";

/** Regulator-formatted derivative of Session — exported to PDF. */
export interface AuditPack {
  sessionId: string;
  workerName: string;
  workerCertifications: string[];
  procedureTitle: string;
  procedureVersion: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepCount: number;
  verifiedStepCount: number;
  interventions: number;
  edgeCasesFlagged: number;
  signedHashSha256: string;              // tamper-evident signature
  events: SessionEvent[];                // full log
}
```

### 4.4 Slide — walkthrough-specific view

```typescript
// packages/schema/src/walkthrough.ts

export type Journey = "entry" | "setup" | "training" | "field-use" | "monitor";

export type SlideTemplate =
  | "entry-cover"
  | "hub"
  | "tour"
  | "journey-intro"
  | "section-divider"
  | "journey-outro"
  | "setup-step"
  | "training-step"
  | "field-use-step"
  | "monitor-step"
  | "monitor-feature"
  | "closer";

export interface Slide {
  id: number;                            // 1..49
  journey: Journey;
  step: number | null;                   // null for non-step slides
  template: SlideTemplate;
  headline: string;
  subtitle: string;
  body: string;
  footer: string;
  images: string[];                      // public asset paths
  actions: SlideAction[];
  texts: string[];                       // raw extracted text, used by templates
}

export interface SlideAction {
  label: string;
  action: "next" | "back" | "goto" | "home" | "placeholder";
  target?: number;
  variant?: "primary" | "secondary" | "ghost";
  message?: string;
}

export interface Walkthrough {
  title: string;
  version: number;
  totalSlides: number;
  hubSlide: number;                      // 2
  journeyEntry: Record<Exclude<Journey, "entry">, number>;
  slides: Slide[];
}
```

The `Slide` and `Walkthrough` types model the *current* Vercel walkthrough one-to-one. The `Procedure` / `Step` / `Session` types model the **real product**. Phase 0 implements both; later phases produce `Procedure` instances from authored content in Genesis and `Session` instances from Field IQ runtime.

---

## 5. Design system

Tokens carried over from the frozen walkthrough (`../4b Code Html Field_IQ_Walkthrough/css/tokens.css`), exposed as Tailwind theme extensions.

```typescript
// apps/walkthrough/tailwind.config.ts (excerpt)
export default {
  theme: {
    extend: {
      colors: {
        bg: {
          page: "#0B1424",
          card: "#152033",
          elev: "#1E2A40",
          hover: "#243047",
        },
        border: { DEFAULT: "#2C3853" },
        ink: {
          DEFAULT: "#F5F1E8",
          dim:     "#A6AFC2",
          faint:   "#6B7689",
        },
        journey: {
          setup:    "#5BA8D6",          // System Setup cyan
          training: "#B284E6",          // Training/Genesis purple
          field:    "#E07B47",          // Field Use coral (Field IQ brand)
          monitor:  "#10B981",          // Monitor green
        },
        genesis: "#B284E6",
        alert:   "#F0B23A",
        danger:  "#E0625C",
      },
      borderRadius: { card: "12px", sm: "8px" },
      boxShadow: { elev: "0 18px 50px rgba(0,0,0,0.35)" },
      fontFamily: {
        sans:    ['"Inter"', '"Calibri"', "system-ui", "sans-serif"],
        display: ['"Inter"', '"Trebuchet MS"', "sans-serif"],
      },
    },
  },
};
```

**Typography rule:** Inter at all weights, fallback to Calibri/Trebuchet to match the frozen walkthrough's look on Mac. Numerals are tabular for any timecode/metric display.

**Layout primitives:** `Card`, `ImageZone`, `DeviceFrame` (iPhone), `HudFrame` (Ray-Ban Display 1:1), `Pill`, `Kicker`. These map one-to-one to the current `render.js` template helpers in the frozen walkthrough.

---

## 6. Phasing

### Phase 0 — Foundation (this week)

**Goal:** the walkthrough refactored into Next.js + TypeScript, all 49 slides rendering from the typed data model, the canonical schema in place. Same look, same content, now production-grade.

**Deliverables:**

1. `packages/schema/` published locally with `Procedure`, `Step`, `Session`, `Slide`, all types in section 4.
2. `apps/walkthrough/` Next.js 14 app:
   - App Router, TypeScript strict.
   - Tailwind with the tokens in section 5.
   - `data/journey.ts` — typed port of `journey.json`.
   - `app/walkthrough/[slideId]/page.tsx` dynamic route.
   - 12 slide template components (one per `SlideTemplate`).
   - Sidebar + topbar + footer chrome matching the frozen walkthrough.
   - Keyboard nav (← → arrows, H for home, 1–4 for journey jumps).
   - Asset folder seeded from `../4b Code Html Field_IQ_Walkthrough/assets/`.
3. Local dev runs: `pnpm dev` → <http://localhost:3000> → home/title slide loads, all 49 slides navigable.
4. Vercel deploy target: `field-iq-product-walkthrough.vercel.app` (new project, doesn't disturb the frozen one).

**Acceptance test:** Open localhost:3000. Confirm slide 1 (entry cover) and slide 26 (Field Use intro) render visually identical to the frozen Vercel walkthrough. Hit `→` 48 times, see all 49 slides. Hit `1`, jump to slide 4 (Setup). Hit `H`, return to slide 2 (Hub).

### Phase 1 — Monitor MVP (weeks 2–3)

**Goal:** Sara's console — real data, not mocked images.

- `apps/monitor/` Next.js app.
- `services/cloud/` API routes (or tRPC server) reading from Postgres.
- Tables: `procedure`, `step`, `session`, `session_event`, `worker`, `device`, `site`.
- Seed script generates 87 mock sessions (matches Monitor mockup data — Joe Mendez, Aisha Patel, et al.).
- Pages: Live Sessions (grouped by site), All Active Sessions, AI Assessment Stream, Active Alert detail, Session Replay, Worker Competency, Compliance Export.
- Real-time updates via Server-Sent Events from a mock event generator.
- Recharts for the 30-day competency trend.

### Phase 2 — iPhone Field IQ Setup app (month 2)

**Goal:** Priya's 7-step setup flow as a real Swift app.

- `apps/ios/FieldIQSetup/` — SwiftUI, iOS 17+, Universal app.
- SwiftUI navigation matching the 7 setup screens.
- SSO (Okta SDK or generic OIDC) — real auth.
- Bluetooth pairing for Ray-Ban Display + Neural Band (real BLE where Meta SDK is available; stubbed otherwise behind a feature flag).
- Genesis workspace connect — hits `services/cloud`, downloads procedure manifest as JSON.
- Offline content sync — local SQLite, progress UI matches the mockup.
- 30-second self-test.
- "Demo Field Use" mode that runs a stubbed Field Use loop against the same `services/cloud` backend.

### Phase 3 — Real AI + Genesis Content Studio (month 3+)

- `apps/genesis/` — Maya's authoring environment. React Three Fiber for 3D viewport. Anthropic API for conversational refinement.
- Equipment recognition pipeline — Claude (Sonnet 4.6 or vision-specific) for first-pass; fine-tuned ViT later when telemetry justifies.
- Voice — OpenAI Realtime API for low-latency duplex, fallback to ElevenLabs streaming.
- HUD push protocol — Ray-Ban Display SDK integration (NDA-gated; stubbed until access lands).
- IS certification path — coordinate with industrial hardware partner.

---

## 7. Engineering norms

**TypeScript:**

- `strict: true`. No `any` without `// @reason:` comment.
- Schema types live in `@field-iq/schema`. Apps import from there. No duplicating types across apps.
- Public APIs (anything exported from a package) have explicit return types. Internal helpers can infer.

**File and naming:**

- Components: `PascalCase.tsx`. One default export per file. Co-located CSS modules only if needed (default to Tailwind).
- Hooks: `use<Name>.ts`. Pure, no JSX.
- Data: `kebab-case.ts` or `.json` for static, `[id].ts` for dynamic routes.
- Schema types: singular nouns. `Procedure`, not `Procedures`.

**Code style:**

- Prettier defaults, 2-space indent, single quotes, trailing commas.
- ESLint with `next/core-web-vitals` and `@typescript-eslint/strict`.
- Imports sorted by tooling (`@trivago/prettier-plugin-sort-imports`).

**Testing:**

- Unit: Vitest co-located with source files (`*.test.ts`).
- Schema: every type with a default constructor function has a Vitest test that round-trips through JSON.
- Component: Playwright smoke test per phase (Phase 0: "all 49 slides navigate"; Phase 1: "live session updates within 2s").
- No 100% coverage mandate. Test the contracts and the loops, not the leaves.

**Git:**

- `main` is always deployable.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- Pull requests required for any merge to `main` once we have more than one developer.
- Claude Code commits with author `Claude <claude@eonreality.com>` and includes the prompt ID in the commit body.

---

## 8. What's frozen and what isn't

| Artifact | Status | Notes |
|---|---|---|
| `../4b Code Html Field_IQ_Walkthrough/` | **FROZEN** | UI reference. Read-only from this repo's perspective. |
| <https://field-iq-walkthrough.vercel.app/> | **FROZEN** | Live demo. Keep deploying from the frozen folder. |
| Vision deck (`../1 Field IQ Vision/`) | **FROZEN** | Narrative reference. |
| User Journey decks (`../2 Field IQ User Journeys/`) | **FROZEN** | Step-by-step narrative reference. |
| UI Mockup decks (`../3 Field IQ UI Mockups/`) | **FROZEN** | Per-screen design reference. |
| `field-iq-product/packages/schema/` | **LIVING** | Schema versions bump when contracts change. |
| `field-iq-product/apps/walkthrough/` | **LIVING** | Production-grade refactor. |
| Everything else under `field-iq-product/` | **LIVING** | |

**If a Phase 1+ requirement conflicts with the frozen walkthrough:** the walkthrough wins for visual layout; the spec wins for data model. Update this document and ship.

---

## 9. The Cowork ↔ Claude Code workflow

The norm we're committing to:

1. **Cowork** writes a prompt for Claude Code as a self-contained Markdown file in this repo (e.g., `PHASE_0_CLAUDE_CODE_PROMPT.md`, `MONITOR_API_PROMPT.md`).
2. **Dan** opens Claude Code in this repo and runs the prompt.
3. **Claude Code** executes — creates files, runs builds, runs tests, runs the dev server, commits.
4. **Dan** reviews the result with Cowork present (paste a screenshot, paste the diff, ask for review).
5. **Cowork** writes the next prompt. Loop.

This file (`FIELD_IQ_PRODUCT_SPEC.md`) is the master reference Claude Code reads at the start of every prompt. Every prompt references it explicitly.

---

## Appendix A — Mapping the frozen walkthrough's 12 templates to React components

| `SlideTemplate` | Component (Phase 0) | Notes |
|---|---|---|
| `entry-cover` | `<EntryCover slide={slide} />` | Hero with four pill buttons. |
| `hub` | `<Hub slide={slide} />` | The AssessIQ-style welcome home. |
| `tour` | `<Tour slide={slide} />` | Quick Start Tour. |
| `journey-intro` | `<JourneyIntro slide={slide} />` | "Journey N of 4 — <name>". |
| `section-divider` | `<SectionDivider slide={slide} />` | UI Mockup cover slides. |
| `journey-outro` | `<JourneyOutro slide={slide} />` | UI Mockup summary slides. |
| `setup-step` | `<SetupStep slide={slide} />` | iPhone Setup app screen + paired hardware photo. |
| `training-step` | `<TrainingStep slide={slide} />` | Genesis Content Studio screen (1–3 image zones). |
| `field-use-step` | `<FieldUseStep slide={slide} />` | HUD card · context · iPhone mirror. Three-column. |
| `monitor-step` | `<MonitorStep slide={slide} />` | Full-bleed Monitor console screen. |
| `monitor-feature` | `<MonitorStep slide={slide} />` | Same component, different `feature` flag. |
| `closer` | `<Closer slide={slide} />` | Final hero with restart/return-home actions. |

Each component reads only the fields it needs from `Slide`. Add new fields to `Slide` as the product schema evolves; templates pick them up as needed.

---

## Appendix B — Decisions deferred to later phases

These are intentional non-decisions for Phase 0. They get answered when Phase 1+ work starts:

- **State management** — Phase 0 uses URL params + React server components only. Phase 1 may introduce React Query for the live session feed.
- **Authentication** — Phase 0 is unauthenticated (it's a walkthrough). Phase 1 picks an identity provider (recommend Clerk for speed, Auth.js for control).
- **Hosting** — Phase 0 deploys to Vercel. Phase 1 picks managed Postgres (Neon) and Redis (Upstash). Phase 2+ may add an AWS region for enterprise customers who require US-hosted data.
- **Localization** — Phase 0 is English-only. Phase 2 introduces i18n scaffolding (next-intl).
- **Accessibility** — Phase 0 targets WCAG AA at the component level (color contrast already conformant given our token choices). Phase 1 adds screen-reader testing.

End of spec.
