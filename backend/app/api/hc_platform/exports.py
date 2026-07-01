"""HC platform exports: create, list, get, download, run."""

from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.exports import HcExport
from app.services.audit import log_event
from app.services.hc_platform import export_runner

router = APIRouter()


_MIME_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "html": "text/html",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class ExportCreate(BaseModel):
    format: str
    source_type: str
    source_id: uuid.UUID
    project_id: uuid.UUID | None = None


class ExportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID | None = None
    generated_document_id: uuid.UUID | None = None
    export_type: str | None = None
    format: str
    status: str
    storage_path: str | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.post("", response_model=ExportRead, status_code=status.HTTP_201_CREATED)
async def create_export(
    payload: ExportCreate,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ExportRead:
    try:
        export = await export_runner.enqueue_export(
            db,
            tenant_id=current_tenant.id,
            format=payload.format,
            source_type=payload.source_type,
            source_id=payload.source_id,
            project_id=payload.project_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(export)

    # Run inline so the UI's poll-then-download flow completes within a few seconds.
    # If rendering fails we mark the row "failed" but still return 201 so the client
    # can show a user-facing error from the polled status.
    try:
        export = await export_runner.run_export(db, export.id)
        await db.flush()
        await db.refresh(export)
    except Exception:  # noqa: BLE001 — error captured on the export row itself.
        pass
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.exports.create",
        {"export_id": str(export.id), "format": payload.format, "source_type": payload.source_type},
    )
    return ExportRead.model_validate(export)


@router.get("", response_model=list[ExportRead])
async def list_exports(
    current_tenant: CurrentTenant,
    db: DBDep,
    status_filter: str | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[ExportRead]:
    stmt = select(HcExport).where(HcExport.tenant_id == current_tenant.id)
    if status_filter:
        stmt = stmt.where(HcExport.status == status_filter)
    stmt = stmt.order_by(HcExport.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [ExportRead.model_validate(r) for r in rows]


async def _get_export_or_404(export_id: uuid.UUID, tenant_id: uuid.UUID, db) -> HcExport:
    stmt = select(HcExport).where(
        HcExport.id == export_id, HcExport.tenant_id == tenant_id
    )
    e = (await db.execute(stmt)).scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")
    return e


@router.get("/{export_id}", response_model=ExportRead)
async def get_export(
    export_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ExportRead:
    e = await _get_export_or_404(export_id, current_tenant.id, db)
    return ExportRead.model_validate(e)


@router.get("/{export_id}/download")
async def download_export(
    export_id: uuid.UUID,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> FileResponse:
    e = await _get_export_or_404(export_id, current_tenant.id, db)
    if e.status != "completed" or not e.storage_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Export not ready")
    path = Path(e.storage_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export file missing on disk")
    mime = _MIME_TYPES.get(e.format, "application/octet-stream")
    filename = f"export-{e.id}.{e.format}"
    return FileResponse(
        path=str(path),
        media_type=mime,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{export_id}/run", response_model=ExportRead)
async def run_export_now(
    export_id: uuid.UUID,
    admin_user: AdminUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> ExportRead:
    await _get_export_or_404(export_id, current_tenant.id, db)
    try:
        e = await export_runner.run_export(db, export_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(e)
    await _audit(
        current_tenant.id,
        admin_user.id,
        "hc_platform.exports.run",
        {"export_id": str(export_id), "status": e.status},
    )
    return ExportRead.model_validate(e)
