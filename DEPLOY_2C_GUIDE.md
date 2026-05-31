# Phase 2C — Fix the backend (≈ 10 minutes, browser only)

`DEPLOY_2B_GUIDE.md` got Dan to Railway. The deploy went green but `/health`
came back `{"ok":false,"db":false,"redis":false}` with no clue why — both
checks were caught silently. Phase 2C makes `/health` and the boot log say
exactly what's broken, hardens the Postgres/Redis clients against the
specific Neon + Upstash gotchas, and adds a browser-triggerable migrate
endpoint so Dan can run migrations without `RUN_MIGRATIONS_ON_BOOT=true`
(which was blocking Railway's healthcheck loop).

> You only need a browser. **No terminal commands.**

---

## Step 1 — Merge this PR · 1 min

Railway auto-deploys on push to `main`. Wait for the new deploy to turn green.

---

## Step 2 — Read the boot env audit · 30 s

Railway → backend service → **Logs**. Look for these lines right after
`backend listening on …`:

```
--- env audit (boot) ---
DATABASE_URL: present (length=170, prefix="postgres", suffix="bind")
REDIS_URL: present (length=137, prefix="rediss:/", suffix="6379")
JWT_SIGNING_SECRET: present (length=64, prefix="field-iq", suffix="WxAy")
REPORT_SIGNING_KEY: present (length=64, prefix="field-iq", suffix="lEgI")
ANTHROPIC_API_KEY: present (length=108, prefix="sk-ant-a", suffix="iAAA")
USE_MOCK_VERIFIER: present (length=4, prefix="true", suffix="")
RUN_MIGRATIONS_ON_BOOT: present (length=5, prefix="false", suffix="")
SEED_ON_BOOT: MISSING
NODE_ENV: present (length=10, prefix="productio", suffix="tion")
PORT: present (length=4, prefix="8080", suffix="")
ADMIN_SETUP_TOKEN: MISSING   <-- this is the one to fix next
--- end env audit ---
```

If any of `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`,
`REPORT_SIGNING_KEY` say **MISSING** or **PLACEHOLDER**, fix that in
Railway → Variables before going further. (The values are never logged in
full — only length + first 8 / last 4 chars.)

---

## Step 3 — Read the new `/health` body · 30 s

Open `https://field-iqbackend-production.up.railway.app/health` in the
browser. The body now includes the actual error message when something
fails:

```json
{
  "ok": false,
  "db": false,
  "redis": false,
  "dbError": "Error: ...",
  "redisError": "Error: ..."
}
```

The two most likely shapes:

| `dbError` / `redisError`                                         | Means                                                          | Fix                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Error: timeout`                                                 | Client never connected (network blocked or TLS handshake hang) | The Phase 2C TLS hardening (explicit `ssl: 'require'` + `tls: {}`) should already fix it on its own. |
| `Error: getaddrinfo ENOTFOUND ...`                               | Hostname typo                                                  | Re-paste the URL in Railway Variables.                                                               |
| `Error: SASL ... channel_binding ...`                            | postgres-js didn't understand `channel_binding=require`        | Phase 2C strips that flag automatically — this should be gone after redeploy.                        |
| `Error: WRONGPASS`                                               | Upstash credentials wrong                                      | Re-paste the Redis URL in Variables.                                                                 |
| `Error: connect ECONNREFUSED 127.0.0.1:5432` or `127.0.0.1:6379` | Env var literally missing on the container                     | Variables tab on the **backend** (not the verifier) — confirm it's there.                            |

Paste the exact `dbError` / `redisError` strings back to Cowork if anything
unexpected shows up.

---

## Step 4 — Run migrations from the browser · 2 min

In Phase 2B we used `RUN_MIGRATIONS_ON_BOOT=true` on the first deploy, but
that hung the healthcheck loop on cold-start. Phase 2C adds a one-shot
admin route.

1. Railway → backend → **Variables** → add:

   | Variable            | Value                                              |
   | ------------------- | -------------------------------------------------- |
   | `ADMIN_SETUP_TOKEN` | click **Generate** in Railway (or any 32-byte hex) |

2. Wait ~30 s for the redeploy.

3. From any browser (DevTools console, Postman, Hoppscotch, …):

   ```js
   fetch('https://field-iqbackend-production.up.railway.app/api/admin/migrate?seed=true', {
     method: 'POST',
     headers: { 'X-Admin-Setup-Token': '<paste the token>' },
   })
     .then((r) => r.json())
     .then(console.log);
   ```

   Expected response: `{ "ok": true, "seedRan": true, "durationMs": 1234 }`.

4. Re-hit `/health`. It should now return `{"ok": true, "db": true, "redis": true}`.

5. (Optional) Remove `ADMIN_SETUP_TOKEN` from Railway Variables once
   migrations are in place. The route returns 404 when the token isn't
   set, so leaving it removed locks the door behind you.

---

## Step 5 — End-to-end verification · 1 min

1. **Magic-link sign-in.** The dashboard's sign-in page (or any browser):

   ```js
   fetch('https://field-iqbackend-production.up.railway.app/api/auth/magic-link/request', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email: 'maya.wu@eonreality.com' }),
   });
   ```

   That should now return **204 No Content** (not 500 like before).

2. Railway → backend → **Logs** → search for `magic-link issued`. Copy the
   `link` URL from the log line, paste into the browser → you're signed in
   as Maya.

3. Open the dashboard URL. The top bar's connection chip turns green; the
   "Connecting to backend …" banner from Phase 2A disappears once the WS
   opens.

If anything errors at this point, the Railway log line for that request
will now contain the actual error (the `req.log.error(...)` calls in /health
land in the per-request log).

---

## What changed in code

| Change                                                           | Why                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/health` returns `dbError`/`redisError`                         | The whole reason 2B was opaque — silent `catch {}`. Now you see the failure mode in one browser hit. Timeout bumped 2 s → 5 s. |
| Boot-time env audit                                              | Redacted (`length + first 8 / last 4 chars`) so the log proves which vars Railway injected.                                    |
| Postgres `ssl: 'require'` explicit + `channel_binding` stripped  | Removes URL-parsing ambiguity across postgres-js versions; lets Neon's SCRAM-SHA-256 auth succeed.                             |
| Redis explicit `tls: {}` for `rediss://` + `connectTimeout: 10s` | Belt-and-braces on Upstash's TLS scheme; fails fast on network blockage.                                                       |
| `POST /api/admin/migrate` route                                  | Run migrations from any browser, no Railway shell, no `RUN_MIGRATIONS_ON_BOOT` healthcheck-killing loop.                       |

---

## Out of scope for Phase 2C

- Python verifier deployment → Phase 2D.
- Real email transport (Resend / Postmark) → Phase 2D or later.
- Photo storage migration to R2 → Phase 2E.

## When you're done

`/health` should return:

```json
{ "ok": true, "db": true, "redis": true }
```

and the dashboard URL with `VITE_MOCK_MODE=false` shows the **● open**
connection chip. Then **Phase 2D** wires the Python verifier so real
Claude Sonnet 4.6 grades the photos.
