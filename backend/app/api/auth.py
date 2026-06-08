from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.config import settings
from app.models.billing import CreditLedger, Plan, TenantSubscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.rate_limit import limiter
from app.services.credits import get_balance
from app.utils.security import (
    create_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user: User) -> str:
    return create_access_token({"sub": str(user.id), "email": user.email})


async def _provision_tenant_and_credits(
    user: User,
    db,
    plan_slug: str = "starter",
) -> None:
    """Ensure the user's tenant has a subscription and starter credits."""
    sub_result = await db.execute(
        select(TenantSubscription).where(TenantSubscription.tenant_id == user.tenant_id)
    )
    if sub_result.scalar_one_or_none() is not None:
        return

    plan_result = await db.execute(select(Plan).where(Plan.slug == plan_slug))
    plan = plan_result.scalar_one_or_none()
    if plan is None:
        plan_result = await db.execute(select(Plan).where(Plan.slug == "starter"))
        plan = plan_result.scalar_one_or_none()

    if plan:
        db.add(TenantSubscription(
            tenant_id=user.tenant_id,
            plan_id=plan.id,
            status=SubscriptionStatus.trialing,
        ))
        await db.flush()

    balance = await get_balance(user.tenant_id, db)
    if balance == 0:
        db.add(CreditLedger(
            tenant_id=user.tenant_id,
            user_id=user.id,
            action_type="starter_grant",
            credits_delta=100,
            balance_after=100,
            reference_id=str(user.tenant_id),
            description="100 starter credits on signup",
        ))
        await db.flush()


def _user_response(user: User, tenant: Tenant, token: str) -> dict[str, Any]:
    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "avatar_url": user.avatar_url,
            "xp_points": user.xp_points,
            "level": user.level,
        },
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "domain": tenant.domain,
            "plan": tenant.plan,
        },
    }


async def _get_tenant(user: User, db) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=500, detail="Tenant not found")
    return tenant


# ---------------------------------------------------------------------------
# Email / password signup
# ---------------------------------------------------------------------------

@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def signup(request: Request, payload: SignupRequest, db: DBDep) -> dict[str, Any]:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 8 characters")

    domain = payload.email.split("@")[-1]
    tenant_result = await db.execute(select(Tenant).where(Tenant.domain == domain))
    tenant = tenant_result.scalar_one_or_none()
    if tenant is None:
        tenant = Tenant(name=payload.name, domain=domain, plan="starter", settings={}, brand_kit={})
        db.add(tenant)
        await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=UserRole.owner,
    )
    db.add(user)
    await db.flush()

    await _provision_tenant_and_credits(user, db)

    token = _make_token(user)
    return _user_response(user, tenant, token)


# ---------------------------------------------------------------------------
# Email / password login
# ---------------------------------------------------------------------------

@router.post("/login")
@limiter.limit("20/minute")
async def login(request: Request, payload: LoginRequest, db: DBDep) -> dict[str, Any]:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not await verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    tenant = await _get_tenant(user, db)
    token = _make_token(user)
    return _user_response(user, tenant, token)


# ---------------------------------------------------------------------------
# Google OAuth — step 1: redirect to Google
# ---------------------------------------------------------------------------

@router.get("/google")
async def google_login() -> dict[str, str]:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return {"url": f"{GOOGLE_AUTH_URL}?{query}"}


# ---------------------------------------------------------------------------
# Google OAuth — step 2: exchange code, upsert user, return JWT
# ---------------------------------------------------------------------------

@router.get("/google/callback")
async def google_callback(code: str, db: DBDep) -> dict[str, Any]:
    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })

    if token_resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to exchange Google code")

    access_token = token_resp.json().get("access_token")

    # Fetch Google profile
    async with httpx.AsyncClient() as client:
        profile_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if profile_resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to fetch Google profile")

    profile = profile_resp.json()
    google_id: str = profile["id"]
    email: str = profile.get("email", "")
    name: str = profile.get("name", email.split("@")[0])
    avatar_url: str | None = profile.get("picture")

    # Upsert user by google_id, fall back to email match
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if user is None:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        # New user — provision tenant
        domain = email.split("@")[-1]
        tenant_result = await db.execute(select(Tenant).where(Tenant.domain == domain))
        tenant = tenant_result.scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name=name, domain=domain, plan="starter", settings={}, brand_kit={})
            db.add(tenant)
            await db.flush()

        user = User(
            tenant_id=tenant.id,
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
            role=UserRole.owner,
        )
        db.add(user)
        await db.flush()
        await _provision_tenant_and_credits(user, db)
    else:
        # Update Google fields on existing user
        user.google_id = google_id
        if avatar_url:
            user.avatar_url = avatar_url
        await db.flush()

    tenant = await _get_tenant(user, db)
    token = _make_token(user)

    # Redirect to frontend with token in query param (SPA handles it)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/auth/callback?token={token}",
        status_code=302,
    )


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------

@router.get("/me")
async def get_me(
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, Any]:
    balance = await get_balance(current_user.tenant_id, db)
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "avatar_url": current_user.avatar_url,
        "xp_points": current_user.xp_points,
        "level": current_user.level,
        "tenant": {
            "id": str(current_tenant.id),
            "name": current_tenant.name,
            "domain": current_tenant.domain,
            "plan": current_tenant.plan,
        },
        "credits": {"balance": balance},
    }


@router.post("/logout")
async def logout() -> dict[str, str]:
    # JWT is stateless — client discards the token
    return {"detail": "Logged out"}
