from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.ai import AiDraft
from app.models.export import BrandKit, Export, ExportFormat, ExportStatus
from app.models.skill import SkillRegistry
from app.models.workspace import Workspace
from app.services.gamification import award_xp, check_quest_progress

router = APIRouter(prefix="/exports", tags=["exports"])


class ExportCreate(BaseModel):
    draft_id: uuid.UUID
    format: ExportFormat
    brand_kit_id: uuid.UUID | None = None
    workspace_id: uuid.UUID | None = None  # optional — derived from draft if omitted


class ExportResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    workspace_name: str
    draft_id: uuid.UUID
    skill_name: str
    brand_kit_id: uuid.UUID | None
    brand_kit_name: str | None
    format: ExportFormat
    s3_url: str | None
    status: ExportStatus
    created_at: datetime

    model_config = {"from_attributes": True}


def _export_to_response(
    export: Export,
    workspace_name: str = "",
    skill_name: str = "",
    brand_kit_name: str | None = None,
) -> ExportResponse:
    return ExportResponse(
        id=export.id,
        workspace_id=export.workspace_id,
        workspace_name=workspace_name,
        draft_id=export.draft_id,
        skill_name=skill_name,
        brand_kit_id=export.brand_kit_id,
        brand_kit_name=brand_kit_name,
        format=export.format,
        s3_url=export.s3_url,
        status=export.status,
        created_at=export.created_at,
    )


@router.post("", status_code=status.HTTP_200_OK)
async def create_export(
    payload: ExportCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> Response:
    """Generate a file export and return it directly as a download."""
    from app.services.export_service import generate_docx, generate_pdf, generate_pptx

    # Load draft (and derive workspace_id from it)
    draft_result = await db.execute(select(AiDraft).where(AiDraft.id == payload.draft_id))
    draft = draft_result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    workspace_id = payload.workspace_id or draft.workspace_id

    # Verify workspace belongs to tenant
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Load brand kit if provided
    brand_kit_data: dict[str, Any] = {}
    if payload.brand_kit_id:
        bk_result = await db.execute(
            select(BrandKit).where(
                BrandKit.id == payload.brand_kit_id,
                BrandKit.tenant_id == current_user.tenant_id,
            )
        )
        bk = bk_result.scalar_one_or_none()
        if bk:
            brand_kit_data = {
                "primary_color": bk.primary_color,
                "secondary_color": bk.secondary_color,
                "font": bk.font,
                "logo_url": bk.logo_url,
            }

    # Generate file
    fmt = payload.format
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    draft_content = draft.content or {}

    if fmt == ExportFormat.pptx:
        content_bytes = generate_pptx(draft_content, brand_kit_data)
        filename = f"export_{str(payload.draft_id)[:8]}_{timestamp}.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif fmt == ExportFormat.pdf:
        content_bytes = generate_pdf(draft_content, brand_kit_data)
        filename = f"export_{str(payload.draft_id)[:8]}_{timestamp}.pdf"
        media_type = "application/pdf"
    else:
        content_bytes = generate_docx(draft_content, brand_kit_data)
        filename = f"export_{str(payload.draft_id)[:8]}_{timestamp}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    # Record export in DB
    export = Export(
        workspace_id=workspace_id,
        draft_id=payload.draft_id,
        brand_kit_id=payload.brand_kit_id,
        format=fmt,
        status=ExportStatus.completed,
        s3_url=None,
    )
    db.add(export)
    await db.flush()
    await db.commit()

    await award_xp(current_user.id, "export_created", str(export.id), db)
    await check_quest_progress(current_user.id, "export_created", db)

    return Response(
        content=content_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{export_id}", response_model=ExportResponse)
async def get_export(
    export_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> ExportResponse:
    result = await db.execute(select(Export).where(Export.id == export_id))
    export = result.scalar_one_or_none()
    if export is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == export.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _export_to_response(export)


@router.get("", response_model=list[ExportResponse])
async def list_exports(
    current_user: CurrentUser,
    db: DBDep,
    workspace_id: uuid.UUID | None = None,
) -> list[ExportResponse]:
    from sqlalchemy.orm import aliased

    ws_query = select(Workspace.id).where(Workspace.tenant_id == current_user.tenant_id)
    if workspace_id is not None:
        ws_query = ws_query.where(Workspace.id == workspace_id)
    ws_result = await db.execute(ws_query)
    allowed_ws_ids = [row[0] for row in ws_result.all()]

    if not allowed_ws_ids:
        return []

    BrandKitAlias = aliased(BrandKit)

    result = await db.execute(
        select(Export, Workspace.name, AiDraft.skill_id, BrandKitAlias.name)
        .join(Workspace, Workspace.id == Export.workspace_id)
        .join(AiDraft, AiDraft.id == Export.draft_id)
        .outerjoin(BrandKitAlias, BrandKitAlias.id == Export.brand_kit_id)
        .where(Export.workspace_id.in_(allowed_ws_ids))
        .order_by(Export.created_at.desc())
    )
    rows = result.all()

    # Collect skill IDs to look up names
    skill_ids = list({row[2] for row in rows if row[2]})
    skill_map: dict[uuid.UUID, str] = {}
    if skill_ids:
        sk_result = await db.execute(
            select(SkillRegistry.id, SkillRegistry.name).where(SkillRegistry.id.in_(skill_ids))
        )
        skill_map = {r[0]: r[1] for r in sk_result.all()}

    return [
        _export_to_response(
            export=row[0],
            workspace_name=row[1] or "",
            skill_name=skill_map.get(row[2], "Unknown Skill") if row[2] else "Unknown Skill",
            brand_kit_name=row[3],
        )
        for row in rows
    ]
