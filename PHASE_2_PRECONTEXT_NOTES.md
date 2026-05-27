# Phase 2 — Pre-Context Notes

**Status:** Notes only. NOT an executable Claude Code prompt yet.
**Purpose:** Preserve the Phase 2 context that's in Cowork's head today, so we don't have to reload it later when we write the real Phase 2 prompt.
**When to use:** Cowork will read this file (plus Phase 1's actual outputs and learnings) when it's time to write `PHASE_2_CLAUDE_CODE_PROMPT.md`. That should happen after Phase 1's M10 acceptance lands and the team has run at least 5 internal sessions.

---

## Why this isn't a finished prompt

Three things from Phase 1 will reshape Phase 2 in ways we can't fully predict today:

1. **Real verification accuracy by step.** Some of the 10 LOTO verification prompts may need tuning after seeing real photos and real failure modes. Phase 2's "add more procedures" plan depends on knowing which prompt-engineering patterns work.
2. **SDK constraints discovered at integration time.** What Meta's developer docs promise and what the SDK actually does at integration are two different things. Phase 2's API surface for `apps/genesis` and the operational deployment will be shaped by Phase 1's real integration findings.
3. **Pilot customer's actual environment.** Aiming at Exxon. Their refinery layouts, IT requirements, procedure variations, and infosec posture will reshape Phase 2 (operational deployment with Joe + Sara) in ways the spec can't predict from a Cowork chat.

Writing the full Phase 2 Claude Code prompt today would lock in details that should stay flexible. So: notes now, prompt later.

---

## Phase 2 mission (one sentence)

Take the Phase 1 LOTO v1 — which ships as a single procedure on a single training simulator for one persona pair (Maya the trainee + Carlos the trainer + Priya the supervisor) — and **scale it along three dimensions: procedure variety, operational environment, and customer-grade infrastructure.**

## The three dimensions of Phase 2 scale

### 1. Procedure variety — three more procedures beyond LOTO

Per colleague's spec §9 and the master roadmap, Phase 2 adds:

- **Pump alignment (E811-S04).** Mechanical procedure on the DAC #811 trainer's pump skid. Visual verification of dial-indicator readings, shaft alignment markers, coupling installation. Tighter geometric tolerance than LOTO — Claude's spatial reasoning gets tested.
- **Confined space entry prep (E811-S06).** Pre-entry checklist: atmospheric testing (O₂, LEL, H₂S, CO meter readings), permit verification, harness inspection, rescue equipment check, attendant assignment. More text-heavy verification (Claude reads meter displays, permit text).
- **Customer-specific SOPs.** Whatever the pilot customer (Exxon) needs. Could be MOC procedures, hot work permits, line break, valve calibration — driven by customer's actual operational priorities.

**Key technical addition:** the admin/authoring UI in Phase 1 supports CRUD on procedures, but Phase 2 hardens it for non-engineer authors. A safety trainer at a customer site should be able to author a procedure in Genesis Content Studio in <4 hours without engineering involvement. This was deferred from Phase 1 because the v1 authoring UX is engineer-grade; Phase 2 makes it trainer-grade.

**Architecture impact:** mostly content + UX, not new infrastructure. The Phase 1 schema (`Equipment`, `Procedure`, `Step`, `VerificationRule`) already supports arbitrary procedures. Adding procedure types is a data exercise, not a code exercise.

### 2. Operational environment — from training bay to production refinery

Phase 1's personas are training-bay personas:

- **Maya** — trainee, learning LOTO on a DAC #811 simulator in a controlled environment.
- **Carlos** — trainer, watching and coaching from a tablet at the front of the bay.
- **Priya** — supervisor / safety manager, often at HQ, viewing aggregate dashboards.

Phase 2 introduces **operational personas** running the same procedures (and new ones) in real production environments:

- **Joe Mendez** — field technician at Refinery East. Runs LOTO on the real pump skid `SKD-104` with valve `V-204`, not on a training simulator. Wears the glasses outdoors, in PPE, in industrial noise, possibly in hazardous-area-adjacent zones (we stay green-area in Phase 2; IS-rated zones wait for Phase 4 hardware certification).
- **Sara Chen** — process-safety supervisor at Refinery East. Watches Joe's live session from the operations center. Different stakes from Carlos: Sara's interventions are real procedural overrides, not coaching moments.

**Architectural deltas from Phase 1:**

- **Real-equipment identification.** Phase 1 uses QR codes on the DAC #811 baseplate. Phase 2 still uses QR for v1 but adds support for NFC tags (per the original Field IQ vision spec) and starts the path toward on-glasses CV equipment recognition (Phase 3+ depending on DAT SDK continuous-frame access).
- **Stricter retry policies.** Carlos can let Maya retry a LOTO step three times during training. Sara cannot — operational sessions need a much lower retry threshold before supervisor escalation (1 retry, then alert). The retry threshold becomes a per-procedure-per-environment configuration.
- **Intervention semantics differ.** In training (Phase 1), an intervention is a coaching moment. In operations (Phase 2), an intervention is a near-miss that must be logged as a safety event, potentially OSHA-reportable. The `Intervention` event type already exists in the schema; Phase 2 adds the severity classification + escalation path.
- **Audit pack format differs.** Training audit packs are for L&D record-keeping. Operational audit packs are for regulator review. Different cover page, different attestation language, different signature blocks. Same underlying event log.
- **Outdoor/lighting variability.** The 600×600 HUD at 5,000 nits handles bright outdoor reading. But verification photos taken outdoors have lighting variability that Phase 1's training-bay-tuned prompts may not handle. Phase 2 may need lighting-condition tags in the session metadata to inform prompt selection.

**The deep architectural insight:** the move from training to operational deployment is mostly a **content + configuration change**, not a code change. The schema is already general enough. What changes is:
- Equipment records (real refinery skids, not simulators)
- Procedure assignments (operational procedures vs. training procedures)
- Retry thresholds + escalation rules (per-environment)
- Audit pack templates (per-environment)
- Persona-specific UI affordances (Sara's dashboard differs from Carlos's by emphasis, not by capability)

### 3. Customer-grade infrastructure

Phase 1 is enterprise-preview grade. Phase 2 takes it to actual-customer-deployable grade.

#### Multi-tenant organization isolation

- Phase 1 has `org_id` as a foreign key on every relevant table but doesn't enforce isolation rigorously (assumes single-tenant).
- Phase 2 enforces row-level security: every query filters by `org_id` automatically; cross-tenant access requires explicit superadmin role.
- Per-tenant Postgres schemas as an option (heavier isolation) vs. shared-schema-with-tenant-id (lighter, faster) — propose in Phase 2 prompt.
- Per-tenant S3 bucket prefixes for photo storage so customer infosec teams can validate isolation.

#### SSO + identity federation

- Phase 1 uses magic-link email auth. Sufficient for v1 demos and small pilots.
- Phase 2 must support SAML 2.0 (Okta, Azure AD, generic SAML) and OIDC.
- Recommendation: **Clerk** for v2 (fast, opinionated, supports both protocols, has org-management UI built-in). Alternatively **Auth.js** if we need more control or want to self-host. The decision will depend on what Phase 1's auth code looked like and whether customer infosec wants self-hosted identity.
- Add per-device "active technician" picker for shared-device scenarios (a glasses unit shared across a shift) using a 6-digit PIN entry on the companion app.

#### Compliance + security posture

- **SOC 2 Type I** kicked off during Phase 2 with a readiness firm (Vanta, Drata, Secureframe — Dan to pick).
- **OSHA defensibility review** by an industrial safety attorney on the PDF audit report format and the AI-mediated procedure execution model. This is conversational, not technical, but needs to happen during Phase 2.
- **Tamper-evident audit chain** — Phase 1 has SHA-256 hashes. Phase 2 adds a Merkle-tree structure for the daily audit log and a published root hash (so a customer can prove no historical record was modified). Lightweight in code, valuable in customer conversations.
- **Photo retention policies** — Phase 2 makes the retention configurable per organization (default 1 year, customer can set 90 days to 7 years). Auto-purge worker runs nightly.
- **Customer-bring-your-own-bucket** option for photo storage — relevant for oil & gas customers with data residency requirements. Abstract the `StorageAdapter` so customers can provide their own S3 credentials and we never touch their data at rest.

#### Edge-case archive + retry-pattern dashboard

- **Edge-case archive.** Sessions with anomalies (low confidence, high retry, intervention) flag for archive. Used for future model fine-tuning and for trainer review. Phase 2 builds the archive query + tagging UI.
- **Retry-pattern dashboard for trainers.** Across many sessions, which steps have high retry rates? Which workers retry which steps most? Surfaces three things: poor lighting in the training bay, unclear instructions, poorly-tuned verification prompts. Trainers iterate on the procedure based on this data. (Carlos uses this. Sara uses a different version focused on safety-event patterns.)
- **Anomaly detection on the event stream.** Lightweight rule-based at first: alert when session takes >2× median duration; alert when single step retried >3×; alert when confidence trend declines through a session.

#### LMS / Genesis integration

- **xAPI / Tin Can profile** for Field IQ session completion. Pushed to EON Genesis as competency-credential events.
- Bidirectional in principle but Phase 2 only does Field-IQ-to-Genesis. Genesis-to-Field-IQ (gate Field IQ access on VR training completion) is Phase 3.
- Standard xAPI verbs: `completed`, `attempted`, `failed`, `passed`. Standard activity types matching Genesis's existing taxonomy.

---

## Specific Phase 2 milestones (draft, not final)

When the real Phase 2 prompt gets written, it'll likely follow this milestone shape. Numbers continue from Phase 1.

- **M12 — Multi-tenant hardening.** Row-level security, per-tenant data isolation, audit of every cross-tenant code path.
- **M13 — SSO + Clerk integration** (or Auth.js, decided post-Phase-1).
- **M14 — Authoring UI v2** for non-engineer trainers. Reuse Phase 1's CRUD but with templated procedure types, validation, prompt-test sandbox enhancements, version history.
- **M15 — Pump alignment procedure.** Author + seed in Genesis Content Studio; validate against the DAC #811 simulator.
- **M16 — Confined space entry prep procedure.** Same pattern; novel verification challenges (reading meter displays, parsing permit text).
- **M17 — Customer-specific procedure.** Whatever Exxon picks; co-authored with their safety lead during pilot scoping.
- **M18 — Operational deployment scaffolding.** Joe + Sara personas added to seed data. Sara's dashboard variant. Retry-threshold + escalation-rule configuration per environment. Operational audit pack template.
- **M19 — Edge-case archive + retry-pattern dashboard.** Trainer-facing analytics.
- **M20 — Anomaly detection rules engine.** Lightweight rules first; ML-driven detection deferred to Phase 3.
- **M21 — LMS / Genesis xAPI integration.** Field IQ → Genesis competency events.
- **M22 — SOC 2 evidence collection** kicked off (mostly non-code: policies, runbooks, training records, vendor reviews).
- **M23 — Phase 2 end-to-end test.** All four operational scenarios run successfully on the platform: LOTO training (Maya/Carlos), pump-alignment training (Maya/Carlos), LOTO operational (Joe/Sara at Refinery East), customer-specific procedure (whoever the pilot picks).

---

## Open questions that Phase 1 will answer

When Cowork sits down to write the real Phase 2 prompt, these are the questions whose answers should come from Phase 1's outputs and from your conversations with Dan during Phase 1:

1. **Which Phase 1 verification prompts needed tuning, and what patterns emerged?** Informs how we author new procedures in Phase 2.
2. **What's the actual p50 / p95 latency we hit in Phase 1?** Informs whether Phase 2's added procedures stay within the 3-second budget or whether we need preprocessing optimization.
3. **Did the Web Apps SDK constraints we assumed hold up?** Especially: did "no camera in Web Apps SDK v1" remain true, or did Meta release an update that changed it? If yes, simplifies Phase 2 architecture.
4. **Did the React Native + native bridge approach work cleanly?** Or did we hit JS-to-native latency issues that push toward a more native iOS Swift or native Android Kotlin path for Phase 2?
5. **Which customer infosec asks came up during Phase 1 demos?** Drives Phase 2's compliance priorities.
6. **What did Exxon ask for, specifically, during pilot scoping?** Drives the Phase 2 customer-specific procedure + any specific operational deployment quirks.
7. **What did the 5+ internal session runs reveal about trainer workflow?** Drives the Phase 2 authoring-UI-v2 design.
8. **Did the audit report format hold up under attorney review?** Drives Phase 2 audit pack template work.
9. **Which Phase 1 deferrals do we actually want in Phase 2 vs. Phase 3?** Re-prioritize based on customer reality.

---

## Personas locked in for Phase 2

For continuity with the master spec and the walkthrough cast:

**Training personas (carried over from Phase 1):**
- **Maya Wu** — trainee. Field technician. Mid-30s East-Asian female. (Note: the master spec used "Maya" as a content author; here we follow the colleague's spec where Maya is the trainee. Phase 2 introduces a separate **content author** persona who is the equivalent of the master spec's Maya — propose a new name in the Phase 2 prompt, possibly **Lin Wu** or **Aisha Patel** from the walkthrough cast.)
- **Carlos Romero** — trainer / safety coach. Mid-50s Latin male.
- **Priya Patel** — supervisor / safety manager (HQ).

**Operational personas (new in Phase 2):**
- **Joe Mendez** — field technician at Refinery East. Mid-30s, navy industrial coveralls. Same Joe from the walkthrough cast.
- **Sara Chen** — process-safety supervisor at Refinery East. Mid-30s, navy blazer. Same Sara from the walkthrough cast.

**Secondary personas:**
- **OSHA inspector / compliance auditor.** Doesn't use the system directly; consumes the PDF audit reports. Phase 2 hardens the report format under their lens.
- **EON content author** — the Maya from the master spec, renamed. Authors new procedures in Genesis Content Studio.
- **Customer admin** (e.g., Exxon's safety-systems lead). Manages their org's users, equipment, procedures.

---

## Files Phase 2 will need that don't exist yet

When we write the Phase 2 prompt, these companion docs need to exist or be written alongside:

- `MONITOR_COMPANION_SPEC.md` — already mentioned in master spec; covers the full API contract for the Sara/Priya dashboard at scale. Write before Phase 2 M12.
- `SECURITY_MODEL.md` — auth tokens, session signing, tamper-evidence, data isolation. Write before Phase 2 M12.
- `MULTI_TENANT_SPEC.md` — row-level security approach, per-tenant storage, customer onboarding flow. Write before Phase 2 M12.
- `EDGE_CASE_ARCHIVE_SPEC.md` — what gets archived, indexing, retention. Write before Phase 2 M19.
- `LMS_INTEGRATION_SPEC.md` — xAPI profile, Genesis activity types, the event-shape contract. Write before Phase 2 M21.

Cowork writes each of these as Phase 2 approaches that milestone.

---

## TL;DR for the next person reading this

When it's time to start Phase 2:

1. Read this file.
2. Read Phase 1's actual outputs — the codebase, the audit log of decisions made, the verification-prompt tuning history, any deferred TODOs.
3. Talk to Dan about the Exxon pilot's actual customer asks.
4. Write `PHASE_2_CLAUDE_CODE_PROMPT.md` using this file as the structural skeleton + Phase 1's real outputs as the substantive grounding.
5. Hand to Claude Code. Iterate milestone by milestone, same rhythm as Phase 1.

These notes are not finished plans. They're the context that would otherwise get lost if Cowork's working context compressed between Phase 1 and Phase 2. Preserved here so the next Cowork session can pick up where this one left off.
