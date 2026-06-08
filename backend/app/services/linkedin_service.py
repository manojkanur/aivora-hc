from __future__ import annotations

import urllib.parse
from typing import Any

import httpx

from app.config import settings

LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_API_BASE = "https://api.linkedin.com/v2"

SCOPES = ["openid", "profile", "email", "w_member_social"]


def get_auth_url(state: str) -> str:
    """Build the LinkedIn OAuth2 authorization URL."""
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "state": state,
        "scope": " ".join(SCOPES),
    }
    return f"{LINKEDIN_AUTH_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> dict[str, Any]:
    """Exchange an authorisation code for an access token."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            LINKEDIN_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        return response.json()


async def get_profile(access_token: str) -> dict[str, Any]:
    """Fetch the authenticated member's profile using the OpenID userinfo endpoint."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            "https://api.linkedin.com/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()


async def post_share(
    access_token: str,
    text: str,
    media_url: str | None = None,
) -> dict[str, Any]:
    """
    Publish a UGC post to LinkedIn on behalf of the authenticated member.
    Uses the LinkedIn UGC Posts API v2.
    """
    # First get the member URN
    profile = await get_profile(access_token)
    sub = profile.get("sub", "")
    author_urn = f"urn:li:person:{sub}"

    share_content: dict[str, Any] = {
        "shareCommentary": {"text": text},
        "shareMediaCategory": "NONE",
    }

    if media_url:
        share_content["shareMediaCategory"] = "ARTICLE"
        share_content["media"] = [
            {
                "status": "READY",
                "originalUrl": media_url,
            }
        ]

    body = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": share_content
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{LINKEDIN_API_BASE}/ugcPosts",
            json=body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            },
        )
        response.raise_for_status()
        return response.json()
