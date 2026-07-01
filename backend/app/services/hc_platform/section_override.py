"""Section-level overrides for generated documents.

Consultants can hand-edit any IR section; we persist their edit in
`generated_document_section_overrides` keyed on `(document_id, section_id)`.
On regeneration, `document_generator` looks these up and re-applies them.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.document_engine import (
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
)


async def save_override(
    db: AsyncSession,
    document_id: uuid.UUID,
    section_id: str,
    content: dict[str, Any],
    edited_by_user_id: uuid.UUID | None = None,
) -> GeneratedDocumentSectionOverride:
    """UPSERT on `(document_id, section_id)`."""
    document = await db.get(GeneratedDocument, document_id)
    if document is None:
        raise LookupError(f"GeneratedDocument not found: {document_id}")

    stmt = (
        pg_insert(GeneratedDocumentSectionOverride)
        .values(
            tenant_id=document.tenant_id,
            document_id=document_id,
            section_id=section_id,
            content=content,
            edited_by=edited_by_user_id,
        )
        .on_conflict_do_update(
            index_elements=["document_id", "section_id"],
            set_={"content": content, "edited_by": edited_by_user_id},
        )
        .returning(GeneratedDocumentSectionOverride)
    )
    result = await db.execute(stmt)
    override = result.scalar_one()
    await db.flush()
    return override


async def list_overrides(
    db: AsyncSession,
    document_id: uuid.UUID,
) -> list[GeneratedDocumentSectionOverride]:
    stmt = (
        select(GeneratedDocumentSectionOverride)
        .where(GeneratedDocumentSectionOverride.document_id == document_id)
        .order_by(GeneratedDocumentSectionOverride.section_id)
    )
    return list((await db.execute(stmt)).scalars().all())
