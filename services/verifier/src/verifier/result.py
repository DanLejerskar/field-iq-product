"""Verifier output schema. Mirrors the Node `VerificationResult` in @field-iq/schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]


class VerificationResult(BaseModel):
    """Strict shape Claude must return (02_Architecture.md §8.1)."""

    verified: bool
    confidence: Confidence
    message: str = Field(min_length=1)
    detail: str = Field(min_length=1)
