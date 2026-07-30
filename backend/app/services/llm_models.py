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
MODEL_CATALOGUE: list[dict[str, Any]] = [
    # Anthropic
    {"id": "anthropic/claude-opus-4.1", "label": "Claude Opus 4.1", "provider": "Anthropic",
     "hint": "Deepest reasoning, best for premium reports", "default": True},
    {"id": "anthropic/claude-sonnet-4.5", "label": "Claude Sonnet 4.5", "provider": "Anthropic",
     "hint": "Fast, excellent quality"},
    {"id": "anthropic/claude-opus-4", "label": "Claude Opus 4", "provider": "Anthropic",
     "hint": "Premium reasoning"},
    {"id": "anthropic/claude-3.7-sonnet", "label": "Claude 3.7 Sonnet", "provider": "Anthropic",
     "hint": "Balanced, reliable"},
    {"id": "anthropic/claude-3.5-haiku", "label": "Claude 3.5 Haiku", "provider": "Anthropic",
     "hint": "Fastest, low cost"},
    # OpenAI
    {"id": "openai/gpt-5.1", "label": "GPT-5.1", "provider": "OpenAI",
     "hint": "Strong all-round reasoning"},
    {"id": "openai/gpt-5", "label": "GPT-5", "provider": "OpenAI",
     "hint": "Flagship reasoning"},
    {"id": "openai/gpt-4.1", "label": "GPT-4.1", "provider": "OpenAI",
     "hint": "Capable, long context"},
    {"id": "openai/gpt-4o", "label": "GPT-4o", "provider": "OpenAI",
     "hint": "Fast and capable"},
    {"id": "openai/o3", "label": "OpenAI o3", "provider": "OpenAI",
     "hint": "Deep step-by-step reasoning"},
    {"id": "openai/o4-mini", "label": "OpenAI o4-mini", "provider": "OpenAI",
     "hint": "Fast reasoning, low cost"},
    # Google
    {"id": "google/gemini-2.5-pro", "label": "Gemini 2.5 Pro", "provider": "Google",
     "hint": "Long-context analysis"},
    {"id": "google/gemini-2.5-flash", "label": "Gemini 2.5 Flash", "provider": "Google",
     "hint": "Very fast, low cost"},
    {"id": "google/gemini-2.0-flash-001", "label": "Gemini 2.0 Flash", "provider": "Google",
     "hint": "Fast general use"},
    # xAI
    {"id": "x-ai/grok-4", "label": "Grok 4", "provider": "xAI",
     "hint": "Strong reasoning alternative"},
    {"id": "x-ai/grok-3", "label": "Grok 3", "provider": "xAI",
     "hint": "Capable general model"},
    # DeepSeek
    {"id": "deepseek/deepseek-r1", "label": "DeepSeek R1", "provider": "DeepSeek",
     "hint": "Cost-effective deep reasoning"},
    {"id": "deepseek/deepseek-chat-v3.1", "label": "DeepSeek V3.1", "provider": "DeepSeek",
     "hint": "Fast, very low cost"},
    # Meta / Mistral / Qwen
    {"id": "meta-llama/llama-3.3-70b-instruct", "label": "Llama 3.3 70B", "provider": "Meta",
     "hint": "Open-weight, solid quality"},
    {"id": "mistralai/mistral-large-2411", "label": "Mistral Large", "provider": "Mistral",
     "hint": "Strong European model"},
    {"id": "qwen/qwen-2.5-72b-instruct", "label": "Qwen 2.5 72B", "provider": "Qwen",
     "hint": "Capable, multilingual"},
]

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
