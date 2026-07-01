"""Module catalog (Domain 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Module(Base):
    """Catalog of platform modules (Replit ``modules`` table).

    Drives marketplace UI and entitlement checks.
    """

    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="prototype", server_default="prototype"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    plan_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
