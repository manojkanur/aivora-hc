from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.skill import SkillRegistry, WorkspaceSkill
from app.models.workspace import Workspace, WorkspaceStatus
from app.schemas.skill import SkillStateUpdate, WorkspaceSkillResponse
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate
from app.services.gamification import award_xp, check_quest_progress, update_streak

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


async def _get_workspace_or_404(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> Workspace:
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(current_user: CurrentUser, db: DBDep) -> list[WorkspaceResponse]:
    result = await db.execute(
        select(Workspace).where(Workspace.tenant_id == current_user.tenant_id)
    )
    return [WorkspaceResponse.model_validate(w) for w in result.scalars().all()]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceResponse:
    # Count existing workspaces for first-client-workspace quest
    existing = await db.execute(
        select(Workspace).where(Workspace.tenant_id == current_user.tenant_id)
    )
    is_first = len(list(existing.scalars().all())) == 0

    ws = Workspace(
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
        name=payload.name,
        client_name=payload.client_name,
        description=payload.description,
        status=WorkspaceStatus.active,
    )
    db.add(ws)
    await db.flush()

    if is_first:
        await award_xp(current_user.id, "first_client_workspace", str(ws.id), db)
        await check_quest_progress(current_user.id, "first_client_workspace", db)

    return WorkspaceResponse.model_validate(ws)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceResponse:
    ws = await _get_workspace_or_404(workspace_id, current_user, db)
    return WorkspaceResponse.model_validate(ws)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceResponse:
    ws = await _get_workspace_or_404(workspace_id, current_user, db)

    if payload.name is not None:
        ws.name = payload.name
    if payload.client_name is not None:
        ws.client_name = payload.client_name
    if payload.description is not None:
        ws.description = payload.description
    if payload.status is not None:
        ws.status = payload.status

    await db.flush()
    return WorkspaceResponse.model_validate(ws)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_workspace(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> None:
    """Soft-delete workspace by setting status to archived."""
    ws = await _get_workspace_or_404(workspace_id, current_user, db)
    ws.status = WorkspaceStatus.archived


# ---------------------------------------------------------------------------
# Skills within workspace
# ---------------------------------------------------------------------------

@router.get("/{workspace_id}/skills", response_model=list[WorkspaceSkillResponse])
async def list_workspace_skills(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> list[WorkspaceSkillResponse]:
    await _get_workspace_or_404(workspace_id, current_user, db)
    result = await db.execute(
        select(WorkspaceSkill).where(WorkspaceSkill.workspace_id == workspace_id)
    )
    items = list(result.scalars().all())
    # Eager-load skill details inline
    responses = []
    for ws_skill in items:
        skill_result = await db.execute(
            select(SkillRegistry).where(SkillRegistry.id == ws_skill.skill_id)
        )
        skill = skill_result.scalar_one_or_none()
        r = WorkspaceSkillResponse.model_validate(ws_skill)
        if skill:
            from app.schemas.skill import SkillResponse
            r.skill = SkillResponse.model_validate(skill)
        responses.append(r)
    return responses


@router.post("/{workspace_id}/skills/{skill_id}", response_model=WorkspaceSkillResponse, status_code=status.HTTP_201_CREATED)
async def activate_skill(
    workspace_id: uuid.UUID,
    skill_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceSkillResponse:
    await _get_workspace_or_404(workspace_id, current_user, db)

    # Verify skill exists
    skill_result = await db.execute(select(SkillRegistry).where(SkillRegistry.id == skill_id))
    skill = skill_result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    # Check if already activated
    existing = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill_id,
        )
    )
    ws_skill = existing.scalar_one_or_none()
    if ws_skill is not None:
        r = WorkspaceSkillResponse.model_validate(ws_skill)
        from app.schemas.skill import SkillResponse
        r.skill = SkillResponse.model_validate(skill)
        return r

    ws_skill = WorkspaceSkill(
        workspace_id=workspace_id,
        skill_id=skill_id,
        state={},
    )
    db.add(ws_skill)
    await db.flush()

    # Award XP for skill activation
    await award_xp(current_user.id, "skill_activated", str(skill.id), db)
    await update_streak(current_user.id, skill.slug, db)
    await check_quest_progress(current_user.id, "skill_activated", db)

    r = WorkspaceSkillResponse.model_validate(ws_skill)
    from app.schemas.skill import SkillResponse
    r.skill = SkillResponse.model_validate(skill)
    return r


@router.put("/{workspace_id}/skills/{skill_id}/state", response_model=WorkspaceSkillResponse)
async def update_skill_state(
    workspace_id: uuid.UUID,
    skill_id: uuid.UUID,
    payload: SkillStateUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceSkillResponse:
    """Update the JSON state blob for a workspace skill."""
    await _get_workspace_or_404(workspace_id, current_user, db)

    result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == workspace_id,
            WorkspaceSkill.skill_id == skill_id,
        )
    )
    ws_skill = result.scalar_one_or_none()
    if ws_skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace skill not found")

    ws_skill.state = payload.state
    await db.flush()
    return WorkspaceSkillResponse.model_validate(ws_skill)
