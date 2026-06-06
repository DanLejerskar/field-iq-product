"""SessionState fetch from Postgres.

The monitor needs just enough context to ask Claude: current procedure +
step, the last few verdicts, the most recent dialogue transcript (if any),
and "how long has it been silent." Read-only — no writes.

Functions are sync (psycopg's classic API); the worker calls them via
loop.run_in_executor so the asyncio loop stays responsive.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import psycopg

# Pull active session row + its current step. Steps live in the `steps`
# table, keyed off `sessions.current_step_id`. The schema brand
# `verificationPrompt` is stored as `verification_prompt`.
_SESSION_QUERY = """
SELECT
  s.org_id::text         AS org_id,
  s.procedure_id::text   AS procedure_id,
  st."order"             AS step_order,
  st.title               AS step_title,
  st.verification_prompt AS verification_prompt
FROM sessions s
LEFT JOIN steps st ON st.id = s.current_step_id
WHERE s.id = %s
  AND s.status = 'active'
LIMIT 1
"""

# Recent audit log rows, newest first. We slice this two ways: last 3 verdicts
# (event_type in {verified, retry, failed}) and the most recent transcript
# (event_type = 'note' carries dialogue transcripts in `detail`).
_AUDIT_QUERY = """
SELECT
  step_number,
  event_type::text AS event_type,
  message,
  detail,
  timestamp
FROM audit_log
WHERE session_id = %s
  AND superseded_by IS NULL
ORDER BY timestamp DESC
LIMIT 25
"""

_VERDICT_EVENTS = {"verified", "retry", "failed", "error"}


@dataclass(frozen=True)
class SessionState:
    session_id: str
    org_id: str
    procedure_id: str
    current_step_number: int
    current_step_title: str
    current_step_verification_prompt: str
    recent_verdicts: list[dict[str, Any]] = field(default_factory=list)
    last_transcript: str | None = None
    seconds_since_last_audit: float = 0.0
    last_severity: str | None = None


def _now_utc() -> datetime:
    return datetime.now(UTC)


def fetch_state(
    conn: psycopg.Connection,
    session_id: str,
    *,
    last_severity: str | None = None,
    now: datetime | None = None,
) -> SessionState | None:
    """Build a SessionState for `session_id`, or None if the session isn't active.

    `last_severity` comes from the throttle store — we don't persist it in
    Postgres.
    """
    now = now or _now_utc()
    with conn.cursor() as cur:
        cur.execute(_SESSION_QUERY, (session_id,))
        row = cur.fetchone()
        if row is None:
            return None
        org_id, procedure_id, step_order, step_title, verification_prompt = row

        cur.execute(_AUDIT_QUERY, (session_id,))
        rows = cur.fetchall()

    verdicts: list[dict[str, Any]] = []
    last_transcript: str | None = None
    last_ts: datetime | None = None

    for step_number, event_type, message, detail, ts in rows:
        if last_ts is None and ts is not None:
            last_ts = ts
        if event_type in _VERDICT_EVENTS and len(verdicts) < 3:
            verdicts.append(
                {
                    "step_number": step_number,
                    "outcome": event_type,
                    "verdict_text": (message or detail or "").strip(),
                    "at": ts.isoformat() if ts is not None else "",
                }
            )
        elif event_type == "note" and last_transcript is None and detail:
            last_transcript = detail.strip()

    # Reverse verdicts so they read oldest-first when handed to the prompt.
    verdicts.reverse()

    seconds_since = 0.0
    if last_ts is not None:
        # Postgres returns aware timestamps when the column is `timestamptz`.
        delta = now - last_ts
        seconds_since = max(0.0, delta.total_seconds())

    return SessionState(
        session_id=session_id,
        org_id=org_id,
        procedure_id=procedure_id,
        current_step_number=int(step_order or 0),
        current_step_title=step_title or "",
        current_step_verification_prompt=verification_prompt or "",
        recent_verdicts=verdicts,
        last_transcript=last_transcript,
        seconds_since_last_audit=seconds_since,
        last_severity=last_severity,
    )
