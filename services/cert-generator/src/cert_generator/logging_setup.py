"""Structlog configuration. Same JSON-friendly stack the sibling services use.

Set ``CERT_LOG_FORMAT=console`` for human-readable dev logs; default is JSON
so Railway can index fields directly.
"""

from __future__ import annotations

import logging
import os

import structlog


def configure_logging() -> None:
    """Idempotently configure structlog + stdlib logging."""
    fmt = os.environ.get("CERT_LOG_FORMAT", "json")

    logging.basicConfig(format="%(message)s", level=logging.INFO)

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if fmt == "console":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
