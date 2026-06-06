"""QR-code → PNG bytes for embedding in the certificate PDF.

Deterministic given the same input text: ``qrcode.make`` walks a fixed
parameter set and PIL's PNG encoder is byte-stable for identical pixel data.
"""

from __future__ import annotations

from io import BytesIO

import qrcode


def qr_png_bytes(text: str, size_px: int = 240) -> bytes:
    """Render `text` as a QR PNG of edge length `size_px` and return the bytes."""
    if not text:
        raise ValueError("qr_png_bytes: text must be non-empty")
    img = qrcode.make(text, box_size=10, border=2)
    img = img.resize((size_px, size_px))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
