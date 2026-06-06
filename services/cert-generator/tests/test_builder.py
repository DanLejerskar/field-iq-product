from __future__ import annotations

import base64
from dataclasses import replace
from io import BytesIO

import pytest
from pypdf import PdfReader

from cert_generator.builder import build_pdf
from cert_generator.state import SessionCertState

# 1×1 red JPEG (smallest possible JPEG embedded for the photo strip test).
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB"
    "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEB"
    "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgA"
    "AQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIB"
    "AwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYX"
    "GBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeI"
    "iYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn"
    "6Onq8fLz9PX29/j5+v/aAAgBAQAAPwD9/KKKKAP/2Q=="
)


def test_returns_pdf_bytes(sample_state: SessionCertState) -> None:
    pdf = build_pdf(sample_state)
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-")


def test_pdf_is_single_page(sample_state: SessionCertState) -> None:
    pdf = build_pdf(sample_state)
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 1


def test_pdf_contains_worker_and_cert_text(sample_state: SessionCertState) -> None:
    pdf = build_pdf(sample_state)
    reader = PdfReader(BytesIO(pdf))
    text = reader.pages[0].extract_text() or ""
    assert sample_state.worker_name in text
    assert sample_state.cert_id in text
    assert "EON AI VENTURES" in text or "FIELD IQ" in text
    assert "OSHA 29 CFR 1910.147" in text


def test_pdf_contains_all_step_titles(sample_state: SessionCertState) -> None:
    pdf = build_pdf(sample_state)
    reader = PdfReader(BytesIO(pdf))
    text = reader.pages[0].extract_text() or ""
    for step in sample_state.steps:
        # Titles can wrap; check a token from each.
        token = step.title.split()[0]
        assert token in text, f"step {step.step_number} title token {token!r} missing"


def test_pdf_embeds_data_uri_photo(sample_state: SessionCertState) -> None:
    state = replace(
        sample_state,
        sample_photo_urls=[
            f"data:image/jpeg;base64,{TINY_JPEG_B64}",
            f"data:image/jpeg;base64,{TINY_JPEG_B64}",
            f"data:image/jpeg;base64,{TINY_JPEG_B64}",
        ],
    )
    # Should not raise and should still produce single-page bytes.
    pdf = build_pdf(state)
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 1
    assert pdf.startswith(b"%PDF-")


def test_pdf_handles_missing_photos(sample_state: SessionCertState) -> None:
    # No sample photos at all → still renders with placeholders.
    pdf = build_pdf(sample_state)
    assert pdf.startswith(b"%PDF-")


def test_pdf_handles_long_procedure_title(sample_state: SessionCertState) -> None:
    state = replace(
        sample_state,
        procedure_title=(
            "Extremely Long Procedure Title That Should Still Fit On A Single Page "
            "Even With Padding And Multiple Lines"
        ),
    )
    pdf = build_pdf(state)
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) == 1


# Sanity check: the TINY_JPEG_B64 actually decodes to JPEG bytes.
def test_fixture_jpeg_decodes() -> None:
    data = base64.b64decode(TINY_JPEG_B64)
    # JPEG SOI
    assert data[:2] == b"\xff\xd8"


@pytest.mark.parametrize("retry_count", [0, 1, 3])
def test_step_status_string_in_pdf(sample_state: SessionCertState, retry_count: int) -> None:
    from cert_generator.state import StepResult

    # Replace step 1 with a known retry count.
    new_steps = list(sample_state.steps)
    new_steps[0] = StepResult(
        step_number=1,
        title="Notify affected employees",
        status="retry_passed" if retry_count else "pass",
        retry_count=retry_count,
    )
    state = replace(sample_state, steps=new_steps)
    pdf = build_pdf(state)
    reader = PdfReader(BytesIO(pdf))
    text = reader.pages[0].extract_text() or ""
    if retry_count:
        assert f"retry" in text.lower() or str(retry_count) in text
    else:
        assert "Passed" in text
