from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.challenge import BriefOutput, BriefStatus, ChallengeBrief
from app.models.workspace import Workspace
from app.services.gamification import award_xp, check_quest_progress

router = APIRouter(prefix="/challenge-briefs", tags=["challenge"])


class ChallengeBriefCreate(BaseModel):
    workspace_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=500)
    content: dict[str, Any] = {}


class ChallengeBriefUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    content: dict[str, Any] | None = None
    status: BriefStatus | None = None


class HermesRunRequest(BaseModel):
    skill_ids: list[str]


class ChallengeBriefResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID | None
    title: str
    content: dict[str, Any]
    status: BriefStatus
    created_at: Any
    updated_at: Any

    model_config = {"from_attributes": True}


async def _verify_workspace(
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


@router.post("", response_model=ChallengeBriefResponse, status_code=status.HTTP_201_CREATED)
async def create_brief(
    payload: ChallengeBriefCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> ChallengeBriefResponse:
    await _verify_workspace(payload.workspace_id, current_user, db)

    brief = ChallengeBrief(
        workspace_id=payload.workspace_id,
        user_id=current_user.id,
        title=payload.title,
        content=payload.content,
        status=BriefStatus.draft,
    )
    db.add(brief)
    await db.flush()
    await db.refresh(brief)
    return ChallengeBriefResponse.model_validate(brief)


@router.get("", response_model=list[ChallengeBriefResponse])
async def list_briefs(
    current_user: CurrentUser,
    db: DBDep,
    workspace_id: uuid.UUID | None = None,
) -> list[ChallengeBriefResponse]:
    ws_query = select(Workspace.id).where(Workspace.tenant_id == current_user.tenant_id)
    if workspace_id is not None:
        ws_query = ws_query.where(Workspace.id == workspace_id)
    ws_result = await db.execute(ws_query)
    allowed_ws_ids = [row[0] for row in ws_result.all()]

    if not allowed_ws_ids:
        return []

    result = await db.execute(
        select(ChallengeBrief)
        .where(ChallengeBrief.workspace_id.in_(allowed_ws_ids))
        .order_by(ChallengeBrief.created_at.desc())
    )
    return [ChallengeBriefResponse.model_validate(b) for b in result.scalars().all()]


@router.get("/{brief_id}", response_model=ChallengeBriefResponse)
async def get_brief(
    brief_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> ChallengeBriefResponse:
    result = await db.execute(select(ChallengeBrief).where(ChallengeBrief.id == brief_id))
    brief = result.scalar_one_or_none()
    if brief is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brief not found")

    await _verify_workspace(brief.workspace_id, current_user, db)
    return ChallengeBriefResponse.model_validate(brief)


@router.patch("/{brief_id}", response_model=ChallengeBriefResponse)
async def update_brief(
    brief_id: uuid.UUID,
    payload: ChallengeBriefUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> ChallengeBriefResponse:
    result = await db.execute(select(ChallengeBrief).where(ChallengeBrief.id == brief_id))
    brief = result.scalar_one_or_none()
    if brief is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brief not found")

    await _verify_workspace(brief.workspace_id, current_user, db)

    if payload.title is not None:
        brief.title = payload.title
    if payload.content is not None:
        brief.content = payload.content
    if payload.status is not None:
        brief.status = payload.status

    await db.flush()
    await db.refresh(brief)
    return ChallengeBriefResponse.model_validate(brief)


@router.post("/{brief_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_brief(
    brief_id: uuid.UUID,
    payload: HermesRunRequest,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, Any]:
    """Trigger a multi-skill AI run for the brief."""
    result = await db.execute(select(ChallengeBrief).where(ChallengeBrief.id == brief_id))
    brief = result.scalar_one_or_none()
    if brief is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brief not found")

    await _verify_workspace(brief.workspace_id, current_user, db)

    brief.status = BriefStatus.processing
    await db.flush()

    from app.workers.tasks import run_hermes_job
    task = run_hermes_job.delay(
        str(brief_id),
        payload.skill_ids,
        str(brief.workspace_id),
    )

    await award_xp(current_user.id, "challenge_brief_completed", str(brief_id), db)
    await check_quest_progress(current_user.id, "challenge_brief_completed", db)

    return {
        "task_id": task.id,
        "brief_id": str(brief_id),
        "status": "processing",
        "skills_queued": payload.skill_ids,
    }


class BriefOutputResponse(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    skill_id: str
    draft_id: uuid.UUID | None
    output_type: str
    created_at: Any

    model_config = {"from_attributes": True}


@router.get("/{brief_id}/outputs", response_model=list[BriefOutputResponse])
async def list_brief_outputs(
    brief_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> list[BriefOutputResponse]:
    """List draft outputs linked to a challenge brief."""
    result = await db.execute(select(ChallengeBrief).where(ChallengeBrief.id == brief_id))
    brief = result.scalar_one_or_none()
    if brief is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brief not found")

    await _verify_workspace(brief.workspace_id, current_user, db)

    outputs_result = await db.execute(
        select(BriefOutput)
        .where(BriefOutput.brief_id == brief_id)
        .order_by(BriefOutput.created_at.asc())
    )
    return [BriefOutputResponse.model_validate(o) for o in outputs_result.scalars().all()]
