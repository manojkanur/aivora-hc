from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.ai import AiDraft, AiJob
    from app.models.connector import WorkspaceConnector
    from app.models.export import Export
    from app.models.publish import PublishQueue
    from app.models.skill import WorkspaceSkill
    from app.models.tenant import Tenant
    from app.models.user import User


class WorkspaceStatus(str, enum.Enum):
    active = "active"
    archived = "archived"


class Workspace(UUIDBase):
    __tablename__ = "workspaces"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[WorkspaceStatus] = mapped_column(
        Enum(WorkspaceStatus, name="workspace_status_enum"),
        nullable=False,
        default=WorkspaceStatus.active,
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="workspaces")
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])
    workspace_skills: Mapped[list["WorkspaceSkill"]] = relationship(
        "WorkspaceSkill", back_populates="workspace", lazy="select"
    )
    ai_jobs: Mapped[list["AiJob"]] = relationship(
        "AiJob", back_populates="workspace", lazy="select"
    )
    ai_drafts: Mapped[list["AiDraft"]] = relationship(
        "AiDraft", back_populates="workspace", lazy="select"
    )
    exports: Mapped[list["Export"]] = relationship(
        "Export", back_populates="workspace", lazy="select"
    )
    publish_queue: Mapped[list["PublishQueue"]] = relationship(
        "PublishQueue", back_populates="workspace", lazy="select"
    )
    connectors: Mapped[list["WorkspaceConnector"]] = relationship(
        "WorkspaceConnector", back_populates="workspace", lazy="select"
    )
