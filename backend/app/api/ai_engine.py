from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep, check_credits
from app.config import settings
from app.models.ai import AiDraft, AiJob, AiJobStatus, DraftApprovalStatus
from app.models.skill import SkillRegistry
from app.models.workspace import Workspace
from app.schemas.ai import AiDraftResponse, AiJobCreate, AiJobResponse, DraftApprovalUpdate, HermesJobCreate
from app.services.credits import deduct_credits
from app.services.gamification import award_xp, check_quest_progress

router = APIRouter(prefix="/ai", tags=["ai-engine"])


def _draft_to_response(draft: AiDraft) -> AiDraftResponse:
    """Build AiDraftResponse from column values only — avoids lazy relationship access."""
    return AiDraftResponse(
        id=draft.id,
        ai_job_id=draft.ai_job_id,
        workspace_id=draft.workspace_id,
        skill_id=draft.skill_id,
        content=draft.content,
        approval_status=draft.approval_status,
        version=draft.version,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.post("/jobs", response_model=AiJobResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_job(
    payload: AiJobCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> AiJobResponse:
    """Create an AI job and dispatch to Celery."""
    # Verify workspace belongs to tenant
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == payload.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Verify skill exists
    skill_result = await db.execute(
        select(SkillRegistry).where(SkillRegistry.id == payload.skill_id)
    )
    skill = skill_result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    # Check and deduct credits
    if skill.credit_cost > 0:
        ok = await deduct_credits(
            current_user.tenant_id,
            current_user.id,
            skill.credit_cost,
            f"ai_job_{skill.slug}",
            str(payload.skill_id),
            db,
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Insufficient credits. Required: {skill.credit_cost}",
            )

    job = AiJob(
        workspace_id=payload.workspace_id,
        skill_id=payload.skill_id,
        user_id=current_user.id,
        model=settings.AI_MODEL,
        status=AiJobStatus.pending,
        context=payload.context or {},
    )
    db.add(job)
    await db.flush()
    await db.commit()  # commit before dispatching so worker can find the job

    # Dispatch to Celery
    from app.workers.tasks import run_ai_job
    run_ai_job.delay(str(job.id))

    return AiJobResponse.model_validate(job)


@router.get("/jobs", response_model=list[AiJobResponse])
async def list_ai_jobs(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> list[AiJobResponse]:
    """List AI jobs for a workspace."""
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(AiJob)
        .where(AiJob.workspace_id == workspace_id)
        .order_by(AiJob.created_at.desc())
    )
    return [AiJobResponse.model_validate(j) for j in result.scalars().all()]


@router.get("/jobs/{job_id}", response_model=AiJobResponse)
async def get_ai_job(
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> AiJobResponse:
    result = await db.execute(select(AiJob).where(AiJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Verify access via workspace → tenant
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == job.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return AiJobResponse.model_validate(job)


@router.get("/stream/{job_id}")
async def stream_job_progress(
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> StreamingResponse:
    """Server-Sent Events stream for AI job progress via Redis pub/sub."""

    async def _event_generator() -> AsyncGenerator[str, None]:
        import time
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL)
        pubsub = r.pubsub()
        # Use the channel format that ai_orchestrator publishes to
        channel = f"job:{job_id}:progress"
        await pubsub.subscribe(channel)

        timeout = 300  # 5 minutes
        start = time.monotonic()

        try:
            while True:
                elapsed = time.monotonic() - start
                if elapsed > timeout:
                    yield f"data: {json.dumps({'type': 'timeout', 'message': 'Stream timed out'})}\n\n"
                    break

                # Non-blocking get with short timeout
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is not None and message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    yield f"data: {data}\n\n"

                    # Stop streaming when job completes or errors
                    try:
                        parsed = json.loads(data)
                        if parsed.get("type") in ("complete", "error", "timeout"):
                            break
                    except Exception:
                        pass
                else:
                    # Yield a heartbeat comment to keep connection alive
                    await asyncio.sleep(0.5)
        finally:
            await pubsub.unsubscribe(channel)
            await r.aclose()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/drafts", response_model=list[AiDraftResponse])
async def list_drafts(
    current_user: CurrentUser,
    db: DBDep,
    workspace_id: uuid.UUID | None = None,
    skill_id: uuid.UUID | None = None,
) -> list[AiDraftResponse]:
    # Get all workspace IDs for this tenant
    ws_query = select(Workspace.id).where(Workspace.tenant_id == current_user.tenant_id)
    if workspace_id is not None:
        ws_query = ws_query.where(Workspace.id == workspace_id)
    ws_result = await db.execute(ws_query)
    allowed_ws_ids = [row[0] for row in ws_result.all()]

    if not allowed_ws_ids:
        return []

    query = (
        select(AiDraft)
        .where(AiDraft.workspace_id.in_(allowed_ws_ids))
        .order_by(AiDraft.created_at.desc())
    )
    if skill_id is not None:
        query = query.where(AiDraft.skill_id == skill_id)

    result = await db.execute(query)
    return [_draft_to_response(d) for d in result.scalars().all()]


@router.get("/drafts/{draft_id}", response_model=AiDraftResponse)
async def get_draft(
    draft_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> AiDraftResponse:
    result = await db.execute(select(AiDraft).where(AiDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == draft.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _draft_to_response(draft)


@router.patch("/drafts/{draft_id}/approval", response_model=AiDraftResponse)
async def update_draft_approval(
    draft_id: uuid.UUID,
    payload: DraftApprovalUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> AiDraftResponse:
    result = await db.execute(select(AiDraft).where(AiDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    draft.approval_status = payload.status

    if payload.status == DraftApprovalStatus.approved:
        await award_xp(current_user.id, "draft_approved", str(draft_id), db)
        await check_quest_progress(current_user.id, "draft_approved", db)

    await db.flush()
    await db.refresh(draft)
    return _draft_to_response(draft)


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_draft(
    draft_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> None:
    result = await db.execute(select(AiDraft).where(AiDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == draft.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(draft)


@router.post("/hermes", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def run_hermes(
    payload: HermesJobCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, Any]:
    """Trigger a multi-skill AI job from a challenge brief."""
    # Verify workspace
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == payload.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    from app.workers.tasks import run_hermes_job
    task = run_hermes_job.delay(
        str(payload.brief_id),
        payload.skill_ids,
        str(payload.workspace_id),
    )

    await award_xp(current_user.id, "cross_skill_run", str(payload.brief_id), db)
    await check_quest_progress(current_user.id, "cross_skill_run", db)

    return {"task_id": task.id, "status": "queued"}
