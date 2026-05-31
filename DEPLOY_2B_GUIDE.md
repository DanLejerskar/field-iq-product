# Phase 2B — Real Backend (≈ 15 minutes, browser only)

What flips on at the end:

- A live **Fastify backend** on Railway, talking to a real **Neon Postgres** and **Upstash Redis**.
- A live **Python verifier** on Railway, calling real **Claude Sonnet 4.6**
  on real photos.
- The Vercel **dashboard** and **glasses-webapp** projects from Phase 2A,
  re-deployed with `VITE_MOCK_MODE=false` so they talk to the real backend
  instead of the in-memory mock.

> You only need a browser. **No terminal commands.**

---

## Step 1 — Sign up for Neon (Postgres) · 1 min

1. Open <https://neon.tech> → **Sign in with GitHub**.
2. **Create a project** → name it **`field-iq-product`**, region near you.
3. On the success screen, copy the **Connection string** (looks like
   `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`).
   **Save it** — you'll paste it into Railway twice.

---

## Step 2 — Sign up for Upstash (Redis) · 1 min

1. Open <https://upstash.com> → **Sign in with GitHub**.
2. **Create Database** → Redis → free tier, region near you.
3. On the database page, copy the **Redis URL** (the
   `redis://default:PASSWORD@HOST.upstash.io:6379` form, _not_ the REST URL).
   **Save it.**

---

## Step 3 — Get an Anthropic API key · 1 min

1. Open <https://console.anthropic.com> → sign in with the account on the
   EON enterprise tier.
2. **Settings → API Keys → Create Key** → name it **`field-iq-prod`**.
3. Copy the key (`sk-ant-…`). **Save it.**

---

## Step 4 — Deploy to Railway · 5 min

1. Open <https://railway.app> → **Sign in with GitHub**.
2. **New Project → Deploy from GitHub Repo → `field-iq-product`**.
3. Railway will scan the repo. It finds two services thanks to the
   `services/backend/railway.json` and `services/verifier/railway.json`:
   - **field-iq-backend** (Node + Fastify, Dockerfile at `services/backend/Dockerfile`)
   - **field-iq-verifier** (Python + uv, Dockerfile at `services/verifier/Dockerfile`)

   If Railway shows only one service, click **+ New → GitHub Repo → same repo**
   and set the **Root Directory** for the new service to either
   `services/backend` or `services/verifier`.

4. **Set variables on the backend service.** Click the backend → **Variables**
   → paste each line one at a time:

   | Variable                 | Value                                                         |
   | ------------------------ | ------------------------------------------------------------- |
   | `DATABASE_URL`           | Neon connection string from Step 1                            |
   | `REDIS_URL`              | Upstash Redis URL from Step 2                                 |
   | `JWT_SIGNING_SECRET`     | click **Generate** in Railway (or paste any 32-byte hex)      |
   | `REPORT_SIGNING_KEY`     | click **Generate**                                            |
   | `USE_MOCK_VERIFIER`      | `false`                                                       |
   | `RUN_MIGRATIONS_ON_BOOT` | `true` _(for the very first deploy — see Step 6 to turn off)_ |
   | `SEED_ON_BOOT`           | `true` _(first deploy only)_                                  |

5. **Set variables on the verifier service.** Click the verifier → **Variables**:

   | Variable            | Value                                  |
   | ------------------- | -------------------------------------- |
   | `DATABASE_URL`      | same Neon string as the backend        |
   | `REDIS_URL`         | same Upstash URL as the backend        |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` from Step 3                 |
   | `VERIFIER_MOCK`     | `false`                                |
   | `ANTHROPIC_MODEL`   | `claude-sonnet-4-6` _(or leave unset)_ |

6. Both services should turn **green** in ~3 min. You'll see Railway redeploy
   the backend a second time after the first boot finishes — that's expected
   when migrations + seed land. **Once both are green:**
   - Click the **backend** service → **Settings → Networking → Generate
     Public Domain**. Save the `https://field-iq-backend-XXX.up.railway.app`
     URL.
   - Go back to the backend's **Variables** page and **flip these two
     back to `false`** (you don't want migrations + seed re-running on
     every restart):
     - `RUN_MIGRATIONS_ON_BOOT` = `false`
     - `SEED_ON_BOOT` = `false`

7. Confirm health: open `https://<backend>.up.railway.app/health` in the
   browser. You should see `{"ok":true,"db":true,"redis":true}`.

---

## Step 5 — Wire the Vercel frontends to the real backend · 3 min

For **both** Vercel projects (`field-iq-product-dashboard` and
`field-iq-product-glasses-webapp`):

1. Open <https://vercel.com> → click the project.
2. **Settings → Environment Variables** → add:

   | Variable         | Value                              |
   | ---------------- | ---------------------------------- |
   | `VITE_API_URL`   | `https://<backend>.up.railway.app` |
   | `VITE_MOCK_MODE` | `false`                            |

3. **Deployments** → top-right kebab on the latest deploy → **Redeploy**.

Repeat for the second project. Total time: ~3 minutes.

---

## Step 6 — Verify · 1 min

1. Open the dashboard URL. The top bar should show "Connecting to backend
   at https://…" briefly, then the connection chip turns green. The
   "DEMO" badge from Phase 2A is gone (because `VITE_MOCK_MODE=false`).
2. The Live Sessions list is **empty** — no demo session is running anymore.
   That's correct.
3. To exercise the real Claude verifier, create a session by hand from the
   admin sandbox, or run the Phase 2B smoke test (see `tests/e2e/specs/phase_2b_real_backend.spec.ts`):

   ```
   # On a Mac with the repo checked out
   PHASE_2B_BACKEND_URL=https://<backend>.up.railway.app \
   pnpm --filter @field-iq/e2e exec playwright test phase_2b_real_backend
   ```

   The smoke test creates a session, submits a 1×1 placeholder photo, and
   asserts a real Claude verdict comes back within 15 seconds.

---

## Photo size — the only limit you'll hit

Phase 2B stores verification photos **as data URIs in
`audit_log.photo_url`** (no S3 / R2 yet). Server-side cap: **1 MB per photo**.
Submitting anything bigger returns a 400 with a clear message.

That covers all the placeholder + glasses-camera JPEGs we use today. When the
trainer-bay rollout starts and people start sending real high-res photos, the
fix is one env var on the backend (`PHOTO_SIZE_LIMIT_BYTES`) plus a Phase 2C
deploy of Cloudflare R2. **`TODO(2c)` markers in the codebase** already
mark the four spots that change.

---

## Magic-link login in production

The backend's email transport defaults to **`console`** — it logs the
magic link to Railway's log stream rather than emailing it. That's fine
for the first sign-ins. To read a link:

1. Railway → backend service → **Logs**.
2. Search for `magic-link issued`.
3. Copy the URL from the log line, paste into your browser to complete
   sign-in.

Phase 2C wires a real email provider (Resend or Postmark) via the
`EMAIL_API_KEY` + `EMAIL_TRANSPORT=resend` env vars.

---

## When something goes wrong

| Symptom                                             | Likely cause                                    | Fix                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway backend stays red                           | Migrations failed (DB URL wrong) or build error | Check **Logs** on the backend service. Most common: typo in `DATABASE_URL`. Fix it in **Variables**, click **Redeploy**.                                                                                  |
| `/health` returns `{ok: false, db: false}`          | Neon connection rejected                        | Verify the Neon connection string ends with `?sslmode=require`. Re-paste in Railway Variables.                                                                                                            |
| Verifier logs "ANTHROPIC_API_KEY is required"       | Key not set on the verifier service             | Check **Variables** on the **verifier** (not the backend). `ANTHROPIC_API_KEY` lives only there.                                                                                                          |
| Dashboard banner stays "Connecting to backend at …" | CORS rejected the Vercel origin                 | Backend allow-list covers `https://field-iq-{product-,}dashboard.vercel.app` + any `*.vercel.app`. If you renamed the project, add `ALLOWED_ORIGINS=https://your-custom.vercel.app` to backend Variables. |
| Photo upload returns 400 "Photo too large"          | Photo > 1 MB (v1 cap)                           | Resize on the client or wait for Phase 2C R2 swap.                                                                                                                                                        |
| Claude verdict takes > 10 s                         | Anthropic Vision tail latency                   | Expected for some images. The smoke test gives 15 s. Don't tune.                                                                                                                                          |

---

## Done

When `https://<backend>.up.railway.app/health` returns `ok: true` for both
db + redis, **and** the dashboard URL with `VITE_MOCK_MODE=false` shows
the "● open" connection chip, Phase 2B is live. Paste both URLs back to
Cowork.

Phase 2C from here: Cloudflare R2 for photos, Resend for email, the PDF
reporter on a third Railway service, and the React Native companion's
TestFlight + Firebase distribution.
