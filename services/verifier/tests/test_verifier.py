"""Offline tests: response parsing, mock verdict, retry/backoff on transient errors."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from verifier.verifier import (
    TransientAnthropicError,
    VerifyJob,
    call_anthropic,
    mock_verify,
    parse_response,
)

JOB = VerifyJob(
    session_id="sess_1",
    org_id="org_1",
    step_id="step_1",
    step_number=1,
    photo_key="org_1/sess_1/1-abc.jpg",
    verification_prompt="Look at this photo of a technician. Confirm BOTH of the following: ...",
)


def test_parse_response_strict_json():
    raw = '{"verified": true, "confidence": "high", "message": "ok", "detail": "all good"}'
    result = parse_response(raw)
    assert result.verified is True
    assert result.confidence == "high"
    assert result.message == "ok"


def test_parse_response_strips_markdown_fence():
    raw = '```json\n{"verified": false, "confidence": "low", "message": "x", "detail": "y"}\n```'
    result = parse_response(raw)
    assert result.verified is False
    assert result.confidence == "low"


def test_parse_response_rejects_non_json():
    with pytest.raises(ValueError, match="non-JSON"):
        parse_response("definitely not json")


def test_parse_response_rejects_invalid_confidence():
    raw = '{"verified": true, "confidence": "unknown", "message": "m", "detail": "d"}'
    with pytest.raises(ValidationError):
        parse_response(raw)


def test_parse_response_rejects_missing_fields():
    with pytest.raises(ValidationError):
        parse_response('{"verified": true, "confidence": "high"}')


def test_mock_verify_returns_verified_high_confidence():
    result = mock_verify(JOB)
    assert result.verified is True
    assert result.confidence == "high"
    assert "Step 1 verified (mock)" in result.message


class RateLimitError(RuntimeError):
    """Subclass whose name matches the Anthropic SDK's transient error class."""


class _FlakyClient:
    """Raises a transient error N times, then returns a successful response."""

    def __init__(self, fails: int, body: str):
        self.fails = fails
        self.body = body
        self.calls = 0

    def create(self, **_kwargs):
        self.calls += 1
        if self.calls <= self.fails:
            raise RateLimitError("upstream rate limited")
        return type(
            "Resp",
            (),
            {"content": [type("Block", (), {"type": "text", "text": self.body})()]},
        )()


def test_call_anthropic_retries_transient_then_succeeds():
    body = '{"verified": true, "confidence": "medium", "message": "ok", "detail": "after retry"}'
    client = _FlakyClient(fails=2, body=body)
    result = call_anthropic(client, "claude-sonnet-4-6", "step prompt", b"\xff\xd8\xff fake jpeg")
    assert result.verified is True
    assert client.calls == 3


def test_call_anthropic_gives_up_after_three_attempts():
    body = "ignored"
    client = _FlakyClient(fails=99, body=body)
    with pytest.raises(TransientAnthropicError):
        call_anthropic(client, "claude-sonnet-4-6", "step prompt", b"fake")
    assert client.calls == 3
