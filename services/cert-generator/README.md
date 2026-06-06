# services/cert-generator

The Field IQ completion-certificate worker. Subscribes to Redis pub/sub on
`session:*`; on every `session.ended` envelope with `finalOutcome=pass` it
assembles a one-page A4 PDF certificate, uploads it to Supabase Storage (or
local disk in dev), records a row in the `certificates` table, and
publishes a `certificate.ready` event so the dashboard banner updates with
a download link.

Sibling of `services/safety-monitor` — same Python 3.12 + `uv` + structlog
stack; same Dockerfile shape; same Railway deploy story.

## What's on the certificate

Single-page A4 layout, top → bottom:

1. Navy header band — **EON AI VENTURES** left, **FIELD IQ** right.
2. Title: "Lockout/Tagout Procedure Completion Certificate" (or whatever
   the procedure is called).
3. Subtitle: "Issued under OSHA 29 CFR 1910.147".
4. Recipient: worker name + role.
5. Procedure metadata — two columns: title / ID / org / supervisor on the
   left, started / completed / duration / location on the right.
6. Step results — every step in the procedure with retry counts.
7. Photo strip — up to 3 sampled verification photos (first / middle /
   last completed step).
8. QR code + cert ID + verification URL (bottom-right).
9. Grey footer band with the cert ID and verify URL.

Cert ID format: `FIQ-YYYY-MM-DD-XXXXXX`, where `XXXXXX` is six
unambiguous base-30 characters (no `I`, `L`, `O`, `U`, `0`, `1`).

## The contracts

### Incoming — `session.ended`

On Redis channel `session:<sessionId>`:

```json
{
  "type": "session.ended",
  "sessionId": "uuid",
  "orgId": "uuid",
  "finalOutcome": "pass" | "fail" | "incomplete",
  "endedAt": "2026-06-08T14:32:11Z"
}
```

The worker processes only `finalOutcome == "pass"`. Other outcomes are
ignored. The backend's `completeSession` emits this event alongside the
existing `session.completed` so the dashboard's WS subscribers continue to
work unchanged.

### Outgoing — `certificate.ready`

On `session:<sessionId>` AND `org:<orgId>:sessions`:

```json
{
  "eventId": 1717635200000,
  "type": "certificate.ready",
  "sessionId": "uuid",
  "orgId": "uuid",
  "certId": "FIQ-2026-06-08-A7B3X9",
  "certUrl": "https://...",
  "ts": "2026-06-08T14:32:14+00:00"
}
```

### Read API

```
GET /api/sessions/:sessionId/certificate
```

JWT-gated; the worker who ran the session OR a supervisor/trainer/admin in
the same org. Returns:

```ts
{ certId: string; certUrl: string; issuedAt: string }
```

404 if the session is missing or no cert has been generated yet. Generation
is asynchronous, so the dashboard polls or listens to the `certificate.ready`
event.

## Environment variables

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | Same Neon string as the backend. Required. |
| `REDIS_URL` | `redis://localhost:6379` | Same Upstash URL as the backend. |
| `STORAGE_BACKEND` | `local` | `local` or `supabase`. |
| `LOCAL_OUTPUT_DIR` | `./certs` | Used when `STORAGE_BACKEND=local`. |
| `SUPABASE_URL` | — | Required when `STORAGE_BACKEND=supabase`. |
| `SUPABASE_SERVICE_KEY` | — | Required when `STORAGE_BACKEND=supabase`. |
| `SUPABASE_BUCKET` | `certificates` | Storage bucket to upload to. |
| `VERIFY_BASE_URL` | `https://app.fieldiq.io` | Base for the QR + footer URL. |
| `CERT_LOG_FORMAT` | `json` | Set to `console` for human-readable dev logs. |
| `CERT_SUPERVISOR_NAME` | `—` | Override for the supervisor name (until session-level supervisors land). |

## Local dev

```bash
cd services/cert-generator
uv sync
# Point at the local docker-compose Redis + Postgres:
DATABASE_URL=postgresql://field_iq:field_iq_dev@localhost:5432/field_iq \
REDIS_URL=redis://localhost:6379 \
STORAGE_BACKEND=local \
LOCAL_OUTPUT_DIR=./certs \
uv run python -m cert_generator.worker
```

Trigger a cert manually by publishing a fake event:

```bash
docker exec -it field-iq-redis redis-cli PUBLISH session:demo \
  '{"type":"session.ended","sessionId":"<uuid>","orgId":"<uuid>","finalOutcome":"pass","endedAt":"2026-06-08T14:32:11Z"}'
```

The PDF lands in `./certs/<sessionId>.pdf`; a row appears in
`certificates`; the worker logs `certificate issued`.

## Verifying a cert manually

The cert ID + `sha256` of the PDF bytes are persisted in the `certificates`
table. To verify a printed certificate, look up the cert_id and compare the
downloaded PDF's sha256 against `certificates.cert_hash`. The QR encodes
`{VERIFY_BASE_URL}/verify/{cert_id}` — that surface is the dashboard's
job (not built here).

## Tests

```bash
uv run pytest
```

34 tests covering bus envelopes + filter, builder layout + photo embedding +
single-page invariant + step-status text, QR determinism, storage backends
(local + Supabase via injectable transport), cert-id format/alphabet, the
worker happy path and its failure-isolation behaviour.

## Deployment

Railway service config lives in `railway.json`. Root directory should stay
at `/` (repo root); the Dockerfile uses repo-root-relative
`COPY services/cert-generator/...` paths. The Phase 2E
`railway-verifier-deploy` workflow can be extended to also provision this
service's env vars — `DATABASE_URL`, `REDIS_URL`, `STORAGE_BACKEND`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `VERIFY_BASE_URL`.

## Out of scope

- Cryptographic signing of certs. We hash the PDF bytes for tamper
  detection; we don't sign them yet.
- Fail / incomplete outcome certificates. Spec is pass-only for v1.
- Multi-process scale-out. The worker is single-process; the
  `ON CONFLICT (cert_id) DO NOTHING` guard makes a duplicate session.ended
  idempotent, but two workers racing on the same session would still both
  build the PDF.
- The `/verify/<cert_id>` page on the dashboard. The QR encodes the URL;
  the page itself is its own milestone.
