"""PDF certificate builder.

ReportLab-based. ``build_pdf(state)`` returns a single-page A4 PDF as bytes.

Layout (top → bottom):
  1. Navy header band                — drawn directly on the canvas
  2. Title + subtitle                — Platypus paragraphs
  3. Recipient block                 — "Awarded to" + worker name + role
  4. Procedure block                 — two-column metadata table
  5. Steps table                     — alternating-row table of all procedure steps
  6. Photo strip                     — up to 3 sampled photos
  7. QR + cert id + verify URL       — drawn on the canvas, bottom-right
  8. Footer band                     — drawn on the canvas, full-width grey
"""

from __future__ import annotations

import base64
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Image,
    KeepInFrame,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .qr import qr_png_bytes
from .state import SessionCertState, StepResult

# --- Constants ---------------------------------------------------------------

NAVY = colors.HexColor("#1E2761")
MUTED = colors.HexColor("#666666")
ROW_ALT = colors.HexColor("#F4F4F4")
ROW_BORDER = colors.HexColor("#E0E0E0")

HEADER_HEIGHT = 0.83 * inch
FOOTER_HEIGHT = 0.5 * inch
QR_SIZE = 1.2 * inch
PHOTO_SIZE = 1.5 * inch


# --- Helpers -----------------------------------------------------------------


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = base["BodyText"]
    return {
        "title": ParagraphStyle(
            "CertTitle",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "CertSubtitle",
            parent=body,
            fontName="Helvetica",
            fontSize=11,
            leading=13,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "awarded": ParagraphStyle(
            "CertAwarded",
            parent=body,
            fontName="Helvetica",
            fontSize=11,
            leading=13,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "recipient": ParagraphStyle(
            "CertRecipient",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "role": ParagraphStyle(
            "CertRole",
            parent=body,
            fontName="Helvetica-Oblique",
            fontSize=11,
            leading=13,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=14,
        ),
        "meta_label": ParagraphStyle(
            "MetaLabel",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=MUTED,
            alignment=TA_LEFT,
            spaceAfter=1,
        ),
        "meta_value": ParagraphStyle(
            "MetaValue",
            parent=body,
            fontName="Helvetica",
            fontSize=10,
            leading=12,
            textColor=colors.black,
            alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=13,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "caption": ParagraphStyle(
            "Caption",
            parent=body,
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=0,
        ),
    }


def _format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    m, s = divmod(seconds, 60)
    if m < 60:
        return f"{m} min {s:02d} s"
    h, m = divmod(m, 60)
    return f"{h} h {m:02d} min"


def _format_dt(dt: datetime) -> str:
    return dt.strftime("%B %d, %Y · %H:%M UTC")


def _decode_photo(url: str) -> bytes | None:
    """Decode a data: URI or read from local disk. Returns None when the URL
    isn't immediately fetchable (e.g. remote http) — we degrade gracefully
    rather than block PDF generation on the network."""
    if not url:
        return None
    if url.startswith("data:"):
        try:
            header, _, b64 = url.partition(",")
            if "base64" not in header:
                return b64.encode("utf-8")
            return base64.b64decode(b64)
        except (ValueError, TypeError):
            return None
    if url.startswith("file://"):
        try:
            from pathlib import Path

            return Path(url[len("file://") :]).read_bytes()
        except OSError:
            return None
    # http(s): skip — PDF builds must not depend on outbound network.
    return None


# --- Blocks ------------------------------------------------------------------


def _title_block(state: SessionCertState, st: dict[str, ParagraphStyle]) -> list:
    title = state.procedure_title
    if "Completion Certificate" not in title:
        title = f"{title} Completion Certificate"
    return [
        Paragraph(title, st["title"]),
        Paragraph("Issued under OSHA 29 CFR 1910.147", st["subtitle"]),
    ]


def _recipient_block(state: SessionCertState, st: dict[str, ParagraphStyle]) -> list:
    return [
        Paragraph("Awarded to", st["awarded"]),
        Paragraph(state.worker_name, st["recipient"]),
        Paragraph(state.worker_role, st["role"]),
    ]


def _procedure_block(state: SessionCertState, st: dict[str, ParagraphStyle]) -> list:
    left = [
        Paragraph("PROCEDURE", st["meta_label"]),
        Paragraph(state.procedure_title, st["meta_value"]),
        Paragraph("PROCEDURE ID", st["meta_label"]),
        Paragraph(state.procedure_id, st["meta_value"]),
        Paragraph("ORGANIZATION", st["meta_label"]),
        Paragraph(state.organization_name, st["meta_value"]),
        Paragraph("SUPERVISOR", st["meta_label"]),
        Paragraph(state.supervisor_name, st["meta_value"]),
    ]
    right = [
        Paragraph("STARTED", st["meta_label"]),
        Paragraph(_format_dt(state.started_at), st["meta_value"]),
        Paragraph("COMPLETED", st["meta_label"]),
        Paragraph(_format_dt(state.ended_at), st["meta_value"]),
        Paragraph("DURATION", st["meta_label"]),
        Paragraph(_format_duration(state.duration_seconds), st["meta_value"]),
        Paragraph("LOCATION", st["meta_label"]),
        Paragraph(state.location or "—", st["meta_value"]),
    ]
    table = Table([[left, right]], colWidths=[3.0 * inch, 3.0 * inch])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return [table, Spacer(1, 0.16 * inch)]


def _step_row_status(step: StepResult) -> str:
    if step.status == "retry_passed":
        return f"Passed (retry ×{step.retry_count})"
    return "Passed"


def _steps_table(state: SessionCertState, st: dict[str, ParagraphStyle]) -> list:
    header = ["#", "Step", "Status", "Retries"]
    body_rows: list[list] = []
    for s in state.steps:
        body_rows.append(
            [
                str(s.step_number),
                Paragraph(s.title, st["meta_value"]),
                _step_row_status(s),
                str(s.retry_count),
            ]
        )
    data = [header] + body_rows
    col_widths = [0.4 * inch, 3.8 * inch, 1.4 * inch, 0.7 * inch]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (3, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, ROW_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    table.setStyle(TableStyle(style_cmds))
    return [Paragraph("Step results", st["section"]), table, Spacer(1, 0.12 * inch)]


def _photo_strip(state: SessionCertState, st: dict[str, ParagraphStyle]) -> list:
    """Embed up to 3 sampled photos as a single Table row."""
    images: list = []
    captions: list = []
    completed_steps = [s for s in state.steps]
    sample_steps: list[StepResult] = []
    if completed_steps:
        if len(completed_steps) >= 3:
            sample_steps = [
                completed_steps[0],
                completed_steps[len(completed_steps) // 2],
                completed_steps[-1],
            ]
        else:
            sample_steps = completed_steps[:]

    for i, url in enumerate(state.sample_photo_urls[:3]):
        data = _decode_photo(url)
        cell: object
        if data:
            try:
                cell = Image(BytesIO(data), width=PHOTO_SIZE, height=PHOTO_SIZE, kind="proportional")
            except Exception:
                cell = _photo_placeholder()
        else:
            cell = _photo_placeholder()
        images.append(cell)
        step = sample_steps[i] if i < len(sample_steps) else None
        caption_text = f"Step {step.step_number}" if step else f"Photo {i + 1}"
        captions.append(Paragraph(caption_text, st["caption"]))

    # Pad with blanks if we have fewer than 3
    while len(images) < 3:
        images.append(_photo_placeholder())
        captions.append(Paragraph("—", st["caption"]))

    table = Table(
        [images, captions],
        colWidths=[PHOTO_SIZE + 0.2 * inch] * 3,
        rowHeights=[PHOTO_SIZE + 0.05 * inch, 0.2 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
                ("VALIGN", (0, 1), (-1, 1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    return [Paragraph("Photo evidence", _styles()["section"]), table]


def _photo_placeholder():
    """A neutral grey square the same dimensions as a photo cell."""

    class _Placeholder:
        def wrap(self, _w, _h):
            return (PHOTO_SIZE, PHOTO_SIZE)

        def drawOn(self, canvas, x, y, _ignore=0):
            canvas.saveState()
            canvas.setFillColor(ROW_ALT)
            canvas.setStrokeColor(ROW_BORDER)
            canvas.rect(x, y, PHOTO_SIZE, PHOTO_SIZE, fill=1, stroke=1)
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 8)
            canvas.drawCentredString(x + PHOTO_SIZE / 2, y + PHOTO_SIZE / 2 - 4, "no photo")
            canvas.restoreState()

        def getKeepWithNext(self):
            return False

    return _Placeholder()


# --- Canvas chrome ----------------------------------------------------------


def _draw_chrome(canvas: Canvas, state: SessionCertState) -> None:
    """Header band, QR + cert id, footer band. Drawn on every page (but we
    only ever ship single-page certs)."""
    page_w, page_h = A4

    # Header band
    canvas.setFillColor(NAVY)
    canvas.rect(0, page_h - HEADER_HEIGHT, page_w, HEADER_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(inch, page_h - 0.55 * inch, "EON AI VENTURES")
    canvas.drawRightString(page_w - inch, page_h - 0.55 * inch, "FIELD IQ")

    # QR block above the footer band
    qr_bytes = qr_png_bytes(state.verify_url)
    qr_x = page_w - inch - QR_SIZE
    qr_y = FOOTER_HEIGHT + 0.15 * inch + 0.5 * inch
    canvas.drawImage(
        ImageReader(BytesIO(qr_bytes)), qr_x, qr_y, width=QR_SIZE, height=QR_SIZE
    )

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawRightString(page_w - inch, qr_y - 0.16 * inch, state.cert_id)
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(page_w - inch, qr_y - 0.30 * inch, state.verify_url)

    # Footer band
    canvas.setFillColor(ROW_ALT)
    canvas.rect(0, 0, page_w, FOOTER_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        inch,
        0.22 * inch,
        f"Issued by Field IQ on {state.ended_at:%B %d, %Y} · "
        f"Cert ID {state.cert_id}",
    )
    canvas.drawRightString(
        page_w - inch,
        0.22 * inch,
        f"Verify at {state.verify_url}",
    )


# --- Entry point -------------------------------------------------------------


def build_pdf(state: SessionCertState) -> bytes:
    """Render the single-page A4 PDF and return the raw bytes."""
    buf = BytesIO()

    # Reserve space for the header and footer bands plus the QR block.
    top_margin = HEADER_HEIGHT + 0.25 * inch
    bottom_margin = FOOTER_HEIGHT + QR_SIZE + 0.40 * inch

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
        title=f"Field IQ Certificate {state.cert_id}",
        author="EON AI Ventures",
    )

    st = _styles()
    body: list = []
    body.extend(_title_block(state, st))
    body.extend(_recipient_block(state, st))
    body.extend(_procedure_block(state, st))
    body.extend(_steps_table(state, st))
    body.extend(_photo_strip(state, st))

    frame_w = A4[0] - 2 * inch
    frame_h = A4[1] - top_margin - bottom_margin
    flowable = KeepInFrame(frame_w, frame_h, body, mode="shrink")

    doc.build(
        [flowable],
        onFirstPage=lambda c, _d: _draw_chrome(c, state),
        onLaterPages=lambda c, _d: _draw_chrome(c, state),
    )
    return buf.getvalue()
