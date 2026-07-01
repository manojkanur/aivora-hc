"""Entitlements: plan -> module grants (Domain 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Entitlement(Base):
    """Many-to-many of plans -> modules (which modules each plan grants)."""

    __tablename__ = "entitlements"
    __table_args__ = (
        UniqueConstraint("plan_id", "module_key", name="uq_entitlements_plan_module"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subscription_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    max_seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
