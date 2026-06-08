from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.ai import AiJobStatus, DraftApprovalStatus


class AiJobCreate(BaseModel):
    workspace_id: uuid.UUID
    skill_id: uuid.UUID
    context: dict[str, Any] = {}


class AiJobResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    skill_id: uuid.UUID
    user_id: uuid.UUID | None
    model: str
    status: AiJobStatus
    credits_used: int
    error: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class AiDraftResponse(BaseModel):
    id: uuid.UUID
    ai_job_id: uuid.UUID
    workspace_id: uuid.UUID
    skill_id: uuid.UUID
    content: dict[str, Any]
    approval_status: DraftApprovalStatus
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DraftApprovalUpdate(BaseModel):
    status: DraftApprovalStatus


class HermesJobCreate(BaseModel):
    brief_id: uuid.UUID
    skill_ids: list[str]
    workspace_id: uuid.UUID
