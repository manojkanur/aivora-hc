"""Role capability profiles + requirements + adjacency (Domain 8)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class RoleCapabilityProfile(UUIDBase):
    """Role definition with capability requirements (target side of capability_assessments)."""

    __tablename__ = "role_capability_profiles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "role_code", name="uq_role_capability_profiles_tenant_code"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    framework_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_frameworks.id", ondelete="SET NULL"),
        nullable=True,
    )
    role_code: Mapped[str] = mapped_column(String(100), nullable=False)
    role_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_family: Mapped[str | None] = mapped_column(String(100), nullable=True)
    career_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    job_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    function: Mapped[str | None] = mapped_column(String(100), nullable=True)
    leadership_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    criticality: Mapped[str] = mapped_column(
        String(50), nullable=False, default="standard", server_default="standard"
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual", server_default="manual"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoleCapabilityRequirement(UUIDBase):
    """Capability-level requirement attached to a role profile."""

    __tablename__ = "role_capability_requirements"
    __table_args__ = (
        UniqueConstraint(
            "role_profile_id",
            "framework_item_id",
            name="uq_role_capability_requirements_role_item",
        ),
    )

    role_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="CASCADE"),
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
    priority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoleAdjacency(UUIDBase):
    """Directed adjacency between role profiles (lateral/promotion)."""

    __tablename__ = "role_adjacencies"
    __table_args__ = (
        UniqueConstraint(
            "from_role_profile_id",
            "to_role_profile_id",
            "type",
            name="uq_role_adjacencies_from_to_type",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_role_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_role_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    distance: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    rationale: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class RoleMobilityFacet(UUIDBase):
    """Extra mobility-specific attributes for a role profile."""

    __tablename__ = "role_mobility_facets"
    __table_args__ = (
        UniqueConstraint("role_profile_id", name="uq_role_mobility_facets_role"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leadership_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    criticality: Mapped[str] = mapped_column(
        String(50), nullable=False, default="standard", server_default="standard"
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="manual", server_default="manual"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
