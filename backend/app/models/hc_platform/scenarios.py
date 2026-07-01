"""Scenarios (Domain 7)."""

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


class ScenarioModel(UUIDBase):
    """A 'what-if' scenario tied to a tenant/review."""

    __tablename__ = "scenario_models"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scenario_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    assumptions_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class ScenarioAssumption(UUIDBase):
    """Individual assumption row for a scenario."""

    __tablename__ = "scenario_assumptions"
    __table_args__ = (
        UniqueConstraint("scenario_id", "key", name="uq_scenario_assumptions_scenario_key"),
    )

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scenario_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class ScenarioOutput(UUIDBase):
    """Per-period output row for a scenario."""

    __tablename__ = "scenario_outputs"

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scenario_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class ScenarioRiskFlag(UUIDBase):
    """Risk flag attached to a scenario."""

    __tablename__ = "scenario_risk_flags"

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scenario_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    severity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class ScenarioTemplate(UUIDBase):
    """Reusable scenario template keyed by scenario_type."""

    __tablename__ = "scenario_templates"

    scenario_type: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_assumptions: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    formula_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
