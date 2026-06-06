"""SafetyMonitor — the brain.

Holds the active-session set, the throttle, and an injected
state-fetcher + Anthropic client. Has two public entry points the worker
calls into:
  - `on_session_event(envelope)`: update active-session bookkeeping.
  - `tick(now)`: walk the active sessions, run keyword + Claude checks,
    publish alerts on hits.

Everything outside `monitor.py` should treat this class as an opaque
orchestrator. Tests pass in fakes for `anthropic_messages`, `redis_pub`,
and `fetch_state` to avoid hitting the real services.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

import structlog

from .bus import SafetyAlert, publish_alert
from .config import Config
from .keyword import hits_critical
from .prompt import SYSTEM_PROMPT, build_user_prompt, parse_response
from .state import SessionState
from .throttle import Throttle

log = structlog.get_logger("monitor")

FetchState = Callable[[str, str | None], Awaitable[SessionState | None]]


class _AnthropicMessagesLike(Protocol):
    async def create(self, **kwargs: Any) -> Any: ...


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _text_from_response(response: Any) -> str:
    """Extract the concatenation of all text content blocks."""
    content = getattr(response, "content", None)
    if content is None and isinstance(response, dict):
        content = response.get("content")
    if not content:
        return ""
    parts: list[str] = []
    for block in content:
        block_type = getattr(block, "type", None)
        if block_type is None and isinstance(block, dict):
            block_type = block.get("type")
        if block_type != "text":
            continue
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            text = block.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts)


class SafetyMonitor:
    def __init__(
        self,
        cfg: Config,
        anthropic_messages: _AnthropicMessagesLike | None,
        redis_pub: Any,
        fetch_state: FetchState,
        throttle: Throttle,
    ) -> None:
        self._cfg = cfg
        self._messages = anthropic_messages
        self._pub = redis_pub
        self._fetch_state = fetch_state
        self._throttle = throttle
        # session_id → org_id, populated from inbound pub/sub envelopes so
        # we don't have to query Postgres on every tick to find sessions.
        self._active_sessions: dict[str, str] = {}

    # --- properties for tests / health checks ---
    @property
    def active_session_ids(self) -> list[str]:
        return list(self._active_sessions.keys())

    # --- pub/sub ingestion ---
    def on_session_event(self, envelope: dict[str, Any], *, now: float | None = None) -> None:
        """Update the active-session set from an inbound session envelope."""
        session_id = envelope.get("sessionId")
        org_id = envelope.get("orgId")
        if not isinstance(session_id, str) or not isinstance(org_id, str):
            return
        event_type = envelope.get("type")
        # Drop the session on terminal events.
        if event_type in {"session.completed", "session.abandoned"}:
            self._active_sessions.pop(session_id, None)
            return
        self._active_sessions[session_id] = org_id
        self._throttle.touch(session_id, time.monotonic() if now is None else now)

    # --- per-tick worker loop ---
    async def tick(self, now: float | None = None) -> int:
        """Run one pass over the active sessions. Returns alerts published."""
        now = time.monotonic() if now is None else now
        alerts = 0
        for session_id in list(self._active_sessions.keys()):
            try:
                published = await self._check_session(session_id, now)
                alerts += published
            except Exception:
                log.exception("session check crashed", session_id=session_id)
                # Mark checked anyway so a broken session doesn't busy-loop us.
                self._throttle.mark_checked(session_id, now)
        culled = self._throttle.cull_inactive(now)
        if culled:
            # Also drop them from our org map.
            still_active = set(self._throttle.active_session_ids())
            for sid in list(self._active_sessions.keys()):
                if sid not in still_active:
                    self._active_sessions.pop(sid, None)
        return alerts

    async def _check_session(self, session_id: str, now: float) -> int:
        if not self._throttle.should_check(session_id, now):
            return 0

        last_severity = self._throttle.last_severity(session_id)
        state = await self._fetch_state(session_id, last_severity)
        # Whether or not we publish, we count this as "checked" so the
        # throttle re-arms.
        self._throttle.mark_checked(session_id, now)
        if state is None:
            return 0

        org_id = state.org_id or self._active_sessions.get(session_id, "")
        if not org_id:
            log.warning("session has no org; skipping", session_id=session_id)
            return 0

        # 1. Critical-keyword fast path — bypass Claude entirely.
        if hits_critical(state.last_transcript):
            alert = SafetyAlert(
                session_id=session_id,
                org_id=org_id,
                severity="critical",
                summary=(
                    "Worker mentioned a life-safety hazard "
                    "(gas/smoke/fire/spark/shock) in the most recent transcript."
                ),
                recommended_action=(
                    "Stop work. Establish voice contact and consider evacuation."
                ),
                detected_by="keyword",
                at=_now_iso(),
            )
            await publish_alert(self._pub, alert)
            self._throttle.mark_alert(session_id, "critical", now)
            log.info(
                "safety alert published",
                session_id=session_id,
                detected_by="keyword",
                severity="critical",
            )
            return 1

        # 2. Claude path. Mock mode or no client → never alerts.
        if self._cfg.use_mock or self._messages is None:
            return 0

        verdict = await self._ask_claude(state)
        if verdict is None or not verdict.get("risk"):
            return 0

        severity = str(verdict["severity"])
        alert = SafetyAlert(
            session_id=session_id,
            org_id=org_id,
            severity=severity,  # type: ignore[arg-type]
            summary=str(verdict["summary"]),
            recommended_action=str(verdict["recommended_action"]),
            detected_by="ai",
            at=_now_iso(),
        )
        await publish_alert(self._pub, alert)
        self._throttle.mark_alert(session_id, severity, now)
        log.info(
            "safety alert published",
            session_id=session_id,
            detected_by="ai",
            severity=severity,
        )
        return 1

    async def _ask_claude(self, state: SessionState) -> dict[str, Any] | None:
        assert self._messages is not None
        user_prompt = build_user_prompt(state)
        try:
            response = await self._messages.create(
                model=self._cfg.anthropic_model,
                max_tokens=400,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": [{"type": "text", "text": user_prompt}]}
                ],
            )
        except Exception:
            log.exception("claude call failed", session_id=state.session_id)
            return None
        text = _text_from_response(response)
        if not text:
            return None
        return parse_response(text)
