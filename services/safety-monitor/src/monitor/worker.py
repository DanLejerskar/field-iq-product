"""safety-monitor entrypoint.

Run with ``python -m monitor.worker`` after ``uv sync``.

Subscribes to Redis pub/sub patterns `session:*` and `org:*:sessions` so we
learn about active sessions from the same events the backend already
publishes. A second asyncio task ticks the SafetyMonitor every second; the
throttle handles per-session rate limiting.

Graceful shutdown on SIGTERM/SIGINT: cancel tasks, close clients, exit 0.
"""

from __future__ import annotations

import asyncio
import signal
from typing import Any

import psycopg
import redis.asyncio as aioredis
import structlog

from .bus import parse_session_envelope
from .config import get_config
from .monitor import SafetyMonitor
from .state import SessionState, fetch_state
from .throttle import Throttle

log = structlog.get_logger("monitor.worker")

_SESSION_PATTERN = "session:*"
_ORG_PATTERN = "org:*:sessions"


def _make_anthropic_messages(api_key: str):  # pragma: no cover — exercised only in live mode
    """Build a structural messages client backed by the real Anthropic SDK."""
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(api_key=api_key).messages


async def _fetch_state_async(
    pg: psycopg.Connection,
    lock: asyncio.Lock,
    session_id: str,
    last_severity: str | None,
) -> SessionState | None:
    """Bridge the sync psycopg call onto the asyncio loop."""
    async with lock:
        return await asyncio.to_thread(
            fetch_state, pg, session_id, last_severity=last_severity
        )


async def _subscribe_loop(
    sub: aioredis.Redis,
    monitor: SafetyMonitor,
    stop: asyncio.Event,
) -> None:
    pubsub = sub.pubsub()
    await pubsub.psubscribe(_SESSION_PATTERN, _ORG_PATTERN)
    log.info("subscribed", patterns=[_SESSION_PATTERN, _ORG_PATTERN])
    try:
        while not stop.is_set():
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                continue
            envelope = parse_session_envelope(msg.get("data", b""))
            if envelope is None:
                continue
            monitor.on_session_event(envelope)
    finally:
        await pubsub.punsubscribe(_SESSION_PATTERN, _ORG_PATTERN)
        await pubsub.close()


async def _tick_loop(monitor: SafetyMonitor, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await monitor.tick()
        except Exception:
            log.exception("tick crashed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except TimeoutError:
            continue


async def amain() -> None:  # pragma: no cover — long-running loop
    cfg = get_config()
    log.info(
        "safety-monitor started",
        model=cfg.anthropic_model,
        base_interval_s=cfg.base_interval_s,
        escalated_interval_s=cfg.escalated_interval_s,
        mode="mock" if cfg.use_mock else "claude",
    )

    pub: aioredis.Redis = aioredis.from_url(cfg.redis_url, decode_responses=False)
    sub: aioredis.Redis = aioredis.from_url(cfg.redis_url, decode_responses=False)
    pg: psycopg.Connection = psycopg.connect(cfg.database_url)
    pg_lock = asyncio.Lock()

    messages_client: Any = (
        None if cfg.use_mock else _make_anthropic_messages(cfg.anthropic_api_key)
    )

    throttle = Throttle(
        base_interval_s=cfg.base_interval_s,
        escalated_interval_s=cfg.escalated_interval_s,
        ttl_s=cfg.inactive_session_ttl_s,
    )

    monitor = SafetyMonitor(
        cfg=cfg,
        anthropic_messages=messages_client,
        redis_pub=pub,
        fetch_state=lambda sid, sev: _fetch_state_async(pg, pg_lock, sid, sev),
        throttle=throttle,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    tasks = [
        asyncio.create_task(_subscribe_loop(sub, monitor, stop), name="subscribe"),
        asyncio.create_task(_tick_loop(monitor, stop), name="tick"),
    ]
    await stop.wait()
    log.info("shutting down")
    for t in tasks:
        t.cancel()
    for t in tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
    try:
        await pub.close()
    except Exception:
        log.exception("pub close failed")
    try:
        await sub.close()
    except Exception:
        log.exception("sub close failed")
    try:
        pg.close()
    except Exception:
        log.exception("pg close failed")
    log.info("safety-monitor stopped")


def main() -> None:  # pragma: no cover — entrypoint
    asyncio.run(amain())


if __name__ == "__main__":  # pragma: no cover
    main()
