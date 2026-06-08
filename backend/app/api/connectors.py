from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.connector import (
    ConnectorRegistry,
    SyncStatus,
    WorkspaceConnector,
)
from app.models.workspace import Workspace
from app.services.gamification import award_xp, check_quest_progress
from app.utils.encryption import decrypt_value, encrypt_value

router = APIRouter(tags=["connectors"])


class ConnectorRegistryResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    auth_type: str
    credit_cost_monthly: int
    status: str

    model_config = {"from_attributes": True}


class WorkspaceConnectorCreate(BaseModel):
    connector_id: uuid.UUID
    credentials: dict[str, Any] = {}
    config: dict[str, Any] = {}


class WorkspaceConnectorResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    connector_id: uuid.UUID
    config: dict[str, Any]
    sync_status: SyncStatus
    last_synced_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/connectors", response_model=list[ConnectorRegistryResponse])
async def list_connector_registry(db: DBDep, current_user: CurrentUser) -> list[ConnectorRegistryResponse]:
    result = await db.execute(
        select(ConnectorRegistry).where(ConnectorRegistry.status == "active")
    )
    return [ConnectorRegistryResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/workspaces/{workspace_id}/connectors", response_model=list[WorkspaceConnectorResponse])
async def list_workspace_connectors(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> list[WorkspaceConnectorResponse]:
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(WorkspaceConnector).where(WorkspaceConnector.workspace_id == workspace_id)
    )
    return [WorkspaceConnectorResponse.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/workspaces/{workspace_id}/connectors",
    response_model=WorkspaceConnectorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def connect_connector(
    workspace_id: uuid.UUID,
    payload: WorkspaceConnectorCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceConnectorResponse:
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    conn_result = await db.execute(
        select(ConnectorRegistry).where(ConnectorRegistry.id == payload.connector_id)
    )
    connector = conn_result.scalar_one_or_none()
    if connector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")

    # Encrypt credentials
    credentials_enc: str | None = None
    if payload.credentials:
        import json
        credentials_enc = encrypt_value(json.dumps(payload.credentials))

    ws_connector = WorkspaceConnector(
        workspace_id=workspace_id,
        connector_id=payload.connector_id,
        credentials_enc=credentials_enc,
        config=payload.config,
        sync_status=SyncStatus.idle,
    )
    db.add(ws_connector)
    await db.flush()

    # Award XP
    await award_xp(current_user.id, "connector_connected", str(ws_connector.id), db)
    await check_quest_progress(current_user.id, "connector_connected", db)

    return WorkspaceConnectorResponse.model_validate(ws_connector)


@router.delete(
    "/workspaces/{workspace_id}/connectors/{connector_instance_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def disconnect_connector(
    workspace_id: uuid.UUID,
    connector_instance_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> None:
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(WorkspaceConnector).where(
            WorkspaceConnector.id == connector_instance_id,
            WorkspaceConnector.workspace_id == workspace_id,
        )
    )
    wc = result.scalar_one_or_none()
    if wc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")

    await db.delete(wc)


@router.post(
    "/workspaces/{workspace_id}/connectors/{connector_instance_id}/sync",
    response_model=WorkspaceConnectorResponse,
)
async def sync_connector(
    workspace_id: uuid.UUID,
    connector_instance_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> WorkspaceConnectorResponse:
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(WorkspaceConnector).where(
            WorkspaceConnector.id == connector_instance_id,
            WorkspaceConnector.workspace_id == workspace_id,
        )
    )
    wc = result.scalar_one_or_none()
    if wc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")

    wc.sync_status = SyncStatus.syncing
    await db.flush()

    # Dispatch sync task (non-blocking)
    # In a full implementation this would call the connector-specific sync logic
    wc.sync_status = SyncStatus.synced
    wc.last_synced_at = datetime.now(timezone.utc)
    await db.flush()

    return WorkspaceConnectorResponse.model_validate(wc)


@router.post("/connectors/upload")
async def upload_connector_file(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
    file: UploadFile = File(...),
) -> dict:
    """
    Upload CSV or Excel file for connector data.
    Parses the file and returns column names + row count preview.
    """
    # Verify workspace access
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    filename = file.filename or ""
    content = await file.read()

    columns: list[str] = []
    rows: list[dict] = []
    row_count = 0

    if filename.endswith(".csv"):
        import csv
        import io
        reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="replace")))
        columns = list(reader.fieldnames or [])
        for i, row in enumerate(reader):
            row_count += 1
            if i < 5:  # preview first 5 rows
                rows.append(dict(row))

    elif filename.endswith((".xlsx", ".xls")):
        import io
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header = next(rows_iter, None)
            columns = [str(c) for c in (header or []) if c is not None]
            for i, row in enumerate(rows_iter):
                row_count += 1
                if i < 5:
                    rows.append(dict(zip(columns, [str(v) if v is not None else "" for v in row])))
            wb.close()
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="openpyxl is required to process Excel files",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV and Excel (.xlsx, .xls) files are supported",
        )

    return {
        "filename": filename,
        "columns": columns,
        "row_count": row_count,
        "preview": rows,
    }
