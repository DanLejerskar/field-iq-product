"""Postgres writes for the certificates table.

Read paths live in ``state.assemble`` — this module only owns the side-effect
of recording an issued certificate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import psycopg


@dataclass(frozen=True)
class CertificateRow:
    session_id: str
    cert_id: str
    cert_url: str
    cert_hash: str
    storage_backend: str
    storage_key: str
    issued_at: datetime


_INSERT_CERT = """
INSERT INTO certificates
  (session_id, cert_id, cert_url, cert_hash, storage_backend, storage_key, issued_at)
VALUES
  (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (cert_id) DO NOTHING
RETURNING id
"""


def insert_certificate(conn: psycopg.Connection, row: CertificateRow) -> str | None:
    """INSERT a certificate row. Returns the new id, or None if the cert_id
    already exists (idempotent on retry)."""
    with conn.cursor() as cur:
        cur.execute(
            _INSERT_CERT,
            (
                row.session_id,
                row.cert_id,
                row.cert_url,
                row.cert_hash,
                row.storage_backend,
                row.storage_key,
                row.issued_at,
            ),
        )
        result = cur.fetchone()
    conn.commit()
    if result is None:
        return None
    return str(result[0])
