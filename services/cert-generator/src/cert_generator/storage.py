"""Certificate PDF storage adapters.

Two backends:
  - ``local``: write to disk under ``LOCAL_OUTPUT_DIR``. Dev default.
  - ``supabase``: upload to a Supabase Storage bucket via the storage REST
    API. Prod / Railway.

Both return the same ``UploadResult`` so the worker can record a unified
row in the ``certificates`` table.
"""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import Config


@dataclass(frozen=True)
class UploadResult:
    storage_backend: str  # "local" | "supabase"
    storage_key: str
    url: str


def _supabase_key(org_id: str, session_id: str) -> str:
    return f"{org_id}/{session_id}.pdf"


def _supabase_public_url(cfg: Config, key: str) -> str:
    return f"{cfg.supabase_url.rstrip('/')}/storage/v1/object/public/{cfg.supabase_bucket}/{key}"


def _upload_to_supabase(
    cfg: Config, key: str, pdf_bytes: bytes, *, upsert: bool = True
) -> None:
    """Upload PDF bytes to Supabase Storage via the REST API.

    We use stdlib ``urllib`` so we don't have to add another transitive dep.
    Supabase's storage API takes raw bytes with an ``Authorization`` header,
    not a presigned URL.
    """
    assert cfg.supabase_url is not None and cfg.supabase_service_key is not None
    url = (
        f"{cfg.supabase_url.rstrip('/')}/storage/v1/object/"
        f"{cfg.supabase_bucket}/{key}"
    )
    req = urllib.request.Request(
        url,
        data=pdf_bytes,
        method="POST",
        headers={
            "Authorization": f"Bearer {cfg.supabase_service_key}",
            "Content-Type": "application/pdf",
            "x-upsert": "true" if upsert else "false",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 — trusted host
        if resp.status >= 300:
            body = resp.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase upload failed: status={resp.status} body={body}"
            )


def upload(
    cfg: Config,
    org_id: str,
    session_id: str,
    pdf_bytes: bytes,
    *,
    transport=None,  # injectable for tests; takes (cfg, key, bytes)
) -> UploadResult:
    """Upload ``pdf_bytes`` to the configured backend and return where it landed.

    `transport` is a seam for tests: a callable matching the signature of
    ``_upload_to_supabase`` that replaces the real HTTP path.
    """
    if cfg.storage_backend == "supabase":
        key = _supabase_key(org_id, session_id)
        (transport or _upload_to_supabase)(cfg, key, pdf_bytes)
        return UploadResult(
            storage_backend="supabase",
            storage_key=key,
            url=_supabase_public_url(cfg, key),
        )

    if cfg.storage_backend == "local":
        out_dir = Path(cfg.local_output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{session_id}.pdf"
        path.write_bytes(pdf_bytes)
        return UploadResult(
            storage_backend="local",
            storage_key=str(path),
            url=f"file://{path.resolve()}",
        )

    raise ValueError(f"Unknown storage_backend: {cfg.storage_backend}")
