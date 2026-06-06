from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from cert_generator.bus import CertificateReady, is_pass_session_ended
from cert_generator.config import Config
from cert_generator.db import CertificateRow
from cert_generator.state import SessionCertState
from cert_generator.storage import UploadResult
from cert_generator.worker import HandlerDeps, handle_session_ended


def _cfg() -> Config:
    return Config(
        redis_url="redis://localhost:6379",
        database_url="postgresql://localhost/x",
        storage_backend="local",
        local_output_dir="./certs",
        supabase_url=None,
        supabase_service_key=None,
        supabase_bucket="certificates",
        verify_base_url="https://app.fieldiq.io",
    )


def _ok_state(sample_state: SessionCertState, sid: str) -> SessionCertState:
    return replace(sample_state, session_id=sid)


def _make_deps(state: SessionCertState | None) -> tuple[HandlerDeps, dict]:
    """Build deps that record every call into the returned dict."""
    bag: dict = {
        "fetch_calls": [],
        "uploads": [],
        "rows": [],
        "publishes": [],
        "upload_should_raise": False,
    }

    async def fetch(session_id: str):
        bag["fetch_calls"].append(session_id)
        return state

    async def do_upload(org_id, session_id, pdf_bytes):
        bag["uploads"].append((org_id, session_id, len(pdf_bytes)))
        if bag["upload_should_raise"]:
            raise RuntimeError("boom")
        return UploadResult(
            storage_backend="local",
            storage_key=f"/tmp/{session_id}.pdf",
            url=f"file:///tmp/{session_id}.pdf",
        )

    async def write_row(row: CertificateRow):
        bag["rows"].append(row)
        return "row-uuid"

    async def publish(ready: CertificateReady):
        bag["publishes"].append(ready)

    deps = HandlerDeps(
        cfg=_cfg(),
        fetch_state=fetch,
        upload_pdf=do_upload,
        write_row=write_row,
        publish=publish,
    )
    return deps, bag


def test_is_pass_filter() -> None:
    assert is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "pass", "sessionId": "s1"}
    )
    assert not is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "fail", "sessionId": "s1"}
    )
    assert not is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "incomplete", "sessionId": "s1"}
    )
    assert not is_pass_session_ended(
        {"type": "session.created", "finalOutcome": "pass", "sessionId": "s1"}
    )
    assert not is_pass_session_ended(
        {"type": "session.ended", "finalOutcome": "pass"}  # no sessionId
    )


@pytest.mark.asyncio
async def test_handle_ignores_non_pass(sample_state: SessionCertState) -> None:
    deps, bag = _make_deps(sample_state)
    result = await handle_session_ended(
        deps,
        {"type": "session.ended", "finalOutcome": "fail", "sessionId": "s1"},
    )
    assert result is None
    assert bag["fetch_calls"] == []
    assert bag["uploads"] == []
    assert bag["rows"] == []
    assert bag["publishes"] == []


@pytest.mark.asyncio
async def test_handle_ignores_non_session_ended(sample_state: SessionCertState) -> None:
    deps, bag = _make_deps(sample_state)
    result = await handle_session_ended(
        deps,
        {"type": "session.created", "finalOutcome": "pass", "sessionId": "s1"},
    )
    assert result is None
    assert bag["fetch_calls"] == []


@pytest.mark.asyncio
async def test_handle_skips_when_session_missing(sample_state: SessionCertState) -> None:
    deps, bag = _make_deps(state=None)
    result = await handle_session_ended(
        deps,
        {"type": "session.ended", "finalOutcome": "pass", "sessionId": "s1"},
    )
    assert result is None
    assert bag["fetch_calls"] == ["s1"]
    assert bag["uploads"] == []
    assert bag["rows"] == []
    assert bag["publishes"] == []


@pytest.mark.asyncio
async def test_handle_happy_path(sample_state: SessionCertState) -> None:
    state = _ok_state(sample_state, "s1")
    deps, bag = _make_deps(state)

    result = await handle_session_ended(
        deps,
        {"type": "session.ended", "finalOutcome": "pass", "sessionId": "s1"},
    )

    assert result is not None
    assert result.cert_id == state.cert_id
    assert result.cert_url.endswith("/s1.pdf")

    assert bag["fetch_calls"] == ["s1"]
    assert len(bag["uploads"]) == 1
    assert bag["uploads"][0][0] == state.org_id
    assert bag["uploads"][0][1] == "s1"
    assert bag["uploads"][0][2] > 100  # non-trivial PDF size

    assert len(bag["rows"]) == 1
    row = bag["rows"][0]
    assert row.session_id == "s1"
    assert row.cert_id == state.cert_id
    assert row.storage_backend == "local"
    assert len(row.cert_hash) == 64  # sha256 hex
    assert isinstance(row.issued_at, datetime)
    assert row.issued_at.tzinfo == UTC

    assert len(bag["publishes"]) == 1
    pub = bag["publishes"][0]
    assert pub.session_id == "s1"
    assert pub.org_id == state.org_id
    assert pub.cert_id == state.cert_id


@pytest.mark.asyncio
async def test_handle_swallows_upload_failure(sample_state: SessionCertState) -> None:
    state = _ok_state(sample_state, "s1")
    deps, bag = _make_deps(state)
    bag["upload_should_raise"] = True

    result = await handle_session_ended(
        deps,
        {"type": "session.ended", "finalOutcome": "pass", "sessionId": "s1"},
    )
    assert result is None
    # Failed mid-pipeline: no row, no publish.
    assert bag["rows"] == []
    assert bag["publishes"] == []
