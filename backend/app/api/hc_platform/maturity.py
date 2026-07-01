"""Maturity models + assessments."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
    MaturityModel,
)
from app.services.audit import log_event
from app.services.hc_platform import maturity_engine

router = APIRouter()


class MaturityModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str | None = None
    dimensions: list[dict[str, Any]] | None = None
    is_global: bool
    version: int


class MaturityAssessmentCreate(BaseModel):
    review_id: uuid.UUID
    maturity_model_id: uuid.UUID


class MaturityDimensionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_id: uuid.UUID
    dimension_key: str
    score: float | None = None
    band_name: str | None = None
    criticality: str | None = None
    readiness: str | None = None
    narrative: str | None = None


class MaturityAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    maturity_model_id: uuid.UUID
    overall_score: float | None = None
    overall_band: str | None = None
    computed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class MaturityAssessmentDetail(MaturityAssessmentRead):
    dimensions: list[MaturityDimensionRead] = []


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.get("/models", response_model=list[MaturityModelRead])
async def list_models(db: DBDep) -> list[MaturityModelRead]:
    stmt = select(MaturityModel).order_by(MaturityModel.name)
    rows = (await db.execute(stmt)).scalars().all()
    return [MaturityModelRead.model_validate(r) for r in rows]


@router.get("/models/{model_id}", response_model=MaturityModelRead)
async def get_model(model_id: uuid.UUID, db: DBDep) -> MaturityModelRead:
    m = await db.get(MaturityModel, model_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maturity model not found")
    return MaturityModelRead.model_validate(m)


@router.post("/assessments", response_model=MaturityAssessmentRead, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: MaturityAssessmentCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> MaturityAssessmentRead:
    # verify the review belongs to the tenant
    stmt = select(HcReview).where(
        HcReview.id == payload.review_id, HcReview.tenant_id == current_tenant.id
    )
    review = (await db.execute(stmt)).scalar_one_or_none()
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HC review not found")

    try:
        a = await maturity_engine.run(db, payload.review_id, payload.maturity_model_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(a)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.maturity_assessments.create",
        {"assessment_id": str(a.id), "review_id": str(payload.review_id)},
    )
    return MaturityAssessmentRead.model_validate(a)


@router.get("/assessments", response_model=list[MaturityAssessmentRead])
async def list_assessments(
    current_tenant: CurrentTenant,
    db: DBDep,
    review_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[MaturityAssessmentRead]:
    stmt = select(MaturityAssessment).where(MaturityAssessment.tenant_id == current_tenant.id)
    if review_id:
        stmt = stmt.where(MaturityAssessment.review_id == review_id)
    stmt = stmt.order_by(MaturityAssessment.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [MaturityAssessmentRead.model_validate(r) for r in rows]


@router.get("/assessments/{assessment_id}", response_model=MaturityAssessmentDetail)
async def get_assessment(
    assessment_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> MaturityAssessmentDetail:
    stmt = select(MaturityAssessment).where(
        MaturityAssessment.id == assessment_id,
        MaturityAssessment.tenant_id == current_tenant.id,
    )
    a = (await db.execute(stmt)).scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")
    dim_stmt = select(MaturityDimensionResult).where(MaturityDimensionResult.assessment_id == assessment_id)
    dims = (await db.execute(dim_stmt)).scalars().all()
    base = MaturityAssessmentRead.model_validate(a).model_dump()
    base["dimensions"] = [MaturityDimensionRead.model_validate(d) for d in dims]
    return MaturityAssessmentDetail.model_validate(base)
