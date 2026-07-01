from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import UUIDBase

if TYPE_CHECKING:
    from app.models.gamification import Badge, Quest, Streak, UserBadge, UserQuest, XpEvent
    from app.models.tenant import Tenant


class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


class User(UUIDBase):
    __tablename__ = "users"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"), nullable=False, default=UserRole.member
    )
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    xp_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    onboarding_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    xp_events: Mapped[list["XpEvent"]] = relationship(
        "XpEvent", back_populates="user", lazy="select"
    )
    user_quests: Mapped[list["UserQuest"]] = relationship(
        "UserQuest", back_populates="user", lazy="select"
    )
    user_badges: Mapped[list["UserBadge"]] = relationship(
        "UserBadge", back_populates="user", lazy="select"
    )
    streaks: Mapped[list["Streak"]] = relationship(
        "Streak", back_populates="user", lazy="select"
    )
