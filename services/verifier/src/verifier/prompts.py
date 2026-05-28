"""Loads the verbatim system prompt from prompts/system.txt (02_Architecture.md §8.1)."""

from __future__ import annotations

from functools import cache
from pathlib import Path

_PROMPT_PATH = Path(__file__).with_name("prompts") / "system.txt"


@cache
def system_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8").rstrip("\n")
