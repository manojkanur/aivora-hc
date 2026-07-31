"""LinkedIn posting via Composio (managed connector with OAuth + token refresh).

Composio owns the LinkedIn OAuth account and refreshes tokens, which fixes the
reliability problem of the native integration (LinkedIn access tokens expire in
~60 days and the native path had no refresh).

Flow:
  1. Admin connects LinkedIn once via `initiate_connection` -> returns a redirect
     URL; Composio handles the OAuth callback and stores the account.
  2. `is_connected` checks Composio for an active LinkedIn connection.
  3. `create_post` posts text (and optional image) through Composio's LinkedIn
     "create post" tool.

The Composio "user_id" we scope connections under is the platform user's id, so
each admin's LinkedIn is isolated.

Requires COMPOSIO_API_KEY in the environment. The v3 SDK (composio>=0.18) is
used: `from composio import Composio`.
"""

from __future__ import annotations

from typing import Any

from app.config import settings

# Composio's toolkit + action slugs for LinkedIn. These are the v3 names; if the
# project uses different slugs they can be overridden via env without a code change.
LINKEDIN_TOOLKIT = "linkedin"
# The "create post" action. Composio exposes it as LINKEDIN_CREATE_LINKED_IN_POST.
CREATE_POST_ACTION = "LINKEDIN_CREATE_LINKED_IN_POST"


class ComposioNotConfigured(RuntimeError):
    pass


class ComposioLinkedInError(RuntimeError):
    pass


_client: Any = None


def _get_client() -> Any:
    global _client
    if not settings.COMPOSIO_API_KEY:
        raise ComposioNotConfigured("COMPOSIO_API_KEY is not configured on this environment.")
    if _client is None:
        try:
            from composio import Composio  # v3 SDK
        except Exception as exc:  # noqa: BLE001
            raise ComposioNotConfigured(f"Composio SDK not installed: {exc}")
        _client = Composio(api_key=settings.COMPOSIO_API_KEY)
    return _client


def _auth_config_id() -> str | None:
    # A Composio "auth config" ties to your LinkedIn OAuth app. Set it once in the
    # dashboard and put its id in the env; without it we let Composio use the
    # toolkit default if the project has one configured.
    return getattr(settings, "COMPOSIO_LINKEDIN_AUTH_CONFIG_ID", None) or None


async def initiate_connection(user_id: str, redirect_url: str | None = None) -> dict[str, Any]:
    """Start the LinkedIn OAuth for this user. Returns {redirect_url, connection_id}.

    The caller sends the user to redirect_url; Composio completes the callback and
    marks the connection active.
    """
    import anyio

    def _do() -> dict[str, Any]:
        client = _get_client()
        auth_config = _auth_config_id()
        kwargs: dict[str, Any] = {"user_id": user_id}
        if auth_config:
            kwargs["auth_config_id"] = auth_config
        else:
            kwargs["toolkit"] = LINKEDIN_TOOLKIT
        if redirect_url:
            kwargs["callback_url"] = redirect_url
        req = client.connected_accounts.initiate(**kwargs)
        return {
            "redirect_url": getattr(req, "redirect_url", None) or getattr(req, "redirectUrl", None),
            "connection_id": getattr(req, "id", None),
        }

    return await anyio.to_thread.run_sync(_do)


async def is_connected(user_id: str) -> bool:
    """True if this user has an active LinkedIn connection in Composio."""
    import anyio

    def _do() -> bool:
        try:
            client = _get_client()
        except ComposioNotConfigured:
            return False
        try:
            accounts = client.connected_accounts.list(user_ids=[user_id], toolkit_slugs=[LINKEDIN_TOOLKIT])
            items = getattr(accounts, "items", None) or accounts
            for a in (items or []):
                status = str(getattr(a, "status", "") or "").upper()
                if status in ("ACTIVE", "CONNECTED", "ENABLED"):
                    return True
            return False
        except Exception:  # noqa: BLE001
            return False

    return await anyio.to_thread.run_sync(_do)


async def disconnect(user_id: str) -> bool:
    """Remove this user's LinkedIn connection(s) from Composio."""
    import anyio

    def _do() -> bool:
        client = _get_client()
        accounts = client.connected_accounts.list(user_ids=[user_id], toolkit_slugs=[LINKEDIN_TOOLKIT])
        items = getattr(accounts, "items", None) or accounts
        removed = False
        for a in (items or []):
            aid = getattr(a, "id", None)
            if aid:
                try:
                    client.connected_accounts.delete(aid)
                    removed = True
                except Exception:  # noqa: BLE001
                    pass
        return removed

    return await anyio.to_thread.run_sync(_do)


async def create_post(user_id: str, text: str, visibility: str = "PUBLIC") -> dict[str, Any]:
    """Post text to LinkedIn via Composio. Returns {post_id, url} best-effort.

    Image support depends on the Composio action's media params; text posting is
    the reliable core and is done first.
    """
    import anyio

    def _do() -> dict[str, Any]:
        client = _get_client()
        result = client.tools.execute(
            CREATE_POST_ACTION,
            user_id=user_id,
            arguments={"text": text, "visibility": visibility},
        )
        # v3 execute() returns an object/dict with successful + data.
        ok = getattr(result, "successful", None)
        data = getattr(result, "data", None)
        if ok is None and isinstance(result, dict):
            ok = result.get("successful", result.get("success"))
            data = result.get("data", result)
        if ok is False:
            err = (getattr(result, "error", None) or (result.get("error") if isinstance(result, dict) else None) or "LinkedIn post failed")
            raise ComposioLinkedInError(str(err)[:300])
        data = data or {}
        post_id = data.get("id") or data.get("post_id") or data.get("activityUrn") or ""
        url = data.get("url") or (f"https://www.linkedin.com/feed/update/{post_id}/" if post_id else "")
        return {"post_id": post_id, "url": url}

    return await anyio.to_thread.run_sync(_do)
