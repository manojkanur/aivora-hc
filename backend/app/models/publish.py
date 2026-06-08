from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.export import Export
    from app.models.workspace import Workspace


class PublishPlatform(str, enum.Enum):
    linkedin = "linkedin"


class PublishStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    scheduled = "scheduled"
    published = "published"
    failed = "failed"


class PublishQueue(UUIDBase):
    __tablename__ = "publish_queue"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    export_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exports.id", ondelete="SET NULL"),
        nullable=True,
    )
    platform: Mapped[PublishPlatform] = mapped_column(
        Enum(PublishPlatform, name="publish_platform_enum"),
        nullable=False,
        default=PublishPlatform.linkedin,
    )
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[PublishStatus] = mapped_column(
        Enum(PublishStatus, name="publish_status_enum"),
        nullable=False,
        default=PublishStatus.draft,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="publish_queue")
    export: Mapped["Export | None"] = relationship("Export")
    logs: Mapped[list["PublishLog"]] = relationship(
        "PublishLog", back_populates="queue_item", lazy="select"
    )


class PublishLog(UUIDBase):
    __tablename__ = "publish_logs"

    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("publish_queue.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    response_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    queue_item: Mapped["PublishQueue"] = relationship("PublishQueue", back_populates="logs")
