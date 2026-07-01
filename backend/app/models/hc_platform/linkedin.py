"""LinkedIn OAuth connections per (tenant, user).

Stores the access token, expiry, and LinkedIn person id so the backend can
post on a user's behalf. One row per (tenant_id, user_id).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class LinkedInConnection(UUIDBase):
    """Per-user LinkedIn OAuth token."""

    __tablename__ = "linkedin_connections"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_linkedin_connections_tenant_user"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    linkedin_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
