from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.export import BrandKit
from app.schemas.tenant import (
    BrandKitCreate,
    BrandKitResponse,
    BrandKitUpdate,
    TenantResponse,
    TenantUpdate,
)

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(current_tenant: CurrentTenant) -> TenantResponse:
    return TenantResponse.model_validate(current_tenant)


@router.patch("/me", response_model=TenantResponse)
async def update_my_tenant(
    payload: TenantUpdate,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> TenantResponse:
    if payload.name is not None:
        current_tenant.name = payload.name
    if payload.settings is not None:
        current_tenant.settings = payload.settings
    if payload.brand_kit is not None:
        current_tenant.brand_kit = payload.brand_kit
    await db.flush()
    return TenantResponse.model_validate(current_tenant)


# ---------------------------------------------------------------------------
# Brand Kits
# ---------------------------------------------------------------------------

@router.get("/me/brand-kits", response_model=list[BrandKitResponse])
async def list_brand_kits(current_tenant: CurrentTenant, db: DBDep) -> list[BrandKitResponse]:
    result = await db.execute(
        select(BrandKit).where(BrandKit.tenant_id == current_tenant.id)
    )
    kits = list(result.scalars().all())
    return [BrandKitResponse.model_validate(k) for k in kits]


@router.post("/me/brand-kits", response_model=BrandKitResponse, status_code=status.HTTP_201_CREATED)
async def create_brand_kit(
    payload: BrandKitCreate,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> BrandKitResponse:
    # If this is set as default, unset others
    if payload.is_default:
        existing = await db.execute(
            select(BrandKit).where(
                BrandKit.tenant_id == current_tenant.id,
                BrandKit.is_default == True,  # noqa: E712
            )
        )
        for kit in existing.scalars():
            kit.is_default = False

    kit = BrandKit(
        tenant_id=current_tenant.id,
        name=payload.name,
        logo_url=payload.logo_url,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        font=payload.font,
        template_config=payload.template_config,
        is_default=payload.is_default,
    )
    db.add(kit)
    await db.flush()
    return BrandKitResponse.model_validate(kit)


@router.patch("/me/brand-kits/{kit_id}", response_model=BrandKitResponse)
async def update_brand_kit(
    kit_id: uuid.UUID,
    payload: BrandKitUpdate,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> BrandKitResponse:
    result = await db.execute(
        select(BrandKit).where(
            BrandKit.id == kit_id, BrandKit.tenant_id == current_tenant.id
        )
    )
    kit = result.scalar_one_or_none()
    if kit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand kit not found")

    if payload.name is not None:
        kit.name = payload.name
    if payload.logo_url is not None:
        kit.logo_url = payload.logo_url
    if payload.primary_color is not None:
        kit.primary_color = payload.primary_color
    if payload.secondary_color is not None:
        kit.secondary_color = payload.secondary_color
    if payload.font is not None:
        kit.font = payload.font
    if payload.template_config is not None:
        kit.template_config = payload.template_config
    if payload.is_default is not None:
        if payload.is_default:
            existing = await db.execute(
                select(BrandKit).where(
                    BrandKit.tenant_id == current_tenant.id,
                    BrandKit.is_default == True,  # noqa: E712
                )
            )
            for k in existing.scalars():
                k.is_default = False
        kit.is_default = payload.is_default

    await db.flush()
    return BrandKitResponse.model_validate(kit)


@router.delete("/me/brand-kits/{kit_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_brand_kit(
    kit_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> None:
    result = await db.execute(
        select(BrandKit).where(
            BrandKit.id == kit_id, BrandKit.tenant_id == current_tenant.id
        )
    )
    kit = result.scalar_one_or_none()
    if kit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand kit not found")
    await db.delete(kit)
