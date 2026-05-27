# EON Field IQ — First Test Case: DAC #811 LOTO Trainer

**Document owner:** EON Reality
**Status:** Build-ready (v1.0)
**Last updated:** May 19, 2026
**Companion docs:** `01_PRD.md`, `02_Architecture.md`, `04_Implementation_Plan.md`, `05_CLAUDE.md`
**Reference source:** DAC Worldwide LLC, *Course 811-500: Introduction to Lock-Out/Tag-Out using the DAC #811 LOTO Trainer* (Revision 2, 2019)

---

## 1. Why LOTO and why this trainer

Lockout/Tagout is the single highest-cited safety-compliance requirement in industrial operations, governed by **OSHA 29 CFR 1910.147**. A single violation averages $1.7M in fines, remediation, and lost production. It is the right "first procedure" for EON Field IQ for three reasons:

1. **High stakes, clear pass/fail criteria.** Every step has a binary visual outcome (switch open/closed, hasp installed, padlock locked, valve perpendicular, tag attached). This is ideal for AI photo verification with high first-pass accuracy.
2. **Universal applicability.** Oil & gas, manufacturing, power generation, aerospace MRO, EV service — every major Field IQ target customer runs LOTO every day.
3. **A purpose-built simulator exists.** The DAC Worldwide #811 LOTO Trainer is a heavy-duty desktop process environment specifically designed to teach LOTO. It includes a fused disconnect box, local manual starter switch, three-drain manifold, three-way ball valves, in-line GFCI protector, tank vent covers — i.e. the exact components a technician would lock out on a real pump skid. Training on the simulator with EON Field IQ is the cleanest possible demo and the cleanest possible v1 because (a) we control the lighting and setup, (b) the procedure is bounded, (c) the components are standardized across all DAC #811 units worldwide, and (d) it cleanly maps to real plant work.

V1 ships **one procedure** for **one equipment record**, executed by a trainee under a trainer's supervision via the dashboard. Everything else (additional procedures, additional equipment, multi-tenant) is content authoring on the same platform.

## 2. Equipment record

Seeded at install time as the first row in `equipment`:

| Field | Value |
|---|---|
| `id` | `eq_dac811_001` (uuid in DB) |
| `name` | DAC #811 Lockout/Tagout Trainer |
| `asset_tag` | DAC-811-01 |
| `qr_code_value` | `EON-LOTO-DAC811-01` |
| `description` | Heavy-duty desktop training panel with fused disconnect box, local manual starter, three-drain manifold, three-way ball valves, in-line GFCI protector, and tank vent covers. Used for hands-on LOTO competency training and certification. |
| `location` | EON Training Bay 1 |
| `photo_url` | s3://field-iq/seed/dac811_overview.jpg |
| `metadata` | `{"vendor": "DAC Worldwide", "model": "811", "course_ref": "811-500", "components": ["fused_disconnect_box", "local_manual_starter", "three_drain_manifold", "three_way_ball_valve_a", "three_way_ball_valve_b", "gfci", "tank_vent_cover_a", "tank_vent_cover_b"]}` |

A printed QR code labeled `EON-LOTO-DAC811-01` is affixed to the stainless steel baseplate of the trainer.

## 3. Procedure record

| Field | Value |
|---|---|
| `id` | `proc_loto_dac811_v1` |
| `equipment_id` | `eq_dac811_001` |
| `name` | LOTO Procedure for DAC #811 Trainer |
| `version` | `1.0.0` |
| `description` | Ten-step LOTO procedure derived from DAC Course 811-500 Exercises E811-S01 through E811-S04, adapted for the DAC #811 trainer with photo-verified compliance at each step. Aligned to OSHA 29 CFR 1910.147 requirements: identify hazardous energy, notify, isolate, lock, tag, and verify zero energy. |
| `total_steps` | 10 |
| `is_active` | true |
| `created_by` | seed |

## 4. The 10 steps

Each row below is exactly what gets seeded into the `steps` table. The `verification_prompt` is the literal text sent to Claude alongside the photo and the system prompt from `02_Architecture.md §8.1`. The HUD card content (title + instruction) is what the Web App renders on the glasses.

> Note on numbering: this v1 procedure compresses DAC's instructor-led 8-exercise course into a 10-step practical execution. Trainees should still complete the underlying course reading (IPT Safety First Manual Section 13, pp. 480–499) before being certified to use Field IQ unsupervised. The Field IQ procedure is the *hands-on execution* layer, not a replacement for the course.

### Step 1 — DON PPE

- **HUD title:** `DON PPE`
- **HUD instruction:** `Put on safety glasses and gloves. Take a selfie-style photo of your face and hands.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step01_ppe.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this photo of a technician. Confirm BOTH of the following:
  (1) Protective gloves are clearly visible on the technician's hands.
  (2) Safety glasses are clearly visible on the technician's face.
  Both must be present to verify. If either is absent, partially visible,
  or ambiguous, return verified=false and ask for a retake showing both
  gloves and safety glasses clearly.
  ```
- **`success_criteria`:** Gloves and safety glasses both clearly visible.

### Step 2 — IDENTIFY EQUIPMENT (QR scan)

- **HUD title:** `IDENTIFY EQUIPMENT`
- **HUD instruction:** `Scan the QR code on the trainer baseplate. Photo the QR code.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step02_qr.jpg`
- **`verification_required`:** true (this step also performs the QR resolution as a side effect, but verification still confirms the QR was photographed in the right context)
- **`verification_prompt`:**
  ```
  Look at this photo. Confirm:
  (1) A QR code is clearly visible in the frame.
  (2) The QR code appears affixed to industrial equipment (visible baseplate,
      panel, or chassis around it), not held loose.
  Return verified=true only if both are met.
  ```
- **`success_criteria`:** QR code visible and contextually mounted.

### Step 3 — IDENTIFY ENERGY SOURCES

- **HUD title:** `IDENTIFY ENERGY SOURCES`
- **HUD instruction:** `Point at each energy source: fused disconnect, manual starter, ball valves. Photo with all in frame.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step03_energy.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this photo of the DAC #811 LOTO trainer. Confirm that the photo
  shows the trainer's primary energy-source components in a single frame:
  the fused disconnect box (gray rectangular electrical enclosure, upper
  left of typical layout), the local manual starter switch (smaller switch
  enclosure), and at least one three-way ball valve (red or colored handle
  on a piped manifold). The whole trainer panel should be in frame.
  Return verified=true only if at least two of these three component types
  are clearly visible.
  ```
- **`success_criteria`:** Wide shot showing electrical isolation point(s) and at least one valve.

### Step 4 — DE-ENERGIZE (press STOP on local starter)

- **HUD title:** `STOP THE EQUIPMENT`
- **HUD instruction:** `Press STOP on the local manual starter. Photo the starter close-up.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step04_stop.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this close-up photo of the local manual starter switch on the
  DAC #811 trainer. Confirm:
  (1) The starter switch is clearly visible.
  (2) The switch appears to be in the OFF / STOPPED position
      (typically: pushbutton out, handle down, or indicator light OFF).
  If the switch state is ambiguous or the photo shows it in RUN, return
  verified=false with a one-sentence correction.
  ```
- **`success_criteria`:** Starter visibly in STOP/OFF position.

### Step 5 — OPEN MAIN DISCONNECT

- **HUD title:** `OPEN DISCONNECT`
- **HUD instruction:** `Open the fused disconnect switch (handle DOWN). Photo close-up.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step05_disconnect.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this close-up photo of the fused disconnect box on the DAC #811
  trainer. Confirm:
  (1) The disconnect switch handle is clearly visible.
  (2) The handle is in the OPEN/OFF position — for most industrial
      disconnects this means the handle is pointing DOWN or to the OFF
      label.
  If the handle is in the UP/ON position, or the position is unclear,
  return verified=false.
  ```
- **`success_criteria`:** Disconnect handle in OPEN position.

### Step 6 — APPLY LOCKOUT HASP

- **HUD title:** `APPLY HASP`
- **HUD instruction:** `Install a lockout hasp through the disconnect's lockout point. Photo close-up.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step06_hasp.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this close-up photo of the fused disconnect box. Confirm:
  (1) A lockout hasp (a metal scissor-like device with one or more padlock
      holes) is physically installed on the disconnect's lockout point.
  (2) The hasp is positioned so that the disconnect handle cannot be moved
      back to the ON position.
  If no hasp is visible, or the hasp is held nearby but not installed, or
  the hasp does not appear to block the handle, return verified=false.
  ```
- **`success_criteria`:** Hasp installed and physically preventing reactivation.

### Step 7 — APPLY PERSONAL PADLOCK

- **HUD title:** `APPLY PADLOCK`
- **HUD instruction:** `Lock your personal padlock through the hasp. Photo close-up.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step07_padlock.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this close-up photo. Confirm:
  (1) A padlock is visible, threaded through one of the holes in the
      lockout hasp installed on the disconnect.
  (2) The padlock shackle is fully closed and engaged (locked), not open
      or merely hanging through.
  If the padlock is missing, open, or not actually engaged through the
  hasp, return verified=false.
  ```
- **`success_criteria`:** Padlock locked through hasp.

### Step 8 — CLOSE BALL VALVE (isolate fluid energy)

- **HUD title:** `CLOSE BALL VALVE`
- **HUD instruction:** `Turn the three-way ball valve handle 90° to CLOSED (perpendicular to pipe). Photo close-up.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step08_valve.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this close-up photo of a ball valve on the DAC #811 trainer's
  three-drain manifold. Confirm:
  (1) The valve handle is clearly visible.
  (2) The handle is perpendicular (approximately 90°) to the pipe axis —
      this is the CLOSED position for a standard ball valve.
  If the handle is parallel to the pipe (OPEN), at an intermediate angle,
  or its orientation is unclear, return verified=false.
  ```
- **`success_criteria`:** Valve handle perpendicular to pipe.

### Step 9 — ATTACH LOTO TAG

- **HUD title:** `ATTACH LOTO TAG`
- **HUD instruction:** `Fill in tag (name + date) and attach it to the locked-out disconnect. Photo with tag readable.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step09_tag.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this photo. Confirm:
  (1) A LOTO tag (typically red, orange, or yellow, with text such as
      "DO NOT OPERATE", "DANGER", or similar warning) is visible.
  (2) The tag is physically attached to the locked-out equipment — either
      hung from the padlock, hasp, or the disconnect itself.
  (3) The tag is oriented such that its warning message would be readable
      by another worker approaching the equipment.
  If any of these are not met, return verified=false. You do not need to
  verify the technician's handwritten name and date are legible — only
  that the tag is attached and warning-side-out.
  ```
- **`success_criteria`:** LOTO tag attached, warning visible.

### Step 10 — VERIFY ZERO ENERGY (attempt start; expect no response)

- **HUD title:** `VERIFY ZERO ENERGY`
- **HUD instruction:** `Press START on the local starter. It must NOT activate. Photo your hand on the START button.`
- **Reference image:** `s3://field-iq/seed/dac811/ref_step10_test.jpg`
- **`verification_required`:** true
- **`verification_prompt`:**
  ```
  Look at this photo. The technician is performing a zero-energy
  verification — attempting to start the equipment to confirm the
  lockout is effective. Confirm:
  (1) A hand is visible near or pressing the START button on the local
      manual starter.
  (2) There is no indication that the equipment activated (no spinning
      pump impeller visible, no fluid motion in connected lines, no
      indicator light illuminated to GREEN/RUN if visible in frame).
  If a hand is not visible on the start control, return verified=false.
  If you can see clear evidence that the equipment DID activate (motion,
  lit RUN indicator), return verified=false and flag this as a critical
  safety failure in the detail field — the LOTO is not effective.
  ```
- **`success_criteria`:** Attempted start; no equipment response.

## 5. HUD card layout reference

Each step renders as a single HUD card. The Web App's CSS targets 600×600 px at 5,000-nit brightness. Indicative card structure:

```
┌──────────────────────────────────────────────┐
│  ⬛ STEP 6 OF 10        ⏱ 4:32              │
│                                              │
│  APPLY HASP                                  │
│                                              │
│  Install a lockout hasp through the          │
│  disconnect's lockout point.                 │
│  Photo close-up.                             │
│                                              │
│  [tap thumbnail to view reference]           │
│                                              │
│             [● VERIFY]                       │
└──────────────────────────────────────────────┘
```

State variants:
- **Pending:** as above; large dark verify button.
- **Processing:** "Claude is reviewing your photo…" with animated spinner; verify button hidden.
- **Verified:** "✅ Step 6 verified" in green; pinch hint: "Pinch to continue."
- **Retry:** "⚠️ Retry — [Claude's one-line message]" in amber; verify button re-enabled.
- **Error:** "❌ Verification error — [reason]. Try again or call trainer." in red.

## 6. Trainer dashboard view for this procedure

When a trainee starts the LOTO procedure, the trainer's tablet shows:

- **Header:** Session #YYYY-MMDD-NNN · Trainee: [Name] · Equipment: DAC #811 Trainer · Started: HH:MM
- **Step strip (top):** ten dots, each colored gray (pending), blue (in progress), green (verified), amber (retried), red (failed). Time-on-step shown beneath each completed dot.
- **Live feed (center):** as each step verifies, a card appears with the step title, timestamp, photo thumbnail, Claude's `message`, and Claude's `detail`.
- **Coach panel (right):** an inline note field where the trainer can record observations during the session; appended to the final report.
- **Controls (footer):** Override last verdict (audited), End session.

## 7. PDF audit report contents

Generated on `POST /sessions/:id/complete` and on demand thereafter. Includes:

1. **Cover page:** Session ID, equipment, procedure name + version, trainee, trainer, start/end timestamps, duration, GPS, overall verdict (all 10 verified / completed with retries / abandoned).
2. **Step-by-step record:** for each step — step number, title, instruction text, photo thumbnail, AI verdict + confidence + message + detail, retry count, time on step.
3. **Trainer notes:** verbatim from the coach panel.
4. **Compliance summary:** OSHA 29 CFR 1910.147 paragraph references mapped to the steps that satisfy them. Statement: "This document constitutes a photographic verification record of LOTO compliance per OSHA 29 CFR 1910.147(c)(4)(i)."
5. **Signature block:** trainer signature line, trainee signature line, supervisor signature line. (Field IQ also supports a digital signature flow via emailed link for remote sign-off — Phase 2 feature.)
6. **Audit chain integrity:** SHA-256 of each photo and the overall report hash, signed with the platform's signing key.

## 8. Acceptance criteria for v1

The LOTO procedure is considered "shipped" when all of the following are true:

- ✅ A trainee can complete the 10-step procedure end-to-end on a real Meta Ray-Ban Display + real Neural Band + real DAC #811 trainer in ≤ 13 minutes (target median).
- ✅ First-pass verification rate ≥ 90% across all 10 steps, measured over 20+ supervised sessions.
- ✅ Zero false positives on Step 10 (zero-energy verification) — the system must never verify a session where the equipment actually energizes during the START test.
- ✅ Trainer dashboard updates within 2 s of each verification event.
- ✅ PDF report generates in ≤ 5 s and renders correctly on letter and A4 paper.
- ✅ Audit chain integrity verified by an independent hash check.
- ✅ Internal training session: 5 EON staff complete the procedure on the simulator. Their feedback is incorporated.
- ✅ External pilot: 1 customer technician completes the procedure on their DAC #811 (or equivalent simulator) under remote supervision.

## 9. What v1 does NOT include (deferred to Phase 2)

- Other procedures from the DAC course catalog (E811-S04 Pump Alignment LOTO, E811-S05 Comprehensive Pump Maintenance, E811-S06 Confined Space Entry prep, E811-S07/S08 Tank Inspections).
- Self-guided certification (a trainee completing the procedure unsupervised and being awarded a competency credential).
- Multi-user collaborative LOTO (group lockout scenarios — multiple workers locking the same equipment).
- Live remote expert assist (trainer or expert joins a session via video stream from the glasses).
- Integration with EON Genesis to push competency back to the trainee's learning record.

These are sized in `04_Implementation_Plan.md` as the Phase 2 backlog.

---

*Cross-reference: `01_PRD.md`, `02_Architecture.md`, `04_Implementation_Plan.md`, `05_CLAUDE.md`. Source materials: DAC Worldwide Course 811-500 (uploaded as reference); OSHA 29 CFR 1910.147 (public domain).*
