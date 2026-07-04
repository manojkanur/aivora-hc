"""Uploaded evidence text for AI advisory chat grounding."""

from __future__ import annotations

import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class AdvisoryEvidence(UUIDBase):
    """Extracted text of a document uploaded to /ai-advisory/evidence.

    Stored in the DB (not process memory) so any gunicorn worker can serve
    the follow-up /chat request that references the evidence_id.
    """

    __tablename__ = "advisory_evidence"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
