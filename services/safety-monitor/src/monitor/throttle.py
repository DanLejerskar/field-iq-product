"""Per-session rate limiter.

Two intervals:
  - base_interval_s: standard tick rate.
  - escalated_interval_s: used after an alert at severity "high" or
    "critical" — we want to re-check more often when something's going
    wrong.

Sessions silent for > ttl_s are dropped from the active set.

In-memory only; the worker is a single process. If we scale horizontally
later, port this to a Redis sorted set.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ESCALATED_SEVERITIES: frozenset[str] = frozenset({"high", "critical"})

Severity = Literal["low", "medium", "high", "critical"]


@dataclass
class _SessionThrottleState:
    last_check: float | None = None
    last_alert: float | None = None
    last_severity: str | None = None
    last_seen: float = 0.0


class Throttle:
    def __init__(
        self,
        base_interval_s: float,
        escalated_interval_s: float,
        ttl_s: float,
    ) -> None:
        if base_interval_s <= 0 or escalated_interval_s <= 0 or ttl_s <= 0:
            raise ValueError("throttle intervals must be positive")
        self._base = base_interval_s
        self._escalated = escalated_interval_s
        self._ttl = ttl_s
        self._sessions: dict[str, _SessionThrottleState] = {}

    # --- introspection ---
    def __contains__(self, session_id: str) -> bool:
        return session_id in self._sessions

    def active_session_ids(self) -> list[str]:
        return list(self._sessions.keys())

    def last_severity(self, session_id: str) -> str | None:
        s = self._sessions.get(session_id)
        return s.last_severity if s else None

    # --- mutation ---
    def touch(self, session_id: str, now: float) -> None:
        """Mark the session as active in our world (received a pub/sub event)."""
        state = self._sessions.setdefault(session_id, _SessionThrottleState())
        state.last_seen = now

    def mark_checked(self, session_id: str, now: float) -> None:
        # NB: we do NOT bump last_seen here. "Checked" is the monitor's own
        # activity; only fresh pub/sub events from the backend should keep a
        # session in the active set.
        state = self._sessions.setdefault(session_id, _SessionThrottleState())
        state.last_check = now

    def mark_alert(self, session_id: str, severity: str, now: float) -> None:
        # See note on mark_checked: alerts don't keep a session alive either.
        state = self._sessions.setdefault(session_id, _SessionThrottleState())
        state.last_alert = now
        state.last_severity = severity

    def cull_inactive(self, now: float) -> int:
        """Drop sessions whose last_seen is older than ttl. Returns drop count."""
        stale = [sid for sid, s in self._sessions.items() if now - s.last_seen > self._ttl]
        for sid in stale:
            del self._sessions[sid]
        return len(stale)

    # --- decision ---
    def should_check(
        self,
        session_id: str,
        now: float,
        *,
        last_severity: str | None = None,
    ) -> bool:
        """Should the monitor run a fresh check on this session right now?"""
        state = self._sessions.get(session_id)
        if state is None:
            # Never seen — first contact: allow.
            return True
        if state.last_check is None:
            return True
        effective_sev = last_severity if last_severity is not None else state.last_severity
        interval = self._escalated if effective_sev in ESCALATED_SEVERITIES else self._base
        return (now - state.last_check) >= interval
