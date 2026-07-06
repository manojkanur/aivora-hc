from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncGenerator

from datetime import datetime, timezone
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import CurrentUser, DBDep, check_credits
from app.config import settings
from app.models.ai import AiAuditLog, AiDraft, AiJob, AiJobStatus, DraftApprovalStatus
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

    # Audit log: record the four-phase trace so the admin dashboard can show
    # "user input -> skill -> memory -> agent brain -> output".
    # `payload` JSON holds the inputs available at dispatch time. The worker
    # appends the output phase when the job completes.
    memory_snapshot = {
        "onboarding_state": current_user.onboarding_state or {},
    }
    audit = AiAuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        skill_id=skill.slug,
        action="ai_job.dispatched",
        payload={
            "phase": "dispatch",
            "ai_job_id": str(job.id),
            "workspace_id": str(payload.workspace_id),
            "skill": {"id": str(skill.id), "slug": skill.slug, "name": skill.name},
            "user_input": payload.context or {},
            "memory_snapshot": memory_snapshot,
            "agent": {"model": settings.AI_MODEL, "provider": "configured"},
        },
    )
    db.add(audit)
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


class DraftCreateRequest(BaseModel):
    workspace_id: uuid.UUID
    content: dict[str, Any]
    skill_name: str | None = None  # matched fuzzily against skill_registry


@router.post("/drafts", response_model=AiDraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    payload: DraftCreateRequest,
    current_user: CurrentUser,
    db: DBDep,
) -> AiDraftResponse:
    """Create a draft directly (e.g. an AI Advisory report saved for export)."""
    ws = (
        await db.execute(
            select(Workspace).where(
                Workspace.id == payload.workspace_id,
                Workspace.tenant_id == current_user.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    skill = None
    if payload.skill_name:
        skill = (
            await db.execute(
                select(SkillRegistry).where(SkillRegistry.name.ilike(f"%{payload.skill_name}%")).limit(1)
            )
        ).scalar_one_or_none()
    if skill is None:
        skill = (await db.execute(select(SkillRegistry).limit(1))).scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No studios registered")

    job = AiJob(
        workspace_id=ws.id,
        skill_id=skill.id,
        user_id=current_user.id,
        model="gpt-4o-mini",
        context={"source": "ai_advisory_report"},
        status=AiJobStatus.completed,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.flush()
    draft = AiDraft(
        ai_job_id=job.id,
        workspace_id=ws.id,
        skill_id=skill.id,
        content=payload.content,
        approval_status=DraftApprovalStatus.pending,
        version=1,
    )
    db.add(draft)
    await db.flush()
    await db.refresh(draft)
    return _draft_to_response(draft)


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


@router.patch("/drafts/{draft_id}/content", response_model=AiDraftResponse)
async def update_draft_content(
    draft_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
    payload: dict[str, Any] = Body(...),
) -> AiDraftResponse:
    """
    Inline-edit the draft body. Accepts {"content": {...}} to replace the entire
    content blob, or {"patch": {...}} to merge keys into existing content.
    """
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

    if "content" in payload and isinstance(payload["content"], dict):
        draft.content = payload["content"]
    elif "patch" in payload and isinstance(payload["patch"], dict):
        merged = dict(draft.content or {})
        merged.update(payload["patch"])
        draft.content = merged
    else:
        raise HTTPException(status_code=400, detail="Provide 'content' or 'patch' object")

    flag_modified(draft, "content")
    draft.version = (draft.version or 0) + 1
    await db.flush()
    await db.refresh(draft)
    return _draft_to_response(draft)



@router.post("/drafts/{draft_id}/chat")
async def chat_with_draft(
    draft_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """
    Conversational + edit interface on top of a draft.

    Input: {"prompt": str, "history": [{"role": "user"|"assistant", "text": str}, ...]}.
    The model returns a JSON object {"reply": str, "patch": null | {...}}.
    - reply: short, conversational message shown back to the user.
    - patch: if non-null, a partial content dict to merge into draft.content.

    Writes an audit log row regardless of whether a patch was applied.
    """
    from app.services.ai_orchestrator import _get_client  # type: ignore

    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    history = payload.get("history")
    if not isinstance(history, list):
        history = []

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

    current_content = draft.content or {}

    # Surface the EDITABLE keys only — exclude metadata + Canvas slide blobs so
    # the model never accidentally patches an irrelevant key.
    EDITABLE_BLOCKLIST = {
        "skill_slug", "generated_at", "tool_name", "tool_input", "raw_text",
        "canvas_slides", "canvas_brand", "canvas_title", "canvas_format", "title",
    }
    editable_keys = [k for k in current_content.keys() if k not in EDITABLE_BLOCKLIST]
    editable_summary = ", ".join(editable_keys) if editable_keys else "(none yet)"

    system = (
        "You are a senior HC consultant helping a user discuss and refine a draft advisory report. "
        "You can answer questions about the draft, suggest improvements, or rewrite specific "
        "sections when the user asks for an edit.\n\n"
        "You MUST return a single JSON object with exactly two keys:\n"
        "  reply  (string): a short conversational reply for the user, 1-4 sentences. "
        "Describe what you changed if you applied a patch.\n"
        "  patch  (object or null): the edit to apply.\n\n"
        "Rules for `patch`:\n"
        f"  1. The patch keys MUST be from this allowed list (case-sensitive): {editable_summary}\n"
        "  2. Do NOT use canvas_slides, tool_input, raw_text, skill_slug, generated_at, "
        "title, canvas_*. These are not part of the report body.\n"
        "  3. Pick the key whose meaning matches the user's request. If the user asks for a "
        "recommendation, patch 'recommendations'. If they ask to shorten the summary, patch "
        "'executive_summary'. If they ask to add findings, patch 'key_findings'.\n"
        "  4. Return the FULL new value for the chosen key. For strings, return the new full string. "
        "For arrays/objects, return the full new array/object preserving prior items unless the "
        "user asked to remove them.\n"
        "  5. If the user is only asking a question (no edit intent), set `patch` to null.\n"
        "Never include markdown fences. Never wrap the JSON in any prose."
    )

    chat_messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    chat_messages.append({
        "role": "system",
        "content": (
            "Current draft content (do not exceed these top-level keys when patching):\n"
            + json.dumps(current_content, ensure_ascii=False)[:6000]
        ),
    })
    for m in history[-6:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        text = str(m.get("text") or "")
        if role in ("user", "assistant") and text:
            chat_messages.append({"role": role, "content": text[:1500]})
    chat_messages.append({"role": "user", "content": prompt[:2000]})

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            response_format={"type": "json_object"},
            messages=chat_messages,  # type: ignore[arg-type]
            temperature=0.5,
            max_tokens=1500,
        )
        raw_text = response.choices[0].message.content or "{}"
        result_obj = json.loads(raw_text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Chat failed: {exc}") from exc

    reply = str(result_obj.get("reply") or "").strip() or "Done."
    patch = result_obj.get("patch")
    applied = False
    applied_keys: list[str] = []
    if isinstance(patch, dict) and patch:
        # Strictly merge: keys must already exist AND not be in the blocklist.
        # This prevents the model from clobbering metadata or canvas state via chat.
        merged = dict(current_content)
        for k, v in patch.items():
            if k in EDITABLE_BLOCKLIST:
                continue
            if k in merged:
                merged[k] = v
                applied_keys.append(k)
        if applied_keys and merged != current_content:
            draft.content = merged
            flag_modified(draft, "content")
            draft.version = (draft.version or 0) + 1
            applied = True
            await db.flush()
            await db.refresh(draft)

    audit = AiAuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        skill_id=str(draft.skill_id),
        action="ai_draft.chat",
        payload={
            "phase": "completed",
            "draft_id": str(draft_id),
            "prompt": prompt[:500],
            "patch_applied": applied,
            "patch_keys": applied_keys,
            "raw_patch_keys": list(patch.keys()) if isinstance(patch, dict) else [],
            "agent": {"model": settings.AI_MODEL},
        },
    )
    db.add(audit)
    await db.commit()

    return {
        "reply": reply,
        "patch_applied": applied,
        "applied_keys": applied_keys,
        "content": draft.content if applied else None,
        "version": draft.version,
    }


@router.post("/canvas/edit")
async def canvas_ai_edit(
    current_user: CurrentUser,
    db: DBDep,
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    """
    Apply a prompt-driven edit to a Canvas slide set.

    Expects {"prompt": str, "slides": [{"id": str, "elements": [{"id": str, "type": str, "content": str}]}]}.
    Returns {"slides": [...]} with the same structure but edited content per the prompt.
    Uses the configured LLM (whatever AI engine the backend is wired to).
    """
    prompt = str(payload.get("prompt", "")).strip()
    slides = payload.get("slides")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not isinstance(slides, list):
        raise HTTPException(status_code=400, detail="slides must be a list")

    # Build a system prompt that constrains the model to return the same
    # structure with edited content only.
    from app.services.ai_orchestrator import _get_client  # type: ignore

    system = (
        "You are a senior HC consultant editing a presentation. The user will give you a JSON object "
        "with a 'slides' array. Each slide has 'id' and 'elements'. Each element has 'id', 'type' "
        "('title' | 'heading' | 'label' | 'bullet' | 'body'), and 'content'. "
        "Apply the user's instruction to the slides. Return a JSON object with the SAME shape "
        "(same slide ids, same element ids, same types) but with edited 'content' strings. "
        "Do not invent new ids. Do not drop any element. Do not return markdown fences or any prose. "
        "Return ONLY the JSON object."
    )
    user_message = json.dumps({"instruction": prompt, "slides": slides}, ensure_ascii=False)

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
            max_tokens=4000,
        )
        raw_text = response.choices[0].message.content or "{}"
        result = json.loads(raw_text)
        if not isinstance(result, dict) or "slides" not in result:
            raise ValueError("Model returned unexpected shape")

        # Audit trail for this edit so it shows up in admin logs alongside other AI activity.
        audit = AiAuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            skill_id="canvas",
            action="ai_canvas.edit",
            payload={
                "phase": "completed",
                "prompt": prompt[:500],
                "input_slide_count": len(slides),
                "output_slide_count": len(result.get("slides", [])) if isinstance(result.get("slides"), list) else 0,
                "agent": {"model": settings.AI_MODEL},
            },
        )
        db.add(audit)
        await db.commit()
        return result
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Canvas edit failed: {exc}") from exc


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
