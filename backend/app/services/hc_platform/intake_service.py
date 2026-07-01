"""Structured intake persistence for HC reviews.

Static intake — the Replit codebase does NOT do LLM-driven question generation.
This service just validates `StructuredIntakeData` and writes/reads it to/from
`hc_reviews.intake_data`.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.hc_reviews import HcReview
from app.schemas.hc_platform.intake import StructuredIntakeData


async def save_intake(
    db: AsyncSession,
    review_id: uuid.UUID,
    data: StructuredIntakeData,
) -> HcReview:
    """Validate and persist the structured intake onto `hc_reviews.intake_data`."""
    review = await db.get(HcReview, review_id)
    if review is None:
        raise LookupError(f"HcReview not found: {review_id}")
    # by_alias=True keeps the on-disk JSON key style aligned with the TS source.
    review.intake_data = data.model_dump(by_alias=True, exclude_none=False)
    await db.flush()
    return review


async def get_intake(
    db: AsyncSession,
    review_id: uuid.UUID,
) -> StructuredIntakeData | None:
    """Load + parse the stored intake. Returns None when nothing is saved yet."""
    review = await db.get(HcReview, review_id)
    if review is None or not review.intake_data:
        return None
    raw: dict[str, Any] = review.intake_data  # type: ignore[assignment]
    return StructuredIntakeData.model_validate(raw)
