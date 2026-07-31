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
    format: Literal["single", "carousel", "text", "hero"] = "single"


class GenerateOut(BaseModel):
    caption: str
    format: Literal["single", "carousel", "text", "hero"]
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


def _use_composio() -> bool:
    from app.config import settings as _s
    return bool(getattr(_s, "COMPOSIO_API_KEY", ""))


@auth_router.get("/connect", response_model=ConnectUrlOut)
async def linkedin_connect(current_user: CurrentUser) -> ConnectUrlOut:
    # Composio path: it owns the OAuth + token refresh.
    if _use_composio():
        from app.services.composio_linkedin import initiate_connection
        try:
            res = await initiate_connection(str(current_user.id))
            if res.get("redirect_url"):
                return ConnectUrlOut(url=res["redirect_url"])
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Composio connect failed: {str(exc)[:200]}")
        raise HTTPException(status_code=502, detail="Composio did not return a connect URL")

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
    if _use_composio():
        from app.services.composio_linkedin import is_connected
        return StatusOut(connected=await is_connected(str(current_user.id)))
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
    if _use_composio():
        from app.services.composio_linkedin import disconnect as composio_disconnect
        try:
            await composio_disconnect(str(current_user.id))
        except Exception:  # noqa: BLE001 - best-effort
            pass
        return DisconnectOut(connected=False)
    await db.execute(
        delete(LinkedInConnection).where(
            LinkedInConnection.tenant_id == current_user.tenant_id,
            LinkedInConnection.user_id == current_user.id,
        )
    )
    await db.commit()
    return DisconnectOut(connected=False)


# ---------------------------------------------------------------------------
# HC-platform router (/hc-platform/linkedin/*) — declared once.
# ---------------------------------------------------------------------------
router = APIRouter()


# ---------------------------------------------------------------------------
# LinkedIn upload/post helpers
# ---------------------------------------------------------------------------
async def _upload_image(client: httpx.AsyncClient, token: str, person_urn: str, image_bytes: bytes) -> str:
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
                    {"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}
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
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/octet-stream"},
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
                "shareMediaCategory": "IMAGE" if media else "NONE",
                **({"media": media} if media else {}),
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF contained no pages")
    return images


# ---------------------------------------------------------------------------
# Rendering: design system for data cards (1200x1200)
# ---------------------------------------------------------------------------
_BRAND_BG = (12, 14, 20)          # #0c0e14
_BRAND_CARD = (19, 23, 32)        # #131720
_BRAND_ACCENT = (59, 130, 246)    # #3b82f6
_BRAND_ACCENT_2 = (37, 99, 235)   # #2563eb
_BRAND_TEXT = (241, 245, 249)     # slate-100
_BRAND_MUTED = (148, 163, 184)    # slate-400
_ACCENT_LIGHT = (147, 197, 253)   # blue-300
_BAR_BG = (30, 41, 59)            # slate-800
_HAIRLINE = (30, 36, 51)          # subtle dividers

_CARD_W = _CARD_H = 1200
_CARD_PAD = 72
_CARD_GUTTER = 96


def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    candidates_regular = [
        "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
        "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates_bold = [
        "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
        "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
        "/usr/share/fonts/truetype/inter/Inter-Bold.ttf",
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


_TYPO_MAP = str.maketrans({
    "—": "-",  # em-dash
    "–": "-",  # en-dash
    "−": "-",  # minus sign
    "‘": "'",  # left single quote
    "’": "'",  # right single quote
    "“": '"',  # left double quote
    "”": '"',  # right double quote
    "…": "...",  # ellipsis
    " ": " ",  # non-breaking space
})


def _clean(text: str) -> str:
    """Normalize LLM output: strip em/en dashes, smart quotes, ellipsis."""
    if not text:
        return ""
    return str(text).translate(_TYPO_MAP).strip()


def _clean_payload(obj):
    """Recursively sanitize all string values in a nested LLM payload."""
    if isinstance(obj, str):
        return _clean(obj)
    if isinstance(obj, list):
        return [_clean_payload(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _clean_payload(v) for k, v in obj.items()}
    return obj


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:
    words = str(text).split()
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


def _draw_frame(draw, kicker: str = "AIVORA HC · INSIGHT") -> tuple[int, int, int, int]:
    W = H = _CARD_W
    pad = _CARD_PAD
    draw.rounded_rectangle((pad, pad, W - pad, H - pad), radius=40, fill=_BRAND_CARD)
    # Accent hairline
    draw.rectangle(
        (pad + _CARD_GUTTER, pad + _CARD_GUTTER, pad + _CARD_GUTTER + 48, pad + _CARD_GUTTER + 4),
        fill=_BRAND_ACCENT,
    )
    # Kicker
    kicker_font = _load_font(20, bold=True)
    draw.text(
        (pad + _CARD_GUTTER, pad + _CARD_GUTTER + 18),
        kicker.upper(),
        font=kicker_font,
        fill=_BRAND_ACCENT,
    )
    # Wordmark top-right
    mark_font = _load_font(22, bold=True)
    mark = "AIVORA HC"
    bbox = draw.textbbox((0, 0), mark, font=mark_font)
    mw = bbox[2] - bbox[0]
    draw.text(
        (W - pad - _CARD_GUTTER - mw, pad + _CARD_GUTTER + 18),
        mark,
        font=mark_font,
        fill=_BRAND_TEXT,
    )
    return pad + _CARD_GUTTER, pad + _CARD_GUTTER + 70, W - pad - _CARD_GUTTER, H - pad - _CARD_GUTTER


def _draw_footer(draw):
    W = H = _CARD_W
    pad = _CARD_PAD
    footer_y = H - pad - _CARD_GUTTER - 20
    draw.rectangle(
        (pad + _CARD_GUTTER, footer_y, W - pad - _CARD_GUTTER, footer_y + 1),
        fill=_HAIRLINE,
    )
    hc_font = _load_font(18, bold=True)
    tag_font = _load_font(16)
    draw.text((pad + _CARD_GUTTER, footer_y + 18), "aivora.hc", font=hc_font, fill=_BRAND_TEXT)
    tag = "Human Capital · elevated"
    bbox = draw.textbbox((0, 0), tag, font=tag_font)
    tw = bbox[2] - bbox[0]
    draw.text((W - pad - _CARD_GUTTER - tw, footer_y + 20), tag, font=tag_font, fill=_BRAND_MUTED)


def _draw_headline_block(draw, x0: int, y0: int, x1: int, headline: str, subhead: str) -> int:
    max_w = x1 - x0
    head_font = _load_font(52, bold=True)
    sub_font = _load_font(26)
    y = y0
    for line in _wrap_text(draw, headline, head_font, max_w)[:3]:
        draw.text((x0, y), line, font=head_font, fill=_BRAND_TEXT)
        y += 66
    y += 10
    for line in _wrap_text(draw, subhead, sub_font, max_w)[:2]:
        draw.text((x0, y), line, font=sub_font, fill=_BRAND_MUTED)
        y += 36
    return y + 30


def _new_canvas():
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (_CARD_W, _CARD_H), _BRAND_BG)
    return img, ImageDraw.Draw(img)


def _finalize(img) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---------- KPI hero --------------------------------------------------------

def _render_layout_kpi(headline: str, subhead: str, kpi: dict) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, _y1 = _draw_frame(draw)
    y = _draw_headline_block(draw, x0, y0, x1, headline, subhead)

    value = str(kpi.get("value") or "")[:8]
    label = str(kpi.get("label") or "")
    note = str(kpi.get("note") or "")

    val_font = _load_font(220, bold=True)
    lbl_font = _load_font(26, bold=True)
    note_font = _load_font(22)

    bbox = draw.textbbox((0, 0), value, font=val_font)
    vw = bbox[2] - bbox[0]
    vy = y + 60
    draw.text((x0, vy), value, font=val_font, fill=_BRAND_ACCENT)
    draw.text((x0 + vw + 24, vy + 40), label.upper(), font=lbl_font, fill=_BRAND_TEXT)
    if note:
        for i, line in enumerate(_wrap_text(draw, note, note_font, x1 - x0 - vw - 40)[:3]):
            draw.text((x0 + vw + 24, vy + 90 + i * 30), line, font=note_font, fill=_BRAND_MUTED)

    _draw_footer(draw)
    return _finalize(img)


# ---------- Horizontal bars -------------------------------------------------

def _render_layout_bars(headline: str, subhead: str, bars: list[dict]) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, y1 = _draw_frame(draw, kicker="AIVORA HC · DATA")
    y = _draw_headline_block(draw, x0, y0, x1, headline, subhead)

    bars = bars[:5]
    if not bars:
        _draw_footer(draw)
        return _finalize(img)

    numeric_values: list[float] = []
    for b in bars:
        raw = str(b.get("value") or "0")
        try:
            numeric_values.append(float("".join(ch for ch in raw if ch.isdigit() or ch == ".")) or 0.0)
        except ValueError:
            numeric_values.append(0.0)
    max_val = max(numeric_values + [1.0])

    label_font = _load_font(24, bold=True)
    val_font = _load_font(22, bold=True)

    chart_top = y + 20
    chart_bottom = y1 - 120
    n = len(bars)
    row_h = min(90, (chart_bottom - chart_top) // n)
    gap = 18
    bar_h = row_h - gap

    label_col_w = int((x1 - x0) * 0.40)
    bar_x0 = x0 + label_col_w
    bar_max_w = x1 - bar_x0 - 100

    for i, (b, v) in enumerate(zip(bars, numeric_values)):
        ry = chart_top + i * row_h
        label_text = str(b.get("label") or "")
        for j, line in enumerate(_wrap_text(draw, label_text, label_font, label_col_w - 24)[:2]):
            draw.text((x0, ry + 8 + j * 28), line, font=label_font, fill=_BRAND_TEXT)

        draw.rounded_rectangle(
            (bar_x0, ry + 12, bar_x0 + bar_max_w, ry + 12 + bar_h),
            radius=bar_h // 2, fill=_BAR_BG,
        )
        pct = v / max_val if max_val > 0 else 0
        fill_w = max(int(bar_max_w * pct), 8)
        draw.rounded_rectangle(
            (bar_x0, ry + 12, bar_x0 + fill_w, ry + 12 + bar_h),
            radius=bar_h // 2, fill=_BRAND_ACCENT,
        )
        unit = str(b.get("unit") or "")
        val_text = str(b.get("value") or "") + (f" {unit}" if unit else "")
        draw.text((bar_x0 + fill_w + 16, ry + 16), val_text, font=val_font, fill=_BRAND_TEXT)

    _draw_footer(draw)
    return _finalize(img)


# ---------- Donut chart -----------------------------------------------------

def _render_layout_donut(headline: str, subhead: str, donut: dict) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, _y1 = _draw_frame(draw, kicker="AIVORA HC · METRIC")
    y = _draw_headline_block(draw, x0, y0, x1, headline, subhead)

    try:
        pct = max(0.0, min(100.0, float(str(donut.get("percent") or "0").rstrip("%"))))
    except (TypeError, ValueError):
        pct = 0.0
    label = str(donut.get("label") or "")
    points = donut.get("points") or []

    donut_size = 320
    donut_x = x0
    donut_y = y + 20
    donut_x1 = donut_x + donut_size
    donut_y1 = donut_y + donut_size

    draw.ellipse((donut_x, donut_y, donut_x1, donut_y1), fill=_BAR_BG)
    sweep = pct / 100.0 * 360
    if sweep > 0:
        draw.pieslice(
            (donut_x, donut_y, donut_x1, donut_y1),
            start=-90, end=-90 + sweep, fill=_BRAND_ACCENT,
        )
    inner_pad = 60
    draw.ellipse(
        (donut_x + inner_pad, donut_y + inner_pad, donut_x1 - inner_pad, donut_y1 - inner_pad),
        fill=_BRAND_CARD,
    )

    pct_text = f"{int(pct)}%"
    pct_font = _load_font(64, bold=True)
    bbox = draw.textbbox((0, 0), pct_text, font=pct_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx = donut_x + donut_size // 2
    cy = donut_y + donut_size // 2
    draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1] - 8), pct_text, font=pct_font, fill=_BRAND_TEXT)
    lbl_font = _load_font(18, bold=True)
    if label:
        wrapped = _wrap_text(draw, label.upper(), lbl_font, donut_size - 80)[:1]
        for i, line in enumerate(wrapped):
            b2 = draw.textbbox((0, 0), line, font=lbl_font)
            draw.text(
                (cx - (b2[2] - b2[0]) / 2 - b2[0], cy + 30 + i * 22),
                line, font=lbl_font, fill=_BRAND_MUTED,
            )

    px = donut_x1 + 60
    py = donut_y + 30
    pt_font = _load_font(26, bold=True)
    for i, p in enumerate(points[:3]):
        marker_y = py + 12
        draw.rectangle(
            (px, marker_y, px + 16, marker_y + 16),
            fill=(_BRAND_ACCENT if i == 0 else _ACCENT_LIGHT),
        )
        max_w = x1 - (px + 36)
        for j, line in enumerate(_wrap_text(draw, str(p), pt_font, max_w)[:2]):
            draw.text((px + 36, py + j * 34), line, font=pt_font, fill=_BRAND_TEXT)
        py += 90

    _draw_footer(draw)
    return _finalize(img)


# ---------- Compare (two columns) -------------------------------------------

def _render_layout_compare(headline: str, subhead: str, compare: dict) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, y1 = _draw_frame(draw, kicker="AIVORA HC · COMPARE")
    y = _draw_headline_block(draw, x0, y0, x1, headline, subhead)

    left = compare.get("left") or {}
    right = compare.get("right") or {}
    total_w = x1 - x0
    col_w = (total_w - 40) // 2
    col_h = y1 - y - 120
    col_y = y + 20

    lx0 = x0
    lx1 = lx0 + col_w
    draw.rounded_rectangle((lx0, col_y, lx1, col_y + col_h), radius=24, fill=_BAR_BG)

    rx0 = lx1 + 40
    rx1 = rx0 + col_w
    draw.rounded_rectangle((rx0, col_y, rx1, col_y + col_h), radius=24, fill=(21, 43, 78))
    # Wider accent stripe on the "after" column (5px, blends into rounded corner)
    draw.rectangle((rx0, col_y + 8, rx0 + 5, col_y + col_h - 8), fill=_BRAND_ACCENT)

    def _draw_col(x_start: int, x_end: int, block: dict, accent: bool):
        lbl_font = _load_font(22, bold=True)
        title_font = _load_font(36, bold=True)
        pt_font = _load_font(22)
        inner = 40

        label = str(block.get("label") or "").upper()
        title = str(block.get("title") or "")
        points = block.get("points") or []

        draw.text(
            (x_start + inner, col_y + 32), label,
            font=lbl_font, fill=(_BRAND_ACCENT if accent else _BRAND_MUTED),
        )
        y_cur = col_y + 72
        for line in _wrap_text(draw, title, title_font, x_end - x_start - 2 * inner)[:2]:
            draw.text((x_start + inner, y_cur), line, font=title_font, fill=_BRAND_TEXT)
            y_cur += 44
        y_cur += 24
        for p in points[:3]:
            marker_y = y_cur + 12
            draw.ellipse(
                (x_start + inner, marker_y, x_start + inner + 12, marker_y + 12),
                fill=(_BRAND_ACCENT if accent else _BRAND_MUTED),
            )
            for j, line in enumerate(_wrap_text(draw, str(p), pt_font, x_end - x_start - 2 * inner - 30)[:2]):
                draw.text((x_start + inner + 26, y_cur + j * 30), line, font=pt_font, fill=_BRAND_TEXT)
            y_cur += 70

    _draw_col(lx0, lx1, left, accent=False)
    _draw_col(rx0, rx1, right, accent=True)

    _draw_footer(draw)
    return _finalize(img)


# ---------- Three stat tiles ------------------------------------------------

def _render_layout_stats(headline: str, subhead: str, stats: list[dict]) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, _y1 = _draw_frame(draw, kicker="AIVORA HC · DATA")
    y = _draw_headline_block(draw, x0, y0, x1, headline, subhead)

    stats = stats[:3]
    while len(stats) < 3:
        stats.append({"value": "—", "label": ""})

    total_w = x1 - x0
    gap = 24
    tile_w = (total_w - gap * 2) // 3
    tile_h = 240
    ty0 = y + 40

    val_font = _load_font(88, bold=True)
    lbl_font = _load_font(20, bold=True)

    for i, s in enumerate(stats):
        tx0 = x0 + i * (tile_w + gap)
        tx1 = tx0 + tile_w
        draw.rounded_rectangle((tx0, ty0, tx1, ty0 + tile_h), radius=24, fill=_BAR_BG)
        draw.rectangle((tx0, ty0, tx0 + 40, ty0 + 4), fill=_BRAND_ACCENT)

        value = str(s.get("value") or "")[:6]
        label = str(s.get("label") or "")

        bbox = draw.textbbox((0, 0), value, font=val_font)
        vw = bbox[2] - bbox[0]
        draw.text(
            (tx0 + (tile_w - vw) / 2 - bbox[0], ty0 + 44),
            value, font=val_font, fill=_BRAND_ACCENT,
        )
        wrapped = _wrap_text(draw, label.upper(), lbl_font, tile_w - 32)[:2]
        for j, line in enumerate(wrapped):
            b2 = draw.textbbox((0, 0), line, font=lbl_font)
            draw.text(
                (tx0 + (tile_w - (b2[2] - b2[0])) / 2 - b2[0], ty0 + tile_h - 60 + j * 26),
                line, font=lbl_font, fill=_BRAND_MUTED,
            )

    _draw_footer(draw)
    return _finalize(img)


def _render_data_card(layout: str, headline: str, subhead: str, data: dict) -> bytes:
    if layout == "bars":
        return _render_layout_bars(headline, subhead, data.get("bars") or [])
    if layout == "donut":
        return _render_layout_donut(headline, subhead, data.get("donut") or {})
    if layout == "compare":
        return _render_layout_compare(headline, subhead, data.get("compare") or {})
    if layout == "stats":
        return _render_layout_stats(headline, subhead, data.get("stats") or [])
    return _render_layout_kpi(headline, subhead, data.get("kpi") or {})


# ---------- Carousel slide (used for carousel format) -----------------------

def _render_carousel_slide(index: int, total: int, title: str, body: str) -> bytes:
    img, draw = _new_canvas()
    x0, y0, x1, y1 = _draw_frame(draw, kicker=f"AIVORA HC · SLIDE {index + 1}/{total}")

    max_w = x1 - x0
    title_font = _load_font(60, bold=True)
    body_font = _load_font(30)

    y = y0
    for line in _wrap_text(draw, title, title_font, max_w)[:4]:
        draw.text((x0, y), line, font=title_font, fill=_BRAND_TEXT)
        y += 76

    y += 24
    for line in _wrap_text(draw, body, body_font, max_w)[:8]:
        draw.text((x0, y), line, font=body_font, fill=_BRAND_MUTED)
        y += 44

    if index == total - 1:
        cta_font = _load_font(22, bold=True)
        cta = "Follow for more insights →"
        draw.text((x0, y1 - 80), cta, font=cta_font, fill=_BRAND_ACCENT)

    _draw_footer(draw)
    return _finalize(img)


# ---------------------------------------------------------------------------
# LLM prompt drafters
# ---------------------------------------------------------------------------

_FALLBACK_KPI = {"value": "6", "label": "capability dimensions we assess"}


_FALLBACK_POSTER = {
    "eyebrow": "Aivora HC Insight",
    "title": "Human capital, elevated",
    "hero": {"value": "6", "label": "capability dimensions we assess"},
    "insight": "Great HC decisions start with the right diagnosis.",
    "tag": "Human Capital, elevated",
}


async def _generate_single(prompt: str) -> tuple[str, list[bytes]]:
    """LLM composes a data-rich infographic; rendered as a WHITE consulting
    dashboard one-pager (Deloitte/EY style)."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    from app.services.social_poster import render_poster
    import json

    fallback_caption = prompt.strip()

    if not settings.OPENAI_API_KEY:
        return fallback_caption, [render_poster(_FALLBACK_POSTER)]

    system = (
        "You are Aivora HC's senior consulting content designer, producing a "
        "board-grade LinkedIn infographic in the style of Deloitte / EY / McKinsey. "
        "Return STRICT JSON with these keys:\n"
        "- caption: 500-900 chars, 2-4 short paragraphs, at most 3 focused hashtags "
        "at the end, no em-dashes (plain hyphens only), specific and insight-led (not fluffy).\n"
        "- eyebrow: 2-4 word category label, e.g. 'Workforce Planning'.\n"
        "- title: the headline, max 60 chars, sharp and specific (no trailing period).\n"
        "- hero: {value: a single hero metric max 6 chars e.g. '85%' or '3.2x', "
        "label: max 40 chars describing it, note: optional max 90 chars}.\n"
        "- kpis: EXACTLY 3 items of {value (max 7 chars), label (max 32 chars)} - three "
        "supporting metrics that reinforce the story.\n"
        "- bars: 3-5 items of {label (max 18 chars), value (0-100 number), unit (optional, e.g. '%')} "
        "- a ranked breakdown (stages, drivers, segments...).\n"
        "- donut: {percent (0-100 number), label (max 26 chars), points: 3 short strings max 40 chars} "
        "- a share-of-a-whole with 3 takeaways.\n"
        "- insight: ONE sharp takeaway sentence, max 120 chars.\n"
        "- tag: 'Human Capital, elevated'.\n\n"
        "Compose REAL, specific, plausible numbers for the topic (these are illustrative but must "
        "look like genuine consulting data - never round-number filler like '100% / 50%'). Every "
        "field is used in the visual, so fill them all. The numbers across hero, kpis, bars and donut "
        "should tell ONE coherent data story about the topic."
    )
    user = f"Create the LinkedIn infographic + caption for:\n\n{prompt.strip()}"

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.5,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = _clean(data.get("caption") or "")
        if not caption:
            raise ValueError("empty llm output")
        # Typography-clean the poster fields too.
        poster = _clean_payload({
            "eyebrow": data.get("eyebrow"),
            "title": data.get("title"),
            "hero": data.get("hero"),
            "kpis": data.get("kpis"),
            "bars": data.get("bars"),
            "donut": data.get("donut"),
            "insight": data.get("insight"),
            "tag": data.get("tag") or "Human Capital, elevated",
        })
        return caption, [render_poster(poster)]
    except Exception:
        return fallback_caption, [render_poster(_FALLBACK_POSTER)]


async def _generate_hero(prompt: str) -> tuple[str, list[bytes]]:
    """Generate a photorealistic HERO image with gpt-image-1.

    Drafts a LinkedIn caption + a clean image prompt from the user's input, then
    asks gpt-image-1 for a text-free, photorealistic HC-advisory hero visual.
    Falls back to the Pillow infographic if the key is missing or the image
    model fails, so this never 500s.
    """
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback_head = prompt.strip().split("\n")[0][:80] or "Aivora HC Insight"
    fallback_sub = "Aivora HC advisory · human capital, elevated."
    fallback_caption = prompt.strip()

    def _fallback() -> tuple[str, list[bytes]]:
        return fallback_caption, [_render_layout_kpi(fallback_head, fallback_sub, _FALLBACK_KPI)]

    if not settings.OPENAI_API_KEY:
        return _fallback()

    # 1) Draft caption + a clean, text-free image prompt.
    caption = fallback_caption
    image_prompt = (
        "A cinematic, photorealistic corporate scene evoking modern human capital "
        "advisory: diverse professionals collaborating in a bright, premium office, "
        "soft natural light, shallow depth of field, blue accent tones."
    )
    try:
        client = _get_client()
        sys = (
            "You are Aivora HC's creative director. Return STRICT JSON with keys: "
            "caption (string, 400-900 chars, 2-4 short paragraphs, at most 3 focused "
            "hashtags at the end, no em-dashes, plain hyphens only); "
            "image_prompt (a single vivid paragraph, max 480 chars, describing a "
            "PHOTOREALISTIC, editorial hero photograph for this topic. Absolutely NO "
            "text, words, letters, logos, charts, or UI in the image. Describe scene, "
            "subjects, lighting, mood, composition and a restrained blue-accent palette "
            "fitting a premium human-capital advisory brand)."
        )
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": sys},
                      {"role": "user", "content": f"Topic:\n\n{prompt.strip()}"}],
            temperature=0.6,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        caption = _clean(data.get("caption") or "") or fallback_caption
        ip = _clean(data.get("image_prompt") or "")
        if ip:
            image_prompt = ip
    except Exception:
        pass  # keep defaults; still try the image below

    # 2) Generate the hero image with gpt-image-1.
    try:
        client = _get_client()
        full_prompt = (
            image_prompt
            + " Editorial photograph, ultra-detailed, natural light, shallow depth of field. "
            "No text, no words, no letters, no logos, no charts, no graphs, no UI elements."
        )
        img_resp = await client.images.generate(
            model="gpt-image-1",
            prompt=full_prompt[:900],
            size="1024x1024",
            n=1,
        )
        b64 = img_resp.data[0].b64_json if img_resp.data else None
        if not b64:
            return caption, [_render_layout_kpi(fallback_head, fallback_sub, _FALLBACK_KPI)]
        return caption, [base64.b64decode(b64)]
    except Exception:
        # Image model unavailable / errored: keep the good caption, fall back to card.
        return caption, [_render_layout_kpi(fallback_head, fallback_sub, _FALLBACK_KPI)]


async def _generate_carousel(prompt: str, slide_count: int = 5) -> tuple[str, list[bytes]]:
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
        f"You are Aivora HC's LinkedIn carousel author. Return STRICT JSON. "
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
        caption = _clean(data.get("caption") or "")
        slides_data = data.get("slides") or []
        if not caption or not slides_data:
            raise ValueError("empty llm output")
        n = min(slide_count, len(slides_data))
        slides: list[bytes] = []
        for i, s in enumerate(slides_data[:slide_count]):
            title = _clean(s.get("title") or f"Slide {i + 1}")
            body = _clean(s.get("body") or "")
            slides.append(_render_carousel_slide(i, n, title, body))
        return caption, slides
    except Exception:
        slides = [_render_carousel_slide(i, slide_count, f"Slide {i + 1}", "") for i in range(slide_count)]
        return fallback_caption, slides


async def _generate_text_only(prompt: str) -> tuple[str, list[bytes]]:
    from app.config import settings
    from app.services.ai_orchestrator import _get_client
    import json

    fallback = prompt.strip()
    if not settings.OPENAI_API_KEY:
        return fallback, []

    system = (
        "You are Aivora HC's LinkedIn author. Return STRICT JSON. "
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
        caption = _clean(data.get("caption") or "")
        return (caption or fallback), []
    except Exception:
        return fallback, []


def _to_data_url(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/share", response_model=ShareOut)
async def linkedin_share(payload: ShareIn, current_user: AdminUser, db: DBDep) -> ShareOut:
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="LinkedIn not connected")
    image_bytes = _decode_image(payload.image_base64)
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image payload")

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    async with httpx.AsyncClient(timeout=30) as client:
        asset_urn = await _upload_image(client, conn.access_token, person_urn, image_bytes)
        post_id = await _create_ugc_post(
            client, conn.access_token, person_urn, payload.caption,
            [asset_urn], payload.visibility, "Aivora HC Deliverable",
        )
    return ShareOut(post_id=post_id, share_url=f"https://www.linkedin.com/feed/update/{post_id}/")


@router.post("/share-carousel", response_model=ShareOut)
async def linkedin_share_carousel(payload: CarouselShareIn, current_user: AdminUser, db: DBDep) -> ShareOut:
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="LinkedIn not connected")

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        assets: list[str] = []
        for idx, img_b64 in enumerate(payload.images_base64):
            image_bytes = _decode_image(img_b64)
            if not image_bytes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Empty image at index {idx}")
            assets.append(await _upload_image(client, conn.access_token, person_urn, image_bytes))
        post_id = await _create_ugc_post(
            client, conn.access_token, person_urn, payload.caption,
            assets, payload.visibility, payload.title,
        )
    return ShareOut(post_id=post_id, share_url=f"https://www.linkedin.com/feed/update/{post_id}/")


@router.post("/share-pdf", response_model=ShareOut)
async def linkedin_share_pdf(payload: PdfShareIn, current_user: AdminUser, db: DBDep) -> ShareOut:
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="LinkedIn not connected")

    pdf_bytes = _decode_image(payload.pdf_base64)
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty PDF payload")

    images = _pdf_to_images(pdf_bytes)
    person_urn = f"urn:li:person:{conn.linkedin_user_id}"
    async with httpx.AsyncClient(timeout=120) as client:
        assets: list[str] = []
        for image_bytes in images:
            assets.append(await _upload_image(client, conn.access_token, person_urn, image_bytes))
        post_id = await _create_ugc_post(
            client, conn.access_token, person_urn, payload.caption,
            assets, payload.visibility, payload.title,
        )
    return ShareOut(post_id=post_id, share_url=f"https://www.linkedin.com/feed/update/{post_id}/")


@router.post("/generate", response_model=GenerateOut)
async def linkedin_generate(payload: GenerateIn, _current_user: AdminUser) -> GenerateOut:
    """LLM-drafts the caption + renders images. Does NOT post to LinkedIn."""
    if payload.format == "single":
        caption, images = await _generate_single(payload.prompt)
    elif payload.format == "carousel":
        caption, images = await _generate_carousel(payload.prompt)
    elif payload.format == "hero":
        caption, images = await _generate_hero(payload.prompt)
    else:
        caption, images = await _generate_text_only(payload.prompt)

    return GenerateOut(
        caption=caption,
        format=payload.format,
        images_base64=[_to_data_url(b) for b in images],
    )


@router.post("/publish", response_model=ShareOut)
async def linkedin_publish(payload: PublishIn, current_user: AdminUser, db: DBDep) -> ShareOut:
    """Post caption + (optional) images to LinkedIn. Used after /generate."""
    # Composio path: managed connector with OAuth + token refresh.
    if _use_composio():
        from app.services.composio_linkedin import create_post
        try:
            res = await create_post(str(current_user.id), payload.caption, payload.visibility)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Composio post failed: {str(exc)[:200]}")
        pid = res.get("post_id") or ""
        return ShareOut(
            post_id=pid,
            share_url=res.get("url") or (f"https://www.linkedin.com/feed/update/{pid}/" if pid else ""),
            caption=payload.caption,
        )

    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="LinkedIn not connected")

    person_urn = f"urn:li:person:{conn.linkedin_user_id}"

    async with httpx.AsyncClient(timeout=90) as client:
        assets: list[str] = []
        if payload.images_base64:
            for idx, img_b64 in enumerate(payload.images_base64):
                image_bytes = _decode_image(img_b64)
                if not image_bytes:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Empty image at index {idx}")
                assets.append(await _upload_image(client, conn.access_token, person_urn, image_bytes))
        post_id = await _create_ugc_post(
            client, conn.access_token, person_urn, payload.caption,
            assets, payload.visibility, payload.title,
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=payload.caption,
    )


@router.post("/share-prompt", response_model=ShareOut)
async def linkedin_share_prompt(payload: PromptShareIn, current_user: AdminUser, db: DBDep) -> ShareOut:
    """Back-compat one-shot: prompt -> LLM -> render -> post immediately."""
    conn = await _get_connection(db, current_user.tenant_id, current_user.id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="LinkedIn not connected")

    caption, images = await _generate_single(payload.prompt)
    person_urn = f"urn:li:person:{conn.linkedin_user_id}"

    async with httpx.AsyncClient(timeout=60) as client:
        assets: list[str] = []
        for image_bytes in images:
            assets.append(await _upload_image(client, conn.access_token, person_urn, image_bytes))
        post_id = await _create_ugc_post(
            client, conn.access_token, person_urn, caption,
            assets, payload.visibility, "Aivora HC Insight",
        )

    return ShareOut(
        post_id=post_id,
        share_url=f"https://www.linkedin.com/feed/update/{post_id}/",
        caption=caption,
    )
