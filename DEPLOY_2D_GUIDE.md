# Phase 2D — Sign-in UI + Python verifier (≈ 15 minutes, browser only)

What flips on at the end:

- **Sign-in UI** on the dashboard and glasses-webapp so you can actually log
  in through the browser. Magic links land on a `#/auth/verify?token=…` route
  that auto-fires the verify call and parks the JWT in `localStorage`.
- **Python verifier** running on Railway, draining the `verify-queue` Redis
  Stream, calling **Claude Sonnet 4.6** on real photos.
- A real LOTO session round-trips end-to-end: Maya signs in on the
  glasses-webapp, starts a session, uploads a photo, Claude grades it, Carlos
  sees the verdict on the dashboard within ~10 s.

> You only need a browser. **No terminal commands.**

---

## Step 1 — Merge this PR · 1 min

Railway auto-deploys the backend on push to `main`. Wait for the new deploy
to turn green and `/health` to come back `{"ok":true,"db":true,"redis":true}`.

---

## Step 2 — Add the new env vars to the backend · 1 min

Railway → backend service → **Variables** → add the two below. Without them
magic-link emails fall back to `http://localhost:3001 / 3002`, which is fine
for `pnpm dev` but breaks the deployed flow.

| Variable           | Value                                                |
| ------------------ | ---------------------------------------------------- |
| `DASHBOARD_ORIGIN` | `https://field-iq-product-dashboard.vercel.app`      |
| `GLASSES_ORIGIN`   | `https://field-iq-product-glasses-webapp.vercel.app` |

Railway redeploys automatically (~30 s).

---

## Step 3 — Create the verifier service on Railway · 4 min

> Phase 2B's deploy guide assumed Railway would auto-discover the verifier
> from the second `railway.json`. In practice you have to add it as a
> sibling service yourself — that's what we're doing here.

1. Railway → your **field-iq-product** project → top-right **+ Create →
   GitHub Repo → `DanLejerskar/field-iq-product`**.
2. After Railway clones the repo it'll guess one of the services. Open the
   newly-created service → **Settings**:
   - **Service name** → rename to `field-iq-verifier`.
   - **Source → Root Directory** → leave at `/` (repo root). The Dockerfile
     uses repo-root-relative paths (`COPY services/verifier/...`).
   - **Build → Builder** → `Dockerfile`.
   - **Build → Dockerfile path** → `services/verifier/Dockerfile`.
   - **Deploy → Start command** → leave blank; the Dockerfile's `CMD`
     (`python -m verifier.worker`) is correct.
3. **Variables** → add (Railway has a _"+ Add Reference"_ button that copies
   values straight from the backend service):

   | Variable            | Value                                        |
   | ------------------- | -------------------------------------------- |
   | `DATABASE_URL`      | reference from backend (same Neon string)    |
   | `REDIS_URL`         | reference from backend (same Upstash string) |
   | `ANTHROPIC_API_KEY` | reference from backend                       |
   | `ANTHROPIC_MODEL`   | `claude-sonnet-4-6`                          |
   | `VERIFIER_MOCK`     | `false`                                      |

4. Wait for the deploy. **Logs** should show:

   ```
   Claude Sonnet 4.6 verifier ready (model=claude-sonnet-4-6, queue=verify-queue, group=verifier)
   ```

   If you see `verifier starting in MOCK mode (no Claude calls)`, double-check
   `VERIFIER_MOCK=false` and that `ANTHROPIC_API_KEY` is non-empty.

> **If the verifier crashes:** check the Logs tab for the exception. Typical
> issues — `DATABASE_URL` pointing at the Neon pooler URL, missing
> `ANTHROPIC_API_KEY`, `VERIFIER_MOCK` still `true`. You can also flip the
> backend's `USE_MOCK_VERIFIER` env var back to `true` to keep the rest of
> the system working while you debug.

---

## Step 4 — Flip the backend to live verification · 30 s

Railway → backend → **Variables** → set `USE_MOCK_VERIFIER=false`. Backend
redeploys.

`/health` should still return `{"ok":true,"db":true,"redis":true}`. The
backend's in-process mock verifier stops; the Python verifier on the sibling
service now picks up every job.

---

## Step 5 — Sign in as Carlos (dashboard) · 2 min

1. Open `https://field-iq-product-dashboard.vercel.app`. You should see the
   **Sign in to EON Field IQ** card (instead of the old "Connecting to
   backend …" banner).
2. Email is prefilled with `carlos.romero@eonreality.com`. Click **Send
   magic link**. A green "Check your email (or the Railway backend logs)"
   notice appears.
3. Railway → backend service → **Logs** → search for `magic-link issued`.
   You'll see a line like:

   ```
   magic-link issued  email="carlos.romero@eonreality.com"  link="https://field-iq-product-dashboard.vercel.app/#/auth/verify?token=eyJ…"
   ```

   **Option A:** click the `link` URL directly — you'll be redirected to the
   dashboard, the AuthGate verifies the token automatically, and you land
   signed in.

   **Option B:** copy just the `token=` value (everything after `token=`) and
   paste it into the **"Or paste the magic-link token"** textarea on the
   sign-in card → **Sign in with token**.

4. You should now see the live dashboard with Carlos's name in the top-right
   and a green **● open** connection chip in the KPI strip.

---

## Step 6 — Sign in as Maya (glasses-webapp) · 2 min

1. Open `https://field-iq-product-glasses-webapp.vercel.app`. You'll see the
   "Missing access token" gate with a **Sign in manually (browser testing)**
   button underneath. Click it.
2. Email is prefilled with `maya.wu@eonreality.com`. Click **Send magic
   link**, then grab the magic-link URL from Railway logs (same shape as
   Step 5, but pointed at the `glasses-webapp.vercel.app` origin thanks to
   `GLASSES_ORIGIN`). Click or paste.
3. You'll land on the glasses-webapp signed in, with a **Start LOTO
   session** button.

---

## Step 7 — Round-trip a verification · 2 min

1. On the glasses-webapp (signed in as Maya), click **Start LOTO session**.
   The page reloads with `?session=<id>` and shows step 1 ("Notify Affected
   Personnel").
2. Click the **● PHOTO** button. Pick any photo from disk (any image is
   fine — Claude will judge it for real).
3. The HUD switches to _Claude is reviewing your photo…_ within a second.
4. **Within ~10 s** you should see either ✅ verified or ⚠ retry depending
   on what Claude makes of the image.
5. On the **dashboard** (signed in as Carlos in another tab), the session
   appears in the sidebar with the same verdict and a real timestamp.

The verifier service Logs will show one of:

```
verdict ack  entry=1748…-0  step=1
```

per acknowledged job. Multiple lines = multiple steps.

---

## What changed in code

| Change                                                   | Why                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/dashboard/src/auth/{auth.ts, …}`                   | New magic-link helpers + `AuthGate` + sign-in card. localStorage key `field_iq_jwt`.                                                 |
| `apps/glasses-webapp/src/{auth.ts, SignIn.tsx, app.tsx}` | Parallel sign-in fallback that lives under the existing "Missing access token" gate.                                                 |
| `services/backend/src/routes/auth.ts`                    | Magic-link URL is now built from `DASHBOARD_ORIGIN` / `GLASSES_ORIGIN` and lands on `#/auth/verify?token=…`. JWT TTL bumped to 30 d. |
| `services/verifier/Dockerfile`                           | Two-step `uv sync` so the editable `field-iq-verifier` install actually finds its src tree.                                          |
| `<input type="file">` in the glasses HUD                 | Minimum-viable photo capture for browser testing — the companion app's camera flow remains the production path.                      |

---

## Out of scope for Phase 2D

- **Real email transport (Resend / Postmark).** Magic links still log to
  Railway only. Phase 2E.
- **Drag-and-drop / camera-preview photo UX.** The `<input type="file">` is
  the v1 affordance.
- **PDF reporter re-deploy** (was removed in 2B). Phase 2E.
- **R2 / S3 photo storage migration.** Photos still inline in
  `audit_log.photo_url` as `data:image/...;base64,…`. Phase 2E.
- **Token refresh / proper session expiry.** v1 stores a 30-day JWT in
  localStorage; rotation is later.
