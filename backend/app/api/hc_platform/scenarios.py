"""Scenarios + assumptions + run + templates."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.scenarios import (
    ScenarioAssumption,
    ScenarioModel,
    ScenarioOutput,
    ScenarioRiskFlag,
    ScenarioTemplate,
)
from app.services.audit import log_event
from app.services.hc_platform import scenario_engine

router = APIRouter()


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scenario_type: str
    name: str
    description: str | None = None
    default_assumptions: dict[str, Any] | None = None
    formula_ref: str | None = None


class AssumptionPayload(BaseModel):
    key: str
    label: str | None = None
    value: dict[str, Any] | None = None
    unit: str | None = None
    source: str | None = None
    sort_order: int = 0


class ScenarioCreate(BaseModel):
    name: str
    scenario_type: str | None = None
    review_id: uuid.UUID | None = None
    assumptions_summary: dict[str, Any] | None = None
    assumptions: list[AssumptionPayload] = []
    meta: dict[str, Any] | None = None


class ScenarioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID | None = None
    scenario_type: str | None = None
    name: str
    status: str
    assumptions_summary: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class AssumptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scenario_id: uuid.UUID
    key: str
    label: str | None = None
    value: dict[str, Any] | None = None
    unit: str | None = None
    source: str | None = None
    sort_order: int


class OutputRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scenario_id: uuid.UUID
    period_label: str | None = None
    output_data: dict[str, Any] | None = None
    sort_order: int


class RiskFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scenario_id: uuid.UUID
    severity: str | None = None
    label: str | None = None
    description: str | None = None
    mitigation: str | None = None


class ScenarioDetail(ScenarioRead):
    assumptions: list[AssumptionRead] = []
    outputs: list[OutputRead] = []
    risk_flags: list[RiskFlagRead] = []


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.get("/templates", response_model=list[TemplateRead])
async def list_templates(db: DBDep) -> list[TemplateRead]:
    stmt = select(ScenarioTemplate).order_by(ScenarioTemplate.name)
    rows = (await db.execute(stmt)).scalars().all()
    return [TemplateRead.model_validate(r) for r in rows]


@router.post("", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    payload: ScenarioCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ScenarioRead:
    s = ScenarioModel(
        tenant_id=current_tenant.id,
        review_id=payload.review_id,
        scenario_type=payload.scenario_type,
        name=payload.name,
        assumptions_summary=payload.assumptions_summary,
        meta=payload.meta,
    )
    db.add(s)
    await db.flush()
    for a in payload.assumptions:
        db.add(
            ScenarioAssumption(
                scenario_id=s.id,
                key=a.key,
                label=a.label,
                value=a.value,
                unit=a.unit,
                source=a.source,
                sort_order=a.sort_order,
            )
        )
    await db.flush()
    await db.refresh(s)
    await _audit(current_tenant.id, current_user.id, "hc_platform.scenarios.create", {"scenario_id": str(s.id)})
    return ScenarioRead.model_validate(s)


@router.get("", response_model=list[ScenarioRead])
async def list_scenarios(
    current_tenant: CurrentTenant,
    db: DBDep,
    review_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[ScenarioRead]:
    stmt = select(ScenarioModel).where(ScenarioModel.tenant_id == current_tenant.id)
    if review_id:
        stmt = stmt.where(ScenarioModel.review_id == review_id)
    stmt = stmt.order_by(ScenarioModel.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [ScenarioRead.model_validate(r) for r in rows]


@router.get("/{scenario_id}", response_model=ScenarioDetail)
async def get_scenario(
    scenario_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ScenarioDetail:
    stmt = select(ScenarioModel).where(
        ScenarioModel.id == scenario_id, ScenarioModel.tenant_id == current_tenant.id
    )
    s = (await db.execute(stmt)).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    a_rows = (await db.execute(select(ScenarioAssumption).where(ScenarioAssumption.scenario_id == scenario_id))).scalars().all()
    o_rows = (await db.execute(select(ScenarioOutput).where(ScenarioOutput.scenario_id == scenario_id))).scalars().all()
    r_rows = (await db.execute(select(ScenarioRiskFlag).where(ScenarioRiskFlag.scenario_id == scenario_id))).scalars().all()
    base = ScenarioRead.model_validate(s).model_dump()
    base["assumptions"] = [AssumptionRead.model_validate(a) for a in a_rows]
    base["outputs"] = [OutputRead.model_validate(o) for o in o_rows]
    base["risk_flags"] = [RiskFlagRead.model_validate(r) for r in r_rows]
    return ScenarioDetail.model_validate(base)


@router.post("/{scenario_id}/run", response_model=ScenarioRead)
async def run_scenario(
    scenario_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ScenarioRead:
    stmt = select(ScenarioModel).where(
        ScenarioModel.id == scenario_id, ScenarioModel.tenant_id == current_tenant.id
    )
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    try:
        s = await scenario_engine.run(db, scenario_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(s)
    await _audit(current_tenant.id, current_user.id, "hc_platform.scenarios.run", {"scenario_id": str(scenario_id)})
    return ScenarioRead.model_validate(s)
