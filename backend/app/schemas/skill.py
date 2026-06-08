from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.skill import SkillStatus, SkillTier


class SkillResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    icon: str | None
    tier: SkillTier
    credit_cost: int
    status: SkillStatus
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceSkillResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    skill_id: uuid.UUID
    state: dict[str, Any]
    last_ai_run_at: datetime | None
    created_at: datetime
    skill: SkillResponse | None = None

    model_config = {"from_attributes": True}


class SkillStateUpdate(BaseModel):
    state: dict[str, Any]


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tier: SkillTier | None = None
    credit_cost: int | None = None
    status: SkillStatus | None = None
    sort_order: int | None = None
