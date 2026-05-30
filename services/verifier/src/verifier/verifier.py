"""Verifier core: parse a Claude response into a VerificationResult, call Anthropic with
retries on transient errors, or return a canned verdict in mock mode.

`verify(job, *, mock)` is the single entry point. The worker (`worker.py`) wires it up to
the queue + persistence + event-bus layers.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .prompts import system_prompt
from .result import VerificationResult


@dataclass(frozen=True)
class VerifyJob:
    """Job payload enqueued by the backend on the verify-queue Redis Stream."""

    session_id: str
    org_id: str
    step_id: str
    step_number: int
    photo_key: str
    verification_prompt: str


class TransientAnthropicError(RuntimeError):
    """Wraps 429 / 5xx / network errors so tenacity retries them."""


_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?|\n?```\s*$", re.MULTILINE)


def parse_response(text: str) -> VerificationResult:
    """Strip optional markdown fences and parse a strict-JSON verdict."""
    cleaned = _FENCE_RE.sub("", text).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned non-JSON output: {exc.msg}") from exc
    return VerificationResult.model_validate(data)


def mock_verify(job: VerifyJob) -> VerificationResult:
    """Canned verdict used when VERIFIER_MOCK=true or no API key is configured.

    Returns verified=True so the full session loop runs without Claude. Keeping this
    deterministic + step-aware makes the offline E2E meaningful.
    """
    return VerificationResult(
        verified=True,
        confidence="high",
        message=f"Step {job.step_number} verified (mock).",
        detail=(
            "VERIFIER_MOCK=true or no ANTHROPIC_API_KEY configured — "
            "no Claude call was made. Verdict generated locally for the dev loop."
        ),
    )


class _AnthropicLike(Protocol):
    def create(self, **kwargs: Any) -> Any: ...


@retry(
    retry=retry_if_exception_type(TransientAnthropicError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
    reraise=True,
)
def call_anthropic(
    messages_client: _AnthropicLike,
    model: str,
    step_prompt: str,
    image_bytes: bytes,
    image_media_type: str = "image/jpeg",
) -> VerificationResult:
    """Make one Anthropic Messages call and parse the verdict.

    Wrapped in tenacity: transient errors trigger up to 3 attempts with exponential
    backoff (0.5s, 2s, 8s). The caller (worker) handles permanent failures by writing
    an `error` audit row and acking the queue entry.
    """
    import base64

    try:
        response = messages_client.create(
            model=model,
            max_tokens=400,
            system=system_prompt(),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": image_media_type,
                                "data": base64.standard_b64encode(image_bytes).decode(),
                            },
                        },
                        {"type": "text", "text": step_prompt},
                    ],
                }
            ],
        )
    except Exception as exc:
        if _is_transient(exc):
            raise TransientAnthropicError(str(exc)) from exc
        raise

    # The Anthropic SDK returns response.content as a list of content blocks.
    text_parts: list[str] = []
    for block in getattr(response, "content", []):
        as_dict = block if isinstance(block, dict) else {}
        block_type = getattr(block, "type", None) or as_dict.get("type")
        if block_type != "text":
            continue
        text = getattr(block, "text", None) or as_dict.get("text", "")
        text_parts.append(text)
    if not text_parts:
        raise ValueError("Claude returned no text content")
    return parse_response("".join(text_parts))


def _is_transient(exc: BaseException) -> bool:
    name = exc.__class__.__name__
    if name in {
        "RateLimitError",
        "APIConnectionError",
        "APIStatusError",
        "InternalServerError",
        "APITimeoutError",
        "ConnectionError",
        "TimeoutError",
    }:
        return True
    # Generic HTTP status check
    status = getattr(exc, "status_code", None)
    if isinstance(status, int) and (status == 429 or 500 <= status < 600):
        return True
    return False


def verify(
    job: VerifyJob,
    *,
    mock: bool,
    fetch_photo: Callable[[str], bytes] | None = None,
    messages_client: _AnthropicLike | None = None,
    model: str = "claude-sonnet-4-6",
) -> VerificationResult:
    """High-level entry point used by the worker."""
    if mock:
        return mock_verify(job)
    if messages_client is None or fetch_photo is None:
        raise RuntimeError("Live mode requires messages_client and fetch_photo")
    image_bytes = fetch_photo(job.photo_key)
    return call_anthropic(messages_client, model, job.verification_prompt, image_bytes)
