"""Key-value platform settings editable from the admin dashboard."""

from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class PlatformSetting(UUIDBase):
    """A single platform-wide setting stored as a JSON string.

    Stored in the DB (not process memory or env) so admins can change it at
    runtime and every gunicorn worker picks it up.
    """

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
