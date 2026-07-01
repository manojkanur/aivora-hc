"""Mobility frameworks, employee profiles, opportunities, matches, movements (Domain 8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDBase


class MobilityFramework(UUIDBase):
    """Tenant mobility framework configuration."""

    __tablename__ = "mobility_frameworks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mode: Mapped[str] = mapped_column(
        String(50), nullable=False, default="hybrid", server_default="hybrid"
    )
    fit_weights: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    eligibility_rules: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class EmployeeMobilityProfile(UUIDBase):
    """Per-employee mobility profile."""

    __tablename__ = "employee_mobility_profiles"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_ref", name="uq_employee_mobility_profiles_tenant_ref"
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    current_role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    performance_tier: Mapped[str] = mapped_column(
        String(50), nullable=False, default="meets", server_default="meets"
    )
    readiness: Mapped[str] = mapped_column(
        String(50), nullable=False, default="ready_24_months", server_default="ready_24_months"
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual", server_default="manual"
    )
    tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityOpportunity(UUIDBase):
    """Open opportunity (role/project) employees can match against."""

    __tablename__ = "mobility_opportunities"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="open", server_default="open"
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityOpportunityRequirement(UUIDBase):
    """Required capability for a mobility opportunity."""

    __tablename__ = "mobility_opportunity_requirements"
    __table_args__ = (
        UniqueConstraint(
            "opportunity_id",
            "framework_item_id",
            name="uq_mobility_opportunity_requirements_opp_item",
        ),
    )

    opportunity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobility_opportunities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    framework_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_framework_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    required_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityMatchResult(UUIDBase):
    """Cached match score between an employee profile and an opportunity."""

    __tablename__ = "mobility_match_results"
    __table_args__ = (
        UniqueConstraint(
            "profile_id",
            "opportunity_id",
            "engine",
            "weights_hash",
            "inputs_hash",
            name="uq_mobility_match_results_profile_opp_engine",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_mobility_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    opportunity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobility_opportunities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    engine: Mapped[str] = mapped_column(
        String(50), nullable=False, default="deterministic_v1", server_default="deterministic_v1"
    )
    weights_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    inputs_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(50), nullable=True)
    breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityMovement(UUIDBase):
    """Realized or proposed move from one role to another."""

    __tablename__ = "mobility_movements"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_mobility_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobility_opportunities.id", ondelete="SET NULL"),
        nullable=True,
    )
    from_role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    movement_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="proposed", server_default="proposed"
    )
    outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityMovementEvent(Base):
    """Event/audit row for movement state changes."""

    __tablename__ = "mobility_movement_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    movement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobility_movements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MobilityPreference(UUIDBase):
    """Employee mobility preference row."""

    __tablename__ = "mobility_preferences"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_mobility_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str | None] = mapped_column(String(100), nullable=True)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityReadinessAssessment(UUIDBase):
    """Discrete readiness assessment snapshot for an employee."""

    __tablename__ = "mobility_readiness_assessments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_mobility_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    readiness: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manager", server_default="manager"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityEligibilityRule(UUIDBase):
    """Eligibility rule scoped to a tenant / owner."""

    __tablename__ = "mobility_eligibility_rules"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owner_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rule: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityBarrier(UUIDBase):
    """Identified mobility barrier."""

    __tablename__ = "mobility_barriers"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope: Mapped[str | None] = mapped_column(String(50), nullable=True)
    scope_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    severity: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium", server_default="medium"
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityRollup(UUIDBase):
    """Period rollup of mobility metrics."""

    __tablename__ = "mobility_rollups"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "scope",
            "scope_ref",
            "period_label",
            name="uq_mobility_rollups_tenant_scope_period",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope: Mapped[str | None] = mapped_column(String(50), nullable=True)
    scope_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityMoveType(Base):
    """Reference table of supported move type codes."""

    __tablename__ = "mobility_move_types"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class MobilityKpiDictionary(Base):
    """Reference table of mobility KPI keys + formulas."""

    __tablename__ = "mobility_kpi_dictionary"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class TalentVisibilitySignal(Base):
    """Visibility signal weighted into mobility matching."""

    __tablename__ = "talent_visibility_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_mobility_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
