from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.billing import CreditLedger, Plan, TenantSubscription
from app.schemas.billing import (
    CreditBalance,
    CreditTopup,
    LedgerEntryResponse,
    PlanResponse,
    StripeCheckoutCreate,
    SubscriptionResponse,
)
from app.services import credits as credit_svc
from app.services import stripe_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: DBDep) -> list[PlanResponse]:
    result = await db.execute(select(Plan).order_by(Plan.price_monthly))
    return [PlanResponse.model_validate(p) for p in result.scalars().all()]


@router.get("/balance", response_model=CreditBalance)
async def get_balance(
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> CreditBalance:
    balance = await credit_svc.get_balance(current_user.tenant_id, db)
    used_this_month = await credit_svc.get_credits_used_this_month(current_user.tenant_id, db)

    # Get credit limit from active subscription
    sub_result = await db.execute(
        select(TenantSubscription, Plan)
        .join(Plan, TenantSubscription.plan_id == Plan.id)
        .where(TenantSubscription.tenant_id == current_user.tenant_id)
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    )
    row = sub_result.first()
    credit_limit = row[1].credit_limit if row else 0

    return CreditBalance(
        balance=balance,
        plan=current_tenant.plan,
        credits_used_this_month=used_this_month,
        credit_limit=credit_limit,
    )


@router.post("/checkout")
async def create_checkout(
    payload: StripeCheckoutCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, str]:
    try:
        url = await stripe_service.create_checkout_session(
            tenant_id=current_user.tenant_id,
            plan_slug=payload.plan_slug,
            billing_period=payload.billing_period,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"checkout_url": url}


@router.post("/topup")
async def create_topup(
    payload: CreditTopup,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, str]:
    try:
        url = await stripe_service.create_topup_session(
            tenant_id=current_user.tenant_id,
            bundle=payload.bundle,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"checkout_url": url}


@router.get("/portal")
async def get_portal(
    return_url: str,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, str]:
    try:
        url = await stripe_service.get_customer_portal(
            tenant_id=current_user.tenant_id,
            return_url=return_url,
            db=db,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not create portal session: {exc}",
        ) from exc
    return {"portal_url": url}


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: DBDep) -> dict[str, str]:
    """
    Unprotected endpoint – verified by Stripe signature.
    Handles subscription lifecycle and credit top-up payment events.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.handle_webhook(payload, sig_header)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    event_type: str = event.get("type", "")
    data_obj = event.get("data", {}).get("object", {})

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        stripe_sub_id: str = data_obj.get("id", "")
        customer_id: str = data_obj.get("customer", "")
        # Resolve tenant_id from customer metadata
        import stripe
        try:
            customer = stripe.Customer.retrieve(customer_id)
            tenant_id_str = customer.get("metadata", {}).get("tenant_id")
            if tenant_id_str:
                await stripe_service.sync_subscription(
                    uuid.UUID(tenant_id_str), stripe_sub_id, db
                )
        except Exception:
            pass  # Webhook failures are logged, not raised

    elif event_type == "checkout.session.completed":
        metadata = data_obj.get("metadata", {})
        tenant_id_str = metadata.get("tenant_id")
        topup_bundle = metadata.get("topup_bundle")

        if tenant_id_str and topup_bundle:
            credits_to_add = stripe_service.TOPUP_CREDITS.get(topup_bundle, 0)
            if credits_to_add > 0:
                tenant_id = uuid.UUID(tenant_id_str)
                await credit_svc.add_credits(
                    tenant_id,
                    credits_to_add,
                    "topup_purchase",
                    data_obj.get("id"),
                    db,
                    description=f"Credit top-up: {topup_bundle} credits purchased",
                )

    elif event_type == "invoice.payment_succeeded":
        # Subscription renewal – refresh subscription record
        stripe_sub_id = data_obj.get("subscription", "")
        customer_id = data_obj.get("customer", "")
        if stripe_sub_id and customer_id:
            import stripe
            try:
                customer = stripe.Customer.retrieve(customer_id)
                tenant_id_str = customer.get("metadata", {}).get("tenant_id")
                if tenant_id_str:
                    await stripe_service.sync_subscription(
                        uuid.UUID(tenant_id_str), stripe_sub_id, db
                    )
            except Exception:
                pass

    elif event_type == "invoice.payment_failed":
        # Mark subscription as past_due
        stripe_sub_id = data_obj.get("subscription", "")
        customer_id = data_obj.get("customer", "")
        if stripe_sub_id and customer_id:
            import stripe
            try:
                customer = stripe.Customer.retrieve(customer_id)
                tenant_id_str = customer.get("metadata", {}).get("tenant_id")
                if tenant_id_str:
                    from app.models.billing import TenantSubscription, SubscriptionStatus
                    sub_result = await db.execute(
                        select(TenantSubscription).where(
                            TenantSubscription.tenant_id == uuid.UUID(tenant_id_str)
                        )
                    )
                    sub = sub_result.scalar_one_or_none()
                    if sub:
                        sub.status = SubscriptionStatus.past_due
            except Exception:
                pass

    return {"status": "ok"}


@router.get("/ledger", response_model=list[LedgerEntryResponse])
async def get_ledger(
    current_user: CurrentUser,
    db: DBDep,
    limit: int = 100,
) -> list[LedgerEntryResponse]:
    entries = await credit_svc.get_ledger(current_user.tenant_id, db, limit=limit)
    return [LedgerEntryResponse.model_validate(e) for e in entries]
