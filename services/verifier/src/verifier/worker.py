"""Verifier worker main loop.

Consumes the ``verify-queue`` Redis Stream via consumer group ``verifier``, runs each
job through :mod:`verifier.verifier` (mock by default, Claude when ``VERIFIER_MOCK=false``
and ``ANTHROPIC_API_KEY`` is set), persists the verdict (state machine + audit), and
publishes the resulting ``step.verified`` / ``step.retry`` / ``step.failed`` event.

Run with ``python -m verifier.worker`` after ``uv sync``.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg
import redis
import structlog

from .config import Config, get_config
from .events import publish_session_event
from .persistence import apply_verdict
from .result import VerificationResult
from .verifier import VerifyJob, mock_verify, verify

VERIFY_QUEUE = "verify-queue"
GROUP = "verifier"
CONSUMER = "verifier-1"

log = structlog.get_logger()


def _ensure_group(r: redis.Redis) -> None:
    try:
        r.xgroup_create(VERIFY_QUEUE, GROUP, id="$", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def _make_anthropic_client(api_key: str):  # pragma: no cover — exercised only in live mode
    from anthropic import Anthropic

    return Anthropic(api_key=api_key).messages


def _make_photo_fetcher(cfg: Config):  # pragma: no cover — exercised only in live mode
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=cfg.s3.endpoint,
        region_name=cfg.s3.region,
        aws_access_key_id=cfg.s3.access_key_id,
        aws_secret_access_key=cfg.s3.secret_access_key,
    )

    def fetch(key: str) -> bytes:
        resp = s3.get_object(Bucket=cfg.s3.bucket, Key=key)
        return resp["Body"].read()

    return fetch


def _job_from_entry(fields: dict[bytes, bytes]) -> VerifyJob:
    raw = fields.get(b"job") or fields.get("job")
    if isinstance(raw, bytes):
        raw = raw.decode()
    payload = json.loads(raw)
    return VerifyJob(
        session_id=payload["sessionId"],
        org_id=payload["orgId"],
        step_id=payload["stepId"],
        step_number=int(payload["stepNumber"]),
        photo_key=payload["photoKey"],
        verification_prompt=payload["verificationPrompt"],
    )


def process_job(
    job: VerifyJob,
    cfg: Config,
    r: redis.Redis,
    pg: psycopg.Connection,
    *,
    fetch_photo=None,
    messages_client=None,
) -> VerificationResult:
    if cfg.use_mock:
        result = mock_verify(job)
        claude_response: dict[str, Any] = {"mock": True}
    else:
        result = verify(
            job,
            mock=False,
            fetch_photo=fetch_photo,
            messages_client=messages_client,
            model=cfg.anthropic_model,
        )
        claude_response = result.model_dump()

    app = apply_verdict(
        pg,
        session_id=job.session_id,
        step_number=job.step_number,
        result=result,
        photo_key=job.photo_key,
        photo_sha256=None,
        claude_response=claude_response,
    )

    event_type = (
        "step.verified"
        if app.new_status == "verified"
        else "step.failed"
        if app.new_status == "failed"
        else "step.retry"
    )
    publish_session_event(
        r,
        session_id=job.session_id,
        org_id=job.org_id,
        event_type=event_type,
        extra={
            "stepNumber": job.step_number,
            "stepId": app.step_id,
            "verified": result.verified,
            "confidence": result.confidence,
            "message": result.message,
            "detail": result.detail,
        },
    )
    return result


def main() -> None:  # pragma: no cover — long-running loop
    cfg = get_config()
    log.info("verifier starting", mock=cfg.use_mock, model=cfg.anthropic_model)

    r = redis.Redis.from_url(cfg.redis_url)
    pg = psycopg.connect(cfg.database_url)
    _ensure_group(r)

    fetch_photo = None
    messages_client = None
    if not cfg.use_mock:
        fetch_photo = _make_photo_fetcher(cfg)
        messages_client = _make_anthropic_client(cfg.anthropic_api_key)  # type: ignore[arg-type]

    while True:
        res = r.xreadgroup(GROUP, CONSUMER, {VERIFY_QUEUE: ">"}, count=1, block=2000)
        if not res:
            continue
        for _stream, entries in res:
            for entry_id, fields in entries:
                try:
                    job = _job_from_entry(fields)
                    process_job(
                        job,
                        cfg,
                        r,
                        pg,
                        fetch_photo=fetch_photo,
                        messages_client=messages_client,
                    )
                    r.xack(VERIFY_QUEUE, GROUP, entry_id)
                    log.info("verdict ack", entry=entry_id, step=job.step_number)
                except Exception:
                    log.exception("verifier job failed", entry=entry_id)


if __name__ == "__main__":  # pragma: no cover
    main()
