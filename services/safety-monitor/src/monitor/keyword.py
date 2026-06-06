"""Critical-phrase fast path.

Mirrors `@field-iq/worker-dialogue`'s CRITICAL_PHRASES so the deterministic
escalation rule fires the same way in both stacks. Word-boundary matching so
"sparks" doesn't fire on "sparkling water".
"""

from __future__ import annotations

import re

CRITICAL_PHRASES: frozenset[str] = frozenset(
    {
        "gas",
        "smoke",
        "smoking",
        "fire",
        "sparks",
        "sparking",
        "shock",
        "burning",
        "hurt",
        "pain",
    }
)

# Pre-compile a single alternation regex. Word boundaries (\b) means "fire"
# matches in "there's fire near the panel" but not in "wildfire" — and
# crucially, "spark" doesn't match "sparkling".
_PATTERN: re.Pattern[str] = re.compile(
    r"\b(?:" + "|".join(re.escape(p) for p in sorted(CRITICAL_PHRASES)) + r")\b",
    re.IGNORECASE,
)


def hits_critical(transcript: str | None) -> bool:
    """True iff `transcript` contains any critical phrase as a whole word."""
    if not transcript:
        return False
    norm = " ".join(transcript.split())
    if not norm:
        return False
    return _PATTERN.search(norm) is not None
