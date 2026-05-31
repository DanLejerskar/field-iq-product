"""Photo-fetcher data-URI decoding (Phase 2B, v1 in-database photo storage)."""

from __future__ import annotations

import base64
import binascii

import pytest

from verifier.worker import _decode_data_uri


def test_decode_data_uri_round_trips_bytes():
    payload = b"\xff\xd8\xff fake jpeg bytes"
    uri = "data:image/jpeg;base64," + base64.b64encode(payload).decode()
    assert _decode_data_uri(uri) == payload


def test_decode_data_uri_handles_no_mime_prefix():
    payload = b"abc"
    uri = "data:," + base64.b64encode(payload).decode()
    assert _decode_data_uri(uri) == payload


def test_decode_data_uri_rejects_garbage():
    with pytest.raises(binascii.Error):
        _decode_data_uri("data:image/jpeg;base64,!!!!")
