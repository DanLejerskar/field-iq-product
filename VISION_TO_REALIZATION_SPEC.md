# Field IQ — Vision to Realization Specification

**First test case: DAC #811 LOTO Trainer · 10-step LOTO procedure.**

Author: Claude Cowork · for Dan Lejerskar, EON AI Ventures · May 25, 2026

This document marries the **Field IQ vision** (what the worker experiences, drawn from the user journeys and the frozen Vercel walkthrough) with the **Meta Ray-Ban Display realization** (what actually happens on the hardware, drawn from the colleague's tactical v1 spec and the verified Meta Wearables SDK docs). Each step has three bands: **Vision**, **Realization**, **Discoveries**. The deck `Field_IQ_Vision_to_Realization.pptx` renders this content visually; this document is the engineering depth behind it.

---

## 0. Decisions locked in

These are the canonical technical decisions for v1, confirmed in conversation on May 25, 2026.

| Decision | Choice | Plain-language reason |
|---|---|---|
| **First test case** | DAC #811 LOTO Trainer | Real, purchasable industrial training device. Green-area (training bay, no IS certification needed). Standardized worldwide so the v1 demo runs identically on any DAC #811 unit. 10-step LOTO procedure with binary visual outcomes — perfect for AI photo verification. |
| **Mobile companion stack** | **React Native** with native iOS Swift + native Android Kotlin bridges to the Meta Wearables DAT SDK | Dan wants both iOS and Android supported. React Native lets us share TypeScript code across both platforms; the SDK-specific parts are thin native bridges. Native Swift-only would mean building Android separately later — doubling the work. |
| **HUD rendering** | **Web App on the glasses** (HTML/CSS/JS, served from a password-protected URL) | The Web Apps SDK is the only path that puts UI directly on the glasses display. The DAT SDK pushes UI from a mobile app, but the experience and update cadence are different. Web App is also portable to future Meta AI glasses (Oakley HSTN, Ray-Ban Display Gen 2) without code changes. **"HUD" = Heads-Up Display = the in-lens display the worker sees.** Web App = a website that runs *on* the glasses, not on a phone or computer. |
| **Backend stack** | **Node.js Fastify** (REST + WebSocket API) + **Python worker** (Claude verification, image preprocessing) + **PostgreSQL** (Neon) + **Redis** (Upstash) + **S3-compatible object storage** for photos | Cleanest separation: API tier handles app/dashboard traffic; Python worker isolates the Claude call so we can swap models, add image preprocessing, or add an on-prem fallback without touching the API. Postgres for relational data + audit log immutability; Redis for queues + pub/sub; S3 for photos. Managed services where possible (Neon, Upstash) for v1; can self-host later for enterprise customers. |
| **AI model** | **Claude Sonnet 4.6** for photo verification | Already in our Anthropic relationship. Vision quality is sufficient for industrial scene analysis per the colleague's spec assessment. Structured JSON output mode for `{verified, confidence, message, detail}`. |
| **Personas (v1)** | **Maya** (trainee), **Carlos** (trainer / safety coach), **Priya** (supervisor / safety manager) | All three from the colleague's spec. Plus we keep **Joe** (operational worker) and **Sara** (process safety supervisor) for Phase 2's broader operational-deployment story — so we cover both training AND operational deployment scenarios. |
| **Phasing** | Build Phases 0 + 1 + 2 — **complete product, not tactical v1** | Phase 0 = foundation (schema, walkthrough refactor). Phase 1 = LOTO v1 on DAC #811 (8 weeks, ships end-to-end). Phase 2 = multi-procedure + operational deployment + supervisor dashboard + admin authoring. |

---

## 1. The vision-to-realization framing

The frozen Vercel walkthrough describes **what the worker should experience**. The colleague's spec describes **what the Meta hardware can actually do today**. Marrying them produces a third thing: **what we will actually build, end to end.**

For every step of the LOTO procedure, three bands:

**VISION** — drawn from the user journey deck. Plain-language, persona-grounded narrative of what the worker sees, hears, and does. The "story" layer that customers and stakeholders read.

**REALIZATION** — what actually happens on the Meta hardware + our backend. Which SDK surface (Web App on glasses for HUD; DAT SDK from companion app for camera + audio), which API call, what data flows where, what Claude prompt runs, what gets persisted. The engineering layer.

**DISCOVERIES** — things the SDK enables that *extend* our original vision, or constraints that *narrow* it. Honest accounting: sometimes the hardware does more than we imagined (display recording, captions, neural handwriting); sometimes less (no camera in Web App SDK v1, must do photo capture from companion).

---

## 2. Personas — quick reference

| Persona | Role | Surface | Job during LOTO procedure |
|---|---|---|---|
| **Maya** | Field technician / trainee | Glasses HUD + companion phone | Wears glasses, runs the 10-step LOTO procedure, captures verification photos by voice or pinch |
| **Carlos** | Field trainer / safety coach | Tablet at the front of the training bay | Watches the live session feed, reviews each verified step, coaches in real time, signs off on the audit report |
| **Priya** | Supervisor / safety manager | Desktop browser, often at HQ | Sees all active sessions across all training bays + the field, drills into specific sessions, generates compliance reports |
| **Joe** *(Phase 2+)* | Operational field worker | Glasses HUD + companion phone | Same as Maya but in production environments (not training bays). Phase 2 milestone — when the LOTO procedure leaves the training bay and runs on real equipment. |
| **Sara** *(Phase 2+)* | Process safety supervisor | Desktop browser, in operations | Same as Priya but for operational sessions, not just training. |

---

## 3. The technical architecture (in plain English)

Before walking through each step, here is how the system works overall, told as if to someone new to the stack.

**The glasses** run a small website we wrote — that's the "Web App." It draws step cards on the in-lens display and listens for pinch gestures from the Neural Band on Maya's wrist. It cannot take photos directly; the Web Apps SDK v1 doesn't give web apps camera access.

**The phone** Maya carries in her pocket runs a small app we wrote — that's the "React Native companion." React Native means we write the code once and it works on both iPhone and Android. This phone app talks to the glasses through Meta's official toolkit (the Device Access Toolkit, or DAT) — specifically to capture the photos that the glasses see, because the glasses themselves expose their camera only through that toolkit.

**The backend** is a separate computer up in the cloud that nobody touches directly. It's the "source of truth" — it knows which session is active, which step Maya is on, what's been verified, what's pending. The glasses Web App and the phone companion app both talk to the backend over WebSocket — a continuous connection that lets the backend push updates to both surfaces in real time.

**Claude Sonnet 4.6** is the AI that looks at each photo Maya captures and decides whether the step was done correctly. It runs as a separate Python worker behind the backend — when a photo comes in, the worker calls Claude, gets back a JSON answer (`verified: true/false, confidence: 0.95, message: "...", detail: "..."`), writes that to the database, and notifies both the glasses and the phone.

**The trainer dashboard** is a web page Carlos opens on his tablet. It watches the same WebSocket events the glasses and phone do, so when Maya verifies step 6, Carlos sees it within a second.

**The PDF audit report** is generated on demand by another worker after the session completes, with all 10 photos, timestamps, Claude's verdicts, and Carlos's coaching notes signed and hashed for tamper-evidence.

That's the whole stack. Five surfaces (glasses Web App, phone RN app, backend API, Claude worker, dashboard), one source of truth (Postgres database), one continuous live channel (WebSocket).

---

## 4. The 10 LOTO steps — vision, realization, discoveries

For each step: what Maya does, what the system actually does on the hardware, and what we discover.

### Step 1 — DON PPE

**VISION.** Maya picks up the glasses + Neural Band from the charging station, puts them on, opens the EON Field IQ Web App from her glasses' app list (Carlos pre-loaded the URL during the training-bay setup), and is greeted by a single card on her HUD: "Tap to scan equipment." Before she does anything else, she puts on safety glasses and gloves. The first procedure step appears: **DON PPE — Put on safety glasses and gloves. Take a selfie-style photo of your face and hands.** She holds her gloved hands up in front of her face, says "Hey Meta, take a photo," and the photo is captured.

**REALIZATION.**
- **Glasses Web App** renders Step 1 card on the 600×600 HUD: title "DON PPE", instruction, reference thumbnail of correct PPE.
- **"Hey Meta, take a photo"** voice command — this is Meta's *native* AI voice trigger, not custom. We rely on it because the Wearables SDK doesn't currently expose a custom wake word.
- **DAT SDK on the companion app** receives the captured photo from the glasses via Bluetooth (~80 ms BLE transfer).
- **Companion app** uploads the photo to backend `POST /api/sessions/:id/verify` with the session ID, step ID, and the photo file. Backend returns immediately with `status: processing`.
- **Python worker** picks up the verification job from Redis, uploads the photo to S3, and calls Anthropic Messages API with `claude-sonnet-4-6`, the image, the system prompt (from `02_Architecture.md §8.1`), and the step's verification prompt (verbatim below).
- **Claude responds** in ~3–5 s with structured JSON: `{verified: true, confidence: 0.92, message: "Gloves and safety glasses both visible.", detail: "Standard nitrile gloves on both hands, polycarbonate safety glasses on face. Confidence high."}`
- **Backend persists** the verdict to the `audit_log` table, broadcasts a `step.verified` event on the WebSocket.
- **Glasses Web App** receives the event, updates the HUD: green check, "Step 1 verified · Pinch for next step."
- **Trainer dashboard** receives the same event, updates Carlos's step strip with a green dot.

**Verification prompt sent to Claude:**
> Look at this photo of a technician. Confirm BOTH of the following:
> (1) Protective gloves are clearly visible on the technician's hands.
> (2) Safety glasses are clearly visible on the technician's face.
> Both must be present to verify. If either is absent, partially visible, or ambiguous, return verified=false and ask for a retake showing both gloves and safety glasses clearly.

**DISCOVERIES.**
- **Display recording (Update 125)** lets us capture the worker's HUD overlay alongside the POV photo for the audit. Original vision was POV only; we get HUD-overlay-on-POV for free.
- **Captions for phone calls (Update 125)** suggests Meta's open-ear speakers can deliver speech-to-text reliably — we can use the same channel for accessibility (deaf/HoH workers can read step instructions instead of hearing them).
- **Constraint discovered:** the Web Apps SDK v1 has no camera. We CANNOT capture the photo from the glasses Web App directly — it must come through the DAT SDK on the companion phone. This is why the architecture is split.

---

### Step 2 — IDENTIFY EQUIPMENT (QR scan)

**VISION.** Maya looks at the DAC #811 trainer in front of her. A printed QR code is affixed to the stainless steel baseplate. Her HUD shows: **IDENTIFY EQUIPMENT — Scan the QR code on the trainer baseplate. Photo the QR code.** She frames the QR code in her field of view, says "Hey Meta, take a photo," and the system identifies the equipment as `DAC-811-01` in the EON training bay.

**REALIZATION.**
- Same photo-capture flow as Step 1.
- **Additional side effect:** the companion app's QR decoder also runs on the photo client-side (decoded via `react-native-camera`'s QR detector). The decoded value `EON-LOTO-DAC811-01` is sent to backend `POST /api/equipment/resolve` which returns the matching equipment record + active procedure.
- **Backend** binds the equipment to the active session (`session.equipment_id = eq_dac811_001`) and pre-fetches all 10 procedure steps into the session cache so subsequent steps are instant.
- **Claude verification** still runs on the photo to confirm the QR is mounted (not held loose) and the surrounding context is industrial.

**Verification prompt:**
> Look at this photo. Confirm:
> (1) A QR code is clearly visible in the frame.
> (2) The QR code appears affixed to industrial equipment (visible baseplate, panel, or chassis around it), not held loose.
> Return verified=true only if both are met.

**DISCOVERIES.**
- The QR step doubles as **session initialization** — by the time Claude returns, the backend has already loaded the full procedure manifest, so step 3 transitions in <200 ms (no DB hit).
- Phase 2 candidate: replace QR with on-glasses computer-vision equipment identification when the DAT SDK exposes continuous frame access. For v1 the QR is the cleanest path.

---

### Step 3 — IDENTIFY ENERGY SOURCES

**VISION.** Maya's HUD: **IDENTIFY ENERGY SOURCES — Point at each energy source: fused disconnect, manual starter, ball valves. Photo with all in frame.** She steps back from the trainer to fit the whole panel in her field of view, points generally at each component as she narrates them aloud (Meta AI is listening), and takes a wide shot.

**REALIZATION.**
- Wider-frame photo, same capture flow.
- **Claude verification** specifically checks for the three energy-source component types (electrical disconnect, manual starter, ball valve) in a single frame.
- **Carlos's dashboard** shows Maya's photo at full size with Claude's annotation: "Disconnect ✓, Starter ✓, Valve ✓." Carlos uses this as a coaching moment — if Maya missed pointing at one component, he can pause the session.

**Verification prompt:**
> Look at this photo of the DAC #811 LOTO trainer. Confirm that the photo shows the trainer's primary energy-source components in a single frame: the fused disconnect box (gray rectangular electrical enclosure, upper left of typical layout), the local manual starter switch (smaller switch enclosure), and at least one three-way ball valve (red or colored handle on a piped manifold). The whole trainer panel should be in frame. Return verified=true only if at least two of these three component types are clearly visible.

**DISCOVERIES.**
- The narration ("disconnect on the left, starter in the middle, ball valves on the manifold") is captured by the glasses' 6-microphone array and stored alongside the photo in the audit log. Phase 2: turn this into a structured "energy isolation plan" by running Claude over the transcript.

---

### Step 4 — DE-ENERGIZE (press STOP on local starter)

**VISION.** Maya's HUD: **STOP THE EQUIPMENT — Press STOP on the local manual starter. Photo the starter close-up.** She walks up to the trainer's local manual starter switch, presses the STOP button, then frames the switch close enough that the OFF state is unambiguous, and captures.

**REALIZATION.**
- Same photo capture flow.
- **Critical detail:** Claude is asked specifically to assess switch state (OFF vs RUN), not just identify the switch. The verification prompt is engineered to fail if state is ambiguous.

**Verification prompt:**
> Look at this close-up photo of the local manual starter switch on the DAC #811 trainer. Confirm:
> (1) The starter switch is clearly visible.
> (2) The switch appears to be in the OFF / STOPPED position (typically: pushbutton out, handle down, or indicator light OFF).
> If the switch state is ambiguous or the photo shows it in RUN, return verified=false with a one-sentence correction.

**DISCOVERIES.**
- This is the first step where **retry behavior matters**. If Maya's photo is ambiguous and Claude returns `verified: false`, the HUD goes amber with a one-line correction ("Switch state unclear — please retake with the indicator light visible"). Retry counter increments. After 3 retries, Carlos is paged.
- The retry counter is itself a learning signal: across many sessions, steps with high retry counts indicate either poor lighting in the training bay, an unclear instruction, or a poorly-tuned verification prompt. Phase 2 includes a retry-pattern dashboard for Carlos.

---

### Step 5 — OPEN MAIN DISCONNECT

**VISION.** Maya's HUD: **OPEN DISCONNECT — Open the fused disconnect switch (handle DOWN). Photo close-up.** She walks to the fused disconnect box on the upper left of the trainer, grabs the handle, swings it down to the OFF position, and captures a close-up.

**REALIZATION.** Same flow. Claude verifies handle position (DOWN = OPEN).

**Verification prompt:**
> Look at this close-up photo of the fused disconnect box on the DAC #811 trainer. Confirm:
> (1) The disconnect switch handle is clearly visible.
> (2) The handle is in the OPEN/OFF position — for most industrial disconnects this means the handle is pointing DOWN or to the OFF label.
> If the handle is in the UP/ON position, or the position is unclear, return verified=false.

**DISCOVERIES.**
- **3D depth perception is not required** for this step — a 2D photo is sufficient because the handle's vertical orientation is unambiguous in 2D. This means we don't need stereoscopic camera or depth sensors. Important because the Ray-Ban Display has a monocular camera; it works for our needs.

---

### Step 6 — APPLY LOCKOUT HASP

**VISION.** Maya's HUD: **APPLY HASP — Install a lockout hasp through the disconnect's lockout point. Photo close-up.** She takes a lockout hasp from the LOTO supply station (a metal scissor-style device with multiple padlock holes), threads it through the lockout point on the disconnect, and photos it close-up.

**REALIZATION.** Same flow. Claude verifies hasp presence AND that it physically blocks the handle from moving back to ON.

**Verification prompt:**
> Look at this close-up photo of the fused disconnect box. Confirm:
> (1) A lockout hasp (a metal scissor-like device with one or more padlock holes) is physically installed on the disconnect's lockout point.
> (2) The hasp is positioned so that the disconnect handle cannot be moved back to the ON position.
> If no hasp is visible, or the hasp is held nearby but not installed, or the hasp does not appear to block the handle, return verified=false.

**DISCOVERIES.**
- Claude's spatial reasoning is good enough to assess "the hasp physically blocks the handle" from a 2D photo. This was uncertain at the start of the spec — confirmed acceptable per the colleague's calibration runs.

---

### Step 7 — APPLY PERSONAL PADLOCK

**VISION.** Maya's HUD: **APPLY PADLOCK — Lock your personal padlock through the hasp. Photo close-up.** Maya takes her personal padlock (color-coded to her — orange in the training bay's color scheme), threads the shackle through one of the hasp's holes, and locks it. Close-up photo.

**REALIZATION.** Same flow. Claude verifies padlock is closed AND engaged through the hasp.

**Verification prompt:**
> Look at this close-up photo. Confirm:
> (1) A padlock is visible, threaded through one of the holes in the lockout hasp installed on the disconnect.
> (2) The padlock shackle is fully closed and engaged (locked), not open or merely hanging through.
> If the padlock is missing, open, or not actually engaged through the hasp, return verified=false.

**DISCOVERIES.**
- The "color-coded personal padlock" is a real LOTO best practice — each worker has their own color. Phase 2 enhancement: the EON Admin can register a specific padlock color per technician, and Claude verifies the *correct* color padlock is being applied (catches the case where Maya grabs Carlos's padlock by mistake).

---

### Step 8 — CLOSE BALL VALVE (isolate fluid energy)

**VISION.** Maya's HUD: **CLOSE BALL VALVE — Turn the three-way ball valve handle 90° to CLOSED (perpendicular to pipe). Photo close-up.** She walks to the three-drain manifold, rotates the colored handle of the three-way ball valve so it's perpendicular to the pipe (the universal "CLOSED" position for ball valves), and photos.

**REALIZATION.** Same flow. Claude verifies handle orientation relative to pipe axis (perpendicular = closed).

**Verification prompt:**
> Look at this close-up photo of a ball valve on the DAC #811 trainer's three-drain manifold. Confirm:
> (1) The valve handle is clearly visible.
> (2) The handle is perpendicular (approximately 90°) to the pipe axis — this is the CLOSED position for a standard ball valve.
> If the handle is parallel to the pipe (OPEN), at an intermediate angle, or its orientation is unclear, return verified=false.

**DISCOVERIES.**
- Geometric reasoning (perpendicular vs parallel) is a Claude vision strength. The risk is intermediate-angle ambiguity — e.g., a handle at 45° due to user error. Verification prompt explicitly handles this by failing verification on "intermediate or unclear" angles.
- The reference image (`ref_step08_valve.jpg`) shows the correct closed state. **Tap-to-view-reference on the HUD** lets Maya pull up the photo on her glasses if she's unsure — Neural Band swipe pages between current step and reference.

---

### Step 9 — ATTACH LOTO TAG

**VISION.** Maya's HUD: **ATTACH LOTO TAG — Fill in tag (name + date) and attach it to the locked-out disconnect. Photo with tag readable.** She grabs a standard LOTO tag (red/orange/yellow, with DANGER / DO NOT OPERATE printed in large type), writes her name and the date in the blank fields with a marker, hangs it from her padlock, and photos with the warning-face visible.

**REALIZATION.** Same flow. Claude verifies tag visible, attached, warning-side-out.

**Verification prompt:**
> Look at this photo. Confirm:
> (1) A LOTO tag (typically red, orange, or yellow, with text such as "DO NOT OPERATE", "DANGER", or similar warning) is visible.
> (2) The tag is physically attached to the locked-out equipment — either hung from the padlock, hasp, or the disconnect itself.
> (3) The tag is oriented such that its warning message would be readable by another worker approaching the equipment.
> If any of these are not met, return verified=false. You do not need to verify the technician's handwritten name and date are legible — only that the tag is attached and warning-side-out.

**DISCOVERIES.**
- **Handwriting recognition is explicitly out of scope for Claude verification** — the spec deliberately doesn't ask Claude to OCR the name and date because handwriting + glove + hand-tremor + lighting variability is unreliable. Phase 2: when neural handwriting on iOS via the Meta Neural Band matures, Maya can *type* her name into the tag with a finger-pinch handwriting gesture and we capture it digitally instead.

---

### Step 10 — VERIFY ZERO ENERGY

**VISION.** Maya's HUD: **VERIFY ZERO ENERGY — Press START on the local starter. It must NOT activate. Photo your hand on the START button.** She walks back to the local manual starter, presses the START button firmly, observes that the equipment does NOT respond (no indicator light, no motion, no sound), and photos her hand on the button as evidence of the attempted start.

**REALIZATION.** Same flow. Claude verifies hand on start button AND no equipment activation. This is the **critical safety verification** — if equipment DID activate, that's a failed LOTO and Claude flags it as a critical incident.

**Verification prompt:**
> Look at this photo. The technician is performing a zero-energy verification — attempting to start the equipment to confirm the lockout is effective. Confirm:
> (1) A hand is visible near or pressing the START button on the local manual starter.
> (2) There is no indication that the equipment activated (no spinning pump impeller visible, no fluid motion in connected lines, no indicator light illuminated to GREEN/RUN if visible in frame).
> If a hand is not visible on the start control, return verified=false.
> If you can see clear evidence that the equipment DID activate (motion, lit RUN indicator), return verified=false and flag this as a critical safety failure in the detail field — the LOTO is not effective.

**DISCOVERIES.**
- **Zero false-positive tolerance.** The colleague's acceptance criteria says: "Zero false positives on Step 10 — the system must never verify a session where the equipment actually energizes." This is the one step where the prompt is engineered to *prefer false negatives* (verified=false when ambiguous) over false positives (verified=true when actually energized).
- After Step 10 verifies, the HUD shows: 🏁 Procedure complete — 10/10 verified. Duration 11:42. Report sent to supervisor.
- The PDF audit report generates automatically and lands in Carlos's dashboard download queue + Priya's "audits ready" inbox.

---

## 5. Cross-step concerns

### 5.1 Session lifecycle

```
[Idle]
   │  Maya opens Web App, scans QR
   ▼
[Active · Step 1 pending]
   │  photo verified
   ▼
[Active · Step 1 verified, Step 2 pending] ──── (retry loop on failures)
   │
   ▼  (repeat for steps 2..10)
[Complete · all 10 verified · PDF generated]

[Active · ...] ──┬─── abandon by trainer or trainee ───▶ [Abandoned]
                 └─── 30 min inactivity timeout ───────▶ [Timed out]
```

State transitions are server-authoritative. The Web App and companion app never advance state on their own; they request a state change from the backend, which validates and broadcasts the new state via WebSocket.

### 5.2 Verification pipeline

```
companion app → POST /api/sessions/:id/verify (photo, step_id)
              ↓
api tier → upload photo to S3, write 'pending' verdict row, enqueue verification job
              ↓
verifier worker (Python) → dequeue job, call Anthropic Messages API with system prompt + step prompt + image
              ↓
              ← {verified, confidence, message, detail} JSON
              ↓
worker writes verdict to audit_log, publishes 'step.verified' (or 'step.retry') event
              ↓
WebSocket gateway broadcasts to: glasses Web App, companion app, trainer dashboard
```

p50 latency target: ≤ 4 s end-to-end (photo capture → HUD verdict). p95: ≤ 8 s. The Anthropic call dominates; everything else is sub-second.

### 5.3 Trainer dashboard live view

Carlos's tablet maintains a WebSocket subscription to all sessions in his organization. When any `step.verified` or `step.retry` event fires, the dashboard updates within 2 seconds of the event timestamp. Carlos sees:

- **Active sessions list** (left rail) with technician name, equipment, current step, status.
- **Selected session detail** (center) with the 10-step strip + a scrolling card feed of verifications.
- **Coach notes panel** (right) where Carlos types observations in real time. Notes append to the final PDF.

### 5.4 PDF audit report

Generated automatically on session completion AND on demand thereafter. Contents documented in colleague's spec §7. Highlights for v1:

- Cover page with all session metadata + overall verdict.
- 10 step records, each with photo, Claude verdict, retry count, time-on-step.
- OSHA 29 CFR 1910.147 compliance mapping.
- Trainer signature, trainee signature, supervisor signature blocks.
- SHA-256 hash chain for tamper-evidence.

Reports generate in ≤ 5 s. Letter and A4 supported.

### 5.5 The operational-deployment extension (Phase 2)

For Phase 2, Joe (operational worker) runs the same 10-step procedure on a real pump skid in a refinery — not the DAC #811 trainer. The system is identical except:

- The equipment record is the real skid (e.g., `eq_skd104_loop2_refinery_east`), not the DAC #811.
- The supervisor is Sara (operational), not Carlos (training).
- The audit pack is regulator-formatted, not training-formatted.
- The retry threshold may be stricter (fewer retries before supervisor escalation) because operational stakes are higher.

**Architectural insight:** the move from training to operational deployment is a *content change*, not a *code change*. The same Field IQ platform serves both.

---

## 6. What v1 (Phase 1) ships

The 8-week build delivers:

- ✅ Glasses Web App rendering the 10-step LOTO HUD UI, working on a real Meta Ray-Ban Display.
- ✅ React Native companion app (iOS + Android) paired with the glasses via DAT SDK, capturing photos via "Hey Meta, take a photo," uploading to backend.
- ✅ Node.js Fastify backend with REST + WebSocket, Postgres data model, Redis queues, S3 photo storage.
- ✅ Python Claude verifier with all 10 verification prompts seeded.
- ✅ Trainer dashboard (Carlos's tablet view) with live step strip, photo feed, coach notes.
- ✅ Admin authoring UI (Equipment/Procedure/Step CRUD + verification prompt sandbox).
- ✅ PDF audit report generator with OSHA compliance mapping.
- ✅ At least 5 internal sessions completed by EON staff on a real DAC #811.
- ✅ At least 1 external pilot session completed by a customer technician.
- ✅ p95 verification latency ≤ 8 s, first-pass verification rate ≥ 90%.

## 7. What Phase 2 adds

- 3 additional procedures (pump alignment, confined space prep, customer-specific).
- Multi-tenant organization model with SSO.
- Supervisor dashboard at scale — Priya's view with all sites, KPI aggregation.
- Operational deployment — Joe and Sara workflows.
- Edge-case archive flow + retry-pattern dashboard.
- Phase 2 of the original master spec's roadmap.

## 8. What Phase 3+ deferrals

Per the colleague's spec §9 and our master roadmap §6:

- On-glasses CV equipment identification (replaces QR).
- Real-time HUD overlays anchored to physical components (when DAT exposes continuous frame access).
- Live remote expert assist (trainer joins session via glasses POV video stream).
- LMS integration (xAPI → EON Genesis).
- Multi-user collaborative LOTO (group lockout).
- Self-guided certification.

These are sized in `04_Implementation_Plan.md` (colleague's spec) as Phase 3 backlog.

---

## 9. The "discoveries" summary — what extends our original vision

Across all 10 steps, the SDK + Update 125 gives us capabilities we did not originally plan for:

1. **Display recording** in audit packs — captures HUD overlay + POV simultaneously. Audit replays now look like the worker's actual experience, not just their viewpoint.
2. **Open-ear speaker captions** for hearing-impaired workers or high-ambient-noise environments. Workers can read step instructions instead of hearing them.
3. **Voice narration capture** during wide-shot steps (Step 3) — the 6-microphone beamforming array picks up the worker's spoken energy-source identification, which we can run through Claude as a structured "energy isolation plan" in Phase 2.
4. **Reference-image tap-to-view** via Neural Band swipe — workers can flip between the current step card and the reference photo on the HUD without removing focus from the equipment.
5. **Color-coded padlock verification** in Step 7 — Claude can be tuned to verify the *correct* padlock color per technician, catching the case of mistaken-padlock-pickup.
6. **Critical-incident flagging** in Step 10 — Claude's `detail` field can flag "equipment activated during zero-energy test" as a structured safety event, triggering an immediate supervisor page and an OSHA-reportable incident record.

---

## 10. Open items

1. **DAC #811 procurement.** EON needs to purchase a DAC #811 trainer (~$5–15K depending on options) for internal dogfooding. Action: source from DAC Worldwide.
2. **Meta Wearables Developer Center signup.** Register EON AI Ventures as an organization. <https://wearables.developer.meta.com/signup/landing/>
3. **Photo storage hosting decision.** S3 (AWS) vs. Cloudflare R2 vs. customer-bring-your-own-bucket. Recommendation: AWS S3 for v1, abstract storage interface so we can swap later.
4. **Claude rate limit headroom.** Confirm Anthropic enterprise tier supports our concurrent-session forecast (target 100 concurrent sessions at p50 of 4 s per verification ≈ 25 calls/sec sustained). Likely within standard enterprise limits but should confirm.
5. **OSHA compliance attestation.** Engage an industrial safety attorney to review the PDF audit report format and the system's defensibility for OSHA inspection. Recommended in Phase 4 of the broader roadmap, but worth starting the conversation in Phase 1.

End of spec.
