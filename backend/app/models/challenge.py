from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.ai import AiDraft
    from app.models.user import User
    from app.models.workspace import Workspace


class BriefStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    processing = "processing"
    completed = "completed"


class ChallengeBrief(UUIDBase):
    __tablename__ = "challenge_briefs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[BriefStatus] = mapped_column(
        Enum(BriefStatus, name="brief_status_enum"),
        nullable=False,
        default=BriefStatus.draft,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    user: Mapped["User | None"] = relationship("User")
    outputs: Mapped[list["BriefOutput"]] = relationship(
        "BriefOutput", back_populates="brief", lazy="select"
    )


class BriefOutput(UUIDBase):
    __tablename__ = "brief_outputs"

    brief_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("challenge_briefs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id: Mapped[str] = mapped_column(String(100), nullable=False)
    draft_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_drafts.id", ondelete="SET NULL"),
        nullable=True,
    )
    output_type: Mapped[str] = mapped_column(String(100), nullable=False)

    brief: Mapped["ChallengeBrief"] = relationship("ChallengeBrief", back_populates="outputs")
    draft: Mapped["AiDraft | None"] = relationship("AiDraft")
