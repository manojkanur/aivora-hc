"""HC platform frameworks / framework_components / framework_reviews."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.frameworks import (
    Framework,
    FrameworkComponent,
    FrameworkReview,
)
from app.services.audit import log_event

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class FrameworkCreate(BaseModel):
    name: str
    description: str | None = None
    framework_type: str | None = None
    is_template: bool = False
    meta: dict[str, Any] | None = None


class FrameworkUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    framework_type: str | None = None
    status: str | None = None
    is_template: bool | None = None
    meta: dict[str, Any] | None = None


class FrameworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None = None
    framework_type: str | None = None
    status: str
    is_template: bool
    created_at: datetime
    updated_at: datetime


class FrameworkComponentCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    parent_id: int | None = None
    level: int | None = None
    maturity_level: str = "initial"
    criteria: dict[str, Any] | None = None
    sort_order: int = 0


class FrameworkComponentUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    parent_id: int | None = None
    level: int | None = None
    maturity_level: str | None = None
    criteria: dict[str, Any] | None = None
    sort_order: int | None = None


class FrameworkComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    framework_id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    parent_id: int | None = None
    level: int | None = None
    maturity_level: str
    criteria: dict[str, Any] | None = None
    sort_order: int


class FrameworkReviewCreate(BaseModel):
    project_id: uuid.UUID
    framework_id: uuid.UUID
    name: str
    review_type: str = "full"
    scope: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class FrameworkReviewUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    review_type: str | None = None
    scope: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class FrameworkReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID
    framework_id: uuid.UUID
    name: str
    status: str
    review_type: str
    scope: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Frameworks CRUD
# ---------------------------------------------------------------------------


@router.post("/frameworks", response_model=FrameworkRead, status_code=status.HTTP_201_CREATED)
async def create_framework(
    payload: FrameworkCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkRead:
    f = Framework(
        tenant_id=current_tenant.id,
        name=payload.name,
        description=payload.description,
        framework_type=payload.framework_type,
        is_template=payload.is_template,
        meta=payload.meta,
    )
    db.add(f)
    await db.flush()
    await db.refresh(f)
    await _audit(current_tenant.id, current_user.id, "hc_platform.frameworks.create", {"framework_id": str(f.id)})
    return FrameworkRead.model_validate(f)


@router.get("/frameworks", response_model=list[FrameworkRead])
async def list_frameworks(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[FrameworkRead]:
    stmt = (
        select(Framework)
        .where(Framework.tenant_id == current_tenant.id)
        .order_by(Framework.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [FrameworkRead.model_validate(r) for r in rows]


@router.get("/frameworks/{framework_id}", response_model=FrameworkRead)
async def get_framework(
    framework_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkRead:
    stmt = select(Framework).where(
        Framework.id == framework_id, Framework.tenant_id == current_tenant.id
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    return FrameworkRead.model_validate(f)


@router.patch("/frameworks/{framework_id}", response_model=FrameworkRead)
async def update_framework(
    framework_id: uuid.UUID,
    payload: FrameworkUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkRead:
    stmt = select(Framework).where(
        Framework.id == framework_id, Framework.tenant_id == current_tenant.id
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(f, k, v)
    await db.flush()
    await db.refresh(f)
    await _audit(current_tenant.id, current_user.id, "hc_platform.frameworks.update", {"framework_id": str(f.id)})
    return FrameworkRead.model_validate(f)


@router.delete("/frameworks/{framework_id}", status_code=status.HTTP_200_OK)
async def delete_framework(
    framework_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(Framework).where(
        Framework.id == framework_id, Framework.tenant_id == current_tenant.id
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    await db.delete(f)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.frameworks.delete", {"framework_id": str(framework_id)})
    return {"status": "deleted", "framework_id": str(framework_id)}


# ---------------------------------------------------------------------------
# Framework components
# ---------------------------------------------------------------------------


async def _get_framework_or_404(framework_id: uuid.UUID, tenant_id: uuid.UUID, db) -> Framework:
    stmt = select(Framework).where(
        Framework.id == framework_id, Framework.tenant_id == tenant_id
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    return f


@router.post(
    "/frameworks/{framework_id}/components",
    response_model=FrameworkComponentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_component(
    framework_id: uuid.UUID,
    payload: FrameworkComponentCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkComponentRead:
    await _get_framework_or_404(framework_id, current_tenant.id, db)
    c = FrameworkComponent(
        framework_id=framework_id,
        code=payload.code,
        name=payload.name,
        description=payload.description,
        parent_id=payload.parent_id,
        level=payload.level,
        maturity_level=payload.maturity_level,
        criteria=payload.criteria,
        sort_order=payload.sort_order,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_components.create", {"component_id": c.id})
    return FrameworkComponentRead.model_validate(c)


@router.get("/frameworks/{framework_id}/components", response_model=list[FrameworkComponentRead])
async def list_components(
    framework_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[FrameworkComponentRead]:
    await _get_framework_or_404(framework_id, current_tenant.id, db)
    stmt = (
        select(FrameworkComponent)
        .where(FrameworkComponent.framework_id == framework_id)
        .order_by(FrameworkComponent.sort_order, FrameworkComponent.id)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [FrameworkComponentRead.model_validate(r) for r in rows]


@router.patch("/framework-components/{component_id}", response_model=FrameworkComponentRead)
async def update_component(
    component_id: int,
    payload: FrameworkComponentUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkComponentRead:
    c = await db.get(FrameworkComponent, component_id)
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    await _get_framework_or_404(c.framework_id, current_tenant.id, db)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    await db.flush()
    await db.refresh(c)
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_components.update", {"component_id": component_id})
    return FrameworkComponentRead.model_validate(c)


@router.delete("/framework-components/{component_id}", status_code=status.HTTP_200_OK)
async def delete_component(
    component_id: int,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str | int]:
    c = await db.get(FrameworkComponent, component_id)
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    await _get_framework_or_404(c.framework_id, current_tenant.id, db)
    await db.delete(c)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_components.delete", {"component_id": component_id})
    return {"status": "deleted", "component_id": component_id}


# ---------------------------------------------------------------------------
# Framework reviews
# ---------------------------------------------------------------------------


@router.post(
    "/framework-reviews",
    response_model=FrameworkReviewRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_framework_review(
    payload: FrameworkReviewCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkReviewRead:
    fr = FrameworkReview(
        tenant_id=current_tenant.id,
        project_id=payload.project_id,
        framework_id=payload.framework_id,
        name=payload.name,
        review_type=payload.review_type,
        scope=payload.scope,
        meta=payload.meta,
    )
    db.add(fr)
    await db.flush()
    await db.refresh(fr)
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_reviews.create", {"review_id": str(fr.id)})
    return FrameworkReviewRead.model_validate(fr)


@router.get("/framework-reviews", response_model=list[FrameworkReviewRead])
async def list_framework_reviews(
    current_tenant: CurrentTenant,
    db: DBDep,
    project_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[FrameworkReviewRead]:
    stmt = select(FrameworkReview).where(FrameworkReview.tenant_id == current_tenant.id)
    if project_id:
        stmt = stmt.where(FrameworkReview.project_id == project_id)
    stmt = stmt.order_by(FrameworkReview.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [FrameworkReviewRead.model_validate(r) for r in rows]


@router.get("/framework-reviews/{review_id}", response_model=FrameworkReviewRead)
async def get_framework_review(
    review_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkReviewRead:
    stmt = select(FrameworkReview).where(
        FrameworkReview.id == review_id, FrameworkReview.tenant_id == current_tenant.id
    )
    fr = (await db.execute(stmt)).scalar_one_or_none()
    if fr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework review not found")
    return FrameworkReviewRead.model_validate(fr)


@router.patch("/framework-reviews/{review_id}", response_model=FrameworkReviewRead)
async def update_framework_review(
    review_id: uuid.UUID,
    payload: FrameworkReviewUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkReviewRead:
    stmt = select(FrameworkReview).where(
        FrameworkReview.id == review_id, FrameworkReview.tenant_id == current_tenant.id
    )
    fr = (await db.execute(stmt)).scalar_one_or_none()
    if fr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework review not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(fr, k, v)
    await db.flush()
    await db.refresh(fr)
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_reviews.update", {"review_id": str(fr.id)})
    return FrameworkReviewRead.model_validate(fr)


@router.delete("/framework-reviews/{review_id}", status_code=status.HTTP_200_OK)
async def delete_framework_review(
    review_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(FrameworkReview).where(
        FrameworkReview.id == review_id, FrameworkReview.tenant_id == current_tenant.id
    )
    fr = (await db.execute(stmt)).scalar_one_or_none()
    if fr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework review not found")
    await db.delete(fr)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.framework_reviews.delete", {"review_id": str(review_id)})
    return {"status": "deleted", "review_id": str(review_id)}
