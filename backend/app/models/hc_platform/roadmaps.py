"""Roadmaps, outputs, phases, recommendations (Domain 6)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class Roadmap(UUIDBase):
    """Roadmap container for a tenant/project."""

    __tablename__ = "roadmaps"

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
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    target_state_design_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("target_state_designs.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoadmapOutput(UUIDBase):
    """Versioned generated roadmap output for a review."""

    __tablename__ = "roadmap_outputs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    output_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoadmapPhase(UUIDBase):
    """Phase grouping (e.g. now/next/later) inside a review's roadmap."""

    __tablename__ = "roadmap_phases"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    start_horizon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    end_horizon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoadmapRecommendation(UUIDBase):
    """Recommendation row within a roadmap, optionally linked to library."""

    __tablename__ = "roadmap_recommendations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recommendation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recommendation_library.id", ondelete="SET NULL"),
        nullable=True,
    )
    phase_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roadmap_phases.id", ondelete="SET NULL"),
        nullable=True,
    )
    tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    effort: Mapped[str | None] = mapped_column(Text, nullable=True)
    dependencies: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    time_horizon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
