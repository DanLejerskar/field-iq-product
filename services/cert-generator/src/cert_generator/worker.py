"""cert-generator entrypoint.

Run with ``python -m cert_generator.worker`` after ``uv sync``.

Subscribes to Redis pub/sub pattern `session:*` so we hear every
session.ended event the backend emits. When the event carries
``finalOutcome=pass`` we:

  1. assemble the SessionCertState from Postgres,
  2. build the one-page PDF,
  3. upload to the configured storage backend,
  4. record the certificate row,
  5. publish a ``certificate.ready`` event on `session:<id>` and
     `org:<orgId>:sessions` so the dashboard banner updates.

Graceful shutdown on SIGTERM/SIGINT: cancel tasks, close clients, exit 0.
"""

from __future__ import annotations

import asyncio
import hashlib
import signal
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Awaitable, Callable

import psycopg
import redis.asyncio as aioredis
import structlog

from .builder import build_pdf
from .bus import (
    CertificateReady,
    is_pass_session_ended,
    parse_session_envelope,
    publish_ready,
)
from .config import Config, get_config
from .db import CertificateRow, insert_certificate
from .logging_setup import configure_logging
from .state import SessionCertState, assemble
from .storage import UploadResult, upload

log = structlog.get_logger("cert_generator.worker")

_SESSION_PATTERN = "session:*"


# --- Pure-ish handler --------------------------------------------------------


@dataclass(frozen=True)
class HandlerDeps:
    cfg: Config
    fetch_state: Callable[[str], Awaitable[SessionCertState | None]]
    upload_pdf: Callable[[str, str, bytes], Awaitable[UploadResult]]
    write_row: Callable[[CertificateRow], Awaitable[str | None]]
    publish: Callable[[CertificateReady], Awaitable[None]]


async def handle_session_ended(
    deps: HandlerDeps, envelope: dict[str, object]
) -> CertificateReady | None:
    """Process a single session.ended/pass envelope end-to-end.

    Returns the published CertificateReady on success, or None when the
    envelope wasn't actionable or generation failed. Exceptions are caught
    and logged so one bad session can't crash the worker.
    """
    if not is_pass_session_ended(envelope):
        return None
    session_id = str(envelope["sessionId"])

    try:
        state = await deps.fetch_state(session_id)
        if state is None:
            log.warning("session not found", session_id=session_id)
            return None

        pdf_bytes = await asyncio.to_thread(build_pdf, state)
        sha = hashlib.sha256(pdf_bytes).hexdigest()
        upload_result = await deps.upload_pdf(state.org_id, session_id, pdf_bytes)

        issued_at = datetime.now(UTC)
        row = CertificateRow(
            session_id=session_id,
            cert_id=state.cert_id,
            cert_url=upload_result.url,
            cert_hash=sha,
            storage_backend=upload_result.storage_backend,
            storage_key=upload_result.storage_key,
            issued_at=issued_at,
        )
        await deps.write_row(row)

        ready = CertificateReady(
            session_id=session_id,
            org_id=state.org_id,
            cert_id=state.cert_id,
            cert_url=upload_result.url,
            issued_at=issued_at.isoformat(),
        )
        await deps.publish(ready)
        log.info(
            "certificate issued",
            session_id=session_id,
            cert_id=state.cert_id,
            backend=upload_result.storage_backend,
            bytes=len(pdf_bytes),
        )
        return ready
    except Exception:
        log.exception("certificate generation failed", session_id=session_id)
        return None


# --- Live wiring -------------------------------------------------------------


def _make_fetch_state(
    pg: psycopg.Connection, lock: asyncio.Lock, cfg: Config
) -> Callable[[str], Awaitable[SessionCertState | None]]:
    async def fetch(session_id: str) -> SessionCertState | None:
        async with lock:
            return await asyncio.to_thread(
                assemble, pg, session_id, verify_base_url=cfg.verify_base_url
            )

    return fetch


def _make_upload(cfg: Config) -> Callable[[str, str, bytes], Awaitable[UploadResult]]:
    async def do(org_id: str, session_id: str, pdf_bytes: bytes) -> UploadResult:
        return await asyncio.to_thread(upload, cfg, org_id, session_id, pdf_bytes)

    return do


def _make_write_row(
    pg: psycopg.Connection, lock: asyncio.Lock
) -> Callable[[CertificateRow], Awaitable[str | None]]:
    async def do(row: CertificateRow) -> str | None:
        async with lock:
            return await asyncio.to_thread(insert_certificate, pg, row)

    return do


def _make_publish(pub: aioredis.Redis) -> Callable[[CertificateReady], Awaitable[None]]:
    async def do(ready: CertificateReady) -> None:
        await publish_ready(pub, ready)

    return do


async def _subscribe_loop(
    sub: aioredis.Redis,
    deps: HandlerDeps,
    stop: asyncio.Event,
) -> None:
    pubsub = sub.pubsub()
    await pubsub.psubscribe(_SESSION_PATTERN)
    log.info("subscribed", pattern=_SESSION_PATTERN)
    try:
        while not stop.is_set():
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                continue
            envelope = parse_session_envelope(msg.get("data", b""))
            if envelope is None:
                continue
            await handle_session_ended(deps, envelope)
    finally:
        await pubsub.punsubscribe(_SESSION_PATTERN)
        await pubsub.close()


async def amain() -> None:  # pragma: no cover — long-running loop
    configure_logging()
    cfg = get_config()
    log.info(
        "cert-generator started",
        storage_backend=cfg.storage_backend,
        output_dir=cfg.local_output_dir if cfg.storage_backend == "local" else None,
        supabase_bucket=cfg.supabase_bucket if cfg.storage_backend == "supabase" else None,
    )

    pub: aioredis.Redis = aioredis.from_url(cfg.redis_url, decode_responses=False)
    sub: aioredis.Redis = aioredis.from_url(cfg.redis_url, decode_responses=False)
    pg: psycopg.Connection = psycopg.connect(cfg.database_url)
    pg_lock = asyncio.Lock()

    deps = HandlerDeps(
        cfg=cfg,
        fetch_state=_make_fetch_state(pg, pg_lock, cfg),
        upload_pdf=_make_upload(cfg),
        write_row=_make_write_row(pg, pg_lock),
        publish=_make_publish(pub),
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    task = asyncio.create_task(_subscribe_loop(sub, deps, stop), name="subscribe")
    await stop.wait()
    log.info("shutting down")
    task.cancel()
    try:
        await task
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
    log.info("cert-generator stopped")


def main() -> None:  # pragma: no cover — entrypoint
    asyncio.run(amain())


if __name__ == "__main__":  # pragma: no cover
    main()
