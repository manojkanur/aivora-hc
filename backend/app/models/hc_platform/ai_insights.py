"""AI analysis versions, generated insights, prompt templates (Domain 4)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDBase


class HcAnalysisVersion(UUIDBase):
    """Versioned snapshot of HC analysis output."""

    __tablename__ = "hc_analysis_versions"
    __table_args__ = (
        UniqueConstraint("review_id", "version", name="uq_hc_analysis_versions_review_version"),
    )

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    generator_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="mock", server_default="mock"
    )
    confidence_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    prompt_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class AiGeneratedInsight(UUIDBase):
    """AI-generated insight tied to a review."""

    __tablename__ = "ai_generated_insights"
    __table_args__ = (
        Index(
            "ix_ai_generated_insights_review_insight_type",
            "review_id",
            "insight_type",
        ),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hc_reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    insight_type: Mapped[str] = mapped_column(String(100), nullable=False)
    generator_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="mock", server_default="mock"
    )
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    prompt_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)


class AiPromptTemplate(Base):
    """Reusable AI prompt template keyed by `key` + `version`."""

    __tablename__ = "ai_prompt_templates"
    __table_args__ = (
        UniqueConstraint("key", "version", name="uq_ai_prompt_templates_key_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    insight_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_prompt_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    temperature: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    allowed_modules: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
