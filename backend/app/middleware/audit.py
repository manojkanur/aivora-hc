"""
Request audit middleware.

Writes a single ai_audit_logs row for every meaningful API call so the admin
audit log shows the FULL user activity, not just AI engine events.

Design rules:
- Skip noisy / read-only endpoints (GET, healthcheck, polls, the audit log
  itself) so the table does not balloon and so the admin UI does not
  recursively log itself when it fetches.
- Decode the JWT directly to attach a user_id and tenant_id, never block on
  the DB.
- Action name comes from the method + path so it is grep-able:
    "POST /workspaces"  ->  "request.POST.workspaces"
    "PATCH /ai/drafts/{id}/content"  ->  "request.PATCH.ai.drafts.content"
- Audit failures must never affect the request.
"""

from __future__ import annotations

import re
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.audit import log_event
from app.utils.security import verify_access_token

# Read-heavy paths we never want to log. Adding a path here keeps the audit
# table focused on writes and significant events.
SKIP_PATH_SUBSTRINGS = (
    "/openapi.json", "/docs", "/redoc",
    "/api/v1/me/stats", "/api/v1/me/onboarding", "/api/v1/me/export",
    "/api/v1/admin/audit-log",        # do not log the audit fetch (recursion)
    "/api/v1/admin/stats",
    "/api/v1/credits", "/api/v1/billing/balance",
    "/api/v1/gamification",
    "/api/v1/ai/stream",              # SSE stream
    "/api/v1/skills",                 # the public catalogue read
    "/api/v1/kb",
)

# Methods we never log even on otherwise-noisy paths.
SKIP_METHODS = {"OPTIONS", "HEAD"}

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _path_to_action(method: str, path: str) -> str:
    """Turn a request line into a stable, readable action name."""
    parts = [p for p in path.split("/") if p and p not in ("api", "v1")]
    # Drop UUID segments so the action is shape-stable, not per-resource
    parts = [p for p in parts if not UUID_RE.match(p)]
    if not parts:
        parts = ["root"]
    return f"request.{method}.{'.'.join(parts)}"


def _should_skip(method: str, path: str) -> bool:
    if method in SKIP_METHODS:
        return True
    # Only GETs that are not state-changing
    if method == "GET":
        return True
    for sub in SKIP_PATH_SUBSTRINGS:
        if sub in path:
            return True
    return False


def _user_from_request(request: Request) -> tuple[Any, Any]:
    """Best-effort: pull (user_id, tenant_id) from the bearer token. Returns (None, None) if not authed."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None, None
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = verify_access_token(token)
        return payload.get("sub"), payload.get("tenant_id")
    except Exception:
        return None, None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Always serve the request first
        try:
            response: Response = await call_next(request)
        except Exception:
            raise

        try:
            method = request.method
            path = request.url.path
            if _should_skip(method, path):
                return response

            user_id, tenant_id = _user_from_request(request)
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent")

            payload: dict[str, Any] = {
                "method": method,
                "path": path,
                "status": response.status_code,
            }
            # Capture target ids that are useful to the admin audit table
            for k, v in request.path_params.items():
                payload[k] = str(v)
            # Only log a one-line summary of the query string (no body, to avoid
            # PII leaks and large payloads in the audit table)
            if request.url.query:
                payload["query"] = request.url.query[:300]

            await log_event(
                tenant_id=tenant_id,
                user_id=user_id,
                action=_path_to_action(method, path),
                payload=payload,
                ip=ip,
                user_agent=ua[:200] if ua else None,
            )
        except Exception:
            # Audit must never break the request lifecycle
            pass

        return response
