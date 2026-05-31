# Phase 2A — Deploy the demo (5 minutes, browser only)

Two clickable URLs at the end:

- **Trainer dashboard** — Carlos's live view of a fake 10-step LOTO session.
- **Glasses screen** — Maya's HUD, mirroring the same session.

Both run **entirely standalone**: no backend, no database, no Anthropic key,
no environment variables. The in-memory mock timeline drives a realistic
~90-second LOTO session that auto-restarts on every page load.

> You only need a browser. No terminal commands.

---

## Step 1 — Deploy the trainer dashboard

1. Open <https://vercel.com> and sign in with your GitHub account.
2. Click **Add New… → Project**.
3. Find **`field-iq-product`** in the list and click **Import**.
4. On the _Configure Project_ page:
   - **Framework Preset:** select **Vite**.
   - **Root Directory:** click **Edit** and set it to **`apps/dashboard`**.
     Vercel will read `apps/dashboard/vercel.json` and pre-fill the build
     command for you — leave those defaults.
   - **Project Name:** change to **`field-iq-dashboard`** (so the URL becomes
     `https://field-iq-dashboard.vercel.app`).
5. Click **Deploy**. Wait ~60 seconds for the first build.
6. Vercel shows **Congratulations!** with the URL. **Save it** — that's the
   trainer dashboard.

### Optional — protect with a password

After the first successful deploy:

1. Project page → **Settings → Deployment Protection → Vercel
   Authentication** → toggle **On**.
2. Anyone hitting the URL is bounced to Vercel SSO first. To share with
   non-Vercel viewers, use **Password Protection** instead and set a shared
   password.

---

## Step 2 — Deploy the glasses screen

Same drill, second project:

1. Back at <https://vercel.com> → **Add New… → Project**.
2. Find **`field-iq-product`** again and click **Import**.
3. On _Configure Project_:
   - **Framework Preset:** **Vite**.
   - **Root Directory:** set to **`apps/glasses-webapp`**.
   - **Project Name:** **`field-iq-glasses`** (URL becomes
     `https://field-iq-glasses.vercel.app`).
4. Click **Deploy**. ~30 seconds — the bundle is tiny (~13 KB gzipped).
5. **Save the URL.**

### Optional — protect with a password

Same flow as Step 1 — Project Settings → Deployment Protection.

---

## What you'll see

### Dashboard (URL #1)

- Left rail: one active session — **"Maya Wu · DAC #811"**.
- Top bar: KPI strip ticking with the session status.
- Click the session → **Session Detail** opens:
  - 10-dot step strip lighting up green as Claude verifies each step.
  - A live feed of verdict cards with the verbatim Claude messages
    ("Gloves and safety glasses both visible.", "Disconnect handle in OPEN
    position.", …).
  - Step 5 briefly flashes **amber** with a retry message
    (_"Handle position unclear — retake with the OFF label visible."_),
    then resolves green.
  - The coach-notes panel on the right works — typing + clicking
    **Save note** appends to the audit feed.
- After ~90 s the session reaches **complete**. Refresh the page to restart.

### Glasses screen (URL #2)

- Single 600×600 HUD card. Same ~90-second timeline.
- All 6 card states appear over the run:
  **pending → processing → verified** for steps 1–4 and 6–10, plus a
  **retry** flash on step 5 and **complete** at the end.
- The right-edge indicator changes colour per state and pulses while
  processing.
- Keyboard shortcuts still work for screenshots: **Enter** simulates a
  pinch, **Esc** the cancel, arrows the swipes.

---

## When something looks wrong

| Symptom                                   | Likely cause                              | Fix                                                                                          |
| ----------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Build fails with "No matching projects"   | Root Directory not set                    | Re-import the project; set Root Directory to `apps/dashboard` or `apps/glasses-webapp`.      |
| Page loads but the session never moves    | JS disabled in the browser                | Re-enable JS (Vercel + the demo are 100% client-side).                                       |
| Dashboard shows "Loading…" forever        | A stale browser cache                     | Hard refresh (⌘⇧R / Ctrl-F5).                                                                |
| The Vercel URL prompts for a Vercel login | Deployment Protection is on (the default) | Either sign into Vercel, or turn protection off / switch to Password Protection in Settings. |

---

## What's next (Phase 2B, not now)

Phase 2A is **demo only**. The real backend — Fastify API, Python verifier,
Postgres, Redis, S3, the PDF reporter — is what Phase 2B brings online. When
that ships, the same two Vercel projects will be redeployed with
`VITE_MOCK_MODE=false` + `VITE_API_HOST` / `VITE_WS_HOST` pointing at the
hosted backend, and the demo will become the real product.
