from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBDep
from app.models.gamification import (
    Badge,
    Quest,
    Streak,
    UserBadge,
    UserQuest,
    XpEvent,
)
from app.models.user import User
from app.schemas.gamification import (
    BadgeResponse,
    LeaderboardEntry,
    QuestResponse,
    StreakResponse,
    UserBadgeResponse,
    UserQuestResponse,
    UserStatsResponse,
)

router = APIRouter(tags=["gamification"])


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(current_user: CurrentUser, db: DBDep) -> UserStatsResponse:
    badges_result = await db.execute(
        select(func.count()).where(UserBadge.user_id == current_user.id)
    )
    badges_count = badges_result.scalar_one() or 0

    quests_result = await db.execute(
        select(func.count()).where(
            UserQuest.user_id == current_user.id,
            UserQuest.status == "completed",
        )
    )
    quests_completed = quests_result.scalar_one() or 0

    active_quests_result = await db.execute(
        select(func.count()).where(
            UserQuest.user_id == current_user.id,
            UserQuest.status == "active",
        )
    )
    active_quests = active_quests_result.scalar_one() or 0

    # Overall streak (no skill filter)
    streak_result = await db.execute(
        select(Streak).where(
            Streak.user_id == current_user.id,
            Streak.skill_id == None,  # noqa: E711
        )
    )
    streak = streak_result.scalar_one_or_none()
    current_streak = streak.current_streak if streak else 0

    return UserStatsResponse(
        user_id=current_user.id,
        xp_points=current_user.xp_points,
        level=current_user.level,
        badges_count=badges_count,
        quests_completed=quests_completed,
        active_quests=active_quests,
        current_streak=current_streak,
    )


@router.get("/me/quests", response_model=list[UserQuestResponse])
async def get_my_quests(current_user: CurrentUser, db: DBDep) -> list[UserQuestResponse]:
    result = await db.execute(
        select(UserQuest)
        .where(UserQuest.user_id == current_user.id)
        .order_by(UserQuest.started_at.desc())
    )
    user_quests = list(result.scalars().all())

    responses = []
    for uq in user_quests:
        quest_result = await db.execute(select(Quest).where(Quest.id == uq.quest_id))
        quest = quest_result.scalar_one_or_none()
        if quest:
            uq_resp = UserQuestResponse(
                id=uq.id,
                quest=QuestResponse.model_validate(quest),
                progress=uq.progress,
                status=uq.status,
                started_at=uq.started_at,
                completed_at=uq.completed_at,
            )
            responses.append(uq_resp)
    return responses


@router.get("/me/badges", response_model=list[UserBadgeResponse])
async def get_my_badges(current_user: CurrentUser, db: DBDep) -> list[UserBadgeResponse]:
    result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == current_user.id)
        .order_by(UserBadge.earned_at.desc())
    )
    user_badges = list(result.scalars().all())

    responses = []
    for ub in user_badges:
        badge_result = await db.execute(select(Badge).where(Badge.id == ub.badge_id))
        badge = badge_result.scalar_one_or_none()
        if badge:
            responses.append(
                UserBadgeResponse(
                    id=ub.id,
                    badge=BadgeResponse.model_validate(badge),
                    earned_at=ub.earned_at,
                )
            )
    return responses


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    current_user: CurrentUser,
    db: DBDep,
    period: str = "weekly",
) -> list[LeaderboardEntry]:
    """
    Return XP-ranked leaderboard for the current tenant.
    period: 'weekly' | 'monthly'
    """
    now = datetime.now(timezone.utc)
    if period == "weekly":
        since = now - timedelta(days=7)
    else:
        since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Aggregate XP earned in period per user (for users in same tenant)
    xp_result = await db.execute(
        select(
            XpEvent.user_id,
            func.sum(XpEvent.xp_amount).label("period_xp"),
        )
        .join(User, User.id == XpEvent.user_id)
        .where(
            User.tenant_id == current_user.tenant_id,
            XpEvent.created_at >= since,
        )
        .group_by(XpEvent.user_id)
        .order_by(func.sum(XpEvent.xp_amount).desc())
        .limit(50)
    )
    rows = xp_result.all()

    entries: list[LeaderboardEntry] = []
    for rank, (user_id, period_xp) in enumerate(rows, start=1):
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            continue

        badges_count_result = await db.execute(
            select(func.count()).where(UserBadge.user_id == user_id)
        )
        badges_count = badges_count_result.scalar_one() or 0

        entries.append(
            LeaderboardEntry(
                rank=rank,
                user_id=user_id,
                name=user.name,
                avatar_url=user.avatar_url,
                xp_points=user.xp_points,
                level=user.level,
                badges_count=badges_count,
            )
        )
    return entries


@router.get("/me/streaks", response_model=list[StreakResponse])
async def get_my_streaks(current_user: CurrentUser, db: DBDep) -> list[StreakResponse]:
    result = await db.execute(
        select(Streak).where(Streak.user_id == current_user.id)
    )
    return [StreakResponse.model_validate(s) for s in result.scalars().all()]
