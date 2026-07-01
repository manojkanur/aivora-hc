from __future__ import annotations

import enum
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.ai import AiDraft
    from app.models.tenant import Tenant
    from app.models.workspace import Workspace


class ExportFormat(str, enum.Enum):
    pptx = "pptx"
    pdf = "pdf"
    docx = "docx"
    html = "html"


class ExportStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class BrandKit(UUIDBase):
    __tablename__ = "brand_kits"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#000000")
    secondary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#ffffff")
    font: Mapped[str] = mapped_column(String(100), nullable=False, default="Inter")
    template_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="brand_kits")
    exports: Mapped[list["Export"]] = relationship(
        "Export", back_populates="brand_kit", lazy="select"
    )


class Export(UUIDBase):
    __tablename__ = "exports"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    draft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_drafts.id", ondelete="CASCADE"),
        nullable=False,
    )
    brand_kit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brand_kits.id", ondelete="SET NULL"),
        nullable=True,
    )
    format: Mapped[ExportFormat] = mapped_column(
        Enum(ExportFormat, name="export_format_enum"), nullable=False
    )
    s3_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[ExportStatus] = mapped_column(
        Enum(ExportStatus, name="export_status_enum"),
        nullable=False,
        default=ExportStatus.pending,
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="exports")
    draft: Mapped["AiDraft"] = relationship("AiDraft", back_populates="exports")
    brand_kit: Mapped["BrandKit | None"] = relationship("BrandKit", back_populates="exports")
