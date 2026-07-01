from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import Any

from app.workers.celery_app import celery_app


def _run_async(coro) -> Any:
    """Run a coroutine from a synchronous Celery task."""
    return asyncio.get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="app.workers.tasks.run_ai_job",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def run_ai_job(self, job_id: str) -> dict[str, Any]:
    """
    Execute a CoPaw AI job.
    Loads job details from DB, calls copaw_run, updates final status.
    """
    async def _inner() -> dict[str, Any]:
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models.ai import AiJob, AiJobStatus
        from app.services.ai_orchestrator import copaw_run

        async with async_session_factory() as db:
            result = await db.execute(select(AiJob).where(AiJob.id == uuid.UUID(job_id)))
            job = result.scalar_one_or_none()
            if job is None:
                return {"error": "Job not found"}

            job.status = AiJobStatus.running
            await db.commit()

            try:
                output = await copaw_run(
                    job_id=job_id,
                    workspace_id=str(job.workspace_id),
                    skill_id=str(job.skill_id),
                    user_context=job.context or {},
                    db=db,
                )
                # Audit: agent brain phase completed, output available.
                from app.models.ai import AiAuditLog
                from app.models.workspace import Workspace as _Workspace
                ws_row = await db.execute(select(_Workspace).where(_Workspace.id == job.workspace_id))
                ws = ws_row.scalar_one_or_none()
                audit = AiAuditLog(
                    tenant_id=ws.tenant_id if ws else None,
                    user_id=job.user_id,
                    skill_id=str(job.skill_id),
                    action="ai_job.completed",
                    payload={
                        "phase": "completed",
                        "ai_job_id": job_id,
                        "output_summary": (str(output)[:500] if output is not None else ""),
                    },
                )
                db.add(audit)
                await db.commit()
                return {"status": "completed", "job_id": job_id}
            except Exception as exc:
                await db.rollback()
                async with async_session_factory() as db2:
                    result2 = await db2.execute(
                        select(AiJob).where(AiJob.id == uuid.UUID(job_id))
                    )
                    job2 = result2.scalar_one_or_none()
                    if job2:
                        job2.status = AiJobStatus.failed
                        job2.error = str(exc)
                        await db2.commit()
                raise self.retry(exc=exc)

    return _run_async(_inner())


@celery_app.task(
    name="app.workers.tasks.run_hermes_job",
    bind=True,
    max_retries=2,
    default_retry_delay=15,
)
def run_hermes_job(self, brief_id: str, skill_ids: list[str], workspace_id: str) -> dict[str, Any]:
    """Run a multi-skill AI orchestration job."""
    async def _inner() -> dict[str, Any]:
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models.challenge import BriefStatus, ChallengeBrief
        from app.services.ai_orchestrator import hermes_run

        async with async_session_factory() as db:
            try:
                result = await hermes_run(
                    brief_id=brief_id,
                    skill_ids=skill_ids,
                    workspace_id=workspace_id,
                    db=db,
                )

                # Update brief status
                brief_result = await db.execute(
                    select(ChallengeBrief).where(ChallengeBrief.id == uuid.UUID(brief_id))
                )
                brief = brief_result.scalar_one_or_none()
                if brief:
                    brief.status = BriefStatus.completed

                await db.commit()
                return result
            except Exception as exc:
                await db.rollback()
                raise self.retry(exc=exc)

    return _run_async(_inner())


@celery_app.task(
    name="app.workers.tasks.generate_export",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def generate_export(self, export_id: str) -> dict[str, Any]:
    """Generate a PPTX/PDF/DOCX export and upload to S3."""
    async def _inner() -> dict[str, Any]:
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models.export import BrandKit, Export, ExportFormat, ExportStatus
        from app.models.ai import AiDraft
        from app.services.export_service import (
            generate_docx,
            generate_pdf,
            generate_pptx,
            upload_to_s3,
        )

        async with async_session_factory() as db:
            result = await db.execute(select(Export).where(Export.id == uuid.UUID(export_id)))
            export = result.scalar_one_or_none()
            if export is None:
                return {"error": "Export not found"}

            export.status = ExportStatus.processing
            await db.commit()

            try:
                # Load draft content
                draft_result = await db.execute(
                    select(AiDraft).where(AiDraft.id == export.draft_id)
                )
                draft = draft_result.scalar_one_or_none()
                draft_content = draft.content if draft else {}

                # Load brand kit
                brand_kit_data: dict[str, Any] = {}
                if export.brand_kit_id:
                    bk_result = await db.execute(
                        select(BrandKit).where(BrandKit.id == export.brand_kit_id)
                    )
                    bk = bk_result.scalar_one_or_none()
                    if bk:
                        brand_kit_data = {
                            "primary_color": bk.primary_color,
                            "secondary_color": bk.secondary_color,
                            "font": bk.font,
                            "logo_url": bk.logo_url,
                        }

                # Generate the file
                fmt = export.format
                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

                if fmt == ExportFormat.pptx:
                    content_bytes = generate_pptx(draft_content, brand_kit_data)
                    filename = f"export_{export_id[:8]}_{timestamp}.pptx"
                elif fmt == ExportFormat.pdf:
                    content_bytes = generate_pdf(draft_content, brand_kit_data)
                    filename = f"export_{export_id[:8]}_{timestamp}.pdf"
                else:
                    content_bytes = generate_docx(draft_content, brand_kit_data)
                    filename = f"export_{export_id[:8]}_{timestamp}.docx"

                # Load workspace for tenant_id
                from app.models.workspace import Workspace
                ws_result = await db.execute(
                    select(Workspace).where(Workspace.id == export.workspace_id)
                )
                ws = ws_result.scalar_one_or_none()
                tenant_id = str(ws.tenant_id) if ws else "unknown"

                s3_url = upload_to_s3(content_bytes, filename, tenant_id)

                export.s3_url = s3_url
                export.status = ExportStatus.completed
                await db.commit()

                return {"status": "completed", "export_id": export_id, "s3_url": s3_url}

            except Exception as exc:
                await db.rollback()
                async with async_session_factory() as db2:
                    result2 = await db2.execute(
                        select(Export).where(Export.id == uuid.UUID(export_id))
                    )
                    exp2 = result2.scalar_one_or_none()
                    if exp2:
                        exp2.status = ExportStatus.failed
                        await db2.commit()
                raise self.retry(exc=exc)

    return _run_async(_inner())


@celery_app.task(
    name="app.workers.tasks.publish_to_linkedin",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def publish_to_linkedin(self, queue_id: str) -> dict[str, Any]:
    """Publish a queued item to LinkedIn."""
    async def _inner() -> dict[str, Any]:
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models.publish import PublishLog, PublishQueue, PublishStatus
        from app.services import linkedin_service
        from app.utils.encryption import decrypt_value

        async with async_session_factory() as db:
            result = await db.execute(
                select(PublishQueue).where(PublishQueue.id == uuid.UUID(queue_id))
            )
            item = result.scalar_one_or_none()
            if item is None:
                return {"error": "Queue item not found"}

            try:
                content = item.content
                text = content.get("text", "")
                media_url = content.get("media_url")
                access_token_enc = content.get("access_token_enc", "")

                if not access_token_enc:
                    raise ValueError("No access token in publish content")

                access_token = decrypt_value(access_token_enc)
                response = await linkedin_service.post_share(
                    access_token=access_token,
                    text=text,
                    media_url=media_url,
                )

                item.status = PublishStatus.published
                item.published_at = datetime.now(timezone.utc)

                log = PublishLog(queue_id=item.id, response_data=response)
                db.add(log)
                await db.commit()

                return {"status": "published", "queue_id": queue_id}

            except Exception as exc:
                await db.rollback()
                async with async_session_factory() as db2:
                    result2 = await db2.execute(
                        select(PublishQueue).where(PublishQueue.id == uuid.UUID(queue_id))
                    )
                    item2 = result2.scalar_one_or_none()
                    if item2:
                        item2.status = PublishStatus.failed
                        log2 = PublishLog(
                            queue_id=item2.id,
                            response_data={"error": str(exc)},
                        )
                        db2.add(log2)
                        await db2.commit()
                raise self.retry(exc=exc)

    return _run_async(_inner())


@celery_app.task(name="app.workers.tasks.update_leaderboard")
def update_leaderboard() -> dict[str, Any]:
    """Weekly cron: rebuild Redis leaderboard rankings cache."""
    async def _inner() -> dict[str, Any]:
        import redis.asyncio as aioredis
        import json
        from sqlalchemy import select, func

        from app.config import settings
        from app.database import async_session_factory
        from app.models.user import User

        async with async_session_factory() as db:
            result = await db.execute(
                select(User).order_by(User.xp_points.desc()).limit(100)
            )
            users = result.scalars().all()

            leaderboard = [
                {
                    "rank": i + 1,
                    "user_id": str(u.id),
                    "tenant_id": str(u.tenant_id),
                    "name": u.name,
                    "xp_points": u.xp_points,
                    "level": u.level,
                }
                for i, u in enumerate(users)
            ]

            r = aioredis.from_url(settings.REDIS_URL)
            await r.set("leaderboard:global", json.dumps(leaderboard), ex=604800)
            await r.aclose()

        return {"status": "ok", "entries": len(leaderboard)}

    return _run_async(_inner())


@celery_app.task(name="app.workers.tasks.run_daily_streak_check")
def run_daily_streak_check() -> dict[str, Any]:
    """Daily cron: check and update streaks, reset broken ones."""
    async def _inner() -> dict[str, Any]:
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models.gamification import Streak

        today = date.today()
        reset_count = 0

        async with async_session_factory() as db:
            result = await db.execute(select(Streak))
            streaks = result.scalars().all()

            for streak in streaks:
                if streak.last_activity_date is None:
                    continue
                delta = (today - streak.last_activity_date).days
                if delta > 1:
                    # Streak broken
                    streak.current_streak = 0
                    reset_count += 1

            await db.commit()

        return {"status": "ok", "streaks_reset": reset_count}

    return _run_async(_inner())
