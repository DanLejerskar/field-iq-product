"""Live Anthropic regression — gated by ``@pytest.mark.live`` and skipped without an
``ANTHROPIC_API_KEY``. Run with::

    ANTHROPIC_API_KEY=... uv run pytest -m live

Drop known-good photos for each step into ``services/verifier/fixtures/dac811/`` to expand
the regression corpus. The test pairs each photo with its verbatim verification prompt and
asserts Claude returns the expected verdict.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
LOTO_DOC = (
    REPO_ROOT
    / "vendor"
    / "colleague-early-specs"
    / "EON Field IQ Claude Specs"
    / "markdown"
    / "03_LOTO_Test_Case.md"
)
FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "dac811"

pytestmark = pytest.mark.live


def _extract_step_prompts() -> list[str]:
    """Re-extract the 10 verbatim prompts from the vendor doc, like M2's seed test."""
    text = LOTO_DOC.read_text(encoding="utf-8")
    prompts: list[str] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if "verification_prompt" in lines[i]:
            i += 1
            while i < len(lines) and lines[i].strip() != "```":
                i += 1
            i += 1
            body: list[str] = []
            while i < len(lines) and lines[i].strip() != "```":
                body.append(lines[i][2:] if lines[i].startswith("  ") else lines[i])
                i += 1
            prompts.append("\n".join(body))
        i += 1
    return prompts


@pytest.fixture(scope="module")
def anthropic_client():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("<"):
        pytest.skip("ANTHROPIC_API_KEY not configured")
    from anthropic import Anthropic

    return Anthropic(api_key=api_key).messages


def _photo_for_step(step_number: int) -> bytes | None:
    pattern = re.compile(rf"^step{step_number:02d}.*\.(jpg|jpeg|png)$", re.IGNORECASE)
    if not FIXTURES.exists():
        return None
    for path in FIXTURES.iterdir():
        if pattern.match(path.name):
            return path.read_bytes()
    return None


@pytest.mark.parametrize("step_number", list(range(1, 11)))
def test_dac811_step_verifies_against_known_good_photo(anthropic_client, step_number):
    photo = _photo_for_step(step_number)
    if photo is None:
        pytest.skip(f"No fixture photo for step {step_number}")
    from verifier.verifier import call_anthropic

    prompts = _extract_step_prompts()
    result = call_anthropic(
        anthropic_client,
        os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        prompts[step_number - 1],
        photo,
    )
    assert result.verified is True, json.dumps(result.model_dump())
