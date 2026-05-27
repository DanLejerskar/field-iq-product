# Field IQ — Roadmap to Complete Product

**From spec → shipping product on industrial workers' faces.**

Author: Claude Cowork · for Dan Lejerskar, EON AI Ventures
Updated: May 25, 2026

---

## The shape of the journey

Six phases, roughly seven months end to end. One major external critical path (Meta Ray-Ban Display SDK access) that we manage in parallel from day one.

| Phase | Window | Who | Exit criteria |
|---|---|---|---|
| **0 — Foundation** | This week | Cowork ✓ specs · Claude Code: build | All 49 slides in Next.js · `@field-iq/schema` live · production build green |
| **1 — Monitor MVP + Cloud** | Weeks 2–4 | Cowork: API spec · Claude Code: build · You: auth/db accounts | Sara's console live with mock data · real-time updates streaming |
| **2 — iPhone Setup + demo Field Use** | Month 2 | Cowork: iOS spec · Claude Code: Swift · You: Apple Developer | TestFlight build · 7-step Setup flow works · demo Field Use against Phase 1 cloud |
| **3 — Real AI + Genesis Studio** | Month 3 | Cowork: AI + Studio specs · Claude Code: build · You: API tiers | Maya authors LOTO-V204 in Genesis · Joe runs it via Field IQ · 3-sec loop measured |
| **4 — Pilot prep** | Month 4 | Cowork: compliance + security specs · External: cert partner | SOC 2 Type I started · IECEx partner signed · Exxon SOW signed |
| **5 — Exxon pilot** | Months 5–7 | Joint with customer | Defined incident-reduction + adoption metrics met |
| **6 — Scale** | Month 7+ | Production engineering, hiring, second customer | Second customer in pilot |

---

## Phase 0 — Foundation (this week)

**Status:** Cowork has written `FIELD_IQ_PRODUCT_SPEC.md`, `PHASE_0_CLAUDE_CODE_PROMPT.md`, `README.md`. Repo skeleton exists. Ready to execute.

**Your next action (today or tomorrow):**

1. `cd` into `field-iq-product/`.
2. Run `claude` (Claude Code CLI).
3. Paste the contents of `PHASE_0_CLAUDE_CODE_PROMPT.md` as your first message.
4. Confirm the plan when Claude Code posts it. Let it run.
5. When it posts "Phase 0 landed" in Cowork, I review with you and we move to Phase 1.

**Deliverable:** A production-grade Next.js codebase that visually matches the frozen Vercel walkthrough but is backed by the canonical TypeScript schema. The walkthrough becomes the spec for everything downstream.

**Effort:** 1–2 Claude Code sessions, 3–5 wall-clock hours.

---

## Phase 1 — Monitor MVP + Cloud (weeks 2–4)

**Cowork writes (before Claude Code starts):**

- `MONITOR_COMPANION_SPEC.md` — every API endpoint typed to the schema, session/step/intervention state machines, auth model, SSE protocol, Postgres schema, infra setup procedure.
- `PHASE_1_CLAUDE_CODE_PROMPT.md` — the executable handoff.

**You do (parallel to spec writing):**

- Sign up for Neon Postgres (free tier).
- Sign up for Upstash Redis (free tier).
- Create Vercel project `field-iq-product-monitor`.
- Decide: Clerk (recommended) vs Auth.js.
- Confirm we use the worker name set from the walkthrough (Joe Mendez, Aisha Patel, Diego Romero, Maya Wu, Olu Bakari, Ines Vargas, Tom Ng, Reza Habibi, Sven Olafur, Lin Yuhan).

**Claude Code executes:**

- `apps/monitor/` Next.js console.
- `services/cloud/` API routes.
- Postgres tables: `procedure`, `step`, `session`, `session_event`, `worker`, `device`, `site`.
- Seed: 87 mock sessions matching the walkthrough's data.
- Pages: Live Sessions · All Active Sessions · AI Assessment Stream · Active Alert · Replay · Worker Competency · Compliance Export.
- Real-time SSE feed.
- Recharts for analytics.

**Exit criteria:** Monitor deploys to a private Vercel URL. Sara's seven steps all work end-to-end against real Postgres. Mock events stream in real-time. A reviewer can click a session and watch the replay.

---

## Phase 2 — iPhone Field IQ Setup + demo Field Use (month 2)

**Decisions before this phase:**

- Hire or contract a Swift developer? Recommendation: senior iOS contractor for month 2–3, full-time hire when pilot starts.
- Apple Developer Program enrolled as **EON AI Ventures (organization)**, not as you personally.
- TestFlight strategy for internal demos.

**Cowork writes:**

- `IOS_COMPANION_SPEC.md` — Swift project structure, SwiftUI patterns, dependency injection, networking layer against Phase 1 cloud, offline cache strategy (GRDB), background sync tasks.
- `BLE_HARDWARE_SPEC.md` — pairing flow, service UUIDs, characteristic protocols. Real BLE where Meta SDK is available; stubs everywhere else. Stubs designed to swap in real BLE later.
- `PHASE_2_CLAUDE_CODE_PROMPT.md`.

**Claude Code executes:**

- `apps/ios/FieldIQSetup/` Xcode project, Swift / SwiftUI, iOS 17+.
- 7 SwiftUI views mapping 1:1 to the System Setup journey.
- SSO (Sign in with Apple + Okta SDK for SAML enterprise).
- Mock BLE pairing flow.
- Workspace connection against Phase 1 cloud, downloads procedure JSON.
- Offline content sync with progress UI.
- 30-second self-test.
- "Demo Field Use" mode — runs a stubbed Field Use loop against the same backend, simulates the HUD on the iPhone screen (no glasses yet).

**Exit criteria:** TestFlight build installable on a real iPhone. Priya's 7 steps run end-to-end. A demo Field Use session (LOTO-V204) runs against Phase 1 cloud, generates real session events visible in Monitor.

---

## Phase 3 — Real AI + Genesis Content Studio (month 3)

**This is where things get genuinely hard.**

**Decisions:**

- Anthropic enterprise tier (recommended for Claude Vision + conversational refinement). Likely already in place given your relationship with Anthropic.
- OpenAI Realtime API access — apply now, beta-gated.
- ElevenLabs as voice fallback.
- Computer vision model: start with Claude Sonnet 4.6 vision. Evaluate fine-tuning a ViT after a few hundred edge cases are archived.

**Cowork writes:**

- `AI_PIPELINE_SPEC.md` — recognition → confidence scoring → intervention triggers, fallback chain, per-stage latency budget, evaluation harness for accuracy.
- `GENESIS_STUDIO_SPEC.md` — three.js scene graph, asset import (LiDAR PLY/OBJ), the 9-layer AI assembly algorithm, conversational refinement protocol.
- `PHASE_3_CLAUDE_CODE_PROMPT.md`.

**Claude Code executes:**

- `apps/genesis/` Next.js + React Three Fiber.
- Asset import pipeline (3D scans, SOPs, master interviews).
- 9-layer AI assembly that turns SOP + 3D model + master interview into a procedure draft.
- Conversational refinement (Carlos says "make the smoke bigger", Claude re-renders).
- `services/ai/` Field IQ AI pipeline service.
- Field IQ iOS runtime gets real recognition and voice plumbing.

**Exit criteria:** Maya authors LOTO-V204 end-to-end in Genesis Studio in under 4 hours. Joe runs it in iPhone demo Field Use mode with real (Claude-powered) recognition, real voice instructions, real interventions. 3-second loop measured and met (with cold-start allowances).

---

## Phase 4 — Pilot prep (month 4)

**This is the bridge to a real customer.**

**Cowork writes:**

- `SAFETY_AND_COMPLIANCE_SPEC.md` — regulator matrix (OSHA 1910.147 for LOTO, IECEx/ATEX for hazardous areas, customer-specific safety standards), evidence inventory, legal-defensibility argument for AI-mediated LOTO.
- `SECURITY_MODEL.md` — auth tokens, session signing, audit log tamper-evidence (define the cryptographic chain), data isolation, SOC 2 trust services criteria mapping.
- `PILOT_PLAYBOOK.md` — how a pilot runs, success criteria, exit criteria, contract structure.

**You do:**

- Engage a SOC 2 readiness firm (Vanta / Drata / Secureframe). Type I starts in Phase 4; Type II requires 6 more months of operating evidence.
- Engage an industrial hardware certification partner — ATEX/IECEx for hazardous areas. Months of work running in parallel. Likely partnership with Aegex or Xciel for the IS-rated hardware.
- Start the Exxon pilot scoping conversation in earnest — which refinery, which procedure (LOTO-V204 is the obvious pick), how many workers, success criteria, insurance posture.
- Hire: a customer success / pilot lead. This is a new role — someone who lives on-site at Exxon during the pilot.

**Exit criteria:** SOC 2 Type I auditor engaged. IECEx/ATEX certification partner contracted. Exxon pilot SOW signed. Pilot lead hired.

---

## Phase 5 — Exxon pilot (months 5–7)

**Shape:** one refinery, one procedure (LOTO-V204), 6–10 workers to start, 6–12 weeks supervised operation.

**Cowork writes:**

- `EXXON_PILOT_BRIEF.md` — co-authored with the customer success lead.
- Weekly status reports.
- Edge-case analysis reports.
- Refinement specs as the pilot reveals gaps.

**Team does:**

- On-site presence at Exxon for at least the first three weeks.
- Daily standups with Exxon's safety + L&D leadership.
- Telemetry capture and review.
- Procedure refinements as edge cases emerge.

**Exit criteria (negotiated with Exxon before pilot starts):**

- Defined safety-incident-reduction metric (e.g., "zero LOTO procedure violations during pilot window").
- Defined adoption metric (e.g., "≥80% of LOTO sessions in scope used Field IQ; ≥90% of users completed at least one session").
- Defined NPS / qualitative metric from Exxon's safety lead.
- Audit pack accepted by Exxon's regulator-facing compliance team.

---

## Phase 6 — Scale (month 7+)

Once the Exxon pilot exits successfully:

- **Second customer.** Same industry to start (refining, chemicals, offshore). The pilot motion repeats but faster — the playbook now exists.
- **Multi-site rollout at Exxon.** More refineries, more procedures.
- **Production observability.** Datadog + Sentry + custom AI evaluation dashboards.
- **On-call rotation.** SLO contracts with customers.
- **Hiring.** Full-time backend engineer · full-time iOS engineer · CV/ML engineer · customer success #2.
- **Second procedure type.** Exxon picks. Pump Inspect or Manifold Check are obvious next moves.

---

## Critical-path dependencies

External things that can block us if we don't manage them in parallel:

| Dependency | Earliest needed | What to do now |
|---|---|---|
| **Meta Ray-Ban Display SDK** | Phase 3 (demo); Phase 5 (pilot) | Direct outreach to Meta partnership. Boz / Mark have publicly invited industrial partners. Start this week. |
| **Apple Developer Program** | Phase 2 | Trivial — enroll EON AI Ventures as organization in Phase 1. |
| **Anthropic enterprise tier** | Phase 3 | Easy — talk to your AE. Likely already in place. |
| **OpenAI Realtime API** | Phase 3 | Apply now — it's beta-gated. |
| **Exxon partnership formalized** | Phase 5 | Customer track — you're already in the conversation. |
| **SOC 2 Type I auditor** | Phase 4 | Engage in Phase 3. |
| **IECEx / ATEX certification partner** | Phase 4 | Engage in Phase 3. Aegex or Xciel are the obvious calls. |
| **Insurance (product + E&O)** | Phase 5 | Talk to your broker in Phase 4. |
| **Pilot lead hired** | Phase 5 | Start recruiting in Phase 3. |
| **Swift iOS contractor** | Phase 2 | Start sourcing in Phase 1. |

---

## Decisions to make this week

Five things, in priority order:

1. **Run Phase 0.** Today or tomorrow. Open Claude Code, paste the prompt, ship the foundation.
2. **Pick the auth provider** — Clerk vs Auth.js for Phase 1. Recommendation: Clerk.
3. **Sign up for Neon Postgres + Upstash Redis.** Both free tiers. Five minutes each.
4. **Start the Meta conversation.** Ray-Ban Display SDK access is the longest-pole dependency. Reach out this week.
5. **Apple Developer Program.** Enroll EON AI Ventures as an organization (not personal).

---

## What I (Cowork) produce, in order

To keep the dependency chain clear, here's the document queue ahead of me:

1. ✓ `FIELD_IQ_PRODUCT_SPEC.md` — done.
2. ✓ `PHASE_0_CLAUDE_CODE_PROMPT.md` — done.
3. ✓ `README.md` — done.
4. ✓ `ROADMAP.md` — this document.
5. After Phase 0 lands: `MONITOR_COMPANION_SPEC.md` + `PHASE_1_CLAUDE_CODE_PROMPT.md`.
6. After Phase 1 lands: `IOS_COMPANION_SPEC.md` + `BLE_HARDWARE_SPEC.md` + `PHASE_2_CLAUDE_CODE_PROMPT.md`.
7. After Phase 2 lands: `AI_PIPELINE_SPEC.md` + `GENESIS_STUDIO_SPEC.md` + `PHASE_3_CLAUDE_CODE_PROMPT.md`.
8. After Phase 3 lands: `SAFETY_AND_COMPLIANCE_SPEC.md` + `SECURITY_MODEL.md` + `PILOT_PLAYBOOK.md`.
9. During Phase 5: `EXXON_PILOT_BRIEF.md` + weekly status + edge-case analyses.

Each document is informed by what we learned in the prior phase. That's why I'm not writing all of them up front — Phase 1's spec is better with Phase 0 in our hands.

---

## What the picture looks like at the end

Twelve months from today (May 2027):

- Field IQ is running in two refineries — one Exxon, one neighbor — across two procedure types (LOTO and Pump Inspection).
- 40+ workers have completed at least one Field IQ session.
- Multiple thousand sessions in the audit archive. The edge-case dataset is genuinely valuable training data.
- Genesis Content Studio is the authoring tool for both customers.
- A small core team — 6–8 engineers, 2 customer success, 1 safety lead.
- Series A done or near done. The Exxon contract + pilot results + edge-case dataset are the deck slides that close it.
- The vision deck and user journey decks we built in May 2026 are still on-brand, still accurate, and still the artifacts that close new customer conversations.

That's the picture. Let's start with Phase 0 today.
