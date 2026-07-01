"""Recommendation library (Domain 6)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class RecommendationLibrary(UUIDBase):
    """Curated reusable recommendation catalog."""

    __tablename__ = "recommendation_library"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    time_horizon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_impact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_effort: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    evidence_sources: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_global: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
