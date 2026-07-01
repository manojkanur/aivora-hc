"""HC platform capability frameworks, items, assessments, ratings."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.capability import (
    CapabilityAssessment,
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityRating,
)
from app.services.audit import log_event

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CapFrameworkCreate(BaseModel):
    name: str
    description: str | None = None
    framework_type: str | None = None
    proficiency_scale: list[dict[str, Any]] | None = None
    is_template: bool = False
    meta: dict[str, Any] | None = None


class CapFrameworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None = None
    framework_type: str | None = None
    proficiency_scale: list[dict[str, Any]] | None = None
    is_template: bool
    created_at: datetime
    updated_at: datetime


class CapItemCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    category: str | None = None
    parent_id: uuid.UUID | None = None
    level: int | None = None
    sort_order: int = 0


class CapItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    framework_id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    category: str | None = None
    parent_id: uuid.UUID | None = None
    level: int | None = None
    sort_order: int


class CapAssessmentCreate(BaseModel):
    framework_id: uuid.UUID
    subject_type: str
    subject_ref: str | None = None
    role_profile_id: uuid.UUID | None = None
    rating_source: str = "self"
    meta: dict[str, Any] | None = None


class CapAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    framework_id: uuid.UUID
    subject_type: str
    subject_ref: str | None = None
    role_profile_id: uuid.UUID | None = None
    status: str
    rating_source: str
    created_at: datetime
    updated_at: datetime


class RatingItem(BaseModel):
    framework_item_id: uuid.UUID
    current_level: int | None = None
    target_level: int | None = None
    evidence: str | None = None
    priority: str | None = None
    confidence: str | None = None
    notes: str | None = None


class RatingBulkUpsert(BaseModel):
    ratings: list[RatingItem]


class RatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_id: uuid.UUID
    framework_item_id: uuid.UUID
    current_level: int | None = None
    target_level: int | None = None
    evidence: str | None = None
    priority: str | None = None
    confidence: str | None = None
    notes: str | None = None


class FromTemplateCreate(BaseModel):
    template_framework_id: uuid.UUID
    name: str | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Frameworks
# ---------------------------------------------------------------------------


@router.post("/frameworks", response_model=CapFrameworkRead, status_code=status.HTTP_201_CREATED)
async def create_cap_framework(
    payload: CapFrameworkCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapFrameworkRead:
    kwargs: dict[str, Any] = dict(
        tenant_id=current_tenant.id,
        name=payload.name,
        description=payload.description,
        framework_type=payload.framework_type,
        is_template=payload.is_template,
        meta=payload.meta,
    )
    if payload.proficiency_scale is not None:
        kwargs["proficiency_scale"] = payload.proficiency_scale
    f = CapabilityFramework(**kwargs)
    db.add(f)
    await db.flush()
    await db.refresh(f)
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_frameworks.create", {"framework_id": str(f.id)})
    return CapFrameworkRead.model_validate(f)


@router.get("/frameworks", response_model=list[CapFrameworkRead])
async def list_cap_frameworks(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[CapFrameworkRead]:
    stmt = (
        select(CapabilityFramework)
        .where(CapabilityFramework.tenant_id == current_tenant.id)
        .order_by(CapabilityFramework.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [CapFrameworkRead.model_validate(r) for r in rows]


@router.get("/frameworks/{framework_id}", response_model=CapFrameworkRead)
async def get_cap_framework(
    framework_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapFrameworkRead:
    stmt = select(CapabilityFramework).where(
        CapabilityFramework.id == framework_id,
        CapabilityFramework.tenant_id == current_tenant.id,
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    return CapFrameworkRead.model_validate(f)


@router.delete("/frameworks/{framework_id}", status_code=status.HTTP_200_OK)
async def delete_cap_framework(
    framework_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(CapabilityFramework).where(
        CapabilityFramework.id == framework_id,
        CapabilityFramework.tenant_id == current_tenant.id,
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    await db.delete(f)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_frameworks.delete", {"framework_id": str(framework_id)})
    return {"status": "deleted", "framework_id": str(framework_id)}


@router.post("/frameworks/from-template", response_model=CapFrameworkRead, status_code=status.HTTP_201_CREATED)
async def create_from_template(
    payload: FromTemplateCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapFrameworkRead:
    template = await db.get(CapabilityFramework, payload.template_framework_id)
    if template is None or not template.is_template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template framework not found")
    new_fw = CapabilityFramework(
        tenant_id=current_tenant.id,
        name=payload.name or f"{template.name} (copy)",
        description=template.description,
        framework_type=template.framework_type,
        proficiency_scale=template.proficiency_scale,
        is_template=False,
        meta=template.meta,
    )
    db.add(new_fw)
    await db.flush()
    # Clone items
    items_stmt = select(CapabilityFrameworkItem).where(CapabilityFrameworkItem.framework_id == template.id)
    items = (await db.execute(items_stmt)).scalars().all()
    id_map: dict[uuid.UUID, uuid.UUID] = {}
    # Insert two-pass to handle parent refs
    new_items: list[CapabilityFrameworkItem] = []
    for it in items:
        new_id = uuid.uuid4()
        id_map[it.id] = new_id
        new_items.append(
            CapabilityFrameworkItem(
                id=new_id,
                framework_id=new_fw.id,
                code=it.code,
                name=it.name,
                description=it.description,
                category=it.category,
                parent_id=None,
                level=it.level,
                sort_order=it.sort_order,
                meta=it.meta,
            )
        )
    db.add_all(new_items)
    await db.flush()
    # Fix parent refs
    for it, new_it in zip(items, new_items):
        if it.parent_id is not None and it.parent_id in id_map:
            new_it.parent_id = id_map[it.parent_id]
    await db.flush()
    await db.refresh(new_fw)
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_frameworks.from_template", {"framework_id": str(new_fw.id), "template_id": str(template.id)})
    return CapFrameworkRead.model_validate(new_fw)


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


async def _get_cap_framework_or_404(framework_id: uuid.UUID, tenant_id: uuid.UUID, db) -> CapabilityFramework:
    stmt = select(CapabilityFramework).where(
        CapabilityFramework.id == framework_id,
        CapabilityFramework.tenant_id == tenant_id,
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    return f


@router.post("/frameworks/{framework_id}/items", response_model=CapItemRead, status_code=status.HTTP_201_CREATED)
async def create_cap_item(
    framework_id: uuid.UUID,
    payload: CapItemCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapItemRead:
    await _get_cap_framework_or_404(framework_id, current_tenant.id, db)
    it = CapabilityFrameworkItem(
        framework_id=framework_id,
        code=payload.code,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        parent_id=payload.parent_id,
        level=payload.level,
        sort_order=payload.sort_order,
    )
    db.add(it)
    await db.flush()
    await db.refresh(it)
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_items.create", {"item_id": str(it.id)})
    return CapItemRead.model_validate(it)


@router.get("/frameworks/{framework_id}/items", response_model=list[CapItemRead])
async def list_cap_items(
    framework_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[CapItemRead]:
    await _get_cap_framework_or_404(framework_id, current_tenant.id, db)
    stmt = (
        select(CapabilityFrameworkItem)
        .where(CapabilityFrameworkItem.framework_id == framework_id)
        .order_by(CapabilityFrameworkItem.sort_order, CapabilityFrameworkItem.code)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [CapItemRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------


@router.post("/assessments", response_model=CapAssessmentRead, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: CapAssessmentCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapAssessmentRead:
    await _get_cap_framework_or_404(payload.framework_id, current_tenant.id, db)
    a = CapabilityAssessment(
        tenant_id=current_tenant.id,
        framework_id=payload.framework_id,
        subject_type=payload.subject_type,
        subject_ref=payload.subject_ref,
        role_profile_id=payload.role_profile_id,
        rating_source=payload.rating_source,
        assessor_user_id=current_user.id,
        meta=payload.meta,
    )
    db.add(a)
    await db.flush()
    await db.refresh(a)
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_assessments.create", {"assessment_id": str(a.id)})
    return CapAssessmentRead.model_validate(a)


@router.get("/assessments", response_model=list[CapAssessmentRead])
async def list_assessments(
    current_tenant: CurrentTenant,
    db: DBDep,
    framework_id: uuid.UUID | None = Query(None),
    subject_type: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[CapAssessmentRead]:
    stmt = select(CapabilityAssessment).where(CapabilityAssessment.tenant_id == current_tenant.id)
    if framework_id:
        stmt = stmt.where(CapabilityAssessment.framework_id == framework_id)
    if subject_type:
        stmt = stmt.where(CapabilityAssessment.subject_type == subject_type)
    stmt = stmt.order_by(CapabilityAssessment.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [CapAssessmentRead.model_validate(r) for r in rows]


@router.get("/assessments/{assessment_id}", response_model=CapAssessmentRead)
async def get_assessment(
    assessment_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CapAssessmentRead:
    stmt = select(CapabilityAssessment).where(
        CapabilityAssessment.id == assessment_id,
        CapabilityAssessment.tenant_id == current_tenant.id,
    )
    a = (await db.execute(stmt)).scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    return CapAssessmentRead.model_validate(a)


# ---------------------------------------------------------------------------
# Ratings (bulk upsert)
# ---------------------------------------------------------------------------


@router.post("/assessments/{assessment_id}/ratings", response_model=list[RatingRead])
async def bulk_upsert_ratings(
    assessment_id: uuid.UUID,
    payload: RatingBulkUpsert,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[RatingRead]:
    stmt = select(CapabilityAssessment).where(
        CapabilityAssessment.id == assessment_id,
        CapabilityAssessment.tenant_id == current_tenant.id,
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    out_ids: list[uuid.UUID] = []
    for item in payload.ratings:
        ins = (
            pg_insert(CapabilityRating)
            .values(
                assessment_id=assessment_id,
                framework_item_id=item.framework_item_id,
                current_level=item.current_level,
                target_level=item.target_level,
                evidence=item.evidence,
                priority=item.priority,
                confidence=item.confidence,
                notes=item.notes,
            )
            .on_conflict_do_update(
                index_elements=["assessment_id", "framework_item_id"],
                set_={
                    "current_level": item.current_level,
                    "target_level": item.target_level,
                    "evidence": item.evidence,
                    "priority": item.priority,
                    "confidence": item.confidence,
                    "notes": item.notes,
                },
            )
            .returning(CapabilityRating.id)
        )
        res = await db.execute(ins)
        out_ids.append(res.scalar_one())
    await db.flush()
    rows_stmt = select(CapabilityRating).where(CapabilityRating.assessment_id == assessment_id)
    rows = (await db.execute(rows_stmt)).scalars().all()
    await _audit(current_tenant.id, current_user.id, "hc_platform.capability_ratings.bulk_upsert", {"assessment_id": str(assessment_id), "count": len(payload.ratings)})
    return [RatingRead.model_validate(r) for r in rows]


@router.get("/assessments/{assessment_id}/ratings", response_model=list[RatingRead])
async def list_ratings(
    assessment_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[RatingRead]:
    stmt = select(CapabilityAssessment).where(
        CapabilityAssessment.id == assessment_id,
        CapabilityAssessment.tenant_id == current_tenant.id,
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    rows_stmt = select(CapabilityRating).where(CapabilityRating.assessment_id == assessment_id)
    rows = (await db.execute(rows_stmt)).scalars().all()
    return [RatingRead.model_validate(r) for r in rows]
