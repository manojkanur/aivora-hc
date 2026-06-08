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
    from app.models.workspace import Workspace


class ConnectorAuthType(str, enum.Enum):
    none = "none"
    api_key = "api_key"
    oauth2 = "oauth2"
    file_upload = "file_upload"


class ConnectorStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class SyncStatus(str, enum.Enum):
    idle = "idle"
    syncing = "syncing"
    synced = "synced"
    failed = "failed"


class ConnectorRegistry(UUIDBase):
    __tablename__ = "connector_registry"

    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_type: Mapped[ConnectorAuthType] = mapped_column(
        Enum(ConnectorAuthType, name="connector_auth_type_enum"),
        nullable=False,
        default=ConnectorAuthType.none,
    )
    schema_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ConnectorStatus] = mapped_column(
        Enum(ConnectorStatus, name="connector_status_enum"),
        nullable=False,
        default=ConnectorStatus.active,
    )
    credit_cost_monthly: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    workspace_connectors: Mapped[list["WorkspaceConnector"]] = relationship(
        "WorkspaceConnector", back_populates="connector", lazy="select"
    )


class WorkspaceConnector(UUIDBase):
    __tablename__ = "workspace_connectors"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("connector_registry.id", ondelete="CASCADE"),
        nullable=False,
    )
    credentials_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    sync_status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, name="sync_status_enum"),
        nullable=False,
        default=SyncStatus.idle,
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="connectors")
    connector: Mapped["ConnectorRegistry"] = relationship(
        "ConnectorRegistry", back_populates="workspace_connectors"
    )
