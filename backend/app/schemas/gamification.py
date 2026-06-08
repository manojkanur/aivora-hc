from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.models.gamification import BadgeRarity, QuestStatus


class XpEventResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: str
    source_id: str | None
    xp_amount: int
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BadgeResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str
    icon_url: str | None
    rarity: BadgeRarity

    model_config = {"from_attributes": True}


class UserBadgeResponse(BaseModel):
    id: uuid.UUID
    badge: BadgeResponse
    earned_at: datetime

    model_config = {"from_attributes": True}


class QuestResponse(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    description: str
    xp_reward: int
    trigger_event: str
    conditions: dict[str, Any]
    badge_slug: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class UserQuestResponse(BaseModel):
    id: uuid.UUID
    quest: QuestResponse
    progress: dict[str, Any]
    status: QuestStatus
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class StreakResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    skill_id: str | None
    current_streak: int
    longest_streak: int
    last_activity_date: date | None

    model_config = {"from_attributes": True}


class UserStatsResponse(BaseModel):
    user_id: uuid.UUID
    xp_points: int
    level: int
    badges_count: int
    quests_completed: int
    active_quests: int
    current_streak: int


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: uuid.UUID
    name: str | None
    avatar_url: str | None
    xp_points: int
    level: int
    badges_count: int
