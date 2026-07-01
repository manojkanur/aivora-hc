"""Benchmark profiles + comparisons."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkProfile,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.services.audit import log_event
from app.services.hc_platform import benchmark_engine

router = APIRouter()


class BenchmarkProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str | None = None
    benchmark_type: str
    industry: str | None = None
    region: str | None = None
    company_size: str | None = None
    source: str | None = None


class BenchmarkComparisonCreate(BaseModel):
    review_id: uuid.UUID
    benchmark_profile_id: uuid.UUID


class BenchmarkComparisonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    benchmark_profile_id: uuid.UUID
    comparison_data: dict[str, Any] | None = None
    overall_positioning: str | None = None
    gap_data: dict[str, Any] | None = None
    computed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.get("/profiles", response_model=list[BenchmarkProfileRead])
async def list_profiles(
    db: DBDep,
    industry: str | None = Query(None),
    region: str | None = Query(None),
    company_size: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[BenchmarkProfileRead]:
    stmt = select(BenchmarkProfile)
    if industry:
        stmt = stmt.where(BenchmarkProfile.industry == industry)
    if region:
        stmt = stmt.where(BenchmarkProfile.region == region)
    if company_size:
        stmt = stmt.where(BenchmarkProfile.company_size == company_size)
    stmt = stmt.order_by(BenchmarkProfile.name).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [BenchmarkProfileRead.model_validate(r) for r in rows]


@router.get("/profiles/{profile_id}", response_model=BenchmarkProfileRead)
async def get_profile(profile_id: uuid.UUID, db: DBDep) -> BenchmarkProfileRead:
    p = await db.get(BenchmarkProfile, profile_id)
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Benchmark profile not found")
    return BenchmarkProfileRead.model_validate(p)


@router.post("/comparisons", response_model=BenchmarkComparisonRead, status_code=status.HTTP_201_CREATED)
async def create_comparison(
    payload: BenchmarkComparisonCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> BenchmarkComparisonRead:
    stmt = select(HcReview).where(
        HcReview.id == payload.review_id, HcReview.tenant_id == current_tenant.id
    )
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HC review not found")

    try:
        c = await benchmark_engine.run(db, payload.review_id, payload.benchmark_profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(c)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.benchmark_comparisons.create",
        {"comparison_id": str(c.id), "review_id": str(payload.review_id)},
    )
    return BenchmarkComparisonRead.model_validate(c)


@router.get("/comparisons", response_model=list[BenchmarkComparisonRead])
async def list_comparisons(
    current_tenant: CurrentTenant,
    db: DBDep,
    review_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[BenchmarkComparisonRead]:
    stmt = select(BenchmarkComparison).where(BenchmarkComparison.tenant_id == current_tenant.id)
    if review_id:
        stmt = stmt.where(BenchmarkComparison.review_id == review_id)
    stmt = stmt.order_by(BenchmarkComparison.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [BenchmarkComparisonRead.model_validate(r) for r in rows]


@router.get("/comparisons/{comparison_id}", response_model=BenchmarkComparisonRead)
async def get_comparison(
    comparison_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> BenchmarkComparisonRead:
    stmt = select(BenchmarkComparison).where(
        BenchmarkComparison.id == comparison_id,
        BenchmarkComparison.tenant_id == current_tenant.id,
    )
    c = (await db.execute(stmt)).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comparison not found")
    return BenchmarkComparisonRead.model_validate(c)
