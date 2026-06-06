"""Pub/sub helpers wrapping the redis-py async client.

We subscribe to `session:*` so we hear about every session.ended event and
publish `certificate.ready` envelopes on both `session:<id>` and
`org:<orgId>:sessions` so the dashboard's existing WebSocket gateway
forwards them without a routing change.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

import redis.asyncio as aioredis


@dataclass(frozen=True)
class CertificateReady:
    session_id: str
    org_id: str
    cert_id: str
    cert_url: str
    issued_at: str  # ISO-8601 UTC


def session_channel(session_id: str) -> str:
    return f"session:{session_id}"


def org_channel(org_id: str) -> str:
    return f"org:{org_id}:sessions"


def envelope_for(ready: CertificateReady) -> dict[str, object]:
    """Match the existing backend session-event envelope shape so the WS
    gateway can forward it verbatim. Discriminator is the `type` field."""
    return {
        # Dashboard de-dupes by eventId; a millisecond clock is fine here —
        # cert.ready is rare enough that wall-clock collisions are not a real
        # concern.
        "eventId": int(time.time() * 1000),
        "type": "certificate.ready",
        "sessionId": ready.session_id,
        "orgId": ready.org_id,
        "certId": ready.cert_id,
        "certUrl": ready.cert_url,
        "ts": ready.issued_at,
    }


async def publish_ready(pub: aioredis.Redis, ready: CertificateReady) -> None:
    """PUBLISH the certificate.ready event on both per-session and org channels."""
    payload = json.dumps(envelope_for(ready))
    await pub.publish(session_channel(ready.session_id), payload)
    await pub.publish(org_channel(ready.org_id), payload)


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


def is_pass_session_ended(envelope: dict[str, object]) -> bool:
    """True iff this is a session.ended event we should generate a cert for."""
    return (
        envelope.get("type") == "session.ended"
        and envelope.get("finalOutcome") == "pass"
        and isinstance(envelope.get("sessionId"), str)
    )
