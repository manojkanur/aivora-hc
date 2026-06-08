from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.ai import AiAuditLog, AiDraft, AiJob
from app.models.billing import CreditLedger
from app.models.challenge import ChallengeBrief
from app.models.connector import WorkspaceConnector
from app.models.export import BrandKit, Export
from app.models.gamification import Streak, UserBadge, UserQuest, XpEvent
from app.models.publish import PublishQueue
from app.models.workspace import Workspace

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/export")
async def export_my_data(current_user: CurrentUser, db: DBDep) -> dict[str, Any]:
    """
    DPDPA / GDPR: export all personal data for the current user as a JSON blob.
    """
    # Workspaces
    ws_result = await db.execute(
        select(Workspace).where(Workspace.tenant_id == current_user.tenant_id)
    )
    workspaces = [
        {"id": str(w.id), "name": w.name, "client_name": w.client_name, "status": w.status}
        for w in ws_result.scalars().all()
    ]

    # XP events
    xp_result = await db.execute(
        select(XpEvent).where(XpEvent.user_id == current_user.id)
    )
    xp_events = [
        {
            "id": str(e.id),
            "source_type": e.source_type,
            "xp_amount": e.xp_amount,
            "description": e.description,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in xp_result.scalars().all()
    ]

    # Badges
    badge_result = await db.execute(
        select(UserBadge).where(UserBadge.user_id == current_user.id)
    )
    badges = [
        {"id": str(ub.id), "badge_id": str(ub.badge_id), "earned_at": ub.earned_at.isoformat()}
        for ub in badge_result.scalars().all()
    ]

    # Quests
    quest_result = await db.execute(
        select(UserQuest).where(UserQuest.user_id == current_user.id)
    )
    quests = [
        {
            "id": str(uq.id),
            "quest_id": str(uq.quest_id),
            "status": uq.status,
            "progress": uq.progress,
            "started_at": uq.started_at.isoformat() if uq.started_at else None,
            "completed_at": uq.completed_at.isoformat() if uq.completed_at else None,
        }
        for uq in quest_result.scalars().all()
    ]

    # Streaks
    streak_result = await db.execute(
        select(Streak).where(Streak.user_id == current_user.id)
    )
    streaks = [
        {
            "skill_id": s.skill_id,
            "current_streak": s.current_streak,
            "longest_streak": s.longest_streak,
            "last_activity_date": str(s.last_activity_date) if s.last_activity_date else None,
        }
        for s in streak_result.scalars().all()
    ]

    # Credit ledger
    ledger_result = await db.execute(
        select(CreditLedger).where(CreditLedger.user_id == current_user.id)
    )
    ledger = [
        {
            "action_type": e.action_type,
            "credits_delta": e.credits_delta,
            "balance_after": e.balance_after,
            "description": e.description,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in ledger_result.scalars().all()
    ]

    return {
        "user": {
            "id": str(current_user.id),
            "google_id": current_user.google_id,
            "email": current_user.email,
            "name": current_user.name,
            "role": current_user.role,
            "xp_points": current_user.xp_points,
            "level": current_user.level,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "workspaces": workspaces,
        "xp_events": xp_events,
        "badges": badges,
        "quests": quests,
        "streaks": streaks,
        "credit_ledger": ledger,
    }


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_my_account(current_user: CurrentUser, db: DBDep) -> None:
    """
    DPDPA / GDPR: cascade-delete all user data.
    The User record deletion cascades to XpEvent, UserBadge, UserQuest, Streak via FK constraints.
    """
    # Anonymise audit logs (don't delete – required for compliance)
    audit_result = await db.execute(
        select(AiAuditLog).where(AiAuditLog.user_id == current_user.id)
    )
    for log in audit_result.scalars().all():
        log.user_id = None

    # Delete the user – cascades configured on FK relationships
    await db.delete(current_user)
