from __future__ import annotations

import uuid
from typing import Any

from app.database import async_session_factory
from app.models.ai import AiAuditLog


async def log_event(
    tenant_id: uuid.UUID | str | None,
    user_id: uuid.UUID | str | None,
    action: str,
    skill_id: str | None = None,
    payload: dict[str, Any] | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    Write an audit log entry in a fresh, independent DB session so that
    audit writes never block or roll back with the caller's transaction.
    """
    # Normalise UUIDs
    _tenant_id: uuid.UUID | None = None
    _user_id: uuid.UUID | None = None

    if tenant_id is not None:
        _tenant_id = uuid.UUID(str(tenant_id)) if not isinstance(tenant_id, uuid.UUID) else tenant_id
    if user_id is not None:
        _user_id = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id

    async with async_session_factory() as session:
        entry = AiAuditLog(
            tenant_id=_tenant_id,
            user_id=_user_id,
            skill_id=skill_id,
            action=action,
            payload=payload or {},
            ip_address=ip,
            user_agent=user_agent,
        )
        session.add(entry)
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            # Audit failures must never crash the caller
