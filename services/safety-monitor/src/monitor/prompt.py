"""Claude prompt builder + response parser for the safety monitor.

Mirrors the verifier service's discipline: system prompt + a single user
content block, strict JSON output (no prose, no markdown fences), strip
fences defensively before parsing.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .state import SessionState

SYSTEM_PROMPT = (
    "You are a safety supervisor watching an industrial worker perform a "
    "Lockout/Tagout (LOTO) procedure under OSHA 29 CFR 1910.147. You receive "
    "the session's recent state. Decide whether there is an active or imminent "
    "safety risk worth interrupting the worker for. Lean toward calling it "
    "out — false positives are cheap, false negatives are dangerous. "
    "Respond with strict JSON only — no prose, no markdown fences. Format: "
    '{"risk": true|false, "severity": "low"|"medium"|"high"|"critical", '
    '"summary": "<one short sentence the supervisor sees>", '
    '"recommended_action": "<one short sentence the worker should do>"}. '
    "When risk is false, severity/summary/recommended_action may be empty strings."
)

# Match verifier.parse_response's fence regex.
_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?|\n?```\s*$", re.MULTILINE)

_SEVERITIES: frozenset[str] = frozenset({"low", "medium", "high", "critical"})


def build_user_prompt(state: SessionState) -> str:
    """Compose the per-tick user message body. Stable enough to regression-test."""
    lines: list[str] = []
    lines.append(f"Procedure: {state.procedure_id}")
    lines.append(
        f"Current step: {state.current_step_number} — {state.current_step_title}"
    )
    lines.append("Current step verification prompt:")
    lines.append(state.current_step_verification_prompt or "(none)")
    lines.append("")
    if state.recent_verdicts:
        lines.append("Recent verdicts (oldest first):")
        for v in state.recent_verdicts:
            lines.append(
                f"  - step {v.get('step_number')} ({v.get('outcome')}) "
                f"at {v.get('at')}: {v.get('verdict_text')}"
            )
    else:
        lines.append("Recent verdicts: (none yet)")
    lines.append("")
    if state.last_transcript:
        lines.append(f"Most recent worker transcript: {state.last_transcript!r}")
    else:
        lines.append("Most recent worker transcript: (none)")
    lines.append("")
    lines.append(
        f"Worker has been silent for {state.seconds_since_last_audit:.0f} seconds "
        "since the last audit entry."
    )
    if state.last_severity:
        lines.append(f"Last alert severity for this session: {state.last_severity}")
    lines.append("")
    lines.append("Reply with JSON only.")
    return "\n".join(lines)


def parse_response(text: str) -> dict[str, Any] | None:
    """Parse Claude's JSON reply into a normalised dict, or None on failure.

    Returns {"risk": False, ...} when Claude says no risk; returns a dict
    with severity/summary/recommended_action when risk is True. Any shape
    mismatch resolves to None — the monitor treats "couldn't parse" as
    "no alert this tick" (the throttle will give us another shot soon).
    """
    if not isinstance(text, str):
        return None
    cleaned = _FENCE_RE.sub("", text).strip()
    if not cleaned:
        return None
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    risk = data.get("risk")
    if not isinstance(risk, bool):
        # Coerce truthy strings/ints to bool, but only if they're obvious.
        if risk in (1, "true", "True"):
            risk = True
        elif risk in (0, "false", "False"):
            risk = False
        else:
            return None

    if not risk:
        return {
            "risk": False,
            "severity": "",
            "summary": "",
            "recommended_action": "",
        }

    severity = data.get("severity")
    if severity not in _SEVERITIES:
        return None

    summary = data.get("summary")
    recommended = data.get("recommended_action")
    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(recommended, str) or not recommended.strip():
        return None

    return {
        "risk": True,
        "severity": severity,
        "summary": summary.strip(),
        "recommended_action": recommended.strip(),
    }
