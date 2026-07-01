"""AI advisory: generate, list insights, prompt templates."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.ai_insights import AiGeneratedInsight, AiPromptTemplate
from app.models.hc_platform.hc_reviews import HcReview
from app.services.audit import log_event
from app.services.hc_platform import ai_advisory

router = APIRouter()


class GenerateRequest(BaseModel):
    review_id: uuid.UUID
    insight_type: str
    force: bool = False


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    insight_type: str
    generator_type: str
    content: dict[str, Any] | None = None
    model_name: str | None = None
    tokens_used: int | None = None
    created_at: datetime


class PromptTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    version: int
    insight_type: str | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    model_name: str | None = None
    is_active: bool


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.post("/generate", response_model=InsightRead, status_code=status.HTTP_201_CREATED)
async def generate(
    payload: GenerateRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> InsightRead:
    stmt = select(HcReview).where(
        HcReview.id == payload.review_id, HcReview.tenant_id == current_tenant.id
    )
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HC review not found")
    try:
        insight = await ai_advisory.generate_insight(
            db,
            review_id=payload.review_id,
            insight_type=payload.insight_type,
            force=payload.force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(insight)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.generate",
        {"insight_id": str(insight.id), "insight_type": payload.insight_type},
    )
    return InsightRead.model_validate(insight)


class DeliverableRequest(BaseModel):
    topic: str
    review_id: uuid.UUID | None = None
    context_brief: str | None = None
    brief: dict[str, Any] | None = None


class DeliverableResponse(BaseModel):
    document: dict[str, Any]


@router.post("/deliverable", response_model=DeliverableResponse)
async def generate_deliverable(
    payload: DeliverableRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> DeliverableResponse:
    """Generate a rich structured deliverable (multi-section studio doc)."""
    try:
        document = await ai_advisory.build_deliverable(
            db,
            topic=payload.topic,
            review_id=payload.review_id,
            context_brief=payload.context_brief,
            brief=payload.brief,
            tenant_id=current_tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.deliverable",
        {"topic": payload.topic, "review_id": str(payload.review_id) if payload.review_id else None},
    )
    return DeliverableResponse(document=document)


class RegenerateSectionRequest(BaseModel):
    topic: str
    section_id: str
    review_id: uuid.UUID | None = None
    context_brief: str | None = None
    brief: dict[str, Any] | None = None
    hint: str | None = None


class RegenerateSectionResponse(BaseModel):
    section: dict[str, Any]


@router.post("/regenerate-section", response_model=RegenerateSectionResponse)
async def regenerate_section(
    payload: RegenerateSectionRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RegenerateSectionResponse:
    """Rebuild a single section of the AI advisory deliverable with optional hint."""
    try:
        section = await ai_advisory.regenerate_section(
            db,
            topic=payload.topic,
            section_id=payload.section_id,
            review_id=payload.review_id,
            context_brief=payload.context_brief,
            brief=payload.brief,
            hint=payload.hint,
            tenant_id=current_tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.regenerate_section",
        {"topic": payload.topic, "section_id": payload.section_id, "has_hint": bool(payload.hint)},
    )
    return RegenerateSectionResponse(section=section)


@router.get("/insights", response_model=list[InsightRead])
async def list_insights(
    current_tenant: CurrentTenant,
    db: DBDep,
    review_id: uuid.UUID | None = Query(None),
    insight_type: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[InsightRead]:
    stmt = select(AiGeneratedInsight).where(AiGeneratedInsight.tenant_id == current_tenant.id)
    if review_id:
        stmt = stmt.where(AiGeneratedInsight.review_id == review_id)
    if insight_type:
        stmt = stmt.where(AiGeneratedInsight.insight_type == insight_type)
    stmt = stmt.order_by(AiGeneratedInsight.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [InsightRead.model_validate(r) for r in rows]


@router.get("/prompt-templates", response_model=list[PromptTemplateRead])
async def list_prompt_templates(
    admin_user: AdminUser,
    db: DBDep,
) -> list[PromptTemplateRead]:
    stmt = select(AiPromptTemplate).order_by(AiPromptTemplate.key, AiPromptTemplate.version.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [PromptTemplateRead.model_validate(r) for r in rows]
