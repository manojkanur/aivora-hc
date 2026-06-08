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


@router.get(
    "/workspaces/{workspace_id}/skills/{skill_id}/state",
    response_model=dict,
)
async def get_skill_state(
    workspace_id: uuid.UUID,
    skill_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, Any]:
    result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill_id,
        )
    )
    ws_skill = result.scalar_one_or_none()
    if ws_skill is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace skill not found"
        )
    return ws_skill.state or {}


@router.put(
    "/workspaces/{workspace_id}/skills/{skill_id}/state",
    response_model=WorkspaceSkillResponse,
)
async def update_skill_state(
    workspace_id: uuid.UUID,
    skill_id: uuid.UUID,
    payload: SkillStateUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceSkillResponse:
    result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill_id,
        )
    )
    ws_skill = result.scalar_one_or_none()
    if ws_skill is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace skill not found"
        )
    ws_skill.state = payload.state
    await db.flush()
    return WorkspaceSkillResponse.model_validate(ws_skill)
