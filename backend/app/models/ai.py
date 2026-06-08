from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.skill import SkillRegistry
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.workspace import Workspace


class AiJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class DraftApprovalStatus(str, enum.Enum):
    pending = "pending"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    ready = "ready"


class AiJob(UUIDBase):
    __tablename__ = "ai_jobs"

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
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[AiJobStatus] = mapped_column(
        Enum(AiJobStatus, name="ai_job_status_enum"),
        nullable=False,
        default=AiJobStatus.pending,
    )
    credits_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="ai_jobs", lazy="noload")
    skill: Mapped["SkillRegistry"] = relationship("SkillRegistry", lazy="noload")
    user: Mapped["User | None"] = relationship("User", lazy="noload")
    drafts: Mapped[list["AiDraft"]] = relationship(
        "AiDraft", back_populates="ai_job", lazy="noload"
    )


class AiDraft(UUIDBase):
    __tablename__ = "ai_drafts"

    ai_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
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
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    approval_status: Mapped[DraftApprovalStatus] = mapped_column(
        Enum(DraftApprovalStatus, name="draft_approval_status_enum"),
        nullable=False,
        default=DraftApprovalStatus.pending,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    ai_job: Mapped["AiJob"] = relationship("AiJob", back_populates="drafts", lazy="noload")
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="ai_drafts", lazy="noload")
    skill: Mapped["SkillRegistry"] = relationship("SkillRegistry", lazy="noload")
    exports: Mapped[list["Export"]] = relationship(
        "Export", back_populates="draft", lazy="noload"
    )


class AiAuditLog(UUIDBase):
    __tablename__ = "ai_audit_logs"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    skill_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    tenant: Mapped["Tenant | None"] = relationship("Tenant")
    user: Mapped["User | None"] = relationship("User")
