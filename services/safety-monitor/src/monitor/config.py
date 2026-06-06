"""Environment loading + typed config.

Mirrors services/verifier/src/verifier/config.py so the two Python services
read the same env vars the same way.
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
    anthropic_api_key: str | None
    anthropic_model: str
    base_interval_s: float
    escalated_interval_s: float
    inactive_session_ttl_s: float
    confidence_threshold: float
    monitor_mock: bool

    @property
    def use_mock(self) -> bool:
        """True when no real API key is configured or the mock toggle is on."""
        return self.monitor_mock or not self.anthropic_api_key


def get_config() -> Config:
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key and api_key.startswith("<"):
        api_key = None
    return Config(
        redis_url=_get("REDIS_URL", "redis://localhost:6379"),
        database_url=_get(
            "DATABASE_URL",
            "postgresql://field_iq:field_iq_dev@localhost:5432/field_iq",
        ),
        anthropic_api_key=api_key,
        anthropic_model=_get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        base_interval_s=float(_get("BASE_INTERVAL_S", "15.0")),
        escalated_interval_s=float(_get("ESCALATED_INTERVAL_S", "5.0")),
        inactive_session_ttl_s=float(_get("INACTIVE_SESSION_TTL_S", "300.0")),
        confidence_threshold=float(_get("CONFIDENCE_THRESHOLD", "0.6")),
        monitor_mock=_get("MONITOR_MOCK", "true").lower() == "true",
    )
