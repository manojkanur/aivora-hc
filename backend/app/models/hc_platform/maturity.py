"""Maturity models, bands, assessments, dimension results (Domain 5)."""

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
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class MaturityModel(UUIDBase):
    """Global or tenant maturity model definition."""

    __tablename__ = "maturity_models"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dimensions: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    is_global: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MaturityBand(UUIDBase):
    """Score band (e.g. 'Emerging', 'Mature') within a maturity model."""

    __tablename__ = "maturity_bands"
    __table_args__ = (
        UniqueConstraint("maturity_model_id", "band_name", name="uq_maturity_bands_model_name"),
    )

    maturity_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("maturity_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    band_name: Mapped[str] = mapped_column(String(100), nullable=False)
    min_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    max_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class MaturityAssessment(UUIDBase):
    """Computed maturity assessment for a review."""

    __tablename__ = "maturity_assessments"

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
    maturity_model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("maturity_models.id"),  # NO ACTION (reference table)
        nullable=False,
    )
    overall_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    overall_band: Mapped[str | None] = mapped_column(String(100), nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    inputs_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MaturityDimensionResult(UUIDBase):
    """Per-dimension result row within a maturity assessment."""

    __tablename__ = "maturity_dimension_results"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id", "dimension_key", name="uq_maturity_dimension_results_assessment_dim"
        ),
    )

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("maturity_assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dimension_key: Mapped[str] = mapped_column(String(100), nullable=False)
    score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    band_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criticality: Mapped[str | None] = mapped_column(String(50), nullable=True)
    readiness: Mapped[str | None] = mapped_column(String(50), nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
