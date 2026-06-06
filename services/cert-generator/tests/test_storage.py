from __future__ import annotations

from pathlib import Path

import pytest

from cert_generator.config import Config
from cert_generator.storage import upload


def _cfg(tmp_path: Path, *, backend: str = "local") -> Config:
    return Config(
        redis_url="redis://localhost:6379",
        database_url="postgresql://localhost/x",
        storage_backend=backend,
        local_output_dir=str(tmp_path / "certs"),
        supabase_url="https://test.supabase.co",
        supabase_service_key="service-key",
        supabase_bucket="certificates",
        verify_base_url="https://app.fieldiq.io",
    )


def test_local_writes_file(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path)
    result = upload(cfg, "org-1", "sess-1", b"%PDF-1.4\n...")
    assert result.storage_backend == "local"
    assert result.url.startswith("file://")
    p = Path(result.storage_key)
    assert p.exists()
    assert p.read_bytes().startswith(b"%PDF-")


def test_local_creates_output_dir(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path)
    out = Path(cfg.local_output_dir)
    assert not out.exists()
    upload(cfg, "org-1", "sess-1", b"%PDF-bytes")
    assert out.exists()


def test_supabase_routes_through_transport(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path, backend="supabase")
    calls: list[tuple[Config, str, bytes]] = []

    def fake_transport(cfg_: Config, key: str, data: bytes, **kw) -> None:
        calls.append((cfg_, key, data))

    result = upload(
        cfg, "org-1", "sess-1", b"%PDF-bytes", transport=fake_transport
    )
    assert result.storage_backend == "supabase"
    assert result.storage_key == "org-1/sess-1.pdf"
    assert "supabase.co/storage/v1/object/public/certificates/org-1/sess-1.pdf" in result.url
    assert calls and calls[0][1] == "org-1/sess-1.pdf"
    assert calls[0][2] == b"%PDF-bytes"


def test_unknown_backend_raises(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path, backend="local")
    # Bypass dataclass frozenness via object.__setattr__ — Config is frozen by default.
    object.__setattr__(cfg, "storage_backend", "ftp")
    with pytest.raises(ValueError):
        upload(cfg, "org", "sess", b"x")
