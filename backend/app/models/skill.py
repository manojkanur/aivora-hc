from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class SkillTier(str, enum.Enum):
    starter = "starter"
    professional = "professional"
    enterprise = "enterprise"
    advisory = "advisory"


class SkillStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class SkillRegistry(UUIDBase):
    __tablename__ = "skill_registry"

    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tier: Mapped[SkillTier] = mapped_column(
        Enum(SkillTier, name="skill_tier_enum"), nullable=False, default=SkillTier.starter
    )
    credit_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[SkillStatus] = mapped_column(
        Enum(SkillStatus, name="skill_status_enum"), nullable=False, default=SkillStatus.active
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    workspace_skills: Mapped[list["WorkspaceSkill"]] = relationship(
        "WorkspaceSkill", back_populates="skill", lazy="select"
    )


class WorkspaceSkill(UUIDBase):
    __tablename__ = "workspace_skills"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("skill_registry.id", ondelete="CASCADE"),
        nullable=False,
    )
    state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    last_ai_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Override created_at only (no updated_at on this model since base has it)
    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="workspace_skills")
    skill: Mapped["SkillRegistry"] = relationship("SkillRegistry", back_populates="workspace_skills")
