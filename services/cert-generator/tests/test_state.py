"""Unit tests for the pure helpers in state.py.

DB-touching `assemble` is exercised via the worker integration test with a
mocked connection.
"""

from __future__ import annotations

from datetime import UTC, datetime

from cert_generator.state import _sample_three, generate_cert_id


def test_cert_id_format() -> None:
    cid = generate_cert_id(
        now=datetime(2026, 6, 8, tzinfo=UTC),
        rand=b"\x00\x00\x00\x01",
    )
    assert cid.startswith("FIQ-2026-06-08-")
    suffix = cid.split("-")[-1]
    assert len(suffix) == 6


def test_cert_id_deterministic_with_seeds() -> None:
    args = dict(now=datetime(2026, 6, 8, tzinfo=UTC), rand=b"\xde\xad\xbe\xef")
    assert generate_cert_id(**args) == generate_cert_id(**args)


def test_cert_id_alphabet_excludes_ambiguous() -> None:
    cid = generate_cert_id(now=datetime(2026, 6, 8, tzinfo=UTC), rand=b"\xff\xff\xff\xff")
    suffix = cid.split("-")[-1]
    for ch in suffix:
        assert ch not in "ILOU01"


def test_sample_three_picks_first_middle_last() -> None:
    assert _sample_three([]) == []
    assert _sample_three(["a"]) == ["a"]
    assert _sample_three(["a", "b"]) == ["a", "b"]
    assert _sample_three(["a", "b", "c", "d", "e"]) == ["a", "c", "e"]
    assert _sample_three(["a", "b", "c", "d", "e", "f"]) == ["a", "d", "f"]
