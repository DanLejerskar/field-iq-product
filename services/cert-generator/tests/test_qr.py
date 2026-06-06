from __future__ import annotations

from cert_generator.qr import qr_png_bytes


def test_returns_png_bytes() -> None:
    out = qr_png_bytes("https://app.fieldiq.io/verify/FIQ-2026-06-08-A7B3X9")
    assert isinstance(out, bytes)
    assert len(out) > 100  # non-empty PNG
    assert out.startswith(b"\x89PNG\r\n\x1a\n")  # PNG magic


def test_deterministic_for_same_input() -> None:
    a = qr_png_bytes("FIQ-cert-id")
    b = qr_png_bytes("FIQ-cert-id")
    assert a == b


def test_empty_text_raises() -> None:
    import pytest

    with pytest.raises(ValueError):
        qr_png_bytes("")
