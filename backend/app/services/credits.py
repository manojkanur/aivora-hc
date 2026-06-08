from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CreditLedger


async def get_balance(tenant_id: uuid.UUID, db: AsyncSession) -> int:
    """
    Return the current credit balance for a tenant.
    We take the *latest* balance_after entry as the running balance.
    If no ledger entries exist, balance is 0.
    """
    result = await db.execute(
        select(CreditLedger.balance_after)
        .where(CreditLedger.tenant_id == tenant_id)
        .order_by(CreditLedger.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def deduct_credits(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID | None,
    amount: int,
    action: str,
    ref_id: str | None,
    db: AsyncSession,
) -> bool:
    """
    Deduct `amount` credits from the tenant balance.
    Returns True on success, False if balance is insufficient.
    """
    current = await get_balance(tenant_id, db)
    if current < amount:
        return False

    new_balance = current - amount
    entry = CreditLedger(
        tenant_id=tenant_id,
        user_id=user_id,
        action_type=action,
        credits_delta=-amount,
        balance_after=new_balance,
        reference_id=ref_id,
        description=f"Deducted {amount} credits for {action}",
    )
    db.add(entry)
    await db.flush()
    return True


async def refund_credits(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID | None,
    amount: int,
    ref_id: str | None,
    db: AsyncSession,
) -> int:
    """
    Refund `amount` credits to the tenant balance. Returns new balance.
    """
    current = await get_balance(tenant_id, db)
    new_balance = current + amount
    entry = CreditLedger(
        tenant_id=tenant_id,
        user_id=user_id,
        action_type="refund",
        credits_delta=amount,
        balance_after=new_balance,
        reference_id=ref_id,
        description=f"Refunded {amount} credits",
    )
    db.add(entry)
    await db.flush()
    return new_balance


async def add_credits(
    tenant_id: uuid.UUID,
    amount: int,
    action: str,
    ref_id: str | None,
    db: AsyncSession,
    description: str = "",
) -> int:
    """
    Add `amount` credits to the tenant balance. Returns new balance.
    """
    current = await get_balance(tenant_id, db)
    new_balance = current + amount
    entry = CreditLedger(
        tenant_id=tenant_id,
        user_id=None,
        action_type=action,
        credits_delta=amount,
        balance_after=new_balance,
        reference_id=ref_id,
        description=description or f"Added {amount} credits ({action})",
    )
    db.add(entry)
    await db.flush()
    return new_balance


async def get_ledger(tenant_id: uuid.UUID, db: AsyncSession, limit: int = 100) -> list[CreditLedger]:
    """Return the most recent ledger entries for a tenant."""
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.tenant_id == tenant_id)
        .order_by(CreditLedger.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_credits_used_this_month(tenant_id: uuid.UUID, db: AsyncSession) -> int:
    """Sum of all negative deltas in the current calendar month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credits_delta * -1), 0))
        .where(
            CreditLedger.tenant_id == tenant_id,
            CreditLedger.credits_delta < 0,
            CreditLedger.created_at >= month_start,
        )
    )
    return int(result.scalar_one() or 0)
