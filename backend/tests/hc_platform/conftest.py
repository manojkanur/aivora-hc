"""Shared test scaffolding for hc_platform tests.

Adds SQLite renderers for the Postgres-specific column types so the in-memory
test database can host JSONB / UUID columns without a real Postgres.
"""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "JSON"


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "CHAR(36)"
