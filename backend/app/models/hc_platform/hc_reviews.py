"""HC reviews (Domain 4)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class HcReview(UUIDBase):
    """Top-level HC review engagement record."""

    __tablename__ = "hc_reviews"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    review_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="full_hc_review", server_default="full_hc_review"
    )
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    intake_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    diagnostic_results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    target_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    roadmap: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
