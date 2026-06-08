from __future__ import annotations

from slowapi import Limiter
from starlette.requests import Request

from app.config import settings


def _client_ip(request: Request) -> str:
    """
    Extract the real client IP respecting Cloudflare and standard proxy headers.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()

    if request.client:
        return request.client.host

    return "unknown"


limiter = Limiter(key_func=_client_ip, storage_uri=settings.REDIS_URL)
