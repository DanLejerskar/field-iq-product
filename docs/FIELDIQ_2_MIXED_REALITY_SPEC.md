# FieldIQ 2.0 — Mixed Reality Specification

> **Status:** Draft v1, June 2026. Source of truth for the AR upgrade.
> **Authored by:** Dan Lejerskar + the Field IQ bridge Claude (code side).
> **Companion docs (intent, marketing):** `FieldIQ_2.0_Mixed_Reality.pptx`,
> `FieldIQ_2.0_White_Paper.docx`, `FieldIQ_2.0_Press_Release.docx`.
> **Conflict rule:** If this spec and the marketing docs disagree on **what is
> shipping when**, this spec wins. If they disagree on **why it matters**, the
> marketing docs win. Code beats both on facts.

---

## Part 1 — The Story in Plain Words (a 10-year-old can follow this)

### What FieldIQ 1.0 does today (the shipping product)

A worker stands in front of a real machine — a pump, a valve, an electrical
panel. They tell their phone (or glasses) which job they're doing. The phone
shows them **a picture of what the next step should look like** plus a short
instruction: *"Put the lock on this red switch."* The worker does it, snaps a
photo, and Claude (the AI) looks at the photo and decides: ✅ correct → next
step, or ❌ try again. Every photo and verdict is saved as a tamper-evident
audit log. That's it. That's the whole product. It works today.

We call this the **Image Bridge**: pictures of the machine guiding work on
the machine.

### The thing Dan noticed driving home

The phone in the worker's pocket is not a dumb camera. It is a small
computer with a depth sensor and a perfect understanding of the 3D space
around it. Genesis (EON's authoring tool) already produces a full 3D model
— the **digital twin** — of every piece of equipment in the procedure. That
twin already loads on the phone today, but it floats on the screen like a
museum exhibit: spin it with your finger, pinch to zoom, no connection to
the actual machine standing in front of the worker. We've been calling that
**"Mobile Reality"** — 3D on the phone, but disconnected from the world.

What if the phone could **glue the twin onto the real machine**?

You point the phone at the pump. The phone recognizes which pump it is
(from a small printed QR code stuck on the pump, or from the shape of the
pump itself), and instantly the 3D twin appears, at the right size, snapped
onto the real pump like a transparent skin. Walk around the pump: the twin
stays glued. A glowing arrow on the actual red switch — not "the red
switch, somewhere over there." That's **Mixed Reality**, and the killer
phrase is: **the machine itself becomes the teacher.**

### Why this is not the same as VR

VR = goggles, you're somewhere else. Mixed Reality = your phone screen
shows your real workplace, with the digital twin drawn on top of it. No
goggles. Just hold up the phone like you're filming a video — except the
video has glowing arrows and instructions baked in.

### The EON ancestor: Murrer

We did this years ago in a tool called **Murrer**. The user picked three
points on the real object, three matching points on the digital twin, and
Murrer scaled the twin to fit. It worked — but it was fiddly. Today's
phones do all of that automatically: ARKit (Apple) and ARCore (Google)
constantly scan the room with depth sensors and build an invisible 3D mesh
of the space. We just need a starting signal — a QR code or a printed
picture — and the phone takes it from there. **No three points to pick. No
calibration. Point and go.**

### The killer demo (your conference table, today)

We do not need a real pump for the demo. We already have the **printed
P-204 poster** from the magnet board demo we ship with today. That poster
is rich enough in detail (pipes, labels, arrows) that ARKit and ARCore can
treat it as an **image target**: point the phone, the phone recognizes the
poster, and the 3D Pump Skid P-204 twin rises **out of the paper at true
scale**, standing on the table, fully interactive. Walk around it.
Annotations point at components. Kill the Wi-Fi mid-demo — everything keeps
working because the procedure was downloaded to the phone before the demo
started.

The poster you already use for 1.0 verification is the launch prop for 2.0.

### Three faces, one brain

The single thing to keep in your head:

```
                  ONE BRAIN
       (the procedure: 12 steps + verification rules)
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     PHONE AR       GLASSES HUD     DASHBOARD
   (the worker)   (worker's eyes)  (the trainer)
```

The brain (the procedure state machine, the AI photo verification, the
audit log) is **unchanged** from 1.0. We're adding a **third face** —
phone AR. That's the whole project.

### What 2.0 changes for the worker

| Today (1.0) | Tomorrow (2.0) |
|---|---|
| "Find the red switch on the disconnect" | A glowing arrow on the actual red switch |
| Picture of an idealized pump on the phone | The actual pump, with the twin glued on top |
| Internet glitches = next step delayed | Procedure pre-downloaded; works offline |
| 3D model is a refresher with no link to reality | 3D model IS reality, plus extra layers |

### What 2.0 does NOT change

- The AI judge that verifies each photo (Claude Sonnet 4.6).
- The audit log (append-only, tamper-evident, signed PDF at the end).
- The procedure authoring (Ted authors in Genesis, exactly as today).
- The silent vs. proactive guidance modes (same logic).
- The glasses HUD (still just a small text/image card on the lens).

If 1.0 is a worker getting postcards of the machine, 2.0 is the worker
standing inside the postcard.

---

## Part 2 — Technical Specification (for Claude Code)

> **Reader:** the Claude Code session implementing this. Treat this spec as
> read-only requirements; the source of truth for **what's actually wired**
> is the repo at `github.com/DanLejerskar/field-iq-product`. Code beats
> spec on facts. Spec beats code on intent. Ask before deviating.

### 0. The thesis in one sentence

**The `SceneManifest` contract that drives `packages/phone-companion-3d`
today is the wire format for AR mode. AR is a second `ViewerMode` over the
same manifest, not a new pipeline.**

That sentence collapses 80% of the architectural complexity. The same
geometry, components, annotations, and camera the Three.js viewer renders
into a `<canvas>` today, the WebXR viewer renders into world space
tomorrow. Nothing about the Genesis bridge, the import pipeline, the
procedure state machine, or the audit log needs to know about AR.

### 1. What already exists in the repo (do not rebuild)

| Layer | Path | What it gives 2.0 |
|---|---|---|
| Scene contract | `packages/genesis-bridge/src/types.ts` — `SceneManifest`, `ComponentSpec`, `Annotation` | Authoring format for the twin — already procedurally describable, already serializable, already keyed by `(procedureId, stepNumber, deviceKind)`. **This is what AR mode anchors.** |
| Lookup | `packages/genesis-bridge/src/lookup.ts` — `getReferenceFor(procedureId, stepNumber, 'phone')` | Returns the manifest for the current step. AR mode calls the same function. |
| 3D viewer (vanilla) | `packages/phone-companion-3d/src/viewerCore.ts` — `createViewer(canvas, { scene })` | Today: imperative Three.js viewer in a `<canvas>`. 2.0: add a sibling `createARViewer(...)` that consumes the **same `SceneManifest`** but mounts a WebXR session. |
| Preact wrapper | `packages/phone-companion-3d/src/preact.ts` — `<PhoneSessionView>` | Today: viewer with one-finger orbit. 2.0: add `<PhoneSessionARView>` next to it. |
| Procedure brain | `services/backend/*` + `apps/glasses-webapp/src/state.ts` | Step state machine. Untouched. AR mode is just a different renderer for the current step. |
| AI verification | `services/backend/src/workers/claude-verifier.ts` (inline; `USE_MOCK_VERIFIER=false` in prod) | Untouched. The frame the worker captures in AR mode goes to the **same** verifier. |
| Audit log | `services/backend/src/services/audit-log.ts` | Untouched. Photo S3 key + SHA-256 + verdict, append-only. |
| Offline scaffolding | `services/backend/src/db/snapshot-repo.ts` + `procedure_snapshots*` tables (migration `0005`) + the Yogi-pattern `result_outbox` in PR #23 | Snapshot = immutable content-hash-gated frozen view of a procedure version. Already exists. 2.0 reuses it as the unit of the offline procedure package. |

### 2. What does NOT exist yet (the 2.0 deliverables)

1. **AR viewer** — a WebXR build of the `phone-companion-3d` viewer.
2. **Anchoring** — image-target recognition (the printed P-204 poster) + LiDAR/depth mesh tracking after anchor.
3. **Offline procedure package** — a downloadable bundle of one `procedure_snapshot` + all referenced scene manifests + assets.
4. **iOS parity path** — a thin native Expo wrapper that runs ARKit and feeds it to the same Babylon/Three.js layer (because WebXR `immersive-ar` is not supported in iOS Safari and no other iOS browser).
5. **Phone → glasses local rendering** — and this one needs to be done carefully (see §4 — it crosses an architectural invariant).
6. **AR-aware verification frame capture** — when in AR mode, the "step photo" should be the AR composite (real world + twin overlay) so the audit record visually shows the worker acted in the right place.

### 3. Architecture: one brain, three faces (codebase mapping)

```
                       ┌──────────────────────────────┐
                       │       GENESIS (cloud)        │
                       │  Authoring tool. Exports     │
                       │  procedures via the bridge.  │
                       └────────────┬─────────────────┘
                                    │ /api/scenes/<id>/export?format=fieldiq
                                    ▼
                       ┌──────────────────────────────┐
                       │   FIELD IQ BACKEND (cloud)   │
                       │ - Procedure import (PR #23)  │
                       │ - Snapshot store (migr 0005) │
                       │ - Session state machine      │
                       │ - Claude verifier worker     │
                       │ - Audit log (append-only)    │
                       └────────────┬─────────────────┘
                                    │ WebSocket (sessions) + REST (assets, snapshots)
                                    ▼
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
   FACE 1: PHONE             FACE 2: GLASSES              FACE 3: DASHBOARD
   apps/companion (RN)       apps/glasses-webapp          apps/dashboard
   + AR layer (NEW)          (Preact, runs on the         (React, trainer view)
                              Meta Ray-Ban Display HUD)
   ────────────────          ────────────────             ────────────────
   2D viewer (today)         Text + image card             Live session view
   + AR viewer (NEW)         (unchanged in 2.0)            (unchanged in 2.0)
   uses SceneManifest        consumes step images          consumes everything
   from genesis-bridge       from backend                  via dashboard API
```

**Invariant.** The phone and the glasses **do not talk to each other
directly** — both talk to the backend (`CLAUDE.md`: *"The glasses Web App
and the companion app do not talk to each other directly — both talk to
the backend over WebSocket. The backend is the source of truth for session
state."*). The "phone renders for the glasses" idea in the marketing docs
must be implemented as: phone uploads rendered frames to the backend, the
backend pushes them to the glasses via the existing WebSocket — same audit
guarantees as today, no new sidechannel. **Do not bypass the backend.**

### 4. The seven things this spec asserts the codebase forces (open questions resolved)

The marketing spec listed seven open questions ("code wins on facts"). Here
are the answers from the code:

| # | Question | Answer from the repo |
|---|---|---|
| 1 | Two 3D engines (Babylon in Genesis vs. Three.js in `phone-companion-3d`) — which one wins on the phone? | **Three.js wins on the Field IQ phone.** `phone-companion-3d` already ships compiled JS consumed by both React and Preact roots. Babylon stays inside Genesis-the-authoring-tool. We render the twin from the `SceneManifest` Genesis exports, not from Genesis's Babylon runtime. One engine on the phone. |
| 2 | Can the phone push rendered frames directly to the glasses? | **No — must go through the backend.** See §3 invariant. Implementation: phone POSTs the rendered frame to `POST /api/sessions/:id/steps/:n/glasses-frame`; backend pushes it down the existing WebSocket. Audit trail preserved. |
| 3 | Will silent mode work in AR on day one? | **No.** Silent mode requires the glasses camera, which requires the Phase-2 native Meta DAT companion (`apps/companion/src/native/MetaGlassesModule.ts` is mocked today). 2.0 ships **proactive AR only**. Silent AR is Phase 3+. |
| 4 | Image-target tracking on day one — WebXR or native? | **WebXR Image Tracking is flag-gated and unreliable in Chrome Android (June 2026).** Day-one Android path: use **`@mediapipe/tasks-vision` ImageEmbedder + ARCore Geospatial anchor** via a thin custom wrapper, OR ship via a Capacitor wrap of the existing PWA and call ARCore directly. Pure WebXR is Phase 3. iOS path is native ARKit from day one anyway. |
| 5 | Where does the offline procedure package live? | **`apps/companion` (the RN app), backed by `react-native-mmkv` which is already a dep.** Bundle = `procedure_snapshot` JSON + all `SceneManifest`s + `expected_views` images + voice audio. SHA-256 manifest; verify on load; redownload on hash mismatch. |
| 6 | Phone position is known from ARKit/ARCore — can we infer the glasses head pose? | **No, not from the Meta Ray-Ban Display SDK as of June 2026.** Glasses-side image rendering is "per-step canonical viewpoint" — phone renders one camera angle per step from the `SceneManifest.camera` config, not a live head-tracked angle. Honest, ships now, upgradable later if Meta exposes head pose. |
| 7 | Does AR break the audit chain? | **No, if the captured "step photo" is a screenshot of the AR composite (real world + twin overlay) rather than the raw camera frame.** This is a one-line change in `apps/companion`'s capture path and means the audit record visually proves the worker was in the right place. Make this the default in AR mode. |

### 5. Anchoring strategy (locked: no 3-point alignment)

The marketing spec mandates "no 3-point manual alignment." Concretely:

**Day-one anchor cascade (try in order, stop at first success):**

1. **Image target** — printed P-204 poster (or any procedure-bound image
   target registered in Genesis). Gives identity, position, and scale in
   one shot. **This is the killer-demo path.**
2. **QR code with known physical size** — Genesis exports `qr.physicalSizeMm`
   per procedure; the phone reads it and computes pose. Fallback when a
   poster isn't available but a QR sticker is.
3. **Manual placement** — user taps the floor, twin appears at tap point at
   true scale, user rotates with a two-finger gesture. **Demo-only
   fallback; not used in field.** Surface a warning.

**After anchor:** ARKit/ARCore world tracking + depth mesh take over. The
twin stays glued as the worker walks. Real-world objects in front of the
twin correctly occlude it (depth mesh).

**Explicit non-goal:** the Murrer 3-point picker. Do not port. If anchoring
fails, fall back to 1.0 image mode for that step — do not ask the worker to
hand-align.

### 6. Platform matrix

| Surface | Day-one host | AR runtime | Status |
|---|---|---|---|
| Android phone | `apps/companion` (Expo RN) + a WebView hosting the Three.js viewer **OR** a Capacitor wrap | **ARCore** via native module → exposes anchor + camera pose to the JS Three.js viewer | Phase 1 |
| Android rugged tablet | Same as Android phone | Same as Android phone | Phase 1 (Samsung A55 is the reference device) |
| iPhone | `apps/companion` (Expo RN) with a native iOS module wrapping ARKit | **ARKit** via native module → exposes anchor + camera pose to the JS Three.js viewer | Phase 2 |
| iPad | Same as iPhone | Same as iPhone | Phase 2 |
| Meta Ray-Ban Display glasses | `apps/glasses-webapp` (Preact, unchanged) | None — receives pre-rendered images from the backend | Phase 1 (proactive mode); Phase 3 (silent mode) — silent requires the native DAT companion (`apps/companion/src/native/MetaGlassesModule.ts`) which is mocked today |

**Why a thin native module instead of pure WebXR everywhere:** WebXR
`immersive-ar` is unsupported in iOS Safari and Apple has confirmed no
plans to ship it. A two-platform native shim is the smallest-blast-radius
fix. The Three.js viewer stays 100% shared — only camera pose and image
anchor events cross the native bridge.

### 7. Offline procedure package

A "procedure package" is what the worker downloads before walking out.

```
procedure-package-<snapshotId>.zip
├── manifest.json              # snapshot id, version, sha256s
├── snapshot.json              # the procedure_snapshot row from migration 0005
├── scenes/
│   ├── step-01.json           # SceneManifest for step 1
│   ├── step-02.json           # ...
├── images/
│   ├── step-01.webp           # rendered expected_views from Genesis
│   ├── step-02.webp
├── audio/
│   ├── step-01.opus           # voice guidance, if authored
└── markers/
    └── p-204-poster.png       # image target source (high-res)
```

- **Where it's stored on device:** `react-native-mmkv` for manifest + small
  JSON; expo-file-system for binary assets.
- **When it's downloaded:** at session start, on Wi-Fi, with a progress
  bar. Worker cannot start AR mode until the package is on-device.
- **Integrity check:** SHA-256 per asset; refuse to start if any hash
  mismatches.
- **Update strategy:** snapshots are immutable + content-hashed (already true
  via migration 0005). New procedure version = new snapshot id = fresh
  download. No partial updates.
- **Verification photos captured offline:** queue via the existing
  `result_outbox` pattern (ported in PR #23). When connectivity returns,
  worker stays at "Verifying step N" until Claude responds; meanwhile they
  can proceed visually in AR. The audit chain catches up async.

### 8. AR-mode capture (the audit-preserving frame)

Today in 1.0, the captured step photo is the raw camera frame. In AR mode:

- **Default:** captured photo = AR composite (camera frame + rendered twin
  overlay + active annotations), at the exact moment the worker taps
  capture.
- **Why:** the audit record then **visually proves** the worker was looking
  at the right component in the right pose. A skeptical OSHA auditor can
  see the green arrow on the photographed switch.
- **Implementation:** Three.js render-to-texture composite over the camera
  frame; export as JPEG; existing `verify` upload path consumes it unchanged.
- **Claude verifier:** unchanged. We do not tell Claude "this is an AR
  composite" — the existing `expected_outcome` prompt language handles it.
  (If acceptance falls, revisit.)
- **Edge case:** if the worker explicitly requests "no overlay" (settings
  toggle), capture the raw frame. Tag the audit row with `captureMode:
  'raw' | 'composite'`. New nullable column on `audit_log`.

### 9. Phases, with code-grounded acceptance criteria

#### Phase 1 — Android proactive AR + killer demo + offline (target: 6–8 weeks)

**Acceptance criteria (each must demo green):**

- [ ] Open `apps/companion` on Samsung A55, point at the printed P-204 poster, the Pump Skid P-204 twin rises out of it at true scale and stays glued as you walk around the table.
- [ ] Step 1 of P-204 shows a glowing arrow on the **actual** BR204 component (not in a void).
- [ ] Proactive mode advances through all 12 P-204 steps with the twin anchored throughout; AR composite photos appear in the audit log with the overlay visible.
- [ ] Wi-Fi off, airplane mode on: all 12 steps still guide; verification queues; chain reconciles on reconnect.
- [ ] Procedure package size for P-204 is ≤ 20 MB (excluding voice audio).
- [ ] Phone-rendered glasses snapshots: with `apps/companion` paired to a Meta Ray-Ban Display device, each step's HUD image arrives within 1.5s of the phone advancing the step. Route is `POST /api/sessions/:id/steps/:n/glasses-frame` → backend WebSocket push.

#### Phase 2 — iOS parity (target: 4 weeks after Phase 1 ships)

- [ ] Same 12-step P-204 demo runs on an iPhone 15 Pro and iPad Pro via the native ARKit module.
- [ ] No Three.js code is forked — only the native anchor/pose module differs from Android.
- [ ] iPhone offline mode passes the Phase 1 acceptance suite.

#### Phase 3 — markerless tracking + silent AR (target: TBD; post-pilot)

- [ ] **Markerless model-based tracking:** the phone recognizes the physical pump from its CAD shape without a poster or QR. Likely path: Vuforia Model Targets or Apple Object Capture, both licensed.
- [ ] **Silent AR:** glasses camera (via DAT companion) provides the frame stream; AI judges in the background and only interrupts on deviation. Requires the native Meta module currently mocked at `apps/companion/src/native/MetaGlassesModule.ts`.

### 10. The codebase invariants 2.0 must not break

These come from `CLAUDE.md` and the existing PR history. Treat as
non-negotiable; if a 2.0 design needs to violate one, escalate to Dan
before writing code.

1. **No phone ↔ glasses direct channel.** Route through backend.
2. **No Claude calls from Node.** All AI calls go through `services/verifier/` (or the inline worker that calls Anthropic with `USE_MOCK_VERIFIER=false`). The AR viewer never calls Anthropic directly.
3. **Audit log is append-only.** New `captureMode` column = ADD a column, do not mutate writes. Go through `AuditLogService.append()`.
4. **No paraphrasing the 12 P-204 verification prompts.** AR mode does not change verification — the prompts that came out of the poster+magnet demo (PR #21) and Ted's overnight authoring are what the AI judges against. Verbatim.
5. **No photos in Postgres.** The AR composite photo goes to S3/MinIO; only the key + SHA-256 land in `audit_log`. (S3 is currently disabled on Railway — composite photos upload as base64 data URIs same as 1.0 photos until S3 is re-enabled.)
6. **TypeScript strict, no `any` without `// @reason:`.**

### 11. Target file tree (where the new code goes)

```
packages/
└── phone-companion-3d/
    └── src/
        ├── viewerCore.ts        # EXISTS — vanilla Three.js
        ├── viewerCoreAR.ts      # NEW — WebXR/native-anchor variant
        ├── arBridge/
        │   ├── android.ts       # NEW — ARCore pose stream consumer
        │   ├── ios.ts           # NEW — ARKit pose stream consumer
        │   └── types.ts         # NEW — AnchorEvent, CameraPose, etc.
        ├── preact.ts            # EXISTS — adds <PhoneSessionARView>
        └── react.ts             # EXISTS — adds <ARViewer> for dashboard preview

apps/
└── companion/
    ├── src/
    │   ├── native/
    │   │   ├── ARAnchorModule.android.ts   # NEW — ARCore native module
    │   │   ├── ARAnchorModule.ios.ts       # NEW — ARKit native module
    │   │   └── MetaGlassesModule.ts        # EXISTS (mocked)
    │   ├── ar/
    │   │   ├── ARSessionScreen.tsx         # NEW — the AR mode screen
    │   │   ├── PackageDownloader.ts        # NEW — offline package fetch
    │   │   └── CompositeCapture.ts         # NEW — AR composite → upload
    │   └── state/
    │       └── arSession.ts                # NEW — Zustand store for AR

services/
└── backend/
    └── src/
        ├── routes/
        │   ├── procedure-packages.ts       # NEW — GET /api/procedures/:id/package
        │   └── sessions.ts                 # EXISTS — adds /steps/:n/glasses-frame
        └── db/
            └── migrations/
                └── 0006_audit_capture_mode.ts  # NEW — captureMode column
```

### 12. Out of scope for 2.0 (explicitly)

- Multi-user shared AR (two workers seeing the same twin) — Phase 4.
- 3D persistent annotations the worker draws on the twin — Phase 4.
- Hand tracking, gesture input — defer.
- Voice commands inside AR mode — reuse existing voice layer if it works; do not build new.
- AR on the dashboard (trainer flying through the worker's world) — Phase 4.
- Photo-based equipment recognition (the marketing 1.0 description) — does not exist in 1.0 either; do not add to fix the marketing.

### 13. Pre-launch risk list

| Risk | Mitigation |
|---|---|
| Apple ships WebXR support and we overbuild the native iOS module | Module is thin (~200 LOC, pose + anchor only). Cost of rip-out is low. |
| ARCore image tracking misses the printed poster on stage | Cascade to QR fallback (poster has a QR corner). Test with stage lighting before launch. |
| Procedure package > 50 MB on complex skids | Compress textures, drop voice for v1, lazy-load per step on Wi-Fi. |
| Audit fails OSHA review because Claude can't read composite frames | Pilot it on P-204 first; if Claude accuracy drops > 5%, add a `captureMode: 'both'` mode that captures raw and composite, sends raw to Claude, archives both. |
| Meta DAT companion slips → glasses 2.0 features delayed | Spec already gates silent AR + direct phone→glasses on the DAT companion; nothing in Phase 1 depends on it. |

### 14. The hand-off

This spec is buildable as-is. The minimum first PR I would open:

> **PR title:** `feat(phone-companion-3d): viewerCoreAR scaffolding + AnchorEvent contract`
>
> **Scope:** add `viewerCoreAR.ts` next to `viewerCore.ts`, consuming the
> existing `SceneManifest`. Mock the anchor source so the viewer can be
> developed against a fake pose stream (anchor at origin, identity
> rotation). Add `<PhoneSessionARView>` in `preact.ts` rendering it inside
> the existing glasses-webapp route layer, gated behind `?ar=1`. No native
> modules yet; no procedure package yet. Just: same `SceneManifest`, new
> renderer, same React tree.
>
> **Why this PR first:** it proves the thesis (§0) — that AR is a viewer
> mode, not a pipeline. Everything else is downstream of that proof.

After that PR merges, the Phase 1 plan in §9 is the build order.

---

### Appendix A — What changed vs. the marketing docs

The deck, white paper, and press release describe 2.0 in pure intent
terms. This spec keeps **all** of the intent but corrects three facts
where marketing got ahead of the code:

1. **"Phone renders for the glasses, no cloud in the loop"** → corrected to
   "phone renders, posts to backend, backend pushes to glasses." Same
   latency budget; preserves audit invariants. (§3, §4.2)
2. **"Silent mode in 1.0 today"** → silent mode is Phase 2+ (native DAT
   companion). 1.0 today is proactive only with phone camera, no glasses
   camera. (§4.3)
3. **"WebXR image tracking — one-day feature"** → realistic Phase 1
   anchor path is ARCore image targets via a thin native module on
   Android, ARKit via native module on iOS. Pure WebXR is Phase 3+. (§4.4, §6)

None of these change the demo, the press story, or the strategic claim.
They change which Claude-Code PR ships in which week.

### Appendix B — Glossary (for cross-team reading)

- **Mobile Reality** — Dan's term for what 1.0 has: 3D twin on the phone, no link to physical world.
- **Mixed Reality** — what 2.0 adds: twin glued to physical world via AR.
- **Image target** — a printed image (poster, drawing) that AR frameworks can track in 6DoF.
- **6DoF** — six degrees of freedom: x, y, z, pitch, yaw, roll. Full pose.
- **Anchor** — a pose in world space that AR keeps stable as you move.
- **SceneManifest** — Field IQ's internal scene description format (`packages/genesis-bridge/src/types.ts`). The wire format Genesis exports and `phone-companion-3d` renders.
- **Snapshot** — an immutable, content-hashed frozen version of a procedure (`procedure_snapshots` table, migration 0005).
- **Procedure package** — a snapshot + all its assets, downloaded to the phone for offline use.
- **Proactive mode** — system tells the worker what to do, then verifies.
- **Silent mode** — system watches; only intervenes on deviation. Phase 2+.
- **DAT companion** — `apps/companion`'s native Meta Wearables module. Mocked today; required for silent mode and any direct glasses-camera access.
