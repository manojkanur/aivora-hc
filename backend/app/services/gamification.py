from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import Badge, BadgeRarity, Quest, Streak, UserBadge, UserQuest, XpEvent
from app.models.user import User

# ---------------------------------------------------------------------------
# XP amounts per event
# ---------------------------------------------------------------------------
XP_EVENT_MAP: dict[str, int] = {
    "skill_activated": 10,
    "ai_draft_generated": 25,
    "draft_approved": 30,
    "export_downloaded": 20,
    "linkedin_published": 50,
    "connector_connected": 15,
    "challenge_brief_completed": 40,
    "cross_skill_run": 35,
    "streak_7_days": 100,
    "first_client_workspace": 75,
}

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SEED_QUESTS: list[dict[str, Any]] = [
    {
        "slug": "first_framework",
        "title": "First Framework",
        "description": "Generate your first HC Framework draft using CoPaw.",
        "xp_reward": 100,
        "trigger_event": "ai_draft_generated",
        "conditions": {"skill_slug": "hc-framework", "count": 1},
        "badge_slug": "bronze-hc-shield",
        "is_active": True,
    },
    {
        "slug": "triple_play",
        "title": "Triple Play",
        "description": "Generate AI drafts using 3 different skills.",
        "xp_reward": 150,
        "trigger_event": "ai_draft_generated",
        "conditions": {"unique_skills": 3},
        "badge_slug": None,
        "is_active": True,
    },
    {
        "slug": "board_ready",
        "title": "Board Ready",
        "description": "Export a draft and publish it to LinkedIn from the same draft.",
        "xp_reward": 200,
        "trigger_event": "linkedin_published",
        "conditions": {"require_export": True},
        "badge_slug": "linkedin-ready-epic",
        "is_active": True,
    },
    {
        "slug": "full_stack_hc",
        "title": "Full Stack HC",
        "description": "Activate 10 or more different HC skills.",
        "xp_reward": 500,
        "trigger_event": "skill_activated",
        "conditions": {"unique_skills": 10},
        "badge_slug": "hc-architect-legendary",
        "is_active": True,
    },
    {
        "slug": "copaw_champion",
        "title": "CoPaw Champion",
        "description": "Complete 5 multi-skill AI runs.",
        "xp_reward": 300,
        "trigger_event": "cross_skill_run",
        "conditions": {"count": 5},
        "badge_slug": "ai-strategist",
        "is_active": True,
    },
    {
        "slug": "streak_7",
        "title": "7-Day Streak",
        "description": "Maintain a 7-day activity streak.",
        "xp_reward": 100,
        "trigger_event": "streak_7_days",
        "conditions": {"streak_days": 7},
        "badge_slug": "consistent",
        "is_active": True,
    },
]

SEED_BADGES: list[dict[str, Any]] = [
    {
        "slug": "bronze-hc-shield",
        "name": "Bronze HC Shield",
        "description": "Awarded for generating your first HC Framework.",
        "icon_url": "/static/badges/bronze-hc-shield.svg",
        "rarity": BadgeRarity.common,
    },
    {
        "slug": "linkedin-ready-epic",
        "name": "LinkedIn Ready",
        "description": "Exported and published HC content to LinkedIn.",
        "icon_url": "/static/badges/linkedin-ready.svg",
        "rarity": BadgeRarity.epic,
    },
    {
        "slug": "hc-architect-legendary",
        "name": "HC Architect",
        "description": "Unlocked 10+ HC skills – true architect status.",
        "icon_url": "/static/badges/hc-architect.svg",
        "rarity": BadgeRarity.legendary,
    },
    {
        "slug": "ai-strategist",
        "name": "AI Strategist",
        "description": "Completed 5 multi-skill AI runs.",
        "icon_url": "/static/badges/ai-strategist.svg",
        "rarity": BadgeRarity.epic,
    },
    {
        "slug": "consistent",
        "name": "Consistent",
        "description": "Maintained a 7-day activity streak.",
        "icon_url": "/static/badges/consistent.svg",
        "rarity": BadgeRarity.rare,
    },
]

# Level thresholds (cumulative XP needed to reach each level)
LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500]


def _xp_to_level(xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
    return min(level, len(LEVEL_THRESHOLDS))


# ---------------------------------------------------------------------------
# Core gamification functions
# ---------------------------------------------------------------------------

async def award_xp(
    user_id: uuid.UUID,
    event_name: str,
    source_id: str | None,
    db: AsyncSession,
) -> int:
    """Award XP for an event. Returns xp awarded (0 if unknown event)."""
    xp = XP_EVENT_MAP.get(event_name, 0)
    if xp == 0:
        return 0

    event = XpEvent(
        user_id=user_id,
        source_type=event_name,
        source_id=source_id,
        xp_amount=xp,
        description=f"XP for: {event_name}",
    )
    db.add(event)

    # Update user totals
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.xp_points += xp
        new_level = _xp_to_level(user.xp_points)
        if new_level != user.level:
            user.level = new_level

    await db.flush()
    return xp


async def check_level_up(user: User, db: AsyncSession) -> bool:
    """Recalculate user level and return True if it changed."""
    new_level = _xp_to_level(user.xp_points)
    if new_level != user.level:
        user.level = new_level
        await db.flush()
        return True
    return False


async def update_streak(user_id: uuid.UUID, skill_id: str | None, db: AsyncSession) -> Streak:
    """
    Update (or create) the streak record for this user+skill.
    A streak increments if last_activity_date was yesterday; resets if > 1 day gap.
    """
    today = date.today()

    result = await db.execute(
        select(Streak).where(Streak.user_id == user_id, Streak.skill_id == skill_id)
    )
    streak = result.scalar_one_or_none()

    if streak is None:
        streak = Streak(
            user_id=user_id,
            skill_id=skill_id,
            current_streak=1,
            longest_streak=1,
            last_activity_date=today,
        )
        db.add(streak)
        await db.flush()
        return streak

    if streak.last_activity_date == today:
        # Already counted today
        return streak

    delta = (today - streak.last_activity_date).days if streak.last_activity_date else 999
    if delta == 1:
        streak.current_streak += 1
    else:
        streak.current_streak = 1

    streak.last_activity_date = today
    streak.longest_streak = max(streak.longest_streak, streak.current_streak)

    # Check if 7-day milestone reached
    if streak.current_streak == 7:
        await award_xp(user_id, "streak_7_days", str(streak.id), db)
        await check_quest_progress(user_id, "streak_7_days", db)

    await db.flush()
    return streak


async def _grant_badge(user_id: uuid.UUID, badge_slug: str, db: AsyncSession) -> None:
    """Grant a badge to a user if not already owned."""
    badge_result = await db.execute(select(Badge).where(Badge.slug == badge_slug))
    badge = badge_result.scalar_one_or_none()
    if badge is None:
        return

    existing = await db.execute(
        select(UserBadge).where(
            UserBadge.user_id == user_id,
            UserBadge.badge_id == badge.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return  # already has it

    user_badge = UserBadge(
        user_id=user_id,
        badge_id=badge.id,
        earned_at=datetime.now(timezone.utc),
    )
    db.add(user_badge)
    await db.flush()


async def check_quest_progress(
    user_id: uuid.UUID,
    event_name: str,
    db: AsyncSession,
) -> None:
    """
    Evaluate active quests for this user that are triggered by event_name.
    Update progress and mark completed if conditions met.
    """
    # Get all matching quests
    q_result = await db.execute(
        select(Quest).where(Quest.trigger_event == event_name, Quest.is_active == True)  # noqa: E712
    )
    quests = list(q_result.scalars().all())

    for quest in quests:
        # Find or create user_quest
        uq_result = await db.execute(
            select(UserQuest).where(
                UserQuest.user_id == user_id,
                UserQuest.quest_id == quest.id,
            )
        )
        user_quest = uq_result.scalar_one_or_none()

        if user_quest is None:
            user_quest = UserQuest(
                user_id=user_id,
                quest_id=quest.id,
                progress={},
                status="active",
                started_at=datetime.now(timezone.utc),
            )
            db.add(user_quest)
            await db.flush()

        if user_quest.status == "completed":
            continue

        # Update progress counter (generic: increment a 'count' key)
        progress = dict(user_quest.progress)
        progress["count"] = progress.get("count", 0) + 1
        user_quest.progress = progress

        # Check completion condition
        conditions = quest.conditions
        completed = False

        required_count = conditions.get("count")
        if required_count and progress["count"] >= required_count:
            completed = True

        # For unique_skills condition – this would be tracked externally via
        # a different event; here we check count as a fallback
        unique_req = conditions.get("unique_skills")
        if unique_req and progress.get("unique_count", progress["count"]) >= unique_req:
            completed = True

        if completed:
            user_quest.status = "completed"
            user_quest.completed_at = datetime.now(timezone.utc)
            # Award XP
            await award_xp(user_id, event_name, str(quest.id), db)
            # Grant badge if applicable
            if quest.badge_slug:
                await _grant_badge(user_id, quest.badge_slug, db)

        await db.flush()
