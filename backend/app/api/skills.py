from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.skill import SkillRegistry, WorkspaceSkill
from app.schemas.skill import SkillResponse, SkillStateUpdate, WorkspaceSkillResponse

router = APIRouter(tags=["skills"])


@router.get("/skills", response_model=list[SkillResponse])
async def list_skills(db: DBDep, current_user: CurrentUser) -> list[SkillResponse]:
    result = await db.execute(
        select(SkillRegistry)
        .where(SkillRegistry.status == "active")
        .order_by(SkillRegistry.sort_order)
    )
    return [SkillResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/skills/{slug}", response_model=SkillResponse)
async def get_skill(slug: str, db: DBDep, current_user: CurrentUser) -> SkillResponse:
    result = await db.execute(select(SkillRegistry).where(SkillRegistry.slug == slug))
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return SkillResponse.model_validate(skill)


async def _resolve_skill(skill_ref: str, db: DBDep) -> SkillRegistry:
    """Look up a skill by UUID *or* slug. Frontend uses both shapes."""
    try:
        sid = uuid.UUID(skill_ref)
        result = await db.execute(select(SkillRegistry).where(SkillRegistry.id == sid))
    except ValueError:
        result = await db.execute(select(SkillRegistry).where(SkillRegistry.slug == skill_ref))
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return skill


@router.get(
    "/workspaces/{workspace_id}/skills/{skill_id}/state",
    response_model=dict,
)
async def get_skill_state(
    workspace_id: uuid.UUID,
    skill_id: str,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, Any]:
    skill = await _resolve_skill(skill_id, db)
    result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill.id,
        )
    )
    ws_skill = result.scalar_one_or_none()
    return {"state": (ws_skill.state if ws_skill else {}) or {}}


@router.put(
    "/workspaces/{workspace_id}/skills/{skill_id}/state",
    response_model=WorkspaceSkillResponse,
)
async def update_skill_state(
    workspace_id: uuid.UUID,
    skill_id: str,
    payload: SkillStateUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceSkillResponse:
    skill = await _resolve_skill(skill_id, db)
    result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill.id,
        )
    )
    ws_skill = result.scalar_one_or_none()
    if ws_skill is None:
        # Upsert: create the workspace_skill row on first save
        ws_skill = WorkspaceSkill(workspace_id=workspace_id, skill_id=skill.id, state=payload.state)
        db.add(ws_skill)
    else:
        ws_skill.state = payload.state
    await db.flush()
    await db.refresh(ws_skill)
    return WorkspaceSkillResponse.model_validate(ws_skill)
