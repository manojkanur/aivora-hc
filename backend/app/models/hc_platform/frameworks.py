"""Frameworks + reviews + extracted frameworks (Domain 3)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDBase


# ---------------------------------------------------------------------------
# frameworks (UUID pk)
# ---------------------------------------------------------------------------


class Framework(UUIDBase):
    """Tenant-owned HC framework root container."""

    __tablename__ = "frameworks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),  # NO ACTION (matches Replit)
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    framework_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    is_template: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


# ---------------------------------------------------------------------------
# framework_components (SERIAL pk, self-referencing)
# ---------------------------------------------------------------------------


class FrameworkComponent(Base):
    """Ordered dimensions/components inside a framework."""

    __tablename__ = "framework_components"
    __table_args__ = (
        UniqueConstraint("framework_id", "code", name="uq_framework_components_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    framework_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("frameworks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("framework_components.id", ondelete="SET NULL"),
        nullable=True,
    )
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    maturity_level: Mapped[str] = mapped_column(
        String(50), nullable=False, default="initial", server_default="initial"
    )
    criteria: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    parent: Mapped["FrameworkComponent | None"] = relationship(
        "FrameworkComponent",
        remote_side="FrameworkComponent.id",
        back_populates="children",
    )
    children: Mapped[list["FrameworkComponent"]] = relationship(
        "FrameworkComponent",
        back_populates="parent",
    )


# ---------------------------------------------------------------------------
# framework_reviews (UUID pk)
# ---------------------------------------------------------------------------


class FrameworkReview(UUIDBase):
    """Instance of running a framework on a specific project."""

    __tablename__ = "framework_reviews"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    framework_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("frameworks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    review_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="full", server_default="full"
    )
    scope: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


# ---------------------------------------------------------------------------
# review_runs (UUID pk)
# ---------------------------------------------------------------------------


class ReviewRun(UUIDBase):
    """Each execution attempt of a framework_review."""

    __tablename__ = "review_runs"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("framework_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", server_default="pending"
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


# ---------------------------------------------------------------------------
# extracted_frameworks (UUID pk)
# ---------------------------------------------------------------------------


class ExtractedFramework(UUIDBase):
    """Framework structures auto-extracted (manually or AI) from uploaded docs."""

    __tablename__ = "extracted_frameworks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # FK to project_documents added in a later phase (Domain 9 deferred)
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    extraction_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual", server_default="manual"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    extracted_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
