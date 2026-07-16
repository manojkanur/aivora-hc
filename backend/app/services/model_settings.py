"""Admin-configurable LLM model selection.

The admin dashboard's LLM Config tab persists {global_model, skill_overrides}
as JSON in platform_settings under LLM_CONFIG_KEY. The AI Advisory chat and
report generators read the global model through get_global_model(), cached
per worker for a short TTL so admin changes propagate without a restart.
"""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_setting import PlatformSetting

LLM_CONFIG_KEY = "llm_config"
DEFAULT_GLOBAL_MODEL = "gpt-4o"

_CACHE_TTL_SECONDS = 30.0
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def default_llm_config() -> dict[str, Any]:
    return {"global_model": DEFAULT_GLOBAL_MODEL, "skill_overrides": {}}


async def get_llm_config(db: AsyncSession) -> dict[str, Any]:
    """The stored LLM config, or defaults if never saved."""
    row = (
        await db.execute(select(PlatformSetting).where(PlatformSetting.key == LLM_CONFIG_KEY))
    ).scalar_one_or_none()
    if row is None:
        return default_llm_config()
    try:
        data = json.loads(row.value)
    except (ValueError, TypeError):
        return default_llm_config()
    config = default_llm_config()
    if isinstance(data, dict):
        if isinstance(data.get("global_model"), str) and data["global_model"].strip():
            config["global_model"] = data["global_model"].strip()
        if isinstance(data.get("skill_overrides"), dict):
            config["skill_overrides"] = {
                str(k): str(v) for k, v in data["skill_overrides"].items() if v
            }
    return config


async def save_llm_config(db: AsyncSession, config: dict[str, Any]) -> None:
    row = (
        await db.execute(select(PlatformSetting).where(PlatformSetting.key == LLM_CONFIG_KEY))
    ).scalar_one_or_none()
    value = json.dumps(config)
    if row is None:
        db.add(PlatformSetting(key=LLM_CONFIG_KEY, value=value))
    else:
        row.value = value
    await db.flush()
    invalidate_cache()


def invalidate_cache() -> None:
    _cache.pop(LLM_CONFIG_KEY, None)


async def get_global_model(db: AsyncSession) -> str:
    """The admin-selected global model (cached ~30s per worker)."""
    cached = _cache.get(LLM_CONFIG_KEY)
    now = time.monotonic()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]["global_model"]
    config = await get_llm_config(db)
    _cache[LLM_CONFIG_KEY] = (now, config)
    return config["global_model"]


def completion_params(model: str, *, temperature: float, max_tokens: int) -> dict[str, Any]:
    """Sampling params adjusted per model family.

    Reasoning models (o-series, gpt-5 family) reject `temperature` and take
    `max_completion_tokens` instead of `max_tokens`.
    """
    if model.startswith(("o1", "o3", "o4", "gpt-5")):
        return {"max_completion_tokens": max_tokens}
    return {"temperature": temperature, "max_tokens": max_tokens}
