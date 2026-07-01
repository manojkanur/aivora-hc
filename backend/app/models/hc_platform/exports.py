"""HC platform exports (Domain 9).

Named `hc_platform_exports` to avoid collision with the pre-existing `exports`
table owned by the studios pipeline (`app.models.export.Export`).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class HcExport(UUIDBase):
    __tablename__ = "hc_platform_exports"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    generated_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("generated_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    export_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pdf", server_default="pdf"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", server_default="pending"
    )
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
