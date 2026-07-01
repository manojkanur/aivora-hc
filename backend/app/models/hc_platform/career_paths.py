"""Career paths (Domain 8)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class CareerPath(UUIDBase):
    """Named career path container."""

    __tablename__ = "career_paths"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class CareerPathStop(UUIDBase):
    """Ordered stop (role) inside a career path."""

    __tablename__ = "career_path_stops"
    __table_args__ = (
        UniqueConstraint("career_path_id", "sort_order", name="uq_career_path_stops_path_order"),
    )

    career_path_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("career_paths.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role_capability_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    time_in_role_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prerequisites: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
