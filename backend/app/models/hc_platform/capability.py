"""Capability frameworks, assessments, ratings, skill tags (Domain 3)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDBase


_DEFAULT_PROFICIENCY_SCALE: list[dict[str, Any]] = [
    {"level": 0, "label": "Not Applicable"},
    {"level": 1, "label": "Awareness"},
    {"level": 2, "label": "Working"},
    {"level": 3, "label": "Practitioner"},
    {"level": 4, "label": "Advanced"},
    {"level": 5, "label": "Expert"},
]


class CapabilityFramework(UUIDBase):
    """Capability/skill framework with proficiency scale."""

    __tablename__ = "capability_frameworks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    framework_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    proficiency_scale: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: list(_DEFAULT_PROFICIENCY_SCALE),
    )
    is_template: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class CapabilityFrameworkItem(UUIDBase):
    """Individual skills/competencies inside a capability framework."""

    __tablename__ = "capability_framework_items"
    __table_args__ = (
        UniqueConstraint("framework_id", "code", name="uq_capability_framework_items_code"),
    )

    framework_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_frameworks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_framework_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    parent: Mapped["CapabilityFrameworkItem | None"] = relationship(
        "CapabilityFrameworkItem",
        remote_side="CapabilityFrameworkItem.id",
        back_populates="children",
    )
    children: Mapped[list["CapabilityFrameworkItem"]] = relationship(
        "CapabilityFrameworkItem",
        back_populates="parent",
    )


class CapabilityAssessment(UUIDBase):
    """Single assessment instance against a capability framework."""

    __tablename__ = "capability_assessments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    framework_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_frameworks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # role_capability_profiles is deferred to a later phase — keep as a plain UUID
    # (no FK) for now so this migration is self-contained. FK will be added later.
    role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    subject_type: Mapped[str] = mapped_column(String(50), nullable=False)
    subject_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft", server_default="draft"
    )
    rating_source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="self", server_default="self"
    )
    assessor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class CapabilityRating(UUIDBase):
    """Per-skill rating row within an assessment."""

    __tablename__ = "capability_ratings"
    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "framework_item_id",
            name="uq_capability_ratings_assessment_item",
        ),
    )

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    framework_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_framework_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    current_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class SkillTag(UUIDBase):
    """Tags applicable to skills; 'global' scope shares tenant_id NULL space."""

    __tablename__ = "skill_tags"
    __table_args__ = (
        UniqueConstraint("scope", "tenant_id", "code", name="uq_skill_tags_scope_tenant_code"),
    )

    scope: Mapped[str] = mapped_column(String(50), nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general", server_default="general"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class FrameworkItemTag(Base):
    """Many-to-many: capability framework items <-> skill tags."""

    __tablename__ = "framework_item_tags"
    __table_args__ = (
        PrimaryKeyConstraint(
            "framework_item_id", "tag_id", name="pk_framework_item_tags"
        ),
    )

    framework_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("capability_framework_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("skill_tags.id", ondelete="CASCADE"),
        nullable=False,
    )
