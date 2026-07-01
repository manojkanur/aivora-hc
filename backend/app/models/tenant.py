from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.billing import TenantSubscription
    from app.models.export import BrandKit
    from app.models.user import User
    from app.models.workspace import Workspace


class Tenant(UUIDBase):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="starter")
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    brand_kit: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # HC platform port (Replit) — additional onboarding / billing fields
    challenge_brief: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    strategic_priorities: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    success_measures: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    primary_hc_priorities: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", lazy="select")
    workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace", back_populates="tenant", lazy="select"
    )
    subscriptions: Mapped[list["TenantSubscription"]] = relationship(
        "TenantSubscription", back_populates="tenant", lazy="select"
    )
    brand_kits: Mapped[list["BrandKit"]] = relationship(
        "BrandKit", back_populates="tenant", lazy="select"
    )
