from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)

    @field_validator("domain")
    @classmethod
    def _normalise_domain(cls, v: str) -> str:
        return v.lower().strip()


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    settings: dict[str, Any] | None = None
    brand_kit: dict[str, Any] | None = None


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    domain: str
    plan: str
    settings: dict[str, Any] | None
    brand_kit: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantOnboard(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domain: str = Field(..., min_length=1, max_length=255)
    plan: str = Field(default="starter", max_length=50)

    @field_validator("domain")
    @classmethod
    def _normalise_domain(cls, v: str) -> str:
        return v.lower().strip()


class BrandKitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    logo_url: str | None = None
    primary_color: str = Field(default="#000000", max_length=20)
    secondary_color: str = Field(default="#ffffff", max_length=20)
    font: str = Field(default="Inter", max_length=100)
    template_config: dict[str, Any] | None = None
    is_default: bool = False


class BrandKitUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    logo_url: str | None = None
    primary_color: str | None = Field(default=None, max_length=20)
    secondary_color: str | None = Field(default=None, max_length=20)
    font: str | None = Field(default=None, max_length=100)
    template_config: dict[str, Any] | None = None
    is_default: bool | None = None


class BrandKitResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    logo_url: str | None
    primary_color: str
    secondary_color: str
    font: str
    template_config: dict[str, Any] | None
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}
