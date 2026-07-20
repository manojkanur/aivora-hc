from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import AdminUser, CurrentUser, DBDep
from app.models.ai import AiAuditLog, AiJob
from app.models.billing import CreditLedger
from app.models.skill import SkillRegistry
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.skill import SkillResponse, SkillUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_platform_stats(admin_user: AdminUser, db: DBDep) -> dict[str, Any]:
    """High-level platform statistics for admins."""
    from app.models.export import Export
    from datetime import timezone

    tenant_count_result = await db.execute(select(func.count()).select_from(Tenant))
    tenant_count = tenant_count_result.scalar_one() or 0

    # Active users today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    active_today_result = await db.execute(
        select(func.count(func.distinct(AiJob.user_id))).where(AiJob.created_at >= today_start)
    )
    active_users_today = active_today_result.scalar_one() or 0

    # AI jobs today
    ai_jobs_today_result = await db.execute(
        select(func.count()).where(AiJob.created_at >= today_start)
    )
    ai_jobs_today = ai_jobs_today_result.scalar_one() or 0

    # Total exports
    exports_result = await db.execute(select(func.count()).select_from(Export))
    total_exports = exports_result.scalar_one() or 0

    # Credits issued today (positive deltas)
    credits_today_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credits_delta), 0)).where(
            CreditLedger.credits_delta > 0,
            CreditLedger.created_at >= today_start,
        )
    )
    credits_issued_today = int(credits_today_result.scalar_one() or 0)

    return {
        "total_tenants": tenant_count,
        "active_users_today": active_users_today,
        "ai_jobs_today": ai_jobs_today,
        "total_exports": total_exports,
        "credits_issued_today": credits_issued_today,
    }


@router.get("/audit-log")
async def get_audit_log(
    admin_user: AdminUser,
    db: DBDep,
    action: str | None = None,
    tenant_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = select(AiAuditLog).order_by(AiAuditLog.created_at.desc())
    if action:
        query = query.where(AiAuditLog.action == action)
    if tenant_id:
        query = query.where(AiAuditLog.tenant_id == tenant_id)
    if date_from:
        query = query.where(AiAuditLog.created_at >= date_from)
    if date_to:
        query = query.where(AiAuditLog.created_at <= date_to)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    entries = result.scalars().all()

    # Resolve user_id -> friendly name/email in one batched query so the table
    # shows "you@example.com" instead of raw UUIDs.
    from app.models.user import User as _User
    user_ids = {e.user_id for e in entries if e.user_id is not None}
    users_by_id: dict[Any, _User] = {}
    if user_ids:
        users_result = await db.execute(select(_User).where(_User.id.in_(list(user_ids))))
        for u in users_result.scalars().all():
            users_by_id[u.id] = u

    def user_label(uid: Any) -> str:
        if uid is None:
            return "system"
        u = users_by_id.get(uid)
        if not u:
            return f"user {str(uid)[:6]}"
        return u.name or u.email or f"user {str(uid)[:6]}"

    return [
        {
            "id": str(e.id),
            "tenant_id": str(e.tenant_id) if e.tenant_id else None,
            "user_id": str(e.user_id) if e.user_id else None,
            # Friendly aliases the admin dashboard expects.
            "timestamp": e.created_at.isoformat() if e.created_at else None,
            "user": user_label(e.user_id),
            "action": e.action,
            "resource": e.skill_id or "",
            "ip": e.ip_address or "-",
            "payload": e.payload,
            # Originals (left for back-compat with other callers).
            "skill_id": e.skill_id,
            "ip_address": e.ip_address,
            "user_agent": e.user_agent,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.get("/skills")
async def admin_list_skills(admin_user: AdminUser, db: DBDep) -> list[dict[str, Any]]:
    """List all skills with usage stats (job_count per skill)."""
    result = await db.execute(select(SkillRegistry).order_by(SkillRegistry.sort_order))
    skills = result.scalars().all()

    output = []
    for skill in skills:
        job_count_result = await db.execute(
            select(func.count()).where(AiJob.skill_id == skill.id)
        )
        job_count = job_count_result.scalar_one() or 0
        s_dict = {
            "id": str(skill.id),
            "slug": skill.slug,
            "name": skill.name,
            "category": skill.category,
            "description": skill.description,
            "icon": skill.icon,
            "tier": skill.tier,
            "credit_cost": skill.credit_cost,
            "status": skill.status,
            "sort_order": skill.sort_order,
            "created_at": skill.created_at.isoformat() if skill.created_at else None,
            "job_count": job_count,
            "report_spec": skill.report_spec,
            "has_report_spec": bool(skill.report_spec),
        }
        output.append(s_dict)
    return output


@router.patch("/skills/{skill_id}", response_model=SkillResponse)
async def admin_update_skill(
    skill_id: uuid.UUID,
    payload: SkillUpdate,
    admin_user: AdminUser,
    db: DBDep,
) -> SkillResponse:
    result = await db.execute(select(SkillRegistry).where(SkillRegistry.id == skill_id))
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    if payload.name is not None:
        skill.name = payload.name
    if payload.description is not None:
        skill.description = payload.description
    if payload.report_spec is not None:
        # Empty string clears the custom spec (studio reverts to the generic contract).
        skill.report_spec = payload.report_spec.strip() or None
        # Bust the in-memory spec cache so the new spec takes effect immediately.
        from app.services.hc_platform import spec_studio
        spec_studio.invalidate_spec_cache(skill.slug)
    if payload.tier is not None:
        skill.tier = payload.tier
    if payload.credit_cost is not None:
        skill.credit_cost = payload.credit_cost
    if payload.status is not None:
        skill.status = payload.status
    if payload.sort_order is not None:
        skill.sort_order = payload.sort_order

    await db.flush()
    return SkillResponse.model_validate(skill)


class LlmConfigUpdate(BaseModel):
    global_model: str | None = None
    skill_overrides: dict[str, str] | None = None


@router.get("/llm-config")
async def admin_get_llm_config(admin_user: AdminUser, db: DBDep) -> dict[str, Any]:
    from app.services.model_settings import get_llm_config

    return await get_llm_config(db)


@router.patch("/llm-config")
async def admin_update_llm_config(
    payload: LlmConfigUpdate,
    admin_user: AdminUser,
    db: DBDep,
) -> dict[str, Any]:
    from app.config import settings
    from app.services.model_settings import completion_params, get_llm_config, save_llm_config

    config = await get_llm_config(db)
    if payload.skill_overrides is not None:
        config["skill_overrides"] = {k: v for k, v in payload.skill_overrides.items() if v}

    if payload.global_model is not None:
        model = payload.global_model.strip()
        if not model or len(model) > 100:
            raise HTTPException(status_code=400, detail="Invalid model name")
        # Prove the model is actually servable before saving it, so a typo or
        # unavailable model can never brick the advisor for every user.
        if settings.OPENAI_API_KEY and model != config["global_model"]:
            from app.services.ai_orchestrator import _get_client

            try:
                await _get_client().chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": "ping"}],
                    **completion_params(model, temperature=0.0, max_tokens=16),
                )
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=400,
                    detail=f"Model '{model}' is not available on the configured API key: {exc}",
                )
        config["global_model"] = model

    await save_llm_config(db, config)
    return config


@router.get("/users")
async def admin_list_users(
    admin_user: AdminUser,
    db: DBDep,
    tenant_id: uuid.UUID | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    query = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if tenant_id:
        query = query.where(User.tenant_id == tenant_id)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": str(u.id),
            "tenant_id": str(u.tenant_id),
            "google_id": u.google_id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "xp_points": u.xp_points,
            "level": u.level,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]
