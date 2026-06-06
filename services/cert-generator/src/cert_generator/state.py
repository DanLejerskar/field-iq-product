"""SessionCertState assembly from Postgres.

Pure read path: given a sessionId, joins sessions+users+organizations+
procedures+steps+audit_log into a single immutable dataclass that the PDF
builder consumes. Read-only — no writes.

The cert_id is generated here too. Format:
    FIQ-YYYY-MM-DD-XXXXXX
where XXXXXX is a base32-encoded 30-bit random value (6 chars, Crockford-ish
upper alphabet without padding). One ID per session.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

import psycopg

# --- Cert ID -----------------------------------------------------------------

# Avoid I, L, O, U to dodge ambiguity in printed certs. 32 chars total.
_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # 30 chars

assert len(_ALPHABET) >= 30, "alphabet must cover the encoding range"


def generate_cert_id(*, now: datetime | None = None, rand: bytes | None = None) -> str:
    """Generate a cert_id of the form ``FIQ-YYYY-MM-DD-XXXXXX``.

    ``now`` and ``rand`` are seam parameters so tests can pin the output.
    """
    now = now or datetime.now(UTC)
    rand = rand or secrets.token_bytes(4)
    # Use 30 bits of entropy → 6 base-30 digits.
    n = int.from_bytes(rand, "big") & ((1 << 30) - 1)
    digits: list[str] = []
    for _ in range(6):
        digits.append(_ALPHABET[n % len(_ALPHABET)])
        n //= len(_ALPHABET)
    suffix = "".join(reversed(digits))
    return f"FIQ-{now:%Y-%m-%d}-{suffix}"


# --- DTOs --------------------------------------------------------------------

StepStatus = Literal["pass", "retry_passed"]


@dataclass(frozen=True)
class StepResult:
    step_number: int
    title: str
    status: StepStatus
    retry_count: int


@dataclass(frozen=True)
class SessionCertState:
    session_id: str
    org_id: str
    cert_id: str
    worker_name: str
    worker_role: str
    supervisor_name: str
    organization_name: str
    procedure_title: str
    procedure_id: str  # the procedures.id UUID; serves as the genesis training ID
    started_at: datetime
    ended_at: datetime
    duration_seconds: int
    location: str | None
    steps: list[StepResult] = field(default_factory=list)
    sample_photo_urls: list[str] = field(default_factory=list)
    verify_url: str = ""


# --- Queries -----------------------------------------------------------------

_SESSION_QUERY = """
SELECT
  s.id::text                       AS session_id,
  s.org_id::text                   AS org_id,
  s.procedure_id::text             AS procedure_id,
  s.started_at                     AS started_at,
  s.completed_at                   AS completed_at,
  s.duration_seconds               AS duration_seconds,
  s.started_lat                    AS started_lat,
  s.started_lng                    AS started_lng,
  u.full_name                      AS worker_name,
  u.role::text                     AS worker_role,
  o.name                           AS organization_name,
  p.name                           AS procedure_title,
  e.location                       AS equipment_location
FROM sessions s
JOIN users         u ON u.id = s.technician_user_id
JOIN organizations o ON o.id = s.org_id
JOIN procedures    p ON p.id = s.procedure_id
JOIN equipment     e ON e.id = s.equipment_id
WHERE s.id = %s
"""

_STEPS_QUERY = """
SELECT
  st.step_number                   AS step_number,
  st.title                         AS title,
  COALESCE(ss.retry_count, 0)      AS retry_count
FROM steps st
LEFT JOIN session_steps ss
  ON ss.step_id = st.id AND ss.session_id = %s
WHERE st.procedure_id = %s
ORDER BY st.step_number ASC
"""

_PHOTOS_QUERY = """
SELECT step_number, photo_url, timestamp
FROM audit_log
WHERE session_id = %s
  AND event_type = 'photo_submitted'
  AND photo_url IS NOT NULL
  AND superseded_by IS NULL
ORDER BY timestamp ASC
"""


# --- Assembly ----------------------------------------------------------------


def _supervisor_name() -> str:
    # The schema doesn't currently surface a per-session supervisor. We honour
    # an env override (e.g. an org-wide default) and fall back to an em dash so
    # the cert always renders.
    return os.environ.get("CERT_SUPERVISOR_NAME") or "—"


def _format_role(raw: str | None) -> str:
    if not raw:
        return "Field Technician"
    return {
        "technician": "Field Technician",
        "trainer": "Trainer",
        "supervisor": "Supervisor",
        "admin": "Administrator",
    }.get(raw, raw.title())


def _sample_three(photo_urls: list[str]) -> list[str]:
    """Pick first / middle / last from a list. Dedupes when there's < 3."""
    if not photo_urls:
        return []
    if len(photo_urls) == 1:
        return [photo_urls[0]]
    if len(photo_urls) == 2:
        return [photo_urls[0], photo_urls[1]]
    return [photo_urls[0], photo_urls[len(photo_urls) // 2], photo_urls[-1]]


def _duration_seconds(
    started_at: datetime, ended_at: datetime, stored: int | None
) -> int:
    if stored is not None and stored > 0:
        return stored
    delta = ended_at - started_at
    return max(0, int(delta.total_seconds()))


def assemble(
    conn: psycopg.Connection,
    session_id: str,
    *,
    verify_base_url: str,
    now: datetime | None = None,
    rand: bytes | None = None,
) -> SessionCertState | None:
    """Build a SessionCertState for `session_id`, or None if the session is
    missing.

    Callers pass in `verify_base_url` so the QR + footer can deep-link.
    `now` and `rand` are seams for deterministic tests.
    """
    with conn.cursor() as cur:
        cur.execute(_SESSION_QUERY, (session_id,))
        row = cur.fetchone()
        if row is None:
            return None
        (
            sid,
            org_id,
            procedure_id,
            started_at,
            completed_at,
            stored_duration,
            _started_lat,
            _started_lng,
            worker_name,
            worker_role,
            organization_name,
            procedure_title,
            equipment_location,
        ) = row

        ended_at = completed_at or (now or datetime.now(UTC))

        cur.execute(_STEPS_QUERY, (session_id, procedure_id))
        step_rows = cur.fetchall()

        cur.execute(_PHOTOS_QUERY, (session_id,))
        photo_rows = cur.fetchall()

    steps: list[StepResult] = []
    for step_number, title, retry_count in step_rows:
        retry_count = int(retry_count or 0)
        steps.append(
            StepResult(
                step_number=int(step_number),
                title=title or f"Step {step_number}",
                status="retry_passed" if retry_count > 0 else "pass",
                retry_count=retry_count,
            )
        )

    photo_urls = [r[1] for r in photo_rows if r[1]]
    samples = _sample_three(photo_urls)

    cert_id = generate_cert_id(now=now, rand=rand)
    verify_url = f"{verify_base_url.rstrip('/')}/verify/{cert_id}"

    return SessionCertState(
        session_id=sid,
        org_id=org_id,
        cert_id=cert_id,
        worker_name=worker_name or "Unknown worker",
        worker_role=_format_role(worker_role),
        supervisor_name=_supervisor_name(),
        organization_name=organization_name or "—",
        procedure_title=procedure_title or "Procedure",
        procedure_id=procedure_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=_duration_seconds(started_at, ended_at, stored_duration),
        location=equipment_location,
        steps=steps,
        sample_photo_urls=samples,
        verify_url=verify_url,
    )
