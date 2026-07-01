"""Modules catalog + tenant module activation."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentTenant, DBDep
from app.models.hc_platform.modules import Module
from app.models.hc_platform.tenant_modules import TenantModule
from app.services.audit import log_event

router = APIRouter()


class ModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    label: str
    description: str | None = None
    route_path: str | None = None
    icon: str | None = None
    category: str
    status: str
    sort_order: int
    plan_tier: str | None = None
    # Tenant activation state
    tenant_status: str | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


async def _get_module_or_404(key: str, db) -> Module:
    stmt = select(Module).where(Module.key == key)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    return m


async def _get_tenant_module(tenant_id: uuid.UUID, module_key: str, db) -> TenantModule | None:
    stmt = select(TenantModule).where(
        TenantModule.tenant_id == tenant_id, TenantModule.module_key == module_key
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get("", response_model=list[ModuleRead])
async def list_modules(
    current_tenant: CurrentTenant,
    db: DBDep,
) -> list[ModuleRead]:
    modules = (await db.execute(select(Module).order_by(Module.sort_order, Module.key))).scalars().all()
    tm_rows = (
        await db.execute(select(TenantModule).where(TenantModule.tenant_id == current_tenant.id))
    ).scalars().all()
    tm_map = {tm.module_key: tm for tm in tm_rows}
    out: list[ModuleRead] = []
    for m in modules:
        base = ModuleRead.model_validate(m).model_dump()
        tm = tm_map.get(m.key)
        base["tenant_status"] = tm.status if tm else None
        out.append(ModuleRead.model_validate(base))
    return out


@router.get("/{key}", response_model=ModuleRead)
async def get_module(
    key: str,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ModuleRead:
    m = await _get_module_or_404(key, db)
    tm = await _get_tenant_module(current_tenant.id, key, db)
    base = ModuleRead.model_validate(m).model_dump()
    base["tenant_status"] = tm.status if tm else None
    return ModuleRead.model_validate(base)


@router.post("/{key}/enable", response_model=ModuleRead)
async def enable_module(
    key: str,
    admin_user: AdminUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ModuleRead:
    m = await _get_module_or_404(key, db)
    tm = await _get_tenant_module(current_tenant.id, key, db)
    if tm is None:
        tm = TenantModule(tenant_id=current_tenant.id, module_key=key, status="active")
        db.add(tm)
    else:
        tm.status = "active"
        tm.revoked_at = None
    await db.flush()
    await _audit(current_tenant.id, admin_user.id, "hc_platform.modules.enable", {"module_key": key})
    base = ModuleRead.model_validate(m).model_dump()
    base["tenant_status"] = tm.status
    return ModuleRead.model_validate(base)


@router.post("/{key}/disable", response_model=ModuleRead)
async def disable_module(
    key: str,
    admin_user: AdminUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ModuleRead:
    m = await _get_module_or_404(key, db)
    tm = await _get_tenant_module(current_tenant.id, key, db)
    if tm is None:
        tm = TenantModule(tenant_id=current_tenant.id, module_key=key, status="disabled")
        db.add(tm)
    else:
        tm.status = "disabled"
        tm.revoked_at = datetime.utcnow()
    await db.flush()
    await _audit(current_tenant.id, admin_user.id, "hc_platform.modules.disable", {"module_key": key})
    base = ModuleRead.model_validate(m).model_dump()
    base["tenant_status"] = tm.status
    return ModuleRead.model_validate(base)
