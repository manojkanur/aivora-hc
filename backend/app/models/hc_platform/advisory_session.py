"""Server-side persistence for the AI Advisory workspace.

One AdvisorySession per workspace holds the full chat, the current report
document, the co-work plan and the selected studio skill, so the advisory
survives reloads and moves across devices. Each accepted change to the report
is snapshotted into AdvisoryRevision for an undoable version trail.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDBase


class AdvisorySession(UUIDBase):
    __tablename__ = "advisory_sessions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # A workspace can hold MANY advisory threads (one chat + report each), so this
    # is indexed but NOT unique - the user runs a separate thread per studio report.
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    title: Mapped[str | None] = mapped_column(String(160), nullable=True)  # thread label (e.g. "Talent Mobility report")
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)      # full chat transcript
    report_document: Mapped[dict | None] = mapped_column(JSONB, nullable=True)        # current StudioOutputDocument (or summary)
    report_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)        # 'detailed' | 'summary'
    plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)                    # co-work plan
    selected_skill: Mapped[str | None] = mapped_column(String(100), nullable=True)     # studio slug chosen for the report
    saved_draft_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # export draft, if published

    # Public share (client #5): an unguessable token that renders this thread's
    # CURRENT report as an unauthenticated live artifact at /a/<token>. Revocable.
    share_token: Mapped[str | None] = mapped_column(String(48), nullable=True, unique=True, index=True)
    share_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AdvisoryRevision(UUIDBase):
    """A versioned snapshot of the report document for the undo trail."""

    __tablename__ = "advisory_revisions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("advisory_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    report_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    report_document: Mapped[dict] = mapped_column(JSONB, nullable=False)
    note: Mapped[str | None] = mapped_column(String(400), nullable=True)  # what changed (e.g. the user's edit prompt)
