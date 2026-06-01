# Phase 2E — Verifier auto-deploy (≈ 3 minutes, browser only, one click)

What flips on at the end:

- A GitHub Actions workflow (`railway-verifier-deploy`) that talks to Railway's
  GraphQL API on Claude Code's behalf. From now on, Claude Code drives all
  verifier-side Railway config; no more UI clicks, no more browser-console
  snippets.
- The verifier service gets the four real env vars copied over from the
  backend, every spurious placeholder gets purged, and the service redeploys.
- `USE_MOCK_VERIFIER=false` on the backend (optional, on by default).

---

## Step 1 — Generate a Railway API token · 1 min

1. Open <https://railway.com/account/tokens> (or Railway → click your avatar
   top-right → **Account Settings** → **Tokens**).
2. **Create New Token** → name it `field-iq-github-actions`. Leave workspace
   selection as your default (no project restriction needed).
3. Copy the token. It's shown only once.

---

## Step 2 — Add the token as a GitHub repo secret · 1 min

1. Open <https://github.com/DanLejerskar/field-iq-product/settings/secrets/actions>.
2. **New repository secret** →
   - **Name:** `RAILWAY_TOKEN`
   - **Secret:** paste the token from Step 1.
3. Click **Add secret**.

That's the only click. The token is encrypted at rest, only readable by
workflows, and never echoed in logs (the workflow redacts every value to
`(len=N, prefix="abcdefgh", suffix="wxyz")` before printing).

---

## Step 3 — Reply "secret added" in chat · 5 s

Claude Code takes it from here:

1. Pushes a tiny no-op edit to `.github/workflows/railway-verifier-deploy.yml`
   to trigger the workflow.
2. Watches the workflow run via the GitHub MCP tools.
3. Reads the workflow's PR comment for the full output (reconciliation log +
   verifier deployment status + last 50 log lines).
4. Pings `https://field-iqbackend-production.up.railway.app/health` to confirm
   `{ok:true, db:true, redis:true}` still holds.
5. Reports back with status + first 30 log lines.

If everything's green, you can immediately do the Phase 2D Step 7 round-trip:
open the glasses-webapp, sign in as Maya, click **Start LOTO session**, upload
any photo, watch Carlos's dashboard tab show the real Claude verdict in
10–15 s.

---

## What the workflow does

| Step | Action                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Resolve project (`fe454816-…`) + backend / verifier service IDs + production environment via GraphQL.                                                                                                               |
| 2    | Read every env var on both services.                                                                                                                                                                                |
| 3    | Sanity-check the backend's four critical vars (`DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`). Abort loudly if any are missing / `<placeholder>` / literal `"@field-iq/backend"` / < 5 chars. |
| 4    | Upsert those four values + `VERIFIER_MOCK=false` on the verifier service.                                                                                                                                           |
| 5    | Delete every other env var on the verifier (purges the auto-import junk).                                                                                                                                           |
| 6    | Re-read verifier vars and assert all five keepers are present.                                                                                                                                                      |
| 7    | Trigger a verifier redeploy (`serviceInstanceRedeploy`, fallback `serviceInstanceDeployV2`).                                                                                                                        |
| 8    | Poll latest deployment for `SUCCESS` / `FAILED` / `CRASHED` (max 5 min).                                                                                                                                            |
| 9    | Tail last 50 runtime log lines (build logs if runtime is empty).                                                                                                                                                    |
| 10   | Optionally flip backend `USE_MOCK_VERIFIER=false` and redeploy backend. Controlled by `flip_backend_to_real_verifier` workflow input (default `true`).                                                              |

Idempotent: running the workflow twice in a row is a no-op on the second run
(same upserts, nothing to delete, redeploy still triggers but completes fast).

---

## How to re-trigger later (Claude Code's job, not yours)

Three ways:

- **From the GitHub Actions UI** (your fallback if Claude Code is unavailable):
  <https://github.com/DanLejerskar/field-iq-product/actions/workflows/railway-verifier-deploy.yml>
  → **Run workflow** → leave defaults → **Run workflow**.
- **From Claude Code's sandbox** (no `gh` CLI installed): Claude Code edits
  `.github/workflows/railway-verifier-deploy.yml` (or
  `.github/scripts/railway-verifier-reconcile.sh`) via the GitHub MCP. The
  `on: push: paths:` filter picks up the change and runs the workflow.
- **From a local terminal** (not part of your workflow): `gh workflow run
railway-verifier-deploy.yml -R DanLejerskar/field-iq-product`.

---

## Out of scope for Phase 2E

- Real email transport (Resend / Postmark) — Phase 2F.
- PDF reporter re-deploy (was removed in Phase 2B) — Phase 2F.
- R2 / S3 photo storage migration — Phase 2F.
- Token rotation / proper session expiry — Phase 2F.
- Workflows for other Railway services (backend, future reporter) — same
  pattern can be extended when needed; defer until there's a second case.
