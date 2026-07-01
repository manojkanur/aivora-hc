"""LinkedIn OAuth + post-with-image.

Two routers are exported:

* ``auth_router`` — OAuth connect / callback / status / disconnect endpoints,
  mounted at ``/auth/linkedin`` from ``app.main`` so the public URL is
  ``/api/v1/auth/linkedin/...``.
* ``router`` — the ``/share`` endpoint, registered in
  ``app.api.hc_platform.__init__`` under prefix ``/linkedin`` so the public URL
  is ``/api/v1/hc-platform/linkedin/share``.
"""

from __future__ import annotations

import base64
import binascii
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import AdminUser, CurrentUser, DBDep
from app.models.hc_platform.linkedin import LinkedInConnection

# ---------------------------------------------------------------------------
# Config (env vars)
# ---------------------------------------------------------------------------
LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
LINKEDIN_REGISTER_UPLOAD_URL = "https://api.linkedin.com/v2/assets?action=registerUpload"
LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts"

DEFAULT_REDIRECT_URI = "https://srv1272089.hstgr.cloud/api/v1/auth/linkedin/callback"
DEFAULT_SCOPE = "openid profile email w_member_social"


def _client_id() -> str | None:
    return os.environ.get("LINKEDIN_CLIENT_ID") or None


def _client_secret() -> str | None:
    return os.environ.get("LINKEDIN_CLIENT_SECRET") or None


def _redirect_uri() -> str:
    return os.environ.get("LINKEDIN_REDIRECT_URI") or DEFAULT_REDIRECT_URI


def _require_configured() -> tuple[str, str, str]:
    cid = _client_id()
    secret = _client_secret()
    if not cid or not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LinkedIn not configured - admin must set LINKEDIN_CLIENT_ID/SECRET",
        )
    return cid, secret, _redirect_uri()


# ---------------------------------------------------------------------------
# In-memory OAuth state store: {state: (user_id, tenant_id, ts)}
# Cleared after 10 minutes. Process-local; fine for a single backend instance.
# ---------------------------------------------------------------------------
_STATE_TTL_SECONDS = 600
_state_lock = threading.Lock()
_state_store: dict[str, tuple[uuid.UUID, uuid.UUID, float]] = {}


def _state_put(user_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
    tok = uuid.uuid4().hex
    now = time.time()
    with _state_lock:
        # opportunistic cleanup
        for k in [k for k, v in _state_store.items() if now - v[2] > _STATE_TTL_SECONDS]:
            _state_store.pop(k, None)
        _state_store[tok] = (user_id, tenant_id, now)
    return tok


def _state_pop(state: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    now = time.time()
    with _state_lock:
        entry = _state_store.pop(state, None)
    if entry is None:
        return None
    user_id, tenant_id, ts = entry
    if now - ts > _STATE_TTL_SECONDS:
        return None
    return user_id, tenant_id


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ConnectUrlOut(BaseModel):
    url: str


class StatusOut(BaseModel):
    connected: bool
    linkedin_user_id: str | None = None
    expires_at: datetime | None = None


class DisconnectOut(BaseModel):
    connected: bool = False


class ShareIn(BaseModel):
    caption: str = Field(..., min_length=1)
    image_base64: str = Field(..., min_length=1)
    visibility: Literal["PUBLIC", "CONNECTIONS"] = "PUBLIC"


class CarouselShareIn(BaseModel):
    caption: str = Field(..., min_length=1)
    images_base64: list[str] = Field(..., min_length=1, max_length=20)
    visibility: Literal["PUBLIC", "CONNECTIONS"] = "PUBLIC"
    title: str = "Aivora HC carousel"


class PdfShareIn(BaseModel):
    caption: str = Field(..., min_length=1)
    pdf_base64: str = Field(..., min_length=1)
    visibility: Literal["PUBLIC", "CONNECTIONS"] = "PUBLIC"
    title: str = "Aivora HC document"


class PromptShareIn(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    visibility: Literal["PUBLIC", "CONNECTIONS"] = "PUBLIC"


class GenerateIn(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    format: Literal["single", "carousel", "text"] = "single"


class GenerateOut(BaseModel):
    caption: str
    format: Literal["single", "carousel", "text"]
    images_base64: list[str] = Field(default_factory=list)


class PublishIn(BaseModel):
    caption: str = Field(..., min_length=1)
    images_base64: list[str] = Field(default_factory=list, max_length=20)
    visibility: Literal["PUBLIC", "CONNECTIONS"] = "PUBLIC"
    title: str = "Aivora HC Insight"


class ShareOut(BaseModel):
    post_id: str
    share_url: str
    caption: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_connection(
    db, tenant_id: uuid.UUID, user_id: uuid.UUID
) -> LinkedInConnection | None:
    stmt = select(LinkedInConnection).where(
        LinkedInConnection.tenant_id == tenant_id,
        LinkedInConnection.user_id == user_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _decode_image(image_base64: str) -> bytes:
    raw = image_base64.strip()
    if raw.startswith("data:"):
        # e.g. "data:image/png;base64,XXXX"
        try:
            _, raw = raw.split(",", 1)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed data URL",
            ) from exc
    try:
        return base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 image: {exc}",
        ) from exc


def _bad_gateway(resp: httpx.Response, step: str) -> HTTPException:
    try:
        body = resp.json()
    except ValueError:
        body = resp.text
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"step": step, "status": resp.status_code, "linkedin": body},
    )


# ---------------------------------------------------------------------------
# Auth router: /auth/linkedin/*
# ---------------------------------------------------------------------------
auth_router = APIRouter(prefix="/auth/linkedin", tags=["linkedin-oauth"])


@auth_router.get("/connect", response_model=ConnectUrlOut)
async def linkedin_connect(current_user: CurrentUser) -> ConnectUrlOut:
    cid, _secret, redirect = _require_configured()
    state = _state_put(current_user.id, current_user.tenant_id)
    params = {
        "response_type": "code",
        "client_id": cid,
        "redirect_uri": redirect,
        "state": state,
        "scope": DEFAULT_SCOPE,
    }
    url = str(httpx.URL(LINKEDIN_AUTH_URL).copy_merge_params(params))
    return ConnectUrlOut(url=url)


@auth_router.get("/callback")
async def linkedin_callback(
    db: DBDep,
    code: str = Query(...),
    state: str = Query(...),
) -> HTMLResponse:
    cid, secret, redirect = _require_configured()

    resolved = _state_pop(state)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state",
        )
    user_id, tenant_id = resolved

    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            LINKEDIN_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect,
                "client_id": cid,
                "client_secret": secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code >= 300:
            raise _bad_gateway(token_resp, "token_exchange")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        expires_in = int(token_data.get("expires_in") or 0)
        scope = token_data.get("scope")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"step": "token_exchange", "linkedin": token_data},
            )

        userinfo_resp = await client.get(
            LINKEDIN_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code >= 300:
            raise _bad_gateway(userinfo_resp, "userinfo")
        userinfo = userinfo_resp.json()
        sub = userinfo.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"step": "userinfo", "linkedin": userinfo},
            )

    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        if expires_in
        else None
    )

    existing = await _get_connection(db, tenant_id, user_id)
    if existing is None:
        conn = LinkedInConnection(
            tenant_id=tenant_id,
            user_id=user_id,
            linkedin_user_id=str(sub),
            access_token=access_token,
            expires_at=expires_at,
            scope=scope,
        )
        db.add(conn)
    else:
        existing.linkedin_user_id = str(sub)
        existing.access_token = access_token
        existing.expires_at = expires_at
        existing.scope = scope

    await db.flush()
    await db.commit()

    return HTMLResponse(
        """<!doctype html><html><body>
<script>
  try { window.opener && window.opener.postMessage({source:'aivora-linkedin',status:'connected'}, '*'); } catch(e) {}
  if (window.opener) { window.close(); } else { window.location = '/settings?linkedin=connected'; }
</script>
LinkedIn connected. You can close this window.
</body></html>"""
    )


@auth_router.get("/status", response_model=StatusOut)
async def linkedin_status(current_user: CurrentUser, db: DBDep) -> StatusOut:
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        return StatusOut(connected=False)
    return StatusOut(
        connected=True,
        linkedin_user_id=conn.linkedin_user_id,
        expires_at=conn.expires_at,
    )


@auth_router.post("/disconnect", response_model=DisconnectOut)
async def linkedin_disconnect(current_user: CurrentUser, db: DBDep) -> DisconnectOut:
    await db.execute(
        delete(LinkedInConnection).where(
            LinkedInConnection.tenant_id == current_user.tenant_id,
            LinkedInConnection.user_id == current_user.id,
        )
    )
    await db.commit()
    return DisconnectOut(connected=False)


# ---------------------------------------------------------------------------
# HC-platform router: /hc-platform/linkedin/share
# ---------------------------------------------------------------------------
router = APIRouter()


async def _upload_image(client: httpx.AsyncClient, token: str, person_urn: str, image_bytes: bytes) -> str:
    """Register an upload with LinkedIn, PUT the bytes, return the asset URN."""
    register_resp = await client.post(
        LINKEDIN_REGISTER_UPLOAD_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        json={
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": person_urn,
                "serviceRelationships": [
                    {
                        "relationshipType": "OWNER",
                        "identifier": "urn:li:userGeneratedContent",
                    }
                ],
            }
        },
    )
    if register_resp.status_code >= 300:
        raise _bad_gateway(register_resp, "register_upload")

    reg = register_resp.json().get("value") or {}
    asset_urn = reg.get("asset")
    mech = (reg.get("uploadMechanism") or {}).get(
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    )
    upload_url = (mech or {}).get("uploadUrl")
    if not asset_urn or not upload_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"step": "register_upload", "linkedin": register_resp.json()},
        )

    upload_resp = await client.put(
        upload_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
        },
        content=image_bytes,
    )
    if upload_resp.status_code >= 300:
        raise _bad_gateway(upload_resp, "upload_bytes")

    return asset_urn


async def _create_ugc_post(
    client: httpx.AsyncClient,
    token: str,
    person_urn: str,
    caption: str,
    assets: list[str],
    visibility: str,
    title: str,
) -> str:
    """Create a UGC post with 1+ image assets. Returns the post id."""
    media = [
        {
            "status": "READY",
            "description": {"text": ""},
            "media": asset,
            "title": {"text": title},
        }
        for asset in assets
    ]
    ugc_body = {
        "author": person_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": caption},
                "shareMediaCategory": "IMAGE",
                "media": media,
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": visibility},
    }
    ugc_resp = await client.post(
        LINKEDIN_UGC_POSTS_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
        json=ugc_body,
    )
    if ugc_resp.status_code >= 300:
        raise _bad_gateway(ugc_resp, "ugc_post")

    ugc_data = ugc_resp.json() if ugc_resp.content else {}
    post_id = ugc_data.get("id") or ugc_resp.headers.get("x-restli-id") or ""
    if not post_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"step": "ugc_post", "linkedin": ugc_data},
        )
    return post_id


def _pdf_to_images(pdf_bytes: bytes, max_pages: int = 20) -> list[bytes]:
    """Rasterize each PDF page to a PNG. Requires PyMuPDF (fitz)."""
    try:
        import fitz  # type: ignore
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF carousel requires PyMuPDF - install `pymupdf` on the server",
        ) from exc

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images: list[bytes] = []
    page_count = min(doc.page_count, max_pages)
    for i in range(page_count):
        page = doc.load_page(i)
        pix = page.get_pixmap(dpi=150)
        images.append(pix.tobytes("png"))
    doc.close()
    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF contained no pages",
        )
    return images


@router.post("/share", response_model=ShareOut)
async def linkedin_share(
    payload: ShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Post a single image to LinkedIn (admin only)."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    image_bytes = _decode_image(payload.image_base64)
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image payload",
        )

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=30) as client:
        asset_urn = await _upload_image(client, token, person_urn, image_bytes)
        post_id = await _create_ugc_post(
            client, token, person_urn, payload.caption, [asset_urn], payload.visibility, "Aivora HC Deliverable"
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
    )


# ---------------------------------------------------------------------------
# Prompt-driven share: LLM drafts the caption, we render a branded Aivora card
# as the attached image. No file upload from the admin.
# ---------------------------------------------------------------------------

_BRAND_BG = (12, 14, 20)          # #0c0e14
_BRAND_CARD = (19, 23, 32)        # #131720
_BRAND_ACCENT = (59, 130, 246)    # #3b82f6
_BRAND_ACCENT_2 = (37, 99, 235)   # #2563eb
_BRAND_TEXT = (241, 245, 249)     # slate-100
_BRAND_MUTED = (148, 163, 184)    # slate-400


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    candidates_regular = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates_bold = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in (candidates_bold if bold else candidates_regular):
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _render_brand_card(headline: str, subhead: str) -> bytes:
    """Render a 1200x1200 square branded Aivora card and return PNG bytes."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    # Card panel
    pad = 60
    draw.rounded_rectangle(
        (pad, pad, W - pad, H - pad),
        radius=48,
        fill=_BRAND_CARD,
    )

    # Accent bar top-left
    draw.rounded_rectangle(
        (pad + 60, pad + 60, pad + 80, pad + 200),
        radius=8,
        fill=_BRAND_ACCENT,
    )

    # Brand mark: "A" tile with subtle glow
    mark_x0, mark_y0 = W - pad - 200, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 200
    draw.rounded_rectangle(
        (mark_x0, mark_y0, mark_x1, mark_y1),
        radius=24,
        fill=_BRAND_ACCENT_2,
    )
    mark_font = _load_font(96, bold=True)
    letter = "A"
    bbox = draw.textbbox((0, 0), letter, font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        letter,
        font=mark_font,
        fill=_BRAND_TEXT,
    )

    # Kicker
    kicker = "AIVORA HC · ADVISORY POST"
    kicker_font = _load_font(28, bold=True)
    draw.text((pad + 100, pad + 240), kicker, font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(72, bold=True)
    max_width = W - 2 * pad - 200
    headline_lines = _wrap_text(draw, headline, headline_font, max_width)[:5]
    y = pad + 300
    for line in headline_lines:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 92

    # Subhead
    subhead_font = _load_font(36)
    y += 20
    for line in _wrap_text(draw, subhead, subhead_font, max_width)[:3]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 52

    # Footer bar
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(28, bold=True)
    draw.text((pad + 100, footer_y + 24), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(24)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 28), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _draft_post(prompt: str) -> tuple[str, str, str]:
    """Call the LLM to draft caption + card headline + card subhead.

    Returns (caption, headline, subhead). Falls back to a safe default if the
    LLM is unavailable so the endpoint never silently fails.
    """
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not settings.OPENAI_API_KEY:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead

    system = (
        "You draft short, sharp LinkedIn posts for Aivora HC, a human capital "
        "advisory platform. Return STRICT JSON with keys: caption (string, max "
        "900 chars, 2-4 short paragraphs, no hashtags spam, at most 3 focused "
        "hashtags at the end), headline (string, max 80 chars, punchy, no "
        "trailing period), subhead (string, max 120 chars, supporting line, "
        "no exclamation marks). Use plain hyphens, never em-dashes."
    )
    user = f"Compose a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.5,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        import json
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        if not caption or not headline:
            raise ValueError("empty llm output")
        return caption, headline, subhead or "Aivora HC advisory."
    except Exception:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead


@router.post("/share-prompt", response_model=ShareOut)
async def linkedin_share_prompt(
    payload: PromptShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """One-shot: prompt → LLM caption → branded card image → LinkedIn post."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    caption, headline, subhead = await _draft_post(payload.prompt)
    image_bytes = _render_brand_card(headline, subhead)

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=45) as client:
        asset_urn = await _upload_image(client, token, person_urn, image_bytes)
        post_id = await _create_ugc_post(
            client, token, person_urn, caption, [asset_urn], payload.visibility, "Aivora HC Insight"
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=caption,
    )


# ---------------------------------------------------------------------------
# Two-step Publish flow: /generate (LLM + Pillow, no post) then /publish
# ---------------------------------------------------------------------------

def _render_infographic(headline: str, subhead: str, bullets: list[str], stat: dict | None) -> bytes:
    """Render a 1200x1200 infographic card with headline, subhead, 4 bullets and a stat panel."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Brand mark top-right
    mark_x0, mark_y0 = W - pad - 160, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 160
    draw.rounded_rectangle((mark_x0, mark_y0, mark_x1, mark_y1), radius=20, fill=_BRAND_ACCENT_2)
    mark_font = _load_font(64, bold=True)
    bbox = draw.textbbox((0, 0), "A", font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        "A", font=mark_font, fill=_BRAND_TEXT,
    )

    kicker_font = _load_font(24, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · INSIGHT", font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(60, bold=True)
    max_w = W - 2 * pad - 200
    y = pad + 290
    for line in _wrap_text(draw, headline, headline_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 78

    # Subhead
    subhead_font = _load_font(30)
    y += 10
    for line in _wrap_text(draw, subhead, subhead_font, max_w)[:2]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 44

    # Bullets — colored dot + text
    y += 40
    bullet_font = _load_font(28, bold=True)
    for i, b in enumerate(bullets[:4]):
        cx, cy = pad + 108, y + 18
        draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=_BRAND_ACCENT)
        for j, line in enumerate(_wrap_text(draw, b, bullet_font, max_w - 40)[:2]):
            draw.text((pad + 138, y + j * 36), line, font=bullet_font, fill=_BRAND_TEXT)
        y += 72

    # Stat pill (bottom-right of the card) if provided
    if stat and stat.get("value"):
        stat_pad = 32
        stat_h = 140
        stat_w = 380
        sx0 = W - pad - stat_w - 40
        sy0 = H - pad - stat_h - 40
        sx1 = sx0 + stat_w
        sy1 = sy0 + stat_h
        draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=20, fill=(24, 30, 44))
        val_font = _load_font(56, bold=True)
        lbl_font = _load_font(20)
        val = str(stat.get("value") or "")
        lbl = str(stat.get("label") or "")
        draw.text((sx0 + stat_pad, sy0 + 20), val, font=val_font, fill=_BRAND_ACCENT)
        # Wrap the label into two lines max
        wrapped = _wrap_text(draw, lbl, lbl_font, stat_w - 2 * stat_pad)[:2]
        for i, line in enumerate(wrapped):
            draw.text((sx0 + stat_pad, sy0 + 90 + i * 24), line, font=lbl_font, fill=_BRAND_MUTED)

    # Footer
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(20)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 26), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _render_carousel_slide(index: int, total: int, title: str, body: str) -> bytes:
    """Render one 1200x1200 carousel slide."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Slide counter top-right pill
    counter_font = _load_font(22, bold=True)
    counter = f"{index + 1} / {total}"
    bbox = draw.textbbox((0, 0), counter, font=counter_font)
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx1 = W - pad - 60
    cy0 = pad + 60
    cx0 = cx1 - cw - 32
    cy1 = cy0 + ch + 20
    draw.rounded_rectangle((cx0, cy0, cx1, cy1), radius=14, fill=(24, 30, 44))
    draw.text((cx0 + 16, cy0 + 10), counter, font=counter_font, fill=_BRAND_ACCENT)

    kicker_font = _load_font(22, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · CAROUSEL", font=kicker_font, fill=_BRAND_ACCENT)

    max_w = W - 2 * pad - 200
    title_font = _load_font(70, bold=True)
    y = pad + 290
    for line in _wrap_text(draw, title, title_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=title_font, fill=_BRAND_TEXT)
        y += 88

    y += 24
    body_font = _load_font(32)
    for line in _wrap_text(draw, body, body_font, max_w)[:8]:
        draw.text((pad + 100, y), line, font=body_font, fill=_BRAND_MUTED)
        y += 46

    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    if index == total - 1:
        cta_font = _load_font(22, bold=True)
        cta = "Follow for more insights →"
        bbox = draw.textbbox((0, 0), cta, font=cta_font)
        draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 22), cta, font=cta_font, fill=_BRAND_ACCENT)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _generate_single(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption + one infographic image."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()
    fallback_head = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"

    if not settings.OPENAI_API_KEY:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            {"value": "6", "label": "capability dimensions we assess"},
        )
        return fallback_caption, [img]

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON only. "
        "Keys: caption (string, 400-900 chars, 2-4 paragraphs, at most 3 focused "
        "hashtags at the end, no em-dashes), headline (string, max 70 chars, "
        "punchy, no trailing period), subhead (string, max 110 chars), bullets "
        "(array of 4 short strings, each max 55 chars), stat (object with "
        "keys value (max 6 chars, e.g. '87%' or '3x') and label (max 40 chars))."
    )
    user = f"Draft a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:4]
        stat = data.get("stat") or {}
        if not caption or not headline:
            raise ValueError("empty llm output")
        while len(bullets) < 4:
            bullets.append("")
        img = _render_infographic(headline, subhead or "Aivora HC advisory.", bullets, stat if isinstance(stat, dict) else None)
        return caption, [img]
    except Exception:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            None,
        )
        return fallback_caption, [img]


async def _generate_carousel(prompt: str, slide_count: int = 5) -> tuple[str, list[bytes]]:
    """LLM -> caption + N carousel slides."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()

    if not settings.OPENAI_API_KEY:
        slides = [
            _render_carousel_slide(0, slide_count, "Aivora HC Insight", prompt.strip()[:400])
        ]
        for i in range(1, slide_count):
            slides.append(_render_carousel_slide(i, slide_count, f"Point {i}", ""))
        return fallback_caption, slides

    system = (
        f"You are Aivora HC's LinkedIn carousel author. Output STRICT JSON. "
        f"Keys: caption (string, 300-700 chars, 2-3 paragraphs, at most 3 "
        f"hashtags at end, no em-dashes), slides (array of exactly {slide_count} "
        f"objects). Each slide: {{title (max 55 chars, punchy, no trailing "
        f"period), body (max 220 chars, 1-3 short sentences)}}. Slide 1 is a "
        f"cover with the big idea, slide {slide_count} is the takeaway/CTA."
    )
    user = f"Draft a {slide_count}-slide LinkedIn carousel about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        slides_data = data.get("slides") or []
        if not caption or not slides_data:
            raise ValueError("empty llm output")
        slides: list[bytes] = []
        for i, s in enumerate(slides_data[:slide_count]):
            title = str(s.get("title") or f"Slide {i + 1}").strip()
            body = str(s.get("body") or "").strip()
            slides.append(_render_carousel_slide(i, min(slide_count, len(slides_data)), title, body))
        return caption, slides
    except Exception:
        slides = [_render_carousel_slide(i, slide_count, f"Slide {i + 1}", "") for i in range(slide_count)]
        return fallback_caption, slides


async def _generate_text_only(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption only."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback = prompt.strip()
    if not settings.OPENAI_API_KEY:
        return fallback, []

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON. "
        "Key: caption (string, 400-1100 chars, 3-5 short paragraphs, at most "
        "3 focused hashtags at the end, no em-dashes, no filler)."
    )
    user = f"Draft a text-only LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        return (caption or fallback), []
    except Exception:
        return fallback, []


def _to_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


@router.post("/generate", response_model=GenerateOut)
async def linkedin_generate(
    payload: GenerateIn,
    _current_user: AdminUser,
) -> GenerateOut:
    """LLM-drafts the caption + renders images. Does NOT post to LinkedIn."""
    if payload.format == "single":
        caption, images = await _generate_single(payload.prompt)
    elif payload.format == "carousel":
        caption, images = await _generate_carousel(payload.prompt)
    else:
        caption, images = await _generate_text_only(payload.prompt)

    return GenerateOut(
        caption=caption,
        format=payload.format,
        images_base64=[_to_data_url(b) for b in images],
    )


@router.post("/publish", response_model=ShareOut)
async def linkedin_publish(
    payload: PublishIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Post caption + (optional) images to LinkedIn. Used after /generate."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=90) as client:
        if payload.images_base64:
            assets: list[str] = []
            for idx, img_b64 in enumerate(payload.images_base64):
                image_bytes = _decode_image(img_b64)
                if not image_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Empty image at index {idx}",
                    )
                asset_urn = await _upload_image(client, token, person_urn, image_bytes)
                assets.append(asset_urn)
            post_id = await _create_ugc_post(
                client, token, person_urn, payload.caption, assets, payload.visibility, payload.title
            )
        else:
            # Text-only post
            ugc_body = {
                "author": person_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": payload.caption},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": payload.visibility},
            }
            ugc_resp = await client.post(
                LINKEDIN_UGC_POSTS_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
                json=ugc_body,
            )
            if ugc_resp.status_code >= 300:
                raise _bad_gateway(ugc_resp, "ugc_post")
            ugc_data = ugc_resp.json() if ugc_resp.content else {}
            post_id = ugc_data.get("id") or ugc_resp.headers.get("x-restli-id") or ""
            if not post_id:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"step": "ugc_post", "linkedin": ugc_data},
                )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=payload.caption,
    )


@router.post("/share-carousel", response_model=ShareOut)
async def linkedin_share_carousel(
    payload: CarouselShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Post multiple images as a single carousel post (admin only)."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=60) as client:
        assets: list[str] = []
        for idx, image_b64 in enumerate(payload.images_base64):
            image_bytes = _decode_image(image_b64)
            if not image_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Empty image at index {idx}",
                )
            asset_urn = await _upload_image(client, token, person_urn, image_bytes)
            assets.append(asset_urn)

        post_id = await _create_ugc_post(
            client, token, person_urn, payload.caption, assets, payload.visibility, payload.title
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
    )


# ---------------------------------------------------------------------------
# Prompt-driven share: LLM drafts the caption, we render a branded Aivora card
# as the attached image. No file upload from the admin.
# ---------------------------------------------------------------------------

_BRAND_BG = (12, 14, 20)          # #0c0e14
_BRAND_CARD = (19, 23, 32)        # #131720
_BRAND_ACCENT = (59, 130, 246)    # #3b82f6
_BRAND_ACCENT_2 = (37, 99, 235)   # #2563eb
_BRAND_TEXT = (241, 245, 249)     # slate-100
_BRAND_MUTED = (148, 163, 184)    # slate-400


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    candidates_regular = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates_bold = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in (candidates_bold if bold else candidates_regular):
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _render_brand_card(headline: str, subhead: str) -> bytes:
    """Render a 1200x1200 square branded Aivora card and return PNG bytes."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    # Card panel
    pad = 60
    draw.rounded_rectangle(
        (pad, pad, W - pad, H - pad),
        radius=48,
        fill=_BRAND_CARD,
    )

    # Accent bar top-left
    draw.rounded_rectangle(
        (pad + 60, pad + 60, pad + 80, pad + 200),
        radius=8,
        fill=_BRAND_ACCENT,
    )

    # Brand mark: "A" tile with subtle glow
    mark_x0, mark_y0 = W - pad - 200, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 200
    draw.rounded_rectangle(
        (mark_x0, mark_y0, mark_x1, mark_y1),
        radius=24,
        fill=_BRAND_ACCENT_2,
    )
    mark_font = _load_font(96, bold=True)
    letter = "A"
    bbox = draw.textbbox((0, 0), letter, font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        letter,
        font=mark_font,
        fill=_BRAND_TEXT,
    )

    # Kicker
    kicker = "AIVORA HC · ADVISORY POST"
    kicker_font = _load_font(28, bold=True)
    draw.text((pad + 100, pad + 240), kicker, font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(72, bold=True)
    max_width = W - 2 * pad - 200
    headline_lines = _wrap_text(draw, headline, headline_font, max_width)[:5]
    y = pad + 300
    for line in headline_lines:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 92

    # Subhead
    subhead_font = _load_font(36)
    y += 20
    for line in _wrap_text(draw, subhead, subhead_font, max_width)[:3]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 52

    # Footer bar
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(28, bold=True)
    draw.text((pad + 100, footer_y + 24), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(24)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 28), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _draft_post(prompt: str) -> tuple[str, str, str]:
    """Call the LLM to draft caption + card headline + card subhead.

    Returns (caption, headline, subhead). Falls back to a safe default if the
    LLM is unavailable so the endpoint never silently fails.
    """
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not settings.OPENAI_API_KEY:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead

    system = (
        "You draft short, sharp LinkedIn posts for Aivora HC, a human capital "
        "advisory platform. Return STRICT JSON with keys: caption (string, max "
        "900 chars, 2-4 short paragraphs, no hashtags spam, at most 3 focused "
        "hashtags at the end), headline (string, max 80 chars, punchy, no "
        "trailing period), subhead (string, max 120 chars, supporting line, "
        "no exclamation marks). Use plain hyphens, never em-dashes."
    )
    user = f"Compose a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.5,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        import json
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        if not caption or not headline:
            raise ValueError("empty llm output")
        return caption, headline, subhead or "Aivora HC advisory."
    except Exception:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead


@router.post("/share-prompt", response_model=ShareOut)
async def linkedin_share_prompt(
    payload: PromptShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """One-shot: prompt → LLM caption → branded card image → LinkedIn post."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    caption, headline, subhead = await _draft_post(payload.prompt)
    image_bytes = _render_brand_card(headline, subhead)

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=45) as client:
        asset_urn = await _upload_image(client, token, person_urn, image_bytes)
        post_id = await _create_ugc_post(
            client, token, person_urn, caption, [asset_urn], payload.visibility, "Aivora HC Insight"
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=caption,
    )


# ---------------------------------------------------------------------------
# Two-step Publish flow: /generate (LLM + Pillow, no post) then /publish
# ---------------------------------------------------------------------------

def _render_infographic(headline: str, subhead: str, bullets: list[str], stat: dict | None) -> bytes:
    """Render a 1200x1200 infographic card with headline, subhead, 4 bullets and a stat panel."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Brand mark top-right
    mark_x0, mark_y0 = W - pad - 160, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 160
    draw.rounded_rectangle((mark_x0, mark_y0, mark_x1, mark_y1), radius=20, fill=_BRAND_ACCENT_2)
    mark_font = _load_font(64, bold=True)
    bbox = draw.textbbox((0, 0), "A", font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        "A", font=mark_font, fill=_BRAND_TEXT,
    )

    kicker_font = _load_font(24, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · INSIGHT", font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(60, bold=True)
    max_w = W - 2 * pad - 200
    y = pad + 290
    for line in _wrap_text(draw, headline, headline_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 78

    # Subhead
    subhead_font = _load_font(30)
    y += 10
    for line in _wrap_text(draw, subhead, subhead_font, max_w)[:2]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 44

    # Bullets — colored dot + text
    y += 40
    bullet_font = _load_font(28, bold=True)
    for i, b in enumerate(bullets[:4]):
        cx, cy = pad + 108, y + 18
        draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=_BRAND_ACCENT)
        for j, line in enumerate(_wrap_text(draw, b, bullet_font, max_w - 40)[:2]):
            draw.text((pad + 138, y + j * 36), line, font=bullet_font, fill=_BRAND_TEXT)
        y += 72

    # Stat pill (bottom-right of the card) if provided
    if stat and stat.get("value"):
        stat_pad = 32
        stat_h = 140
        stat_w = 380
        sx0 = W - pad - stat_w - 40
        sy0 = H - pad - stat_h - 40
        sx1 = sx0 + stat_w
        sy1 = sy0 + stat_h
        draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=20, fill=(24, 30, 44))
        val_font = _load_font(56, bold=True)
        lbl_font = _load_font(20)
        val = str(stat.get("value") or "")
        lbl = str(stat.get("label") or "")
        draw.text((sx0 + stat_pad, sy0 + 20), val, font=val_font, fill=_BRAND_ACCENT)
        # Wrap the label into two lines max
        wrapped = _wrap_text(draw, lbl, lbl_font, stat_w - 2 * stat_pad)[:2]
        for i, line in enumerate(wrapped):
            draw.text((sx0 + stat_pad, sy0 + 90 + i * 24), line, font=lbl_font, fill=_BRAND_MUTED)

    # Footer
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(20)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 26), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _render_carousel_slide(index: int, total: int, title: str, body: str) -> bytes:
    """Render one 1200x1200 carousel slide."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Slide counter top-right pill
    counter_font = _load_font(22, bold=True)
    counter = f"{index + 1} / {total}"
    bbox = draw.textbbox((0, 0), counter, font=counter_font)
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx1 = W - pad - 60
    cy0 = pad + 60
    cx0 = cx1 - cw - 32
    cy1 = cy0 + ch + 20
    draw.rounded_rectangle((cx0, cy0, cx1, cy1), radius=14, fill=(24, 30, 44))
    draw.text((cx0 + 16, cy0 + 10), counter, font=counter_font, fill=_BRAND_ACCENT)

    kicker_font = _load_font(22, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · CAROUSEL", font=kicker_font, fill=_BRAND_ACCENT)

    max_w = W - 2 * pad - 200
    title_font = _load_font(70, bold=True)
    y = pad + 290
    for line in _wrap_text(draw, title, title_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=title_font, fill=_BRAND_TEXT)
        y += 88

    y += 24
    body_font = _load_font(32)
    for line in _wrap_text(draw, body, body_font, max_w)[:8]:
        draw.text((pad + 100, y), line, font=body_font, fill=_BRAND_MUTED)
        y += 46

    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    if index == total - 1:
        cta_font = _load_font(22, bold=True)
        cta = "Follow for more insights →"
        bbox = draw.textbbox((0, 0), cta, font=cta_font)
        draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 22), cta, font=cta_font, fill=_BRAND_ACCENT)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _generate_single(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption + one infographic image."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()
    fallback_head = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"

    if not settings.OPENAI_API_KEY:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            {"value": "6", "label": "capability dimensions we assess"},
        )
        return fallback_caption, [img]

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON only. "
        "Keys: caption (string, 400-900 chars, 2-4 paragraphs, at most 3 focused "
        "hashtags at the end, no em-dashes), headline (string, max 70 chars, "
        "punchy, no trailing period), subhead (string, max 110 chars), bullets "
        "(array of 4 short strings, each max 55 chars), stat (object with "
        "keys value (max 6 chars, e.g. '87%' or '3x') and label (max 40 chars))."
    )
    user = f"Draft a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:4]
        stat = data.get("stat") or {}
        if not caption or not headline:
            raise ValueError("empty llm output")
        while len(bullets) < 4:
            bullets.append("")
        img = _render_infographic(headline, subhead or "Aivora HC advisory.", bullets, stat if isinstance(stat, dict) else None)
        return caption, [img]
    except Exception:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            None,
        )
        return fallback_caption, [img]


async def _generate_carousel(prompt: str, slide_count: int = 5) -> tuple[str, list[bytes]]:
    """LLM -> caption + N carousel slides."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()

    if not settings.OPENAI_API_KEY:
        slides = [
            _render_carousel_slide(0, slide_count, "Aivora HC Insight", prompt.strip()[:400])
        ]
        for i in range(1, slide_count):
            slides.append(_render_carousel_slide(i, slide_count, f"Point {i}", ""))
        return fallback_caption, slides

    system = (
        f"You are Aivora HC's LinkedIn carousel author. Output STRICT JSON. "
        f"Keys: caption (string, 300-700 chars, 2-3 paragraphs, at most 3 "
        f"hashtags at end, no em-dashes), slides (array of exactly {slide_count} "
        f"objects). Each slide: {{title (max 55 chars, punchy, no trailing "
        f"period), body (max 220 chars, 1-3 short sentences)}}. Slide 1 is a "
        f"cover with the big idea, slide {slide_count} is the takeaway/CTA."
    )
    user = f"Draft a {slide_count}-slide LinkedIn carousel about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        slides_data = data.get("slides") or []
        if not caption or not slides_data:
            raise ValueError("empty llm output")
        slides: list[bytes] = []
        for i, s in enumerate(slides_data[:slide_count]):
            title = str(s.get("title") or f"Slide {i + 1}").strip()
            body = str(s.get("body") or "").strip()
            slides.append(_render_carousel_slide(i, min(slide_count, len(slides_data)), title, body))
        return caption, slides
    except Exception:
        slides = [_render_carousel_slide(i, slide_count, f"Slide {i + 1}", "") for i in range(slide_count)]
        return fallback_caption, slides


async def _generate_text_only(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption only."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback = prompt.strip()
    if not settings.OPENAI_API_KEY:
        return fallback, []

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON. "
        "Key: caption (string, 400-1100 chars, 3-5 short paragraphs, at most "
        "3 focused hashtags at the end, no em-dashes, no filler)."
    )
    user = f"Draft a text-only LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        return (caption or fallback), []
    except Exception:
        return fallback, []


def _to_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


@router.post("/generate", response_model=GenerateOut)
async def linkedin_generate(
    payload: GenerateIn,
    _current_user: AdminUser,
) -> GenerateOut:
    """LLM-drafts the caption + renders images. Does NOT post to LinkedIn."""
    if payload.format == "single":
        caption, images = await _generate_single(payload.prompt)
    elif payload.format == "carousel":
        caption, images = await _generate_carousel(payload.prompt)
    else:
        caption, images = await _generate_text_only(payload.prompt)

    return GenerateOut(
        caption=caption,
        format=payload.format,
        images_base64=[_to_data_url(b) for b in images],
    )


@router.post("/publish", response_model=ShareOut)
async def linkedin_publish(
    payload: PublishIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Post caption + (optional) images to LinkedIn. Used after /generate."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=90) as client:
        if payload.images_base64:
            assets: list[str] = []
            for idx, img_b64 in enumerate(payload.images_base64):
                image_bytes = _decode_image(img_b64)
                if not image_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Empty image at index {idx}",
                    )
                asset_urn = await _upload_image(client, token, person_urn, image_bytes)
                assets.append(asset_urn)
            post_id = await _create_ugc_post(
                client, token, person_urn, payload.caption, assets, payload.visibility, payload.title
            )
        else:
            # Text-only post
            ugc_body = {
                "author": person_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": payload.caption},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": payload.visibility},
            }
            ugc_resp = await client.post(
                LINKEDIN_UGC_POSTS_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
                json=ugc_body,
            )
            if ugc_resp.status_code >= 300:
                raise _bad_gateway(ugc_resp, "ugc_post")
            ugc_data = ugc_resp.json() if ugc_resp.content else {}
            post_id = ugc_data.get("id") or ugc_resp.headers.get("x-restli-id") or ""
            if not post_id:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"step": "ugc_post", "linkedin": ugc_data},
                )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=payload.caption,
    )


@router.post("/share-pdf", response_model=ShareOut)
async def linkedin_share_pdf(
    payload: PdfShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Convert a PDF to a per-page carousel and post it (admin only)."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    pdf_bytes = _decode_image(payload.pdf_base64)  # same base64/data-url handling
    if not pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty PDF payload",
        )

    images = _pdf_to_images(pdf_bytes)

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=120) as client:
        assets: list[str] = []
        for image_bytes in images:
            asset_urn = await _upload_image(client, token, person_urn, image_bytes)
            assets.append(asset_urn)

        post_id = await _create_ugc_post(
            client, token, person_urn, payload.caption, assets, payload.visibility, payload.title
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
    )


# ---------------------------------------------------------------------------
# Prompt-driven share: LLM drafts the caption, we render a branded Aivora card
# as the attached image. No file upload from the admin.
# ---------------------------------------------------------------------------

_BRAND_BG = (12, 14, 20)          # #0c0e14
_BRAND_CARD = (19, 23, 32)        # #131720
_BRAND_ACCENT = (59, 130, 246)    # #3b82f6
_BRAND_ACCENT_2 = (37, 99, 235)   # #2563eb
_BRAND_TEXT = (241, 245, 249)     # slate-100
_BRAND_MUTED = (148, 163, 184)    # slate-400


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    candidates_regular = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates_bold = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in (candidates_bold if bold else candidates_regular):
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _render_brand_card(headline: str, subhead: str) -> bytes:
    """Render a 1200x1200 square branded Aivora card and return PNG bytes."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    # Card panel
    pad = 60
    draw.rounded_rectangle(
        (pad, pad, W - pad, H - pad),
        radius=48,
        fill=_BRAND_CARD,
    )

    # Accent bar top-left
    draw.rounded_rectangle(
        (pad + 60, pad + 60, pad + 80, pad + 200),
        radius=8,
        fill=_BRAND_ACCENT,
    )

    # Brand mark: "A" tile with subtle glow
    mark_x0, mark_y0 = W - pad - 200, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 200
    draw.rounded_rectangle(
        (mark_x0, mark_y0, mark_x1, mark_y1),
        radius=24,
        fill=_BRAND_ACCENT_2,
    )
    mark_font = _load_font(96, bold=True)
    letter = "A"
    bbox = draw.textbbox((0, 0), letter, font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        letter,
        font=mark_font,
        fill=_BRAND_TEXT,
    )

    # Kicker
    kicker = "AIVORA HC · ADVISORY POST"
    kicker_font = _load_font(28, bold=True)
    draw.text((pad + 100, pad + 240), kicker, font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(72, bold=True)
    max_width = W - 2 * pad - 200
    headline_lines = _wrap_text(draw, headline, headline_font, max_width)[:5]
    y = pad + 300
    for line in headline_lines:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 92

    # Subhead
    subhead_font = _load_font(36)
    y += 20
    for line in _wrap_text(draw, subhead, subhead_font, max_width)[:3]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 52

    # Footer bar
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(28, bold=True)
    draw.text((pad + 100, footer_y + 24), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(24)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 28), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _draft_post(prompt: str) -> tuple[str, str, str]:
    """Call the LLM to draft caption + card headline + card subhead.

    Returns (caption, headline, subhead). Falls back to a safe default if the
    LLM is unavailable so the endpoint never silently fails.
    """
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not settings.OPENAI_API_KEY:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead

    system = (
        "You draft short, sharp LinkedIn posts for Aivora HC, a human capital "
        "advisory platform. Return STRICT JSON with keys: caption (string, max "
        "900 chars, 2-4 short paragraphs, no hashtags spam, at most 3 focused "
        "hashtags at the end), headline (string, max 80 chars, punchy, no "
        "trailing period), subhead (string, max 120 chars, supporting line, "
        "no exclamation marks). Use plain hyphens, never em-dashes."
    )
    user = f"Compose a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.5,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        import json
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        if not caption or not headline:
            raise ValueError("empty llm output")
        return caption, headline, subhead or "Aivora HC advisory."
    except Exception:
        headline = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
        subhead = "Aivora HC advisory · human capital, elevated."
        caption = prompt.strip()
        return caption, headline, subhead


@router.post("/share-prompt", response_model=ShareOut)
async def linkedin_share_prompt(
    payload: PromptShareIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """One-shot: prompt → LLM caption → branded card image → LinkedIn post."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    caption, headline, subhead = await _draft_post(payload.prompt)
    image_bytes = _render_brand_card(headline, subhead)

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=45) as client:
        asset_urn = await _upload_image(client, token, person_urn, image_bytes)
        post_id = await _create_ugc_post(
            client, token, person_urn, caption, [asset_urn], payload.visibility, "Aivora HC Insight"
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=caption,
    )


# ---------------------------------------------------------------------------
# Two-step Publish flow: /generate (LLM + Pillow, no post) then /publish
# ---------------------------------------------------------------------------

def _render_infographic(headline: str, subhead: str, bullets: list[str], stat: dict | None) -> bytes:
    """Render a 1200x1200 infographic card with headline, subhead, 4 bullets and a stat panel."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Brand mark top-right
    mark_x0, mark_y0 = W - pad - 160, pad + 60
    mark_x1, mark_y1 = W - pad - 60, pad + 160
    draw.rounded_rectangle((mark_x0, mark_y0, mark_x1, mark_y1), radius=20, fill=_BRAND_ACCENT_2)
    mark_font = _load_font(64, bold=True)
    bbox = draw.textbbox((0, 0), "A", font=mark_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (mark_x0 + (mark_x1 - mark_x0 - tw) / 2 - bbox[0],
         mark_y0 + (mark_y1 - mark_y0 - th) / 2 - bbox[1]),
        "A", font=mark_font, fill=_BRAND_TEXT,
    )

    kicker_font = _load_font(24, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · INSIGHT", font=kicker_font, fill=_BRAND_ACCENT)

    # Headline
    headline_font = _load_font(60, bold=True)
    max_w = W - 2 * pad - 200
    y = pad + 290
    for line in _wrap_text(draw, headline, headline_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=headline_font, fill=_BRAND_TEXT)
        y += 78

    # Subhead
    subhead_font = _load_font(30)
    y += 10
    for line in _wrap_text(draw, subhead, subhead_font, max_w)[:2]:
        draw.text((pad + 100, y), line, font=subhead_font, fill=_BRAND_MUTED)
        y += 44

    # Bullets — colored dot + text
    y += 40
    bullet_font = _load_font(28, bold=True)
    for i, b in enumerate(bullets[:4]):
        cx, cy = pad + 108, y + 18
        draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=_BRAND_ACCENT)
        for j, line in enumerate(_wrap_text(draw, b, bullet_font, max_w - 40)[:2]):
            draw.text((pad + 138, y + j * 36), line, font=bullet_font, fill=_BRAND_TEXT)
        y += 72

    # Stat pill (bottom-right of the card) if provided
    if stat and stat.get("value"):
        stat_pad = 32
        stat_h = 140
        stat_w = 380
        sx0 = W - pad - stat_w - 40
        sy0 = H - pad - stat_h - 40
        sx1 = sx0 + stat_w
        sy1 = sy0 + stat_h
        draw.rounded_rectangle((sx0, sy0, sx1, sy1), radius=20, fill=(24, 30, 44))
        val_font = _load_font(56, bold=True)
        lbl_font = _load_font(20)
        val = str(stat.get("value") or "")
        lbl = str(stat.get("label") or "")
        draw.text((sx0 + stat_pad, sy0 + 20), val, font=val_font, fill=_BRAND_ACCENT)
        # Wrap the label into two lines max
        wrapped = _wrap_text(draw, lbl, lbl_font, stat_w - 2 * stat_pad)[:2]
        for i, line in enumerate(wrapped):
            draw.text((sx0 + stat_pad, sy0 + 90 + i * 24), line, font=lbl_font, fill=_BRAND_MUTED)

    # Footer
    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    tag_font = _load_font(20)
    tag = "Human Capital, elevated."
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 26), tag, font=tag_font, fill=_BRAND_MUTED)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _render_carousel_slide(index: int, total: int, title: str, body: str) -> bytes:
    """Render one 1200x1200 carousel slide."""
    from io import BytesIO
    from PIL import Image, ImageDraw

    W = H = 1200
    img = Image.new("RGB", (W, H), _BRAND_BG)
    draw = ImageDraw.Draw(img)

    pad = 60
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=48, fill=_BRAND_CARD)
    draw.rounded_rectangle((pad + 60, pad + 60, pad + 80, pad + 200), radius=8, fill=_BRAND_ACCENT)

    # Slide counter top-right pill
    counter_font = _load_font(22, bold=True)
    counter = f"{index + 1} / {total}"
    bbox = draw.textbbox((0, 0), counter, font=counter_font)
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx1 = W - pad - 60
    cy0 = pad + 60
    cx0 = cx1 - cw - 32
    cy1 = cy0 + ch + 20
    draw.rounded_rectangle((cx0, cy0, cx1, cy1), radius=14, fill=(24, 30, 44))
    draw.text((cx0 + 16, cy0 + 10), counter, font=counter_font, fill=_BRAND_ACCENT)

    kicker_font = _load_font(22, bold=True)
    draw.text((pad + 100, pad + 240), "AIVORA HC · CAROUSEL", font=kicker_font, fill=_BRAND_ACCENT)

    max_w = W - 2 * pad - 200
    title_font = _load_font(70, bold=True)
    y = pad + 290
    for line in _wrap_text(draw, title, title_font, max_w)[:4]:
        draw.text((pad + 100, y), line, font=title_font, fill=_BRAND_TEXT)
        y += 88

    y += 24
    body_font = _load_font(32)
    for line in _wrap_text(draw, body, body_font, max_w)[:8]:
        draw.text((pad + 100, y), line, font=body_font, fill=_BRAND_MUTED)
        y += 46

    footer_y = H - pad - 100
    draw.rectangle((pad + 100, footer_y, W - pad - 100, footer_y + 2), fill=(30, 36, 51))
    footer_font = _load_font(24, bold=True)
    draw.text((pad + 100, footer_y + 22), "aivora.hc", font=footer_font, fill=_BRAND_TEXT)
    if index == total - 1:
        cta_font = _load_font(22, bold=True)
        cta = "Follow for more insights →"
        bbox = draw.textbbox((0, 0), cta, font=cta_font)
        draw.text((W - pad - 100 - (bbox[2] - bbox[0]), footer_y + 22), cta, font=cta_font, fill=_BRAND_ACCENT)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _generate_single(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption + one infographic image."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()
    fallback_head = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"

    if not settings.OPENAI_API_KEY:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            {"value": "6", "label": "capability dimensions we assess"},
        )
        return fallback_caption, [img]

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON only. "
        "Keys: caption (string, 400-900 chars, 2-4 paragraphs, at most 3 focused "
        "hashtags at the end, no em-dashes), headline (string, max 70 chars, "
        "punchy, no trailing period), subhead (string, max 110 chars), bullets "
        "(array of 4 short strings, each max 55 chars), stat (object with "
        "keys value (max 6 chars, e.g. '87%' or '3x') and label (max 40 chars))."
    )
    user = f"Draft a LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        headline = str(data.get("headline") or "").strip()
        subhead = str(data.get("subhead") or "").strip()
        bullets = [str(b).strip() for b in (data.get("bullets") or []) if str(b).strip()][:4]
        stat = data.get("stat") or {}
        if not caption or not headline:
            raise ValueError("empty llm output")
        while len(bullets) < 4:
            bullets.append("")
        img = _render_infographic(headline, subhead or "Aivora HC advisory.", bullets, stat if isinstance(stat, dict) else None)
        return caption, [img]
    except Exception:
        img = _render_infographic(
            fallback_head, "Aivora HC advisory.",
            ["Data-driven decisions", "Board-ready framing", "Clear next steps", "HC as strategy"],
            None,
        )
        return fallback_caption, [img]


async def _generate_carousel(prompt: str, slide_count: int = 5) -> tuple[str, list[bytes]]:
    """LLM -> caption + N carousel slides."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_caption = prompt.strip()

    if not settings.OPENAI_API_KEY:
        slides = [
            _render_carousel_slide(0, slide_count, "Aivora HC Insight", prompt.strip()[:400])
        ]
        for i in range(1, slide_count):
            slides.append(_render_carousel_slide(i, slide_count, f"Point {i}", ""))
        return fallback_caption, slides

    system = (
        f"You are Aivora HC's LinkedIn carousel author. Output STRICT JSON. "
        f"Keys: caption (string, 300-700 chars, 2-3 paragraphs, at most 3 "
        f"hashtags at end, no em-dashes), slides (array of exactly {slide_count} "
        f"objects). Each slide: {{title (max 55 chars, punchy, no trailing "
        f"period), body (max 220 chars, 1-3 short sentences)}}. Slide 1 is a "
        f"cover with the big idea, slide {slide_count} is the takeaway/CTA."
    )
    user = f"Draft a {slide_count}-slide LinkedIn carousel about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        slides_data = data.get("slides") or []
        if not caption or not slides_data:
            raise ValueError("empty llm output")
        slides: list[bytes] = []
        for i, s in enumerate(slides_data[:slide_count]):
            title = str(s.get("title") or f"Slide {i + 1}").strip()
            body = str(s.get("body") or "").strip()
            slides.append(_render_carousel_slide(i, min(slide_count, len(slides_data)), title, body))
        return caption, slides
    except Exception:
        slides = [_render_carousel_slide(i, slide_count, f"Slide {i + 1}", "") for i in range(slide_count)]
        return fallback_caption, slides


async def _generate_text_only(prompt: str) -> tuple[str, list[bytes]]:
    """LLM -> caption only."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback = prompt.strip()
    if not settings.OPENAI_API_KEY:
        return fallback, []

    system = (
        "You are Aivora HC's LinkedIn author. Output STRICT JSON. "
        "Key: caption (string, 400-1100 chars, 3-5 short paragraphs, at most "
        "3 focused hashtags at the end, no em-dashes, no filler)."
    )
    user = f"Draft a text-only LinkedIn post about:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.55,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = str(data.get("caption") or "").strip()
        return (caption or fallback), []
    except Exception:
        return fallback, []


def _to_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


@router.post("/generate", response_model=GenerateOut)
async def linkedin_generate(
    payload: GenerateIn,
    _current_user: AdminUser,
) -> GenerateOut:
    """LLM-drafts the caption + renders images. Does NOT post to LinkedIn."""
    if payload.format == "single":
        caption, images = await _generate_single(payload.prompt)
    elif payload.format == "carousel":
        caption, images = await _generate_carousel(payload.prompt)
    else:
        caption, images = await _generate_text_only(payload.prompt)

    return GenerateOut(
        caption=caption,
        format=payload.format,
        images_base64=[_to_data_url(b) for b in images],
    )


@router.post("/publish", response_model=ShareOut)
async def linkedin_publish(
    payload: PublishIn,
    current_user: AdminUser,
    db: DBDep,
) -> ShareOut:
    """Post caption + (optional) images to LinkedIn. Used after /generate."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="LinkedIn not connected",
        )

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    token = conn.access_token

    async with httpx.AsyncClient(timeout=90) as client:
        if payload.images_base64:
            assets: list[str] = []
            for idx, img_b64 in enumerate(payload.images_base64):
                image_bytes = _decode_image(img_b64)
                if not image_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Empty image at index {idx}",
                    )
                asset_urn = await _upload_image(client, token, person_urn, image_bytes)
                assets.append(asset_urn)
            post_id = await _create_ugc_post(
                client, token, person_urn, payload.caption, assets, payload.visibility, payload.title
            )
        else:
            # Text-only post
            ugc_body = {
                "author": person_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": payload.caption},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": payload.visibility},
            }
            ugc_resp = await client.post(
                LINKEDIN_UGC_POSTS_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
                json=ugc_body,
            )
            if ugc_resp.status_code >= 300:
                raise _bad_gateway(ugc_resp, "ugc_post")
            ugc_data = ugc_resp.json() if ugc_resp.content else {}
            post_id = ugc_data.get("id") or ugc_resp.headers.get("x-restli-id") or ""
            if not post_id:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"step": "ugc_post", "linkedin": ugc_data},
                )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=payload.caption,
    )
