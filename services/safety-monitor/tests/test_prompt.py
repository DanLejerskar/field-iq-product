import json

from monitor.prompt import build_user_prompt, parse_response
from monitor.state import SessionState


def _state(**over) -> SessionState:
    base = {
        "session_id": "sess-1",
        "org_id": "org-1",
        "procedure_id": "dac811-loto",
        "current_step_number": 8,
        "current_step_title": "CLOSE BALL VALVE",
        "current_step_verification_prompt": "Confirm the ball valve handle is perpendicular.",
        "recent_verdicts": [
            {
                "step_number": 6,
                "outcome": "verified",
                "verdict_text": "hasp applied",
                "at": "2026-06-05T22:00:00Z",
            },
            {
                "step_number": 7,
                "outcome": "verified",
                "verdict_text": "padlock engaged",
                "at": "2026-06-05T22:05:00Z",
            },
        ],
        "last_transcript": "the valve is stuck",
        "seconds_since_last_audit": 42.0,
        "last_severity": None,
    }
    base.update(over)
    return SessionState(**base)


def test_build_user_prompt_includes_core_fields():
    prompt = build_user_prompt(_state())
    assert "dac811-loto" in prompt
    assert "CLOSE BALL VALVE" in prompt
    assert "perpendicular" in prompt
    assert "step 6" in prompt and "verified" in prompt
    assert "step 7" in prompt
    assert "the valve is stuck" in prompt
    assert "42 seconds" in prompt
    assert prompt.rstrip().endswith("Reply with JSON only.")


def test_build_user_prompt_handles_missing_transcript_and_verdicts():
    prompt = build_user_prompt(
        _state(recent_verdicts=[], last_transcript=None)
    )
    assert "(none yet)" in prompt
    assert "(none)" in prompt


def test_build_user_prompt_includes_last_severity_when_set():
    prompt = build_user_prompt(_state(last_severity="high"))
    assert "Last alert severity for this session: high" in prompt


def test_parse_response_happy_path():
    raw = json.dumps(
        {
            "risk": True,
            "severity": "high",
            "summary": "Worker silent on a safety-gated step.",
            "recommended_action": "Establish voice contact.",
        }
    )
    out = parse_response(raw)
    assert out == {
        "risk": True,
        "severity": "high",
        "summary": "Worker silent on a safety-gated step.",
        "recommended_action": "Establish voice contact.",
    }


def test_parse_response_strips_fences():
    raw = "```json\n" + json.dumps(
        {
            "risk": True,
            "severity": "medium",
            "summary": "x",
            "recommended_action": "y",
        }
    ) + "\n```"
    out = parse_response(raw)
    assert out is not None and out["severity"] == "medium"


def test_parse_response_no_risk_returns_normalised_dict():
    out = parse_response(json.dumps({"risk": False}))
    assert out == {"risk": False, "severity": "", "summary": "", "recommended_action": ""}


def test_parse_response_invalid_severity_is_rejected():
    raw = json.dumps(
        {"risk": True, "severity": "spooky", "summary": "x", "recommended_action": "y"}
    )
    assert parse_response(raw) is None


def test_parse_response_missing_summary_is_rejected():
    raw = json.dumps({"risk": True, "severity": "high", "summary": "", "recommended_action": "y"})
    assert parse_response(raw) is None


def test_parse_response_malformed_json_is_none():
    assert parse_response("not valid json") is None


def test_parse_response_non_object_is_none():
    assert parse_response("[]") is None


def test_parse_response_empty_input_is_none():
    assert parse_response("") is None
    assert parse_response("   ") is None


def test_parse_response_coerces_string_risk():
    raw = '{"risk":"false"}'
    out = parse_response(raw)
    assert out is not None and out["risk"] is False
