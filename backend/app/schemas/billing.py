from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.billing import SubscriptionStatus


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    price_monthly: int
    price_annual: int
    features: dict[str, Any] | None
    credit_limit: int

    model_config = {"from_attributes": True}


class CreditBalance(BaseModel):
    balance: int
    plan: str
    credits_used_this_month: int
    credit_limit: int


class StripeCheckoutCreate(BaseModel):
    plan_slug: str
    billing_period: str = Field(default="monthly", pattern="^(monthly|annual)$")
    success_url: str
    cancel_url: str


class CreditTopup(BaseModel):
    bundle: str = Field(..., pattern="^(50|200|500)$")
    success_url: str
    cancel_url: str


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plan_id: uuid.UUID
    stripe_subscription_id: str | None
    stripe_customer_id: str | None
    status: SubscriptionStatus
    current_period_end: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LedgerEntryResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID | None
    action_type: str
    credits_delta: int
    balance_after: int
    reference_id: str | None
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}
