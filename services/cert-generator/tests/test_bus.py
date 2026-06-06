from __future__ import annotations

import json

from cert_generator.bus import (
    CertificateReady,
    envelope_for,
    is_pass_session_ended,
    org_channel,
    parse_session_envelope,
    session_channel,
)


def test_channel_names() -> None:
    assert session_channel("abc") == "session:abc"
    assert org_channel("xyz") == "org:xyz:sessions"


def test_envelope_for_shape() -> None:
    ready = CertificateReady(
        session_id="s1",
        org_id="o1",
        cert_id="FIQ-X",
        cert_url="https://x/c.pdf",
        issued_at="2026-06-08T14:00:00+00:00",
    )
    env = envelope_for(ready)
    assert env["type"] == "certificate.ready"
    assert env["sessionId"] == "s1"
    assert env["orgId"] == "o1"
    assert env["certId"] == "FIQ-X"
    assert env["certUrl"] == "https://x/c.pdf"
    assert env["ts"] == "2026-06-08T14:00:00+00:00"
    assert isinstance(env["eventId"], int)


def test_parse_session_envelope_roundtrip() -> None:
    raw = json.dumps({"type": "session.ended", "sessionId": "s1", "finalOutcome": "pass"})
    out = parse_session_envelope(raw)
    assert out == {"type": "session.ended", "sessionId": "s1", "finalOutcome": "pass"}


def test_parse_session_envelope_bytes() -> None:
    raw = json.dumps({"type": "x"}).encode("utf-8")
    assert parse_session_envelope(raw) == {"type": "x"}


def test_parse_session_envelope_bad_json() -> None:
    assert parse_session_envelope(b"not-json") is None
    assert parse_session_envelope("nope") is None


def test_is_pass_session_ended_combinations() -> None:
    assert is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "pass", "sessionId": "s1"}
    )
    assert not is_pass_session_ended({"type": "session.ended", "sessionId": "s1"})
    assert not is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "PASS", "sessionId": "s1"}
    )
