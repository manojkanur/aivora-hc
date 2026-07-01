"""Roadmaps + phases + recommendations + library."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.services.audit import log_event

router = APIRouter()


class RoadmapCreate(BaseModel):
    name: str
    description: str | None = None
    project_id: uuid.UUID | None = None
    target_state_design_id: uuid.UUID | None = None
    meta: dict[str, Any] | None = None


class RoadmapUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    meta: dict[str, Any] | None = None


class RoadmapRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    status: str
    target_state_design_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class PhaseCreate(BaseModel):
    review_id: uuid.UUID
    name: str
    sort_order: int = 0
    start_horizon: str | None = None
    end_horizon: str | None = None
    narrative: str | None = None
    meta: dict[str, Any] | None = None


class PhaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    name: str
    sort_order: int
    start_horizon: str | None = None
    end_horizon: str | None = None
    narrative: str | None = None


class RecommendationCreate(BaseModel):
    review_id: uuid.UUID
    recommendation_id: uuid.UUID | None = None
    phase_id: uuid.UUID | None = None
    tier: str | None = None
    category: str | None = None
    title: str
    description: str | None = None
    impact: str | None = None
    effort: str | None = None
    time_horizon: str | None = None
    sort_order: int = 0
    meta: dict[str, Any] | None = None


class RecommendationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    recommendation_id: uuid.UUID | None = None
    phase_id: uuid.UUID | None = None
    tier: str | None = None
    category: str | None = None
    title: str
    description: str | None = None
    impact: str | None = None
    effort: str | None = None
    time_horizon: str | None = None
    sort_order: int


class RoadmapDetail(RoadmapRead):
    phases: list[PhaseRead] = []
    recommendations: list[RecommendationRead] = []


class LibraryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    title: str
    description: str | None = None
    category: str | None = None
    time_horizon: str | None = None
    tier: str | None = None
    default_impact: str | None = None
    default_effort: str | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Roadmaps CRUD
# ---------------------------------------------------------------------------


@router.post("/roadmaps", response_model=RoadmapRead, status_code=status.HTTP_201_CREATED)
async def create_roadmap(
    payload: RoadmapCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RoadmapRead:
    r = Roadmap(
        tenant_id=current_tenant.id,
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        target_state_design_id=payload.target_state_design_id,
        meta=payload.meta,
    )
    db.add(r)
    await db.flush()
    await db.refresh(r)
    await _audit(current_tenant.id, current_user.id, "hc_platform.roadmaps.create", {"roadmap_id": str(r.id)})
    return RoadmapRead.model_validate(r)


@router.get("/roadmaps", response_model=list[RoadmapRead])
async def list_roadmaps(
    current_tenant: CurrentTenant,
    db: DBDep,
    project_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[RoadmapRead]:
    stmt = select(Roadmap).where(Roadmap.tenant_id == current_tenant.id)
    if project_id:
        stmt = stmt.where(Roadmap.project_id == project_id)
    stmt = stmt.order_by(Roadmap.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [RoadmapRead.model_validate(r) for r in rows]


@router.get("/roadmaps/{roadmap_id}", response_model=RoadmapDetail)
async def get_roadmap(
    roadmap_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RoadmapDetail:
    stmt = select(Roadmap).where(
        Roadmap.id == roadmap_id, Roadmap.tenant_id == current_tenant.id
    )
    r = (await db.execute(stmt)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    # Phases and recommendations live under hc_reviews, not directly under roadmap;
    # we surface any tenant phases here for context.
    phases_stmt = select(RoadmapPhase).where(RoadmapPhase.tenant_id == current_tenant.id)
    recs_stmt = select(RoadmapRecommendation).where(RoadmapRecommendation.tenant_id == current_tenant.id)
    phases = (await db.execute(phases_stmt)).scalars().all()
    recs = (await db.execute(recs_stmt)).scalars().all()
    base = RoadmapRead.model_validate(r).model_dump()
    base["phases"] = [PhaseRead.model_validate(p) for p in phases]
    base["recommendations"] = [RecommendationRead.model_validate(c) for c in recs]
    return RoadmapDetail.model_validate(base)


@router.patch("/roadmaps/{roadmap_id}", response_model=RoadmapRead)
async def update_roadmap(
    roadmap_id: uuid.UUID,
    payload: RoadmapUpdate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RoadmapRead:
    stmt = select(Roadmap).where(
        Roadmap.id == roadmap_id, Roadmap.tenant_id == current_tenant.id
    )
    r = (await db.execute(stmt)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    await db.flush()
    await db.refresh(r)
    await _audit(current_tenant.id, current_user.id, "hc_platform.roadmaps.update", {"roadmap_id": str(r.id)})
    return RoadmapRead.model_validate(r)


@router.delete("/roadmaps/{roadmap_id}", status_code=status.HTTP_200_OK)
async def delete_roadmap(
    roadmap_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(Roadmap).where(
        Roadmap.id == roadmap_id, Roadmap.tenant_id == current_tenant.id
    )
    r = (await db.execute(stmt)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    await db.delete(r)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.roadmaps.delete", {"roadmap_id": str(roadmap_id)})
    return {"status": "deleted", "roadmap_id": str(roadmap_id)}


# ---------------------------------------------------------------------------
# Phases / recommendations
# ---------------------------------------------------------------------------


@router.post("/roadmaps/{roadmap_id}/phases", response_model=PhaseRead, status_code=status.HTTP_201_CREATED)
async def create_phase(
    roadmap_id: uuid.UUID,
    payload: PhaseCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> PhaseRead:
    # roadmap_id is contextual; phases are pinned to (tenant, review)
    rm = await db.get(Roadmap, roadmap_id)
    if rm is None or rm.tenant_id != current_tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    p = RoadmapPhase(
        tenant_id=current_tenant.id,
        review_id=payload.review_id,
        name=payload.name,
        sort_order=payload.sort_order,
        start_horizon=payload.start_horizon,
        end_horizon=payload.end_horizon,
        narrative=payload.narrative,
        meta=payload.meta,
    )
    db.add(p)
    await db.flush()
    await db.refresh(p)
    await _audit(current_tenant.id, current_user.id, "hc_platform.roadmap_phases.create", {"phase_id": str(p.id), "roadmap_id": str(roadmap_id)})
    return PhaseRead.model_validate(p)


@router.post(
    "/roadmaps/{roadmap_id}/recommendations",
    response_model=RecommendationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_recommendation(
    roadmap_id: uuid.UUID,
    payload: RecommendationCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RecommendationRead:
    rm = await db.get(Roadmap, roadmap_id)
    if rm is None or rm.tenant_id != current_tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    rec = RoadmapRecommendation(
        tenant_id=current_tenant.id,
        review_id=payload.review_id,
        recommendation_id=payload.recommendation_id,
        phase_id=payload.phase_id,
        tier=payload.tier,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        impact=payload.impact,
        effort=payload.effort,
        time_horizon=payload.time_horizon,
        sort_order=payload.sort_order,
        meta=payload.meta,
    )
    db.add(rec)
    await db.flush()
    await db.refresh(rec)
    await _audit(current_tenant.id, current_user.id, "hc_platform.roadmap_recommendations.create", {"recommendation_id": str(rec.id), "roadmap_id": str(roadmap_id)})
    return RecommendationRead.model_validate(rec)


# ---------------------------------------------------------------------------
# Library
# ---------------------------------------------------------------------------


@router.get("/recommendations/library", response_model=list[LibraryRead])
async def list_library(
    db: DBDep,
    category: str | None = Query(None),
    time_horizon: str | None = Query(None),
    tier: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[LibraryRead]:
    stmt = select(RecommendationLibrary)
    if category:
        stmt = stmt.where(RecommendationLibrary.category == category)
    if time_horizon:
        stmt = stmt.where(RecommendationLibrary.time_horizon == time_horizon)
    if tier:
        stmt = stmt.where(RecommendationLibrary.tier == tier)
    stmt = stmt.order_by(RecommendationLibrary.title).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [LibraryRead.model_validate(r) for r in rows]
