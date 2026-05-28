"""Environment loading + typed config.

Reads .env.local at the repo root (written by ``pnpm run setup``) and merges it into
os.environ. Mirrors the Node config so the verifier and the backend share infra.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
ENV_LOCAL = REPO_ROOT / ".env.local"

_loaded = False


def load_env() -> None:
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
            raise RuntimeError(f"Missing required env var: {key}. Run `pnpm run setup`.")
        return fallback
    return v


@dataclass(frozen=True)
class S3Config:
    endpoint: str
    bucket: str
    region: str
    access_key_id: str
    secret_access_key: str
    force_path_style: bool


@dataclass(frozen=True)
class Config:
    database_url: str
    redis_url: str
    anthropic_api_key: str | None
    anthropic_model: str
    s3: S3Config
    verifier_mock: bool

    @property
    def use_mock(self) -> bool:
        """True when no real API key is configured or the mock toggle is on."""
        return self.verifier_mock or not self.anthropic_api_key


def get_config() -> Config:
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key and api_key.startswith("<"):
        api_key = None
    return Config(
        database_url=_get(
            "DATABASE_URL",
            "postgresql://field_iq:field_iq_dev@localhost:5432/field_iq",
        ),
        redis_url=_get("REDIS_URL", "redis://localhost:6379"),
        anthropic_api_key=api_key,
        anthropic_model=_get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        s3=S3Config(
            endpoint=_get("S3_ENDPOINT", "http://localhost:9000"),
            bucket=_get("S3_BUCKET", "field-iq"),
            region=_get("S3_REGION", "us-east-1"),
            access_key_id=_get("S3_ACCESS_KEY_ID", "field_iq"),
            secret_access_key=_get("S3_SECRET_ACCESS_KEY", "field_iq_dev"),
            force_path_style=_get("S3_FORCE_PATH_STYLE", "true").lower() == "true",
        ),
        verifier_mock=_get("VERIFIER_MOCK", "true").lower() == "true",
    )
