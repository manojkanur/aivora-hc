"""Multi-provider LLM model catalogue + client resolution.

Report/advisory generation can run on any model in the curated catalogue below.
Models whose id contains a "/" (e.g. "anthropic/claude-opus-4.1") are OpenRouter
models and are called through the OpenRouter endpoint (OpenAI-API compatible).
Bare ids (e.g. "gpt-5.1") stay on the direct OpenAI client so web-search and
image generation - which are OpenAI-specific - are unaffected.
"""

from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI

from app.config import settings

# ── Curated model catalogue (shown in the chat model picker) ─────────────────
# Keep this a tight, high-quality set. `id` is what we send to the provider;
# OpenRouter ids are "provider/model". `default` marks the pre-selected option.
# Curated "featured" flagships. These ids are the DEFAULT / preferred picks and
# are verified live against OpenRouter; the endpoint also surfaces the rest of
# the live catalogue so the list stays current automatically as new models ship.
# Slugs verified against OpenRouter /models on 2026-07-31.
MODEL_CATALOGUE: list[dict[str, Any]] = [
    # Anthropic
    {"id": "anthropic/claude-opus-4.8", "label": "Claude Opus 4.8", "provider": "Anthropic",
     "hint": "Deepest reasoning, best for premium reports", "default": True},
    {"id": "anthropic/claude-opus-5", "label": "Claude Opus 5", "provider": "Anthropic",
     "hint": "Newest flagship reasoning"},
    {"id": "anthropic/claude-sonnet-5", "label": "Claude Sonnet 5", "provider": "Anthropic",
     "hint": "Fast, excellent quality"},
    # OpenAI
    {"id": "openai/gpt-5.6-sol-pro", "label": "GPT-5.6 Sol Pro", "provider": "OpenAI",
     "hint": "Newest flagship reasoning"},
    {"id": "openai/gpt-5.6-sol", "label": "GPT-5.6 Sol", "provider": "OpenAI",
     "hint": "Strong all-round reasoning"},
    {"id": "openai/gpt-5.5", "label": "GPT-5.5", "provider": "OpenAI",
     "hint": "Capable, fast"},
    # Google
    {"id": "google/gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro", "provider": "Google",
     "hint": "Long-context deep analysis"},
    {"id": "google/gemini-3.6-flash", "label": "Gemini 3.6 Flash", "provider": "Google",
     "hint": "Very fast, low cost"},
    # xAI
    {"id": "x-ai/grok-4.5", "label": "Grok 4.5", "provider": "xAI",
     "hint": "Strong reasoning alternative"},
    # DeepSeek
    {"id": "deepseek/deepseek-v4-pro", "label": "DeepSeek V4 Pro", "provider": "DeepSeek",
     "hint": "Cost-effective deep reasoning"},
    # Meta / Mistral / Qwen
    {"id": "meta-llama/llama-4-maverick", "label": "Llama 4 Maverick", "provider": "Meta",
     "hint": "Open-weight flagship"},
    {"id": "mistralai/mistral-medium-3-5", "label": "Mistral Medium 3.5", "provider": "Mistral",
     "hint": "Strong European model"},
    {"id": "qwen/qwen3.7-max", "label": "Qwen 3.7 Max", "provider": "Qwen",
     "hint": "Capable, multilingual"},
]

# Report/advisory generation falls back through these (fast + reliable on
# OpenRouter) when the user's chosen model errors or times out, so "generate
# report" never fails on a flaky pick. Order = try order.
RELIABLE_FALLBACKS = [
    "anthropic/claude-opus-4.8",
    "openai/gpt-4o",
    "google/gemini-3.6-flash",
    "anthropic/claude-sonnet-5",
]

# Providers we surface from the live OpenRouter catalogue (in this order).
_FEATURED_PROVIDERS = ["anthropic", "openai", "google", "x-ai", "deepseek", "meta-llama", "mistralai", "qwen"]
_PROVIDER_LABEL = {
    "anthropic": "Anthropic", "openai": "OpenAI", "google": "Google", "x-ai": "xAI",
    "deepseek": "DeepSeek", "meta-llama": "Meta", "mistralai": "Mistral", "qwen": "Qwen",
}

# Live catalogue cache (fetched from OpenRouter, refreshed hourly per worker).
_LIVE_CACHE: dict[str, Any] = {"at": 0.0, "models": None}
_LIVE_TTL = 3600.0


def _pretty_label(model_id: str, name: str | None) -> str:
    """A clean display label from an OpenRouter id/name."""
    if name:
        # OpenRouter names look like "Anthropic: Claude Opus 4.8" - drop the vendor prefix.
        return name.split(":", 1)[-1].strip()
    slug = model_id.split("/", 1)[-1]
    return slug.replace("-", " ").title()


async def _fetch_live_models() -> list[dict[str, Any]] | None:
    """Pull the current model list from OpenRouter, filtered to featured providers.

    Excludes non-text variants (image/audio/video/embedding/:free/:batch, etc.).
    Returns None on any failure so callers fall back to MODEL_CATALOGUE.
    """
    import time

    now = time.monotonic()
    if _LIVE_CACHE["models"] is not None and now - _LIVE_CACHE["at"] < _LIVE_TTL:
        return _LIVE_CACHE["models"]
    if not settings.OPENROUTER_API_KEY:
        return None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{settings.OPENROUTER_BASE_URL}/models",
                headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
    except Exception:  # noqa: BLE001 - never let a fetch failure break the picker
        return None

    def _is_text_model(m: dict[str, Any]) -> bool:
        mid = m.get("id", "")
        if any(x in mid for x in (":free", ":batch", "-image", "-audio", "-tts", "clip", "lyria", "embed", "customtools")):
            return False
        arch = m.get("architecture") or {}
        mods = arch.get("output_modalities") or arch.get("modality") or ""
        if isinstance(mods, list):
            return "text" in mods and "image" not in mods
        return "image" not in str(mods)

    by_provider: dict[str, list[dict[str, Any]]] = {}
    for m in data:
        mid = m.get("id", "")
        prov = mid.split("/", 1)[0]
        if prov not in _FEATURED_PROVIDERS or not _is_text_model(m):
            continue
        by_provider.setdefault(prov, []).append(m)

    out: list[dict[str, Any]] = []
    for prov in _FEATURED_PROVIDERS:
        items = by_provider.get(prov, [])
        items.sort(key=lambda x: x.get("created", 0), reverse=True)
        for m in items[:8]:  # top 8 newest per provider keeps the list rich but sane
            out.append({
                "id": m["id"],
                "label": _pretty_label(m["id"], m.get("name")),
                "provider": _PROVIDER_LABEL.get(prov, prov.title()),
                "hint": (m.get("description") or "")[:80] or None,
            })
    if not out:
        return None
    # Mark the curated default (Claude Opus 4.8) if present, else the first item.
    default_id = default_model_id()
    ids = {x["id"] for x in out}
    if default_id in ids:
        for x in out:
            if x["id"] == default_id:
                x["default"] = True
    else:
        out[0]["default"] = True
    _LIVE_CACHE["models"] = out
    _LIVE_CACHE["at"] = now
    return out


async def get_model_catalogue() -> list[dict[str, Any]]:
    """The live OpenRouter catalogue when reachable, else the curated fallback."""
    live = await _fetch_live_models()
    return live if live else MODEL_CATALOGUE

# Depth tiers surfaced in the chat (shown in the tier dropdown).
TIER_CATALOGUE: list[dict[str, str]] = [
    {"id": "basic", "label": "Basic", "hint": "Fast, lean output"},
    {"id": "thinking", "label": "Thinking", "hint": "Balanced default"},
    {"id": "expert", "label": "Expert", "hint": "Partner-grade depth"},
    {"id": "deepthinking", "label": "Deep", "hint": "Most thorough, most sources"},
]

_CATALOGUE_IDS = {m["id"] for m in MODEL_CATALOGUE}


def default_model_id() -> str:
    for m in MODEL_CATALOGUE:
        if m.get("default"):
            return m["id"]
    return MODEL_CATALOGUE[0]["id"]


def is_openrouter_model(model: str | None) -> bool:
    """OpenRouter ids are namespaced 'provider/model'; bare ids are direct OpenAI."""
    return bool(model) and "/" in model


def resolve_model(model: str | None) -> str:
    """Fall back to the catalogue default when the requested model is unknown/empty."""
    if model and (model in _CATALOGUE_IDS or is_openrouter_model(model)):
        return model
    return default_model_id()


_openrouter_client: AsyncOpenAI | None = None


def get_llm_client(model: str | None) -> AsyncOpenAI:
    """The right async client for a model id.

    OpenRouter models -> OpenRouter endpoint (needs OPENROUTER_API_KEY).
    Bare OpenAI ids   -> the direct OpenAI client (import kept local to avoid a
                         circular import with ai_orchestrator).
    """
    global _openrouter_client
    if is_openrouter_model(model):
        if not settings.OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not configured on this environment.")
        if _openrouter_client is None:
            _openrouter_client = AsyncOpenAI(
                api_key=settings.OPENROUTER_API_KEY,
                base_url=settings.OPENROUTER_BASE_URL,
                default_headers={
                    # Optional attribution headers OpenRouter recommends.
                    "HTTP-Referer": "https://srv1272089.hstgr.cloud",
                    "X-Title": "Aivora HC",
                },
            )
        return _openrouter_client
    from app.services.ai_orchestrator import _get_client

    return _get_client()


def is_reasoning_model(model: str | None) -> bool:
    """Reasoning families take max_completion_tokens and reject temperature.

    Covers OpenAI o-series / gpt-5 and their OpenRouter-namespaced equivalents.
    """
    m = (model or "").lower()
    return (
        m.startswith(("o1", "o3", "o4", "gpt-5"))
        or "gpt-5" in m
        or m.endswith(("-r1", "/deepseek-r1"))
    )


def completion_params_for(
    model: str | None,
    *,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    """Sampling params by model family.

    OpenRouter normalises most params, so for OpenRouter models we pass the
    standard temperature + max_tokens (which OpenRouter maps per underlying
    model). Direct OpenAI reasoning models need the max_completion_tokens shape.
    """
    if not is_openrouter_model(model) and is_reasoning_model(model):
        return {"max_completion_tokens": max_tokens + 4000}
    return {"temperature": temperature, "max_tokens": max_tokens}
