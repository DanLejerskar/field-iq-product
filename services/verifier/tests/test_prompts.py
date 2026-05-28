"""Asserts the verifier's system prompt is byte-equal to the canonical text in
``02_Architecture.md §8.1``. Like the seed-prompt fidelity guard in M2, this catches
any drift between the docs and the deployed prompt.
"""

from __future__ import annotations

from pathlib import Path

from verifier.prompts import system_prompt

REPO_ROOT = Path(__file__).resolve().parents[3]
ARCH_DOC = (
    REPO_ROOT
    / "vendor"
    / "colleague-early-specs"
    / "EON Field IQ Claude Specs"
    / "markdown"
    / "02_Architecture.md"
)


def _extract_system_prompt(doc: str) -> str:
    """Return the contents of the first fenced code block after the §8.1 heading."""
    marker = "### 8.1 System prompt"
    start = doc.find(marker)
    assert start != -1, "Could not locate §8.1 in the vendor doc"
    fence_open = doc.index("```", start)
    body_start = doc.index("\n", fence_open) + 1
    fence_close = doc.index("```", body_start)
    return doc[body_start:fence_close].rstrip("\n")


def test_system_prompt_matches_architecture_doc_byte_for_byte():
    canonical = _extract_system_prompt(ARCH_DOC.read_text(encoding="utf-8"))
    assert system_prompt() == canonical


def test_system_prompt_mentions_the_strict_json_contract():
    prompt = system_prompt()
    assert "Output only valid JSON" in prompt
    assert '"verified": true | false' in prompt
    assert '"confidence": "high" | "medium" | "low"' in prompt
