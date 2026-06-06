# `@field-iq/dashboard`

Trainer dashboard + admin authoring UI. React 19 + Vite + TanStack Query.

## Scope landed in this commit (M8 step 1)

- Vite + React scaffold with the FIELD_IQ_PRODUCT_SPEC §5 colour tokens
- **Live Sessions** page (`/`):
  - left rail: list of org-scoped sessions polled every 5 s via TanStack Query
  - selected session detail (status, start time) — full live step strip + photo
    feed + coach notes land in the next chunk
  - KPI strip in the top bar (active / completed / total)
- Pure live-feed reducer (`src/state/feed.ts`) covering hydrate, append, replay
  dedupe by `eventId`, status flip on session.completed/abandoned, and a 20-event
  cap — 5 unit tests.
- Thin REST client around the M3 backend; JWT pulled from `localStorage.jwt`
  (real login flow lands in a later chunk).

## Coming in subsequent M8 chunks

- WebSocket subscription to `org:<orgId>:sessions` for sub-2-s updates
- 10-dot step strip + live photo feed + coach notes (autosave to audit_log)
- Session history with filters + bulk export
- Admin CRUD (equipment / procedures / steps) + prompt sandbox

## Dev

```bash
pnpm --filter @field-iq/dashboard dev    # http://localhost:3002
```

`VITE_API_HOST` / `VITE_WS_HOST` override the backend; default `http://localhost:3000`.

## Sign-in (Prompt #10)

The sign-in card calls `POST /api/auth/request-link`. With no
`RESEND_API_KEY` configured the backend logs the magic-link URL via Pino —
copy the URL out of the Railway/dev logs and open it; the backend
302-redirects back here with `#/auth/verify?session=<jwt>` and the
AuthGate hydrates user/org via `GET /api/auth/me`.

Fast lab iteration: set `DEMO_AUTH_ENABLED=true` in the backend env. The
sign-in card then renders a second form that accepts the stateless paste
token, and the `admin@eon.ai` / `Demo1234!` shortcut endpoint becomes
available (no UI for the password — call it directly during smoke tests).
With the flag off (the prod default) both paths return 404.
