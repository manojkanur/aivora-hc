"""HC reviews + intake + analyze + analysis-versions + insights."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.ai_insights import AiGeneratedInsight, HcAnalysisVersion
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import MaturityModel
from app.schemas.hc_platform.intake import StructuredIntakeData
from app.services.audit import log_event
from app.services.hc_platform import intake_service, maturity_engine

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class HcReviewCreate(BaseModel):
    project_id: uuid.UUID | None = None
    company_name: str | None = None
    review_type: str = "full_hc_review"
    company_size: str | None = None
    region: str | None = None
    industry: str | None = None
    meta: dict[str, Any] | None = None


class HcReviewUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    company_name: str | None = None
    status: str | None = None
    review_type: str | None = None
    company_size: str | None = None
    region: str | None = None
    industry: str | None = None
    diagnostic_results: dict[str, Any] | None = None
    target_state: dict[str, Any] | None = None
    roadmap: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class HcReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID | None = None
    company_name: str | None = None
    status: str
    review_type: str
    company_size: str | None = None
    region: str | None = None
    industry: str | None = None
    intake_data: dict[str, Any] | None = None
    diagnostic_results: dict[str, Any] | None = None
    target_state: dict[str, Any] | None = None
    roadmap: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class AnalysisVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    review_id: uuid.UUID
    version: int
    generator_type: str
    confidence_level: str | None = None
    content: dict[str, Any] | None = None
    created_at: datetime


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    insight_type: str
    generator_type: str
    content: dict[str, Any] | None = None
    model_name: str | None = None
    tokens_used: int | None = None
    created_at: datetime


class AnalyzeRequest(BaseModel):
    maturity_model_id: uuid.UUID | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


async def _get_review_or_404(review_id: uuid.UUID, tenant_id: uuid.UUID, db) -> HcReview:
    stmt = select(HcReview).where(HcReview.id == review_id, HcReview.tenant_id == tenant_id)
    r = (await db.execute(stmt)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HC review not found")
    return r


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("", response_model=HcReviewRead, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: HcReviewCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> HcReviewRead:
    r = HcReview(
        tenant_id=current_tenant.id,
        project_id=payload.project_id,
        company_name=payload.company_name,
        review_type=payload.review_type,
        company_size=payload.company_size,
        region=payload.region,
        industry=payload.industry,
        created_by=current_user.id,
        meta=payload.meta,
    )
    db.add(r)
    await db.flush()
    await db.refresh(r)
    await _audit(current_tenant.id, current_user.id, "hc_platform.hc_reviews.create", {"review_id": str(r.id)})
    return HcReviewRead.model_validate(r)


@router.get("", response_model=list[HcReviewRead])
async def list_reviews(
    current_tenant: CurrentTenant,
    db: DBDep,
    project_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[HcReviewRead]:
    stmt = select(HcReview).where(HcReview.tenant_id == current_tenant.id)
    if project_id:
        stmt = stmt.where(HcReview.project_id == project_id)
    stmt = stmt.order_by(HcReview.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [HcReviewRead.model_validate(r) for r in rows]


@router.get("/{review_id}", response_model=HcReviewRead)
async def get_review(
    review_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> HcReviewRead:
    r = await _get_review_or_404(review_id, current_tenant.id, db)
    return HcReviewRead.model_validate(r)


@router.patch("/{review_id}", response_model=HcReviewRead)
async def update_review(
    review_id: uuid.UUID,
    payload: HcReviewUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> HcReviewRead:
    r = await _get_review_or_404(review_id, current_tenant.id, db)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    await db.flush()
    await db.refresh(r)
    await _audit(current_tenant.id, current_user.id, "hc_platform.hc_reviews.update", {"review_id": str(r.id)})
    return HcReviewRead.model_validate(r)


@router.delete("/{review_id}", status_code=status.HTTP_200_OK)
async def delete_review(
    review_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    r = await _get_review_or_404(review_id, current_tenant.id, db)
    await db.delete(r)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.hc_reviews.delete", {"review_id": str(review_id)})
    return {"status": "deleted", "review_id": str(review_id)}


# ---------------------------------------------------------------------------
# Intake
# ---------------------------------------------------------------------------


@router.post("/{review_id}/intake", response_model=HcReviewRead)
async def save_intake(
    review_id: uuid.UUID,
    payload: StructuredIntakeData,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> HcReviewRead:
    await _get_review_or_404(review_id, current_tenant.id, db)
    try:
        r = await intake_service.save_intake(db, review_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.hc_reviews.intake_save", {"review_id": str(review_id)})
    return HcReviewRead.model_validate(r)


@router.get("/{review_id}/intake")
async def get_intake(
    review_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, Any]:
    await _get_review_or_404(review_id, current_tenant.id, db)
    data = await intake_service.get_intake(db, review_id)
    if data is None:
        return {}
    return data.model_dump(by_alias=True, exclude_none=False)


# ---------------------------------------------------------------------------
# Analyze
# ---------------------------------------------------------------------------


@router.post("/{review_id}/analyze")
async def analyze_review(
    review_id: uuid.UUID,
    payload: AnalyzeRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, Any]:
    r = await _get_review_or_404(review_id, current_tenant.id, db)
    if not r.intake_data and not r.diagnostic_results:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Intake or diagnostic results required before analyze",
        )

    maturity_model_id = payload.maturity_model_id
    if maturity_model_id is None:
        stmt = select(MaturityModel).order_by(MaturityModel.created_at.asc()).limit(1)
        model = (await db.execute(stmt)).scalar_one_or_none()
        if model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No maturity_model_id provided and no MaturityModel exists",
            )
        maturity_model_id = model.id

    try:
        assessment = await maturity_engine.run(db, review_id, maturity_model_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.flush()
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.hc_reviews.analyze",
        {"review_id": str(review_id), "assessment_id": str(assessment.id)},
    )
    return {
        "status": "ok",
        "review_id": str(review_id),
        "maturity_assessment_id": str(assessment.id),
    }


# ---------------------------------------------------------------------------
# Analysis versions
# ---------------------------------------------------------------------------


@router.get("/{review_id}/analysis-versions", response_model=list[AnalysisVersionRead])
async def list_analysis_versions(
    review_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[AnalysisVersionRead]:
    await _get_review_or_404(review_id, current_tenant.id, db)
    stmt = (
        select(HcAnalysisVersion)
        .where(HcAnalysisVersion.review_id == review_id)
        .order_by(HcAnalysisVersion.version.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [AnalysisVersionRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------


@router.get("/{review_id}/insights", response_model=list[InsightRead])
async def list_insights(
    review_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
    insight_type: str | None = Query(None),
) -> list[InsightRead]:
    await _get_review_or_404(review_id, current_tenant.id, db)
    stmt = select(AiGeneratedInsight).where(
        AiGeneratedInsight.review_id == review_id,
        AiGeneratedInsight.tenant_id == current_tenant.id,
    )
    if insight_type:
        stmt = stmt.where(AiGeneratedInsight.insight_type == insight_type)
    stmt = stmt.order_by(AiGeneratedInsight.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [InsightRead.model_validate(r) for r in rows]
