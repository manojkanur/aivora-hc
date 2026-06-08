from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.workspace import WorkspaceStatus


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client_name: str | None = Field(default=None, max_length=255)
    description: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    client_name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    status: WorkspaceStatus | None = None


class WorkspaceResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_by: uuid.UUID | None
    name: str
    client_name: str | None
    description: str | None
    status: WorkspaceStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
