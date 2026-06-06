"""Integration tests for SafetyMonitor.tick with mocked Anthropic + Redis."""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

import pytest

from monitor.config import Config
from monitor.monitor import SafetyMonitor
from monitor.state import SessionState
from monitor.throttle import Throttle


def _cfg(use_mock: bool = False) -> Config:
    return Config(
        redis_url="redis://localhost",
        database_url="postgresql://localhost/db",
        anthropic_api_key=None if use_mock else "sk-ant-test",
        anthropic_model="claude-sonnet-4-6",
        base_interval_s=15.0,
        escalated_interval_s=5.0,
        inactive_session_ttl_s=300.0,
        confidence_threshold=0.6,
        monitor_mock=use_mock,
    )


def _state(**over: Any) -> SessionState:
    base = SessionState(
        session_id="sess-1",
        org_id="org-1",
        procedure_id="dac811-loto",
        current_step_number=8,
        current_step_title="CLOSE BALL VALVE",
        current_step_verification_prompt="Confirm handle perpendicular.",
        recent_verdicts=[],
        last_transcript=None,
        seconds_since_last_audit=10.0,
        last_severity=None,
    )
    return replace(base, **over)


class FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []

    async def publish(self, channel: str, payload: str) -> None:
        self.published.append((channel, payload))


class FakeMessages:
    """Stand-in for Anthropic's `messages` client.

    Returns scripted text content; records call args. Default reply has
    no-risk so tests that don't override won't accidentally emit alerts.
    """

    def __init__(self, reply_text: str = '{"risk": false}') -> None:
        self.reply_text = reply_text
        self.calls: list[dict[str, Any]] = []
        self.raise_on_call: Exception | None = None

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.raise_on_call is not None:
            raise self.raise_on_call
        return {"content": [{"type": "text", "text": self.reply_text}]}


def _envelope(session_id: str = "sess-1", org_id: str = "org-1", **over: Any) -> dict[str, Any]:
    e = {
        "eventId": 1,
        "type": "session.created",
        "sessionId": session_id,
        "orgId": org_id,
        "ts": "2026-06-05T22:00:00Z",
    }
    e.update(over)
    return e


@pytest.mark.asyncio
async def test_critical_keyword_publishes_without_claude_call():
    fake = FakeRedis()
    messages = FakeMessages()
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state(last_transcript="there's gas in the room")

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    published = await monitor.tick(now=1.0)

    assert published == 1
    assert len(fake.published) == 2  # session: channel + org: channel
    assert messages.calls == []  # never asked Claude
    envelope = json.loads(fake.published[0][1])
    assert envelope["type"] == "safety_alert"
    assert envelope["detectedBy"] == "keyword"
    assert envelope["severity"] == "critical"
    assert "evacuat" in envelope["recommendedAction"].lower()
    # Throttle now in escalated mode for this session.
    assert throttle.last_severity("sess-1") == "critical"


@pytest.mark.asyncio
async def test_claude_path_publishes_high_severity_alert():
    fake = FakeRedis()
    messages = FakeMessages(
        reply_text=json.dumps(
            {
                "risk": True,
                "severity": "high",
                "summary": "Worker silent for 3 min on a safety-gated step.",
                "recommended_action": "Establish voice contact.",
            }
        )
    )
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state(seconds_since_last_audit=180.0)

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    published = await monitor.tick(now=1.0)

    assert published == 1
    assert len(fake.published) == 2
    assert messages.calls and messages.calls[0]["model"] == "claude-sonnet-4-6"
    envelope = json.loads(fake.published[0][1])
    assert envelope["type"] == "safety_alert"
    assert envelope["detectedBy"] == "ai"
    assert envelope["severity"] == "high"
    assert "voice contact" in envelope["recommendedAction"]
    assert throttle.last_severity("sess-1") == "high"


@pytest.mark.asyncio
async def test_claude_no_risk_publishes_nothing():
    fake = FakeRedis()
    messages = FakeMessages(reply_text='{"risk": false}')
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state()

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    published = await monitor.tick(now=1.0)

    assert published == 0
    assert fake.published == []
    assert len(messages.calls) == 1


@pytest.mark.asyncio
async def test_throttle_blocks_second_tick_within_base_interval():
    fake = FakeRedis()
    messages = FakeMessages(reply_text='{"risk": false}')
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state()

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    await monitor.tick(now=0.0)
    await monitor.tick(now=1.0)
    assert len(messages.calls) == 1  # second tick blocked by throttle


@pytest.mark.asyncio
async def test_terminal_session_event_drops_session():
    fake = FakeRedis()
    messages = FakeMessages()
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state()

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    assert monitor.active_session_ids == ["sess-1"]
    monitor.on_session_event(_envelope(type="session.completed"))
    assert monitor.active_session_ids == []


@pytest.mark.asyncio
async def test_mock_mode_keyword_still_fires_but_claude_does_not():
    fake = FakeRedis()
    messages = FakeMessages()  # would emit on call, but we shouldn't reach it
    throttle = Throttle(15, 5, 300)

    async def fetch_keyword_hit(_sid: str, _sev: str | None) -> SessionState | None:
        return _state(last_transcript="I smell gas")

    monitor = SafetyMonitor(
        cfg=_cfg(use_mock=True),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch_keyword_hit,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    await monitor.tick(now=1.0)
    assert len(fake.published) == 2  # keyword path still emits
    assert messages.calls == []

    # Now switch the transcript to something benign; mock mode means no Claude
    # call → no alert published either.
    async def fetch_benign(_sid: str, _sev: str | None) -> SessionState | None:
        return _state(last_transcript="the valve is stuck")

    monitor2 = SafetyMonitor(
        cfg=_cfg(use_mock=True),
        anthropic_messages=messages,
        redis_pub=FakeRedis(),
        fetch_state=fetch_benign,
        throttle=Throttle(15, 5, 300),
    )
    monitor2.on_session_event(_envelope())
    n = await monitor2.tick(now=1.0)
    assert n == 0
    assert messages.calls == []


@pytest.mark.asyncio
async def test_claude_failure_swallowed_no_alert():
    fake = FakeRedis()
    messages = FakeMessages()
    messages.raise_on_call = RuntimeError("rate limited")
    throttle = Throttle(15, 5, 300)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state()

    monitor = SafetyMonitor(
        cfg=_cfg(),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope())
    n = await monitor.tick(now=1.0)
    assert n == 0
    assert fake.published == []


@pytest.mark.asyncio
async def test_unknown_session_envelope_ignored():
    fake = FakeRedis()
    monitor = SafetyMonitor(
        cfg=_cfg(use_mock=True),
        anthropic_messages=None,
        redis_pub=fake,
        fetch_state=lambda *_: pytest.fail("should not fetch"),  # type: ignore[arg-type]
        throttle=Throttle(15, 5, 300),
    )
    monitor.on_session_event({"type": "session.created"})  # missing sessionId/orgId
    assert monitor.active_session_ids == []


@pytest.mark.asyncio
async def test_cull_inactive_drops_from_active_set():
    fake = FakeRedis()
    messages = FakeMessages()
    throttle = Throttle(base_interval_s=15, escalated_interval_s=5, ttl_s=10)

    async def fetch(_sid: str, _sev: str | None) -> SessionState | None:
        return _state()

    monitor = SafetyMonitor(
        cfg=_cfg(use_mock=True),
        anthropic_messages=messages,
        redis_pub=fake,
        fetch_state=fetch,
        throttle=throttle,
    )
    monitor.on_session_event(_envelope(), now=0.0)
    assert monitor.active_session_ids == ["sess-1"]
    # Tick well after the TTL.
    await monitor.tick(now=1000.0)
    assert monitor.active_session_ids == []
