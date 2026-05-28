"""Database access for the verifier: load the step's retry state, apply the verdict
transition, update session_steps, and append the audit_log row in a single transaction.

Mirrors the Node `session-service.recordVerdict` slice — kept narrow to just verdict
application so the API layer remains the source of truth for everything else.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.types.json import Json

from .result import VerificationResult


@dataclass
class VerdictApplication:
    new_status: str  # 'verified' | 'retrying' | 'failed'
    retry_count: int
    step_id: str


def _next_status(verified: bool, retry_count: int, retry_threshold: int) -> tuple[str, int]:
    if verified:
        return "verified", retry_count
    new_retry = retry_count + 1
    return ("failed" if new_retry >= retry_threshold else "retrying"), new_retry


def apply_verdict(
    conn: psycopg.Connection,
    *,
    session_id: str,
    step_number: int,
    result: VerificationResult,
    photo_key: str,
    photo_sha256: str | None,
    claude_response: dict[str, Any] | None,
) -> VerdictApplication:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ss.retry_count, s.retry_threshold, s.id
              FROM session_steps ss
              JOIN steps s ON s.id = ss.step_id
             WHERE ss.session_id = %s AND ss.step_number = %s
            """,
            (session_id, step_number),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(f"No session_step {step_number} for session {session_id}")
        current_retry, retry_threshold, step_id = row

        new_status, new_retry = _next_status(result.verified, current_retry, retry_threshold)

        cur.execute(
            """
            UPDATE session_steps
               SET status = %s,
                   retry_count = %s,
                   completed_at = CASE WHEN %s = 'verified' THEN now() ELSE completed_at END
             WHERE session_id = %s AND step_number = %s
            """,
            (new_status, new_retry, new_status, session_id, step_number),
        )

        event_type = (
            "verified"
            if result.verified
            else "error"
            if new_status == "failed"
            else "retry"
        )

        cur.execute(
            """
            INSERT INTO audit_log
                (session_id, step_id, step_number, event_type, photo_url, photo_sha256,
                 claude_response, verified, confidence, message, detail)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                step_id,
                step_number,
                event_type,
                photo_key,
                photo_sha256,
                Json(claude_response) if claude_response is not None else None,
                result.verified,
                result.confidence,
                result.message,
                result.detail,
            ),
        )

    conn.commit()
    return VerdictApplication(new_status=new_status, retry_count=new_retry, step_id=step_id)
