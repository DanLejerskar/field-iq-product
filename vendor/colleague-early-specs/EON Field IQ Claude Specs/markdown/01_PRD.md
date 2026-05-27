# EON Field IQ — Product Requirements Document

**Document owner:** EON Reality
**Status:** Implementation-ready PRD (v1.0)
**Last updated:** May 19, 2026
**Target platform:** Meta Ray-Ban Display + Meta Neural Band, with React Native companion app and Node.js/Python backend

---

## 1. Vision

EON Field IQ is the **field execution layer** of EON Reality's Genesis platform. It turns Meta Ray-Ban Display smart glasses into a hands-free industrial co-pilot that guides field workers step-by-step through safety-critical Standard Operating Procedures (SOPs), verifies each action with AI vision, and produces a real-time, photo-evidenced audit trail.

It is the operational sibling of EON Assist IQ: where Assist IQ guides practice and simulation, Field IQ guides the real job — and proves it was done correctly.

**One-sentence pitch.** A field worker puts on the glasses, looks at the equipment, and the system identifies it, walks them through every step on the in-lens display, captures verification photos by voice or wrist gesture, and hands the supervisor a timestamped proof report — all hands-free.

## 2. Why now

Three shifts have converged in May 2026 that make this product viable for the first time:

1. **Hardware is consumer-priced and ready.** The Meta Ray-Ban Display (released September 30, 2025, $799) provides a 600×600 px in-lens HUD readable up to 5,000 nits, a 12 MP camera with 3× zoom, a six-microphone array, open-ear speakers, and the Meta Neural Band for sEMG gesture input — all in a form factor that looks like normal glasses and works outdoors in industrial PPE.
2. **The SDK is open.** As of mid-May 2026, Meta released both paths of the Wearables Device Access Toolkit in developer preview: a native iOS/Android SDK (Swift/Kotlin) with display, camera, microphone, and speaker access, **and** a Web Apps path that lets HTML/CSS/JavaScript apps run directly on Meta Ray-Ban Display glasses. Display access is no longer a hack — it is a documented API.
3. **Multimodal AI vision works.** Claude Sonnet 4.6 (and equivalents) can reliably analyze industrial scenes — valve positions, padlock installation, PPE compliance, meter readings — well enough for procedural verification.

Combined, these unlock a product that older approaches (WhatsApp bot + Teleprompter) could only approximate.

## 3. Personas

### 3.1 Primary — Field Technician ("Maya")

- 28–55 years old, mixed digital fluency.
- Performs LOTO, calibration, inspection, or maintenance tasks across an industrial site, often in PPE and gloves, sometimes outdoors or in confined spaces.
- Needs both hands on the work; cannot reliably hold a tablet or read paper checklists.
- Previously trusted memory and supervisor sign-off for procedure compliance.

### 3.2 Primary — Field Trainer / Safety Coach ("Carlos")

- Conducts hands-on LOTO and process-safety training, often using simulators like the DAC #811 Lock-Out/Tag-Out Trainer.
- Needs to demonstrate correct technique, observe trainees, evaluate competence, and document outcomes.
- For the v1 launch, Carlos is the *first* end user — the LOTO trainer test case is built around his workflow.

### 3.3 Secondary — Supervisor / Safety Manager ("Priya")

- Watches the live dashboard from a tablet or desktop.
- Needs real-time visibility into active sessions, the ability to spot retries or escalations, and one-click audit reports for regulators.

### 3.4 Secondary — Compliance Auditor ("OSHA inspector / internal audit")

- Reviews historical session records to verify regulatory compliance (e.g., OSHA 29 CFR 1910.147).
- Needs immutable, timestamped, photo-evidenced session reports exportable to PDF.

### 3.5 Tertiary — EON Admin / Content Author

- Authors and edits SOPs, equipment definitions, verification prompts, and reference media.
- Manages organizations, users, training cohorts.

## 4. Goals and non-goals

### 4.1 Goals (v1)

- Deliver a working end-to-end LOTO trainer experience on the DAC #811 simulator that demonstrates: equipment identification, step-by-step HUD guidance, AI photo verification at each step, real-time supervisor dashboard, and one-click PDF audit report.
- Run on production hardware (Meta Ray-Ban Display + Neural Band) using the official Wearables Device Access Toolkit — no SDK workarounds.
- Ship a Web App (HTML/CSS/JS) that runs natively on the glasses display for the technician view.
- Ship a React Native companion app for iOS and Android that pairs with the glasses, ingests camera frames via the native SDK, talks to the backend, and provides a richer mobile UX for setup/admin/review.
- Ship a Node.js backend with PostgreSQL persistence, Anthropic Claude integration, and a React-based supervisor dashboard.
- Provide a content model and admin tooling that lets a trainer author additional procedures without engineering involvement.

### 4.2 Non-goals (v1)

- Native iOS-only or Android-only — both must be supported via React Native.
- Full spatial AR overlays anchored to physical objects — the Display is a monocular HUD, not a passthrough AR headset.
- Custom "Hey EON" wake word — Meta's wake-word API is not third-party accessible.
- Custom gestures beyond Meta's standard set (left/right/up/down swipe, index pinch = enter, middle pinch = cancel).
- Marketplace publishing of the Field IQ app — the SDK is in developer preview; distribution is via release channels and password-protected web app URLs through 2026.
- Multi-language support — English only for v1. (Architecture must not preclude i18n later.)

## 5. Scope of v1 (the LOTO trainer milestone)

V1 ships a single working procedure: the **DAC #811 Lock-Out/Tag-Out Trainer LOTO Procedure**, executed by a trainee with a trainer observing the dashboard. The procedure is detailed in `03_LOTO_Test_Case.md`. Everything else (additional procedures, additional equipment, multi-tenant management) is content authoring on top of the same platform.

## 6. User journeys

### 6.1 Journey A — Trainee runs the LOTO procedure

1. Maya the trainee picks up the glasses + Neural Band from a charging station.
2. She opens the **EON Field IQ Web App** from the Meta AI app's app list on her glasses (added by Carlos in dev-mode setup).
3. The HUD shows a home card: "Tap to scan equipment."
4. She looks at the DAC #811 trainer; the QR code on the baseplate enters her field of view.
5. The companion app on her phone (paired) captures a glasses camera frame, decodes the QR (`EON-LOTO-DAC811-01`), and tells the backend to start a session.
6. HUD updates: "Session #2026-0519-014 · LOTO Procedure Rev 2.1 · 10 steps · Pinch to begin."
7. She pinches with her index finger. HUD: **Step 1 of 10 — DON PPE.** Small instruction, reference thumbnail.
8. She puts on glasses and gloves, says "Hey Meta, take a photo." The companion app routes the photo to the backend with the step's verification prompt.
9. Claude Vision returns `verified: true`. HUD: "✅ Step 1 verified. Pinch for next step."
10. She continues through Steps 2–10. Steps 4–10 require close-up photos of disconnect switches, hasps, padlocks, the ball valve, the LOTO tag, and a zero-energy test on the start button. Any retry shows amber on the HUD with one-sentence correction guidance.
11. On the final step's verification, HUD shows: "🏁 Procedure complete — 10/10 verified. Duration 11:42. Report sent to supervisor."

### 6.2 Journey B — Trainer monitors and audits

1. Carlos opens `https://field-iq.eonreality.com/dashboard` on a tablet at the front of the training bay.
2. The dashboard lists active sessions on the left; Maya's session appears within ~1 second of start.
3. The center panel shows a live step feed: each verified step appears as a card with timestamp, instruction, photo thumbnail, AI verification message.
4. When Maya retries a step, the card shows amber and the AI's one-line feedback. Carlos can use this to coach her in real time.
5. When the procedure completes, Carlos clicks **Generate report** and a PDF with all 10 step photos, timestamps, GPS, Claude analysis text, and a competency summary downloads. He emails it to compliance.

### 6.3 Journey C — Content author adds a new procedure

1. An EON admin opens `/admin` on the dashboard.
2. They create a new Equipment record (name, asset tag, QR value, optional reference photos).
3. They create a Procedure tied to that equipment (name, version, total steps).
4. For each step, they enter: title (short, ALL CAPS), instruction (≤80 chars), optional reference image URL, a `verification_prompt` (the exact text sent to Claude with the photo), success criteria, retry threshold.
5. They save. The procedure is immediately loadable by any glasses paired to the same organization.

## 7. Functional requirements

### 7.1 On-glasses Web App (technician HUD view)

- **FR-G-1.** Render step cards optimized for 600×600 px, high contrast, large type, ≤3 lines per card.
- **FR-G-2.** Support Neural Band navigation: index-finger pinch advances to next step (only after verification passes); middle-finger pinch cancels or backs out; left/right/up/down swipes scroll within a card.
- **FR-G-3.** Display verification state inline: pending (gray), processing (blue spinner), verified (green check), retry (amber with one-line correction), error (red).
- **FR-G-4.** Show progress (`Step N of M`) and elapsed time on every card.
- **FR-G-5.** Fall back to a "session paused — reconnecting" state when the companion app loses Bluetooth/internet, then auto-resume.
- **FR-G-6.** Honor Meta Web Apps platform constraints: HTML/CSS/JS only, no native bridges, must work when paired via the Meta AI app in Developer Mode.

### 7.2 React Native companion app (technician phone)

- **FR-M-1.** Pair with the glasses via the Meta Wearables Device Access Toolkit (iOS Swift bridge + Android Kotlin bridge invoked from React Native via native modules).
- **FR-M-2.** Receive on-demand camera frames from the glasses (12 MP photo capture triggered by Meta AI "take a photo" voice command, or by the technician pressing a button in the companion app).
- **FR-M-3.** Decode QR codes from glasses camera frames; resolve them to Equipment IDs via the backend.
- **FR-M-4.** Maintain the active session state (current step, status), display it on the phone screen as a mirror of the HUD, and let the technician retry, skip (only if step `skippable=true`), or abandon.
- **FR-M-5.** Upload verification photos to the backend with session ID, step ID, GPS (when available), and timestamp.
- **FR-M-6.** Receive Claude verification result, surface it to the user (and to the Web App on the HUD via the backend), and queue the next step.
- **FR-M-7.** Work offline for the technician flow: cache the active procedure on session start, queue uploads, sync when network returns.

### 7.3 Backend (Node.js + PostgreSQL)

- **FR-B-1.** Provide a REST + WebSocket API for the companion app, Web App, and dashboard (see `02_Architecture.md` for the full contract).
- **FR-B-2.** Resolve QR codes to Equipment + active Procedure.
- **FR-B-3.** Manage sessions: create, advance, complete, abandon; enforce step ordering; never allow advance without verification (unless step is explicitly `verification_required=false`).
- **FR-B-4.** Photo verification pipeline: receive photo + step → upload to object storage (S3 or Cloudinary) → call Anthropic Messages API with `claude-sonnet-4-6`, image, system prompt, and step `verification_prompt` → parse structured JSON response (`verified`, `confidence`, `message`, `detail`) → persist to `audit_log` → push next step (or retry) via WebSocket to the companion app / Web App.
- **FR-B-5.** Stream live session events to subscribed dashboards via WebSocket (or SSE fallback).
- **FR-B-6.** Generate PDF audit reports on demand with all step photos, timestamps, GPS, Claude analysis text, and a competency summary.
- **FR-B-7.** Provide an authoring API for Equipment, Procedure, Step, and verification prompt CRUD.

### 7.4 Supervisor dashboard (web)

- **FR-D-1.** Show a live list of active sessions with technician name, equipment, current step, status, elapsed time.
- **FR-D-2.** Drill into a session to see the full step feed in real time, with photos and Claude analysis.
- **FR-D-3.** Show historical sessions with filters (date, technician, equipment, procedure, status).
- **FR-D-4.** One-click PDF report generation per session, and bulk export for a date range.
- **FR-D-5.** Show simple aggregate KPIs: completion rate, first-pass verification rate, average duration, most-retried steps.

### 7.5 Admin / content authoring

- **FR-A-1.** CRUD for Organizations, Users (with roles: admin, trainer, supervisor, technician), Equipment, Procedures, Steps.
- **FR-A-2.** Inline `verification_prompt` editor with a "test on a sample photo" sandbox that calls Claude directly so authors can iterate quickly.
- **FR-A-3.** Procedure versioning: editing a procedure creates a new draft version; the live version is the most recent `active=true` version; in-flight sessions stay on the version they started.

## 8. Non-functional requirements

| Category | Requirement |
|---|---|
| **Latency — photo verification** | p50 ≤ 4 s, p95 ≤ 8 s end-to-end (photo capture → HUD verdict). |
| **Latency — step navigation** | p95 ≤ 500 ms for next-step push after verification passes. |
| **Availability** | 99.5% backend uptime for v1 (single region acceptable). |
| **Throughput** | Support 100 concurrent active sessions on the v1 backend; horizontal scale beyond via standard Node + Postgres patterns. |
| **Connectivity** | Companion app must tolerate ≥30 s of network loss without dropping the session. Photos queued locally and uploaded on reconnect. |
| **Security** | TLS everywhere; per-organization data isolation; signed photo URLs with short expiry; PII (technician name + phone) encrypted at rest. |
| **Audit immutability** | `audit_log` rows are append-only. Edits create a new row with `superseded_by` linkage; raw Claude responses preserved verbatim. |
| **Privacy** | Photos retained per org-configurable policy (default 1 year). Technicians informed and consented at first session. |
| **Compliance** | Designed to support OSHA 29 CFR 1910.147 documentation requirements. Reports include all elements OSHA inspectors typically request. |
| **Accessibility** | WCAG 2.1 AA for the dashboard; high-contrast and large-text defaults on the HUD Web App. |
| **Internationalization** | All user-visible strings externalized; v1 ships English; architecture supports adding locales without code changes to step content. |

## 9. Success metrics

### 9.1 Product KPIs (LOTO trainer milestone)

- **First-pass verification rate ≥ 90%** across the 10 LOTO steps after 20 sessions of prompt tuning.
- **Median procedure duration ≤ 13 minutes** for a trained technician (vs. ~20 min for paper-based equivalents in DAC #811 training).
- **Zero missed steps** in any completed session (system-enforced).
- **Trainer satisfaction (CSAT) ≥ 4.2/5** after first 10 training sessions.
- **PDF report generation < 5 s** from click to download.

### 9.2 Business KPIs (for the LOTO trainer as a sellable product)

- 1 paying pilot customer (oil & gas, manufacturing, or industrial training provider) by end of Q3 2026.
- 3 procedures published beyond LOTO (e.g., pump alignment, confined space prep) within 60 days of v1 launch — proving the content model works for non-engineers.
- ≥ 70% of pilot trainees self-report that the glasses experience was "comfortable enough to use for a full shift."

## 10. Phasing

### Phase 1 — LOTO trainer v1 (this spec). Target: 8–10 weeks.
- All FR/NFR above for the single DAC #811 LOTO procedure.
- Web App on glasses + React Native companion + Node backend + supervisor dashboard.
- Internal dogfooding with EON trainers, then 1 pilot customer.

### Phase 2 — Multi-procedure + multi-tenant. Target: +6 weeks.
- Additional procedures authored on the existing platform (E811-S04 pump alignment, E811-S06 confined space prep, plus customer-specific SOPs).
- Org-scoped admin, user roles, SSO.
- LMS integration (xAPI / Tin Can) to push completion data back to EON Genesis.

### Phase 3 — Genesis loop closure. Target: 2027.
- Bidirectional integration with EON Genesis: retry patterns surface as recommended VR retraining; competency from VR flows back to gate Field IQ access.
- Equipment auto-identification via on-glasses CV (when SDK exposes it); QR code becomes a fallback rather than the default.

### Phase 4 — Production publishing. Target: when Meta opens GA distribution.
- App Store / Play Store publishing of the companion app.
- Web App listed in the Meta Ray-Ban Display app store equivalent (when available).

## 11. Open questions

These are flagged for product/engineering to resolve during build:

1. **Authentication model.** Magic-link email per technician, SSO via the customer's IdP, or organization-level shared device with technician selection on-device? Recommendation: SSO with a per-device "active technician" picker that uses a 6-digit PIN.
2. **Photo storage.** Self-hosted S3-compatible vs. Cloudinary vs. customer-bring-your-own-bucket (relevant for oil & gas customers with data residency requirements).
3. **Wake word.** Continue relying on Meta's "Hey Meta, take a photo" until a third-party wake word is supported, or build a phone-side "always listening" companion mode for hands-free advance? Recommendation: stay native for v1; revisit when SDK opens further.
4. **Offline AI fallback.** For sites with no connectivity, do we ship a smaller on-phone model (e.g., a fine-tuned MobileNet for valve positions) as a degraded fallback, or refuse to start a session offline? Recommendation: refuse + clear error in v1; revisit for Phase 2.

---

*Cross-reference: `02_Architecture.md` (system architecture and API contracts), `03_LOTO_Test_Case.md` (the build-ready first procedure spec), `04_Implementation_Plan.md` (phased build plan with concrete Claude Code prompts), `05_CLAUDE.md` (repo-root orientation for Claude Code).*
