# services/safety-monitor

The first proactive AI eye on the floor. A Python worker that watches every
active Field IQ session in real time and publishes `safety_alert` events on
Redis pub/sub when a critical keyword fires or Claude flags an active or
imminent safety risk. The backend's existing WebSocket gateway forwards
those alerts to the dashboard with no routing changes.

Sibling of `services/verifier`. Same Python 3.12 + `uv` + structlog
pattern; same Dockerfile shape; same Railway deploy story.

## What it does

Every base interval (15 s) — or every escalated interval (5 s) once a
session has crossed `severity >= high` — for each active session:

1. **Throttle gate.** Per-session, in-memory. Skip if the interval hasn't elapsed.
2. **State fetch.** Read current step + last 3 verdicts + most recent
   dialogue transcript + seconds-since-last-audit from Postgres.
3. **Keyword fast path.** If the transcript hits `gas`, `smoke`, `fire`,
   `sparks`, `shock`, `burning`, `hurt`, or `pain` as a whole word →
   publish a `critical` alert with `detectedBy: "keyword"` and skip Claude.
4. **Claude path.** Otherwise hand the state to Claude with a tight system
   prompt: *"Is there an active or imminent safety risk? Lean toward
   calling it out — false positives are cheap, false negatives are
   dangerous. Respond with strict JSON only."*
5. **Publish.** Risk alerts emit on `session:<id>` AND `org:<orgId>:sessions`,
   with `type: "safety_alert"` in the envelope. The backend's WS gateway
   forwards on existing channels.

Sessions silent for more than `INACTIVE_SESSION_TTL_S` (5 min) are dropped
from the active set.

## The alert envelope

```json
{
  "eventId": 1717635200000,
  "type": "safety_alert",
  "sessionId": "a1b2c3...",
  "orgId": "d4e5f6...",
  "ts": "2026-06-06T00:00:00+00:00",
  "severity": "critical",
  "summary": "Worker mentioned gas in last transcript.",
  "recommendedAction": "Stop work. Establish voice contact and consider evacuation.",
  "detectedBy": "keyword"
}
```

`detectedBy: "keyword"` indicates the deterministic fast path fired;
`"ai"` means Claude flagged it.

## Environment variables

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | Same Neon string as the backend. Required. |
| `REDIS_URL` | `redis://localhost:6379` | Same Upstash URL as the backend. |
| `ANTHROPIC_API_KEY` | — | Required unless `MONITOR_MOCK=true`. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | |
| `BASE_INTERVAL_S` | `15.0` | Standard tick interval per session. |
| `ESCALATED_INTERVAL_S` | `5.0` | Tick after a `high`/`critical` alert. |
| `INACTIVE_SESSION_TTL_S` | `300.0` | Drop sessions silent for > 5 min. |
| `CONFIDENCE_THRESHOLD` | `0.6` | Reserved — currently we gate on `risk:true` alone. |
| `MONITOR_MOCK` | `true` (when no API key) | Skips Claude calls; keyword path still fires. |

## Local dev

```bash
cd services/safety-monitor
uv sync
# Point at the local docker-compose Redis + Postgres:
MONITOR_MOCK=true \
DATABASE_URL=postgresql://field_iq:field_iq_dev@localhost:5432/field_iq \
REDIS_URL=redis://localhost:6379 \
uv run python -m monitor.worker
```

In mock mode the worker still subscribes, still keyword-checks, and still
publishes — only the Claude call is skipped.

## Tests

```bash
uv run pytest
```

39 tests covering throttle timing, keyword matches (word-boundary aware so
`sparkling` doesn't trigger `sparks`), prompt builder + response parser
(fence stripping, severity validation), and the full monitor loop with a
fake Redis + a stubbed Anthropic client.

## Deployment

Railway service config lives in `railway.json`. Root directory should
stay at `/` (repo root); the Dockerfile uses repo-root-relative
`COPY services/safety-monitor/...` paths just like the verifier. The
Phase 2E `railway-verifier-deploy` workflow can be extended to also
configure this service's env vars — same four: `DATABASE_URL`,
`REDIS_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.

## Out of scope

- New WebSocket routing in the backend. The alerts reuse existing
  `session:*` and `org:*:sessions` channels with `type: "safety_alert"`
  as the discriminator. The dashboard subscriber just needs to handle
  the new type.
- Persistence of alerts to `audit_log`. The backend can append a row
  when it forwards the alert; the monitor stays read-only on Postgres.
- Multi-process scale-out. Throttle is in-memory; a second instance
  would do duplicate work. Add Redis-backed throttle when we need it.
