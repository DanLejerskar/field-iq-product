"""Pub/sub helpers wrapping the redis-py async client.

Two operations matter:
  - subscribing to `session:*` + `org:*:sessions` patterns so we learn which
    sessions are live;
  - publishing `safety_alert` envelopes onto those same channels so the
    backend's existing WebSocket gateway forwards them without a routing
    change.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from typing import Literal

import redis.asyncio as aioredis

Severity = Literal["low", "medium", "high", "critical"]
DetectedBy = Literal["ai", "keyword"]


@dataclass(frozen=True)
class SafetyAlert:
    session_id: str
    org_id: str
    severity: Severity
    summary: str
    recommended_action: str
    detected_by: DetectedBy
    at: str  # ISO-8601 UTC


def session_channel(session_id: str) -> str:
    return f"session:{session_id}"


def org_channel(org_id: str) -> str:
    return f"org:{org_id}:sessions"


def envelope_for(alert: SafetyAlert) -> dict[str, object]:
    """Match the existing backend session-event envelope shape so the WS
    gateway can forward it verbatim. Discriminator is the `type` field."""
    return {
        # The dashboard de-dupes by eventId; a millisecond clock is fine here.
        # The backend uses Redis INCR for verdict events, but safety alerts
        # are rare enough that wall-clock collisions are not a real concern.
        "eventId": int(time.time() * 1000),
        "type": "safety_alert",
        "sessionId": alert.session_id,
        "orgId": alert.org_id,
        "ts": alert.at,
        "severity": alert.severity,
        "summary": alert.summary,
        "recommendedAction": alert.recommended_action,
        "detectedBy": alert.detected_by,
    }


async def publish_alert(pub: aioredis.Redis, alert: SafetyAlert) -> None:
    """PUBLISH the alert on both per-session and org channels."""
    payload = json.dumps(envelope_for(alert))
    await pub.publish(session_channel(alert.session_id), payload)
    await pub.publish(org_channel(alert.org_id), payload)


def parse_session_envelope(raw: bytes | str) -> dict[str, object] | None:
    """Decode an incoming session-event envelope into a dict (or None)."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    return None


def asdict_alert(alert: SafetyAlert) -> dict[str, object]:
    """Plain-dict view of a SafetyAlert. Convenience for tests/logs."""
    return asdict(alert)
