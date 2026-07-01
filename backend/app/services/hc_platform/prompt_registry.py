"""AI prompt template registry.

Loads `ai_prompt_templates` rows by key (+ optional version) and renders the
system + user messages by substituting `{{var}}` placeholders against a context
dict. The five canonical insight types follow Phase 4 of the port plan:
  * executive_summary
  * key_findings
  * risk_assessment
  * recommendations
  * industry_context
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import AiPromptTemplate


class ChatMessage(TypedDict):
    role: str
    content: str


_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def _lookup(context: dict[str, Any], dotted: str) -> Any:
    """Resolve `a.b.c` against a nested dict. Returns "" on miss."""
    cur: Any = context
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return ""
    return cur


def _substitute(text: str | None, context: dict[str, Any]) -> str:
    if not text:
        return ""

    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        value = _lookup(context, key)
        if isinstance(value, (dict, list)):
            import json

            return json.dumps(value, sort_keys=True, default=str)
        return str(value)

    return _PLACEHOLDER_RE.sub(repl, text)


class PromptRegistry:
    """Registry of versioned prompt templates stored in `ai_prompt_templates`."""

    @staticmethod
    async def get(
        db: AsyncSession,
        key: str,
        version: int | None = None,
    ) -> AiPromptTemplate:
        """Fetch a template by key (+ optional version).

        If `version` is None: return the highest-version active row for `key`.
        Raises `LookupError` if no row matches.
        """
        stmt = select(AiPromptTemplate).where(AiPromptTemplate.key == key)
        if version is not None:
            stmt = stmt.where(AiPromptTemplate.version == version)
        else:
            stmt = stmt.where(AiPromptTemplate.is_active.is_(True))
        stmt = stmt.order_by(AiPromptTemplate.version.desc()).limit(1)
        result = await db.execute(stmt)
        tpl = result.scalar_one_or_none()
        if tpl is None:
            raise LookupError(
                f"AiPromptTemplate not found: key={key!r} version={version!r}"
            )
        return tpl

    @staticmethod
    async def list_active(db: AsyncSession) -> list[AiPromptTemplate]:
        stmt = (
            select(AiPromptTemplate)
            .where(AiPromptTemplate.is_active.is_(True))
            .order_by(AiPromptTemplate.key, AiPromptTemplate.version.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def render(
        template: AiPromptTemplate,
        context: dict[str, Any],
    ) -> list[ChatMessage]:
        """Substitute `{{var}}` placeholders and produce the messages list."""
        system_content = _substitute(template.system_prompt, context)
        user_content = _substitute(template.user_prompt_template, context)
        messages: list[ChatMessage] = []
        if system_content:
            messages.append({"role": "system", "content": system_content})
        messages.append({"role": "user", "content": user_content})
        return messages
