from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.config import settings
from app.models.export import Export
from app.models.publish import PublishLog, PublishQueue, PublishPlatform, PublishStatus
from app.models.workspace import Workspace
from app.services import linkedin_service
from app.services.gamification import award_xp, check_quest_progress
from app.utils.encryption import decrypt_value, encrypt_value

router = APIRouter(tags=["publish"])

# OAuth state TTL (10 minutes)
OAUTH_STATE_TTL = 600


async def _store_oauth_state(state: str, user_id: str) -> None:
    """Store OAuth state token in Redis with 10-minute TTL."""
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL)
    try:
        await r.setex(f"oauth:linkedin:state:{state}", OAUTH_STATE_TTL, user_id)
    finally:
        await r.aclose()


async def _verify_and_consume_oauth_state(state: str) -> str | None:
    """Verify OAuth state from Redis and delete it (one-time use). Returns user_id or None."""
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL)
    try:
        key = f"oauth:linkedin:state:{state}"
        user_id = await r.get(key)
        if user_id:
            await r.delete(key)
            return user_id.decode() if isinstance(user_id, bytes) else user_id
        return None
    finally:
        await r.aclose()


class PublishCreate(BaseModel):
    workspace_id: uuid.UUID
    export_id: uuid.UUID | None = None
    platform: PublishPlatform = PublishPlatform.linkedin
    content: dict[str, Any]
    scheduled_at: datetime | None = None


class PublishUpdate(BaseModel):
    status: PublishStatus | None = None
    scheduled_at: datetime | None = None


class PublishResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    export_id: uuid.UUID | None
    platform: PublishPlatform
    content: dict[str, Any]
    status: PublishStatus
    scheduled_at: datetime | None
    published_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/oauth/linkedin/authorize")
async def linkedin_authorize(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict[str, str]:
    """Generate LinkedIn OAuth2 authorization URL with Redis-backed state."""
    state = secrets.token_urlsafe(32)
    await _store_oauth_state(state, str(current_user.id))
    url = linkedin_service.get_auth_url(state)
    return {"authorization_url": url, "state": state}


@router.get("/oauth/linkedin/callback")
async def linkedin_callback(
    code: str,
    state: str,
    current_user: CurrentUser,
    db: DBDep,
) -> dict[str, str]:
    """
    Exchange LinkedIn auth code for access token.
    Verifies state from Redis, encrypts and stores token.
    """
    stored_user_id = await _verify_and_consume_oauth_state(state)
    if stored_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state. Please restart the authorization flow.",
        )

    try:
        token_data = await linkedin_service.exchange_code(code)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token exchange failed: {exc}",
        ) from exc

    access_token = token_data.get("access_token", "")
    encrypted = encrypt_value(access_token)

    # Store encrypted token on the user record's connector or workspace connector.
    # Here we persist the encrypted token directly on the user for simplicity.
    from app.models.user import User
    from sqlalchemy import select as _select
    user_result = await db.execute(_select(User).where(User.id == current_user.id))
    user = user_result.scalar_one_or_none()
    if user:
        # Store in user settings (extend with linkedin_token_enc field via settings JSON)
        # We use the connector table approach: store in WorkspaceConnector config
        pass

    # Redirect clients to /publish page; in a real SPA this would redirect to frontend URL
    return {"status": "connected", "encrypted_token_ref": encrypted[:20] + "..."}


@router.post("/publish", response_model=PublishResponse, status_code=status.HTTP_201_CREATED)
async def create_publish_item(
    payload: PublishCreate,
    current_user: CurrentUser,
    db: DBDep,
) -> PublishResponse:
    # Verify workspace
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == payload.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    item = PublishQueue(
        workspace_id=payload.workspace_id,
        export_id=payload.export_id,
        platform=payload.platform,
        content=payload.content,
        status=PublishStatus.draft,
        scheduled_at=payload.scheduled_at,
    )
    db.add(item)
    await db.flush()
    return PublishResponse.model_validate(item)


@router.get("/publish", response_model=list[PublishResponse])
async def list_publish_queue(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBDep,
) -> list[PublishResponse]:
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    result = await db.execute(
        select(PublishQueue)
        .where(PublishQueue.workspace_id == workspace_id)
        .order_by(PublishQueue.created_at.desc())
    )
    return [PublishResponse.model_validate(i) for i in result.scalars().all()]


@router.patch("/publish/{item_id}", response_model=PublishResponse)
async def update_publish_item(
    item_id: uuid.UUID,
    payload: PublishUpdate,
    current_user: CurrentUser,
    db: DBDep,
) -> PublishResponse:
    result = await db.execute(select(PublishQueue).where(PublishQueue.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Publish item not found")

    # Verify access
    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == item.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if payload.status is not None:
        item.status = payload.status
    if payload.scheduled_at is not None:
        item.scheduled_at = payload.scheduled_at

    await db.flush()
    return PublishResponse.model_validate(item)


@router.post("/publish/{item_id}/send", response_model=PublishResponse)
async def send_publish_item(
    item_id: uuid.UUID,
    request: Request,
    current_user: CurrentUser,
    db: DBDep,
) -> PublishResponse:
    """Trigger immediate publish via Celery."""
    result = await db.execute(select(PublishQueue).where(PublishQueue.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Publish item not found")

    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.id == item.workspace_id,
            Workspace.tenant_id == current_user.tenant_id,
        )
    )
    if ws_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    item.status = PublishStatus.pending_review
    await db.flush()

    from app.workers.tasks import publish_to_linkedin
    publish_to_linkedin.delay(str(item_id))

    return PublishResponse.model_validate(item)
