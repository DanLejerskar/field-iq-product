# Overnight Brief for Ted — Genesis P-204 → Field IQ → Dan's phone by morning

**Written:** 2026-06-10 late evening (Dan's time) — Dan is asleep; do not wait on him.
**Goal for when Dan wakes up:** Mats's P-204 model, authored as a Genesis procedure, is
**imported into the live Field IQ backend** and runnable end-to-end on Dan's **phone**
(all steps visible, photo verification working against the printed P-204 board).
Glasses-side work is Dan's own checklist — nothing for you there.

---

## 1. Where everything is (access + URLs)

| Thing | Where | Notes |
|---|---|---|
| Live backend | `https://field-iqbackend-production.up.railway.app` | Railway, auto-deploys from `main` (~2 min after merge) |
| Glasses/phone web app | `https://field-iq-product-glasses-webapp.vercel.app` | Vercel, auto-deploys from `main` |
| Dashboard | Vercel project `field-iq-product-dashboard` | same repo, `apps/dashboard` |
| Genesis (prod) | `https://eon-genesis-3.onrender.com` | Render service `eon-genesis-3` |
| Repo | `github.com/DanLejerskar/field-iq-product`, branch `main` | this doc lives in `docs/` |

**Secrets — never commit values; read them from the hosting dashboards:**

- Railway → backend service → **Variables**: `ADMIN_SETUP_TOKEN` (gates the admin
  setup/probe routes), `FIELDIQ_M2M_SECRET` (shared with Genesis), `GENESIS_BASE_URL`
  (already set to the Render URL), `DEMO_BYPASS_KEY` (the demo sign-in side door),
  `ANTHROPIC_API_KEY`, `USE_MOCK_VERIFIER=false` (real Claude Vision is LIVE).
- Render → `eon-genesis-3` → **Environment**: `FIELDIQ_M2M_SECRET` (eye icon reveals;
  must equal Railway's copy — it already does, verified live today).
- All of these are demo-grade and flagged for rotation before any real customer launch.

---

## 2. What already works (verified live today — don't rebuild)

1. **Genesis M2M bridge is live.** `GET /api/admin/genesis-ping?projectId=<id>` on the
   Railway backend (header `X-Admin-Setup-Token`) round-trips to Genesis in ~2s.
   Verified with project `e760db92-771d-438a-bfde-78907178fd4f` ("Pad-Mounted
   Transformer Pre-Energization…", v3.0, 10 steps, 11 components,
   `stepsWithRenderedImages: 0`). Route: `services/backend/src/routes/admin.ts`.
2. **The import engine is merged (PR #23).** `services/backend/src/genesis/*` +
   `services/backend/src/services/procedure-import.ts` + `src/db/snapshot-repo.ts`.
   `importProcedureSnapshot(export)` builds an immutable, content-hash-gated snapshot
   into `procedure_snapshots[_steps|_exemplars]` (migration `0005`, already applied in
   prod via `/api/admin/migrate`). 29 ported tests green; backend suite at 184.
3. **Real Claude Vision verification is ON in prod** (`USE_MOCK_VERIFIER=false`,
   inline worker `src/workers/claude-verifier.ts`). Photos upload from the web app as
   base64 data URIs (S3 disabled on Railway — that's intentional, v1).
4. **The phone flow already works** with the *seeded* P-204: open
   `https://field-iqbackend-production.up.railway.app/api/auth/demo-bypass?key=<DEMO_BYPASS_KEY>&app=glasses`
   in Safari → auto-signed in → "Start LOTO session" → 12 steps → "● PHOTO" opens the
   camera → Claude verdicts come back over WebSocket. Seeded prompts are tuned for the
   **printed P-204 poster + magnet board** (PR #21).
5. **The web app is installed on Dan's physical glasses** (today's milestone) via the
   Meta Web Apps deeplink. Dan finishes glasses Wi-Fi himself.

---

## 3. THE GAP — what you need to build tonight, in order

### A. Genesis side: author + publish the P-204 project (you know Genesis best)

- Create/publish a Genesis project for **Pump Skid P-204** using **Mats's new 3D model**
  (he finished the P-204 SKU model today — it should be in Genesis/your asset store).
- Author the procedure steps to mirror the seeded 12-step P-204 flow
  (`services/backend/seed/p204_acceptance.ts` is the reference: NOTIFY → IDENTIFY SKID →
  SHUTDOWN → IDENTIFY/LOCKOUT electrical BR204 → valve V204 → pneumatic PN204 →
  HASP → PERSONAL LOCK + TAG → VERIFY ZERO ENERGY).
- Configure per-step `camera_config` and make sure the export produces **rendered
  `expected_views` images** — today's probe shows `stepsWithRenderedImages: 0`, which
  means no exemplar renders are coming through yet. That's the #1 Genesis-side gap.
- Confirm `GET {GENESIS_BASE_URL}/api/scenes/<newProjectId>/export?format=fieldiq`
  returns it (wire contract: `services/backend/src/genesis/export-contract.ts`; a real
  captured example sits in `src/genesis/__fixtures__/fieldiq-export-loto.json`).
- **Write the new `projectId` down** — everything below takes it as input.

### B. Backend: add the import trigger route (engine exists, trigger doesn't)

PR #23 deliberately landed "the engine, not the trigger." Add to
`services/backend/src/routes/admin.ts`, mirroring `genesis-ping`'s token gate:

```
POST /api/admin/genesis-import?projectId=<id>
  header X-Admin-Setup-Token: <ADMIN_SETUP_TOKEN>
  → fetchFieldIqExport(projectId)           // src/genesis/genesis-client.ts
  → importProcedureSnapshot(export)         // src/services/procedure-import.ts
  → returns { status, snapshotId, version, exemplarsCopied, exemplarsSkipped }
```

Skip the exemplar copier for tonight (S3 is disabled on Railway; the import still
persists steps + compiled prompts and reports `exemplarsSkipped` — fine for v1).

### C. Backend: materialize the snapshot into the live tables ← **the critical missing piece**

Sessions do **not** run off snapshots. They run off `equipment` / `procedures` / `steps`
(see `src/db/schema.ts`). Tonight's import must end with rows in those tables or Dan's
phone shows nothing new. Write a materializer (either inside the import route behind
`?materialize=true`, or a second route) that:

1. Upserts an `equipment` row for P-204 under Dan's org — copy the natural-key upsert
   pattern from `seed/index.ts` (equipment upserts by unique `qrCodeValue`; use a new
   value like `GENESIS-P204` so you never collide with the seeded `EQ-P204` demo row).
2. Inserts a `procedures` row (`equipmentId`, `name`, `version` = snapshot version,
   `totalSteps`).
3. Inserts `steps` rows mapped from `procedure_snapshot_steps`:
   `stepNumber`, `title`, `description → instruction`,
   `verificationPrompt` (already compiled by `compile-prompt.ts`),
   `expectedStateText → successCriteria`, first rendered exemplar URL →
   `referenceImageUrl` (if A produced any), `interactionType==='voice_ack'` →
   `verificationRequired=false`.

**⚠️ Demo-safety trap:** the glasses/phone "Start LOTO session" button picks the
**newest** equipment (`ORDER BY createdAt DESC` in `/api/admin/equipment` — changed in
PR #18). The moment you materialize, the Genesis-imported procedure becomes Dan's
default demo. So: **only materialize once the Genesis prompts are demo-ready** against
the printed poster (compare with the battle-tested prompts in `p204_acceptance.ts`).
If you materialize and regret it: `DELETE /api/admin/equipment/:id` (admin JWT via the
bypass URL) puts the seeded P-204 back on top. **Do not let an untested import be what
Dan demos at his LinkedIn shoot tomorrow.**

### D. Stretch (only if A–C are done and green): 3D model on the phone

- PR **#22** (`claude/digital-twin-model-contract`) is still **open, draft** — optional
  `modelUrl` on SceneManifest + `nodeName` on ComponentSpec + node-mapping helpers in
  `packages/phone-companion-3d`. Review/merge if you want the twin path.
- It needs the Genesis export to carry a hosted GLB URL, an async GLTF loader in
  `phone-companion-3d`, and manifest plumbing in the web app. **Hours, not minutes —
  don't trade A–C for it.** Tomorrow's demo stands without it.

---

## 4. Your test loop (3 AM, nobody to call)

1. Merge to `main` → Railway deploys in ~2 min (watch the Railway deploy log).
2. Probe Genesis: `genesis-ping?projectId=<newProjectId>` → expect `ok: true` and
   `stepsWithRenderedImages > 0` if step A's renders worked.
3. Import: `POST /api/admin/genesis-import?projectId=<id>` → expect
   `status: "imported"`. Run it twice — second call must return `unchanged`
   (content-hash idempotency, already tested in `procedure-import.test.ts`).
4. Materialize, then open the bypass URL (`&app=glasses`) in a browser →
   "Start LOTO session" → confirm the **Genesis-titled** procedure loads with all steps.
5. Photo-verify one step with a P-204 poster photo (Mats has the printables) →
   Claude verdict should come back in ~5–10 s.
6. If anything is on fire, **roll back**: delete the Genesis-imported equipment row
   (step C note) — the seeded P-204 demo is then exactly what Dan already rehearsed.

Leave Dan a status note (Slack/email) when you stop: what's merged, what's imported,
whether you materialized, and which procedure his "Start LOTO session" button will pick.

---

## 5. Dan's own morning checklist (not Ted's)

1. Connect the glasses to Wi-Fi: Meta AI app → ⚙️ → Display 0036 → Wi-Fi.
2. Open **Field IQ** from the glasses app grid (middle-finger+thumb double-tap to wake,
   thumb-slide to the grid, index+thumb pinch to open).
3. Print the P-204 board at scale + the magnet cards (PR #21 build notes).
4. Phone demo: bypass URL → Start LOTO session → place magnet → ● PHOTO → verdict.
