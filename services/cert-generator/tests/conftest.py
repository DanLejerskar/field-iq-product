"""Shared fixtures."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from cert_generator.state import SessionCertState, StepResult


def _ten_steps() -> list[StepResult]:
    titles = [
        "Notify affected employees",
        "Identify energy sources",
        "Shut down equipment",
        "Apply lockout device",
        "Apply personal lock",
        "Attach danger tag",
        "Verify zero energy state",
        "Begin authorized work",
        "Remove personal lock",
        "Restore equipment to service",
    ]
    results = []
    for i, t in enumerate(titles, start=1):
        retry = 1 if i == 4 else 0
        results.append(
            StepResult(
                step_number=i,
                title=t,
                status="retry_passed" if retry else "pass",
                retry_count=retry,
            )
        )
    return results


@pytest.fixture
def sample_state() -> SessionCertState:
    return SessionCertState(
        session_id="11111111-1111-1111-1111-111111111111",
        org_id="22222222-2222-2222-2222-222222222222",
        cert_id="FIQ-2026-06-08-A7B3X9",
        worker_name="Maya Wu",
        worker_role="Field Technician",
        supervisor_name="Priya Singh",
        organization_name="EON Industrial Demo",
        procedure_title="DAC #811 Lockout/Tagout",
        procedure_id="33333333-3333-3333-3333-333333333333",
        started_at=datetime(2026, 6, 8, 14, 0, 0, tzinfo=UTC),
        ended_at=datetime(2026, 6, 8, 14, 12, 11, tzinfo=UTC),
        duration_seconds=731,
        location="DAC #811 — Bay 3",
        steps=_ten_steps(),
        sample_photo_urls=[],
        verify_url="https://app.fieldiq.io/verify/FIQ-2026-06-08-A7B3X9",
    )
