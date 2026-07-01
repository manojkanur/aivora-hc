"""Mobility frameworks, profiles, opportunities, matching, role-profiles, ref tables."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.mobility import (
    EmployeeMobilityProfile,
    MobilityFramework,
    MobilityKpiDictionary,
    MobilityMatchResult,
    MobilityMoveType,
    MobilityOpportunity,
)
from app.models.hc_platform.role_profiles import RoleCapabilityProfile
from app.services.audit import log_event
from app.services.hc_platform import mobility_matcher

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class FrameworkCreate(BaseModel):
    name: str
    mode: str = "hybrid"
    fit_weights: dict[str, Any] | None = None
    eligibility_rules: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class FrameworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    mode: str
    fit_weights: dict[str, Any] | None = None
    eligibility_rules: dict[str, Any] | None = None
    created_at: datetime


class ProfileCreate(BaseModel):
    employee_ref: str
    current_role_profile_id: uuid.UUID | None = None
    performance_tier: str = "meets"
    readiness: str = "ready_24_months"
    source: str = "manual"
    tenure_months: int | None = None
    meta: dict[str, Any] | None = None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_ref: str
    current_role_profile_id: uuid.UUID | None = None
    performance_tier: str
    readiness: str
    source: str
    tenure_months: int | None = None
    created_at: datetime


class OpportunityCreate(BaseModel):
    name: str
    target_role_profile_id: uuid.UUID | None = None
    type: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    meta: dict[str, Any] | None = None


class OpportunityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    target_role_profile_id: uuid.UUID | None = None
    name: str
    type: str | None = None
    status: str
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    created_at: datetime


class MatchRequest(BaseModel):
    mode: Literal["profile", "opportunity"]
    profile_id: uuid.UUID | None = None
    opportunity_id: uuid.UUID | None = None


class MatchResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    profile_id: uuid.UUID
    opportunity_id: uuid.UUID
    engine: str
    score: float | None = None
    verdict: str | None = None
    breakdown: dict[str, Any] | None = None
    computed_at: datetime | None = None


class MoveTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    label: str | None = None
    description: str | None = None


class KpiRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str | None = None
    description: str | None = None
    unit: str | None = None
    formula: str | None = None


class RoleProfileCreate(BaseModel):
    role_code: str
    role_name: str
    framework_id: uuid.UUID | None = None
    role_family: str | None = None
    career_level: str | None = None
    job_level: str | None = None
    function: str | None = None
    leadership_tier: str | None = None
    criticality: str = "standard"
    source: str = "manual"
    meta: dict[str, Any] | None = None


class RoleProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    framework_id: uuid.UUID | None = None
    role_code: str
    role_name: str
    role_family: str | None = None
    career_level: str | None = None
    job_level: str | None = None
    function: str | None = None
    leadership_tier: str | None = None
    criticality: str
    source: str
    created_at: datetime


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Frameworks
# ---------------------------------------------------------------------------


@router.post("/frameworks", response_model=FrameworkRead, status_code=status.HTTP_201_CREATED)
async def create_mobility_framework(
    payload: FrameworkCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FrameworkRead:
    f = MobilityFramework(
        tenant_id=current_tenant.id,
        name=payload.name,
        mode=payload.mode,
        fit_weights=payload.fit_weights,
        eligibility_rules=payload.eligibility_rules,
        meta=payload.meta,
    )
    db.add(f)
    await db.flush()
    await db.refresh(f)
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_frameworks.create", {"framework_id": str(f.id)})
    return FrameworkRead.model_validate(f)


@router.get("/frameworks", response_model=list[FrameworkRead])
async def list_mobility_frameworks(
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[FrameworkRead]:
    stmt = select(MobilityFramework).where(MobilityFramework.tenant_id == current_tenant.id)
    rows = (await db.execute(stmt)).scalars().all()
    return [FrameworkRead.model_validate(r) for r in rows]


@router.delete("/frameworks/{framework_id}", status_code=status.HTTP_200_OK)
async def delete_mobility_framework(
    framework_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(MobilityFramework).where(
        MobilityFramework.id == framework_id, MobilityFramework.tenant_id == current_tenant.id
    )
    f = (await db.execute(stmt)).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    await db.delete(f)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_frameworks.delete", {"framework_id": str(framework_id)})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------


@router.post("/profiles", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: ProfileCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ProfileRead:
    p = EmployeeMobilityProfile(
        tenant_id=current_tenant.id,
        employee_ref=payload.employee_ref,
        current_role_profile_id=payload.current_role_profile_id,
        performance_tier=payload.performance_tier,
        readiness=payload.readiness,
        source=payload.source,
        tenure_months=payload.tenure_months,
        meta=payload.meta,
    )
    db.add(p)
    await db.flush()
    await db.refresh(p)
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_profiles.create", {"profile_id": str(p.id)})
    return ProfileRead.model_validate(p)


@router.get("/profiles", response_model=list[ProfileRead])
async def list_profiles(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[ProfileRead]:
    stmt = (
        select(EmployeeMobilityProfile)
        .where(EmployeeMobilityProfile.tenant_id == current_tenant.id)
        .order_by(EmployeeMobilityProfile.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [ProfileRead.model_validate(r) for r in rows]


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_200_OK)
async def delete_profile(
    profile_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(EmployeeMobilityProfile).where(
        EmployeeMobilityProfile.id == profile_id,
        EmployeeMobilityProfile.tenant_id == current_tenant.id,
    )
    p = (await db.execute(stmt)).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    await db.delete(p)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_profiles.delete", {"profile_id": str(profile_id)})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Opportunities
# ---------------------------------------------------------------------------


@router.post("/opportunities", response_model=OpportunityRead, status_code=status.HTTP_201_CREATED)
async def create_opportunity(
    payload: OpportunityCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> OpportunityRead:
    o = MobilityOpportunity(
        tenant_id=current_tenant.id,
        target_role_profile_id=payload.target_role_profile_id,
        name=payload.name,
        type=payload.type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        location=payload.location,
        meta=payload.meta,
    )
    db.add(o)
    await db.flush()
    await db.refresh(o)
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_opportunities.create", {"opportunity_id": str(o.id)})
    return OpportunityRead.model_validate(o)


@router.get("/opportunities", response_model=list[OpportunityRead])
async def list_opportunities(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[OpportunityRead]:
    stmt = (
        select(MobilityOpportunity)
        .where(MobilityOpportunity.tenant_id == current_tenant.id)
        .order_by(MobilityOpportunity.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [OpportunityRead.model_validate(r) for r in rows]


@router.delete("/opportunities/{opportunity_id}", status_code=status.HTTP_200_OK)
async def delete_opportunity(
    opportunity_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(MobilityOpportunity).where(
        MobilityOpportunity.id == opportunity_id,
        MobilityOpportunity.tenant_id == current_tenant.id,
    )
    o = (await db.execute(stmt)).scalar_one_or_none()
    if o is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found")
    await db.delete(o)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility_opportunities.delete", {"opportunity_id": str(opportunity_id)})
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------


@router.post("/match", response_model=list[MatchResultRead])
async def run_match(
    payload: MatchRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[MatchResultRead]:
    if payload.mode == "profile":
        if payload.profile_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="profile_id required")
        try:
            results = await mobility_matcher.run_for_profile(db, current_tenant.id, payload.profile_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    else:
        if payload.opportunity_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="opportunity_id required")
        try:
            results = await mobility_matcher.run_for_opportunity(db, current_tenant.id, payload.opportunity_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.mobility.match", {"mode": payload.mode, "count": len(results)})
    return [MatchResultRead.model_validate(r) for r in results]


@router.get("/match-results", response_model=list[MatchResultRead])
async def list_match_results(
    current_tenant: CurrentTenant,
    db: DBDep,
    profile_id: uuid.UUID | None = Query(None),
    opportunity_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[MatchResultRead]:
    stmt = select(MobilityMatchResult).where(MobilityMatchResult.tenant_id == current_tenant.id)
    if profile_id:
        stmt = stmt.where(MobilityMatchResult.profile_id == profile_id)
    if opportunity_id:
        stmt = stmt.where(MobilityMatchResult.opportunity_id == opportunity_id)
    stmt = stmt.order_by(MobilityMatchResult.score.desc().nullslast()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [MatchResultRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Reference tables
# ---------------------------------------------------------------------------


@router.get("/move-types", response_model=list[MoveTypeRead])
async def list_move_types(db: DBDep) -> list[MoveTypeRead]:
    rows = (await db.execute(select(MobilityMoveType).order_by(MobilityMoveType.code))).scalars().all()
    return [MoveTypeRead.model_validate(r) for r in rows]


@router.get("/kpi-dictionary", response_model=list[KpiRead])
async def list_kpis(db: DBDep) -> list[KpiRead]:
    rows = (await db.execute(select(MobilityKpiDictionary).order_by(MobilityKpiDictionary.key))).scalars().all()
    return [KpiRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Role profiles
# ---------------------------------------------------------------------------


@router.post("/role-profiles", response_model=RoleProfileRead, status_code=status.HTTP_201_CREATED)
async def create_role_profile(
    payload: RoleProfileCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RoleProfileRead:
    rp = RoleCapabilityProfile(
        tenant_id=current_tenant.id,
        framework_id=payload.framework_id,
        role_code=payload.role_code,
        role_name=payload.role_name,
        role_family=payload.role_family,
        career_level=payload.career_level,
        job_level=payload.job_level,
        function=payload.function,
        leadership_tier=payload.leadership_tier,
        criticality=payload.criticality,
        source=payload.source,
        meta=payload.meta,
    )
    db.add(rp)
    await db.flush()
    await db.refresh(rp)
    await _audit(current_tenant.id, current_user.id, "hc_platform.role_profiles.create", {"role_profile_id": str(rp.id)})
    return RoleProfileRead.model_validate(rp)


@router.get("/role-profiles", response_model=list[RoleProfileRead])
async def list_role_profiles(
    current_tenant: CurrentTenant,
    db: DBDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[RoleProfileRead]:
    stmt = (
        select(RoleCapabilityProfile)
        .where(RoleCapabilityProfile.tenant_id == current_tenant.id)
        .order_by(RoleCapabilityProfile.role_code)
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [RoleProfileRead.model_validate(r) for r in rows]


@router.delete("/role-profiles/{role_profile_id}", status_code=status.HTTP_200_OK)
async def delete_role_profile(
    role_profile_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, str]:
    stmt = select(RoleCapabilityProfile).where(
        RoleCapabilityProfile.id == role_profile_id,
        RoleCapabilityProfile.tenant_id == current_tenant.id,
    )
    rp = (await db.execute(stmt)).scalar_one_or_none()
    if rp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role profile not found")
    await db.delete(rp)
    await db.flush()
    await _audit(current_tenant.id, current_user.id, "hc_platform.role_profiles.delete", {"role_profile_id": str(role_profile_id)})
    return {"status": "deleted"}
