"""Publishes verdict events on the Redis bus exactly like the Node session-service:
session:<id> + org:<orgId>:sessions channels, with a per-session monotonic eventId and
a capped per-channel history list for reconnect replay.
"""

from __future__ import annotations

import json
import time
from typing import Any

import redis

HISTORY_MAX = 50


def _session_channel(session_id: str) -> str:
    return f"session:{session_id}"


def _org_channel(org_id: str) -> str:
    return f"org:{org_id}:sessions"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def publish_session_event(
    r: redis.Redis,
    *,
    session_id: str,
    org_id: str,
    event_type: str,
    extra: dict[str, Any] | None = None,
) -> int:
    event_id = int(r.incr(f"evtseq:{session_id}"))
    envelope: dict[str, Any] = {
        "eventId": event_id,
        "type": event_type,
        "sessionId": session_id,
        "orgId": org_id,
        "ts": _now_iso(),
    }
    if extra:
        envelope.update(extra)
    payload = json.dumps(envelope)
    pipe = r.pipeline()
    pipe.publish(_session_channel(session_id), payload)
    pipe.publish(_org_channel(org_id), payload)
    pipe.rpush(f"history:{_session_channel(session_id)}", payload)
    pipe.ltrim(f"history:{_session_channel(session_id)}", -HISTORY_MAX, -1)
    pipe.execute()
    return event_id
