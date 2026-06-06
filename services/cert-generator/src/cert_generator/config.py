"""Environment loading + typed config.

Mirrors services/safety-monitor/src/monitor/config.py so the Python services
all read the same env vars the same way.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
ENV_LOCAL = REPO_ROOT / ".env.local"

_loaded = False


def load_env() -> None:
    """Merge .env.local into os.environ. Idempotent."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    if not ENV_LOCAL.exists():
        return
    for raw in ENV_LOCAL.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _get(key: str, fallback: str | None = None) -> str:
    load_env()
    v = os.environ.get(key)
    if v is None or v.startswith("<") or v == "":
        if fallback is None:
            raise RuntimeError(f"Missing required env var: {key}.")
        return fallback
    return v


@dataclass(frozen=True)
class Config:
    redis_url: str
    database_url: str
    storage_backend: str  # "local" | "supabase"
    local_output_dir: str
    supabase_url: str | None
    supabase_service_key: str | None
    supabase_bucket: str
    verify_base_url: str


def get_config() -> Config:
    load_env()
    backend = _get("STORAGE_BACKEND", "local").lower()
    if backend not in {"local", "supabase"}:
        raise RuntimeError(
            f"Invalid STORAGE_BACKEND={backend!r}; expected 'local' or 'supabase'."
        )

    supabase_url = os.environ.get("SUPABASE_URL") or None
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY") or None
    if supabase_url and supabase_url.startswith("<"):
        supabase_url = None
    if supabase_key and supabase_key.startswith("<"):
        supabase_key = None

    if backend == "supabase" and (not supabase_url or not supabase_key):
        raise RuntimeError(
            "STORAGE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY."
        )

    return Config(
        redis_url=_get("REDIS_URL", "redis://localhost:6379"),
        database_url=_get(
            "DATABASE_URL",
            "postgresql://field_iq:field_iq_dev@localhost:5432/field_iq",
        ),
        storage_backend=backend,
        local_output_dir=_get("LOCAL_OUTPUT_DIR", "./certs"),
        supabase_url=supabase_url,
        supabase_service_key=supabase_key,
        supabase_bucket=_get("SUPABASE_BUCKET", "certificates"),
        verify_base_url=_get("VERIFY_BASE_URL", "https://app.fieldiq.io"),
    )
