"""Document templates, generation, sections, listing."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
)
from app.services.audit import log_event
from app.services.hc_platform import (
    document_generator,
    document_registry,
    section_override,
)

router = APIRouter()


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_type_key: str | None = None
    name: str
    description: str | None = None
    status: str


class TemplateVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: str
    version: int
    sections: dict[str, Any] | None = None


class TemplateDetail(TemplateRead):
    latest_version: TemplateVersionRead | None = None


class GenerateRequest(BaseModel):
    template_id: str
    context_payload: dict[str, Any] = {}
    hc_review_id: uuid.UUID | None = None
    name: str | None = None


class GeneratedDocRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    template_id: str | None = None
    document_type_key: str | None = None
    name: str
    status: str
    ir_snapshot: dict[str, Any] | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class SectionUpdate(BaseModel):
    content: dict[str, Any]


class SectionOverrideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    section_id: str
    content: dict[str, Any] | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


@router.get("/templates", response_model=list[TemplateRead])
async def list_templates(
    current_tenant: CurrentTenant,
    db: DBDep,
    module_key: str | None = Query(None),
) -> list[TemplateRead]:
    templates = await document_registry.list_templates_for_tenant(
        db, current_tenant.id, module_key=module_key
    )
    return [TemplateRead.model_validate(t) for t in templates]


@router.get("/templates/{template_id}", response_model=TemplateDetail)
async def get_template(template_id: str, db: DBDep) -> TemplateDetail:
    try:
        t = await document_registry.get_template(db, template_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    try:
        v = await document_registry.get_latest_version(db, template_id)
        latest = TemplateVersionRead.model_validate(v)
    except LookupError:
        latest = None
    base = TemplateRead.model_validate(t).model_dump()
    base["latest_version"] = latest
    return TemplateDetail.model_validate(base)


# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------


@router.post("/generate", response_model=GeneratedDocRead, status_code=status.HTTP_201_CREATED)
async def generate_document(
    payload: GenerateRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> GeneratedDocRead:
    try:
        doc = await document_generator.generate(
            db,
            template_id=payload.template_id,
            tenant_id=current_tenant.id,
            context_payload=payload.context_payload,
            hc_review_id=payload.hc_review_id,
            name=payload.name,
            created_by_user_id=current_user.id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(doc)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.documents.generate",
        {"document_id": str(doc.id), "template_id": payload.template_id},
    )
    return GeneratedDocRead.model_validate(doc)


# ---------------------------------------------------------------------------
# Generated documents
# ---------------------------------------------------------------------------


@router.get("", response_model=list[GeneratedDocRead])
async def list_documents(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[GeneratedDocRead]:
    stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == current_tenant.id)
        .order_by(GeneratedDocument.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [GeneratedDocRead.model_validate(r) for r in rows]


@router.get("/{document_id}", response_model=GeneratedDocRead)
async def get_document(
    document_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> GeneratedDocRead:
    stmt = select(GeneratedDocument).where(
        GeneratedDocument.id == document_id,
        GeneratedDocument.tenant_id == current_tenant.id,
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return GeneratedDocRead.model_validate(doc)


@router.put("/{document_id}/sections/{section_id}", response_model=SectionOverrideRead)
async def update_section(
    document_id: uuid.UUID,
    section_id: str,
    payload: SectionUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> SectionOverrideRead:
    stmt = select(GeneratedDocument).where(
        GeneratedDocument.id == document_id,
        GeneratedDocument.tenant_id == current_tenant.id,
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    try:
        ov = await section_override.save_override(
            db, document_id, section_id, payload.content, edited_by_user_id=current_user.id
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await db.flush()
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.documents.section_update",
        {"document_id": str(document_id), "section_id": section_id},
    )
    return SectionOverrideRead.model_validate(ov)
