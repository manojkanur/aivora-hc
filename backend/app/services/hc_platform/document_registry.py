"""Document template registry queries.

Thin SQLAlchemy 2.0 async wrappers around `document_templates` and
`document_template_versions`. Used by the document generator to resolve the
latest active version for a given template id.
"""

from __future__ import annotations

import uuid

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
    ModuleDocumentBinding,
)


async def get_template(db: AsyncSession, template_id: str) -> DocumentTemplate:
    template = await db.get(DocumentTemplate, template_id)
    if template is None:
        raise LookupError(f"DocumentTemplate not found: {template_id}")
    return template


async def get_latest_version(
    db: AsyncSession, template_id: str
) -> DocumentTemplateVersion:
    stmt = (
        select(DocumentTemplateVersion)
        .where(DocumentTemplateVersion.template_id == template_id)
        .order_by(desc(DocumentTemplateVersion.version))
        .limit(1)
    )
    version = (await db.execute(stmt)).scalar_one_or_none()
    if version is None:
        raise LookupError(
            f"DocumentTemplateVersion not found for template_id={template_id}"
        )
    return version


async def list_templates_for_tenant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    module_key: str | None = None,
) -> list[DocumentTemplate]:
    """Templates bound to the tenant (via ModuleDocumentBinding), optionally filtered by module."""
    stmt = (
        select(DocumentTemplate)
        .join(
            ModuleDocumentBinding,
            ModuleDocumentBinding.template_id == DocumentTemplate.id,
        )
        .where(
            (ModuleDocumentBinding.tenant_id == tenant_id)
            | (ModuleDocumentBinding.tenant_id.is_(None))
        )
        .where(DocumentTemplate.status == "active")
    )
    if module_key:
        stmt = stmt.where(ModuleDocumentBinding.module_key == module_key)
    stmt = stmt.order_by(ModuleDocumentBinding.sort_order, DocumentTemplate.name)
    return list((await db.execute(stmt)).scalars().unique().all())
