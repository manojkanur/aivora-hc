from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.billing import Plan, TenantSubscription, SubscriptionStatus
from app.models.tenant import Tenant

stripe.api_key = settings.STRIPE_SECRET_KEY

# ---------------------------------------------------------------------------
# Plan → Stripe price ID mapping
# ---------------------------------------------------------------------------
PLAN_PRICES: dict[str, dict[str, str]] = {
    "starter": {
        "monthly": settings.STRIPE_PRICE_STARTER_MONTHLY,
        "annual": settings.STRIPE_PRICE_STARTER_ANNUAL,
    },
    "professional": {
        "monthly": settings.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
        "annual": settings.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
    },
    "enterprise": {
        "monthly": settings.STRIPE_PRICE_ENTERPRISE_MONTHLY,
        "annual": settings.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    },
    "advisory": {
        "monthly": settings.STRIPE_PRICE_ADVISORY_MONTHLY,
        "annual": settings.STRIPE_PRICE_ADVISORY_ANNUAL,
    },
}

TOPUP_PRICES: dict[str, str] = {
    "50": settings.STRIPE_PRICE_TOPUP_50,
    "200": settings.STRIPE_PRICE_TOPUP_200,
    "500": settings.STRIPE_PRICE_TOPUP_500,
}

TOPUP_CREDITS: dict[str, int] = {
    "50": 50,
    "200": 200,
    "500": 500,
}


async def _get_or_create_customer(tenant_id: uuid.UUID, db: AsyncSession) -> str:
    """Return the Stripe customer ID for a tenant, creating one if needed."""
    result = await db.execute(
        select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id)
    )
    sub = result.scalar_one_or_none()
    if sub and sub.stripe_customer_id:
        return sub.stripe_customer_id

    # Get tenant name for the customer record
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    name = tenant.name if tenant else str(tenant_id)

    customer = stripe.Customer.create(
        name=name,
        metadata={"tenant_id": str(tenant_id)},
    )
    return customer["id"]


async def create_checkout_session(
    tenant_id: uuid.UUID,
    plan_slug: str,
    billing_period: str,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    """Create a Stripe Checkout session and return the checkout URL."""
    price_id = PLAN_PRICES.get(plan_slug, {}).get(billing_period)
    if not price_id:
        raise ValueError(f"Unknown plan '{plan_slug}' or billing period '{billing_period}'")

    customer_id = await _get_or_create_customer(tenant_id, db)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"tenant_id": str(tenant_id), "plan_slug": plan_slug},
    )
    return session["url"]


async def create_topup_session(
    tenant_id: uuid.UUID,
    bundle: str,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    """Create a Stripe Checkout session for a one-time credit top-up."""
    price_id = TOPUP_PRICES.get(bundle)
    if not price_id:
        raise ValueError(f"Unknown topup bundle '{bundle}'")

    customer_id = await _get_or_create_customer(tenant_id, db)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"tenant_id": str(tenant_id), "topup_bundle": bundle},
    )
    return session["url"]


def handle_webhook(payload: bytes, sig_header: str) -> dict[str, Any]:
    """Verify and parse a Stripe webhook event."""
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as exc:
        raise ValueError(f"Stripe webhook signature invalid: {exc}") from exc
    return dict(event)


async def sync_subscription(
    tenant_id: uuid.UUID,
    stripe_sub_id: str,
    db: AsyncSession,
) -> TenantSubscription:
    """Fetch live subscription data from Stripe and upsert the local record."""
    stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
    customer_id = stripe_sub["customer"]
    period_end = datetime.fromtimestamp(
        stripe_sub["current_period_end"], tz=timezone.utc
    )
    raw_status: str = stripe_sub["status"]
    status_map = {
        "active": SubscriptionStatus.active,
        "past_due": SubscriptionStatus.past_due,
        "canceled": SubscriptionStatus.canceled,
        "trialing": SubscriptionStatus.trialing,
    }
    status = status_map.get(raw_status, SubscriptionStatus.active)

    result = await db.execute(
        select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id)
    )
    sub = result.scalar_one_or_none()

    if sub is None:
        # Find the default starter plan as fallback
        plan_result = await db.execute(select(Plan).where(Plan.slug == "starter"))
        plan = plan_result.scalar_one_or_none()
        sub = TenantSubscription(
            tenant_id=tenant_id,
            plan_id=plan.id if plan else uuid.uuid4(),
            stripe_subscription_id=stripe_sub_id,
            stripe_customer_id=customer_id,
            status=status,
            current_period_end=period_end,
        )
        db.add(sub)
    else:
        sub.stripe_subscription_id = stripe_sub_id
        sub.stripe_customer_id = customer_id
        sub.status = status
        sub.current_period_end = period_end

    await db.flush()
    return sub


async def get_customer_portal(tenant_id: uuid.UUID, return_url: str, db: AsyncSession) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    customer_id = await _get_or_create_customer(tenant_id, db)
    portal = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return portal["url"]
