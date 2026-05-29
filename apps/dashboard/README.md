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
