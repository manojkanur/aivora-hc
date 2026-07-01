"""Benchmarks (Domain 5)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class BenchmarkProfile(UUIDBase):
    """Reference benchmark profile (industry/region/size)."""

    __tablename__ = "benchmark_profiles"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    benchmark_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="industry", server_default="industry"
    )
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class BenchmarkDimensionScore(UUIDBase):
    """Per-dimension score within a benchmark profile."""

    __tablename__ = "benchmark_dimension_scores"
    __table_args__ = (
        UniqueConstraint(
            "benchmark_profile_id", "dimension_key", name="uq_benchmark_dimension_scores_profile_dim"
        ),
    )

    benchmark_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("benchmark_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_key: Mapped[str] = mapped_column(String(100), nullable=False)
    score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    percentile: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class BenchmarkComparison(UUIDBase):
    """Computed comparison of a review against a benchmark profile."""

    __tablename__ = "benchmark_comparisons"

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
    benchmark_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("benchmark_profiles.id"),  # NO ACTION
        nullable=False,
    )
    comparison_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    overall_positioning: Mapped[str | None] = mapped_column(Text, nullable=True)
    gap_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class BenchmarkGroup(UUIDBase):
    """Named group/peer-set for benchmarking."""

    __tablename__ = "benchmark_groups"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    members: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
