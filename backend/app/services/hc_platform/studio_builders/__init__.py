"""Studio output builders — dispatcher.

Each builder is an async function with the signature::

    async def build(
        db: AsyncSession,
        tenant_id: UUID,
        brief: dict | None,
        params: dict | None,
    ) -> dict

and returns a JSON-serializable ``StudioOutputDocument``::

    {
        "studio_id": str,
        "title": str,
        "subtitle": str,
        "sections": [
            {"id": str, "title": str, "layout": str, "data": Any, "footnote": str?}
        ],
        "meta": dict,
    }

The dispatcher ``run_studio`` resolves a ``studio_id`` to the right builder and
invokes it. Studios not yet implemented raise ``KeyError`` so the API layer can
return a 404.

Builders are registered lazily (best-effort imports) so adding a partial set of
builders never breaks module import if one builder happens to be in flux.
"""

from __future__ import annotations

import importlib
import logging
import uuid
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


Builder = Callable[
    [AsyncSession, uuid.UUID, dict[str, Any] | None, dict[str, Any] | None],
    Awaitable[dict[str, Any]],
]


# (module_name, [studio_id aliases...]) — first alias is the canonical id.
_REGISTRY: list[tuple[str, list[str]]] = [
    # Newly implemented in this batch.
    ("infographic", ["infographic"]),
    ("brand", ["brand", "brand-workspace"]),
    ("doc_engine", ["doc-engine", "doc_engine", "document-engine"]),
    # Other studios — registered if/when their module + build() exists.
    ("benchmarking", ["benchmarking", "benchmark"]),
    ("business_plan", ["business-plan", "business_plan"]),
    ("capability", ["capability"]),
    ("deck_gen", ["deck-gen", "deck_gen"]),
    ("early_career", ["early-career", "early_career"]),
    ("employee_exp", ["employee-exp", "employee_exp", "employee-experience"]),
    ("hc_strategy", ["hc-strategy", "hc_strategy"]),
    ("hipo", ["hipo"]),
    ("leadership_dev", ["leadership-dev", "leadership_dev"]),
    ("learning", ["learning"]),
    ("maturity", ["maturity"]),
    ("mobility", ["mobility"]),
    ("org_design", ["org-design", "org_design", "organization-design"]),
    ("org_dev", ["org-dev", "org_dev"]),
    ("performance", ["performance"]),
    ("playbook", ["playbook"]),
    ("process_excellence", ["process-excellence", "process_excellence", "process-exc"]),
    ("skills_dev", ["skills-dev", "skills_dev"]),
    ("succession", ["succession"]),
    ("total_rewards", ["total-rewards", "total_rewards"]),
    ("workforce", ["workforce"]),
]


def _load_builders() -> dict[str, Builder]:
    out: dict[str, Builder] = {}
    for module_name, aliases in _REGISTRY:
        try:
            mod = importlib.import_module(
                f"app.services.hc_platform.studio_builders.{module_name}"
            )
        except Exception as exc:  # noqa: BLE001 — keep dispatcher resilient
            log.warning(
                "studio_builders: skipping %s - import failed: %s", module_name, exc
            )
            continue
        builder = getattr(mod, "build", None)
        if builder is None or not callable(builder):
            log.warning(
                "studio_builders: %s has no callable build() - skipping", module_name
            )
            continue
        for alias in aliases:
            out[alias] = builder
    return out


BUILDERS: dict[str, Builder] = _load_builders()


async def run_studio(
    studio_id: str,
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dispatch to the builder registered for ``studio_id``."""
    builder = BUILDERS.get(studio_id)
    if builder is None:
        raise KeyError(
            f"No studio builder registered for studio_id={studio_id!r}. "
            f"Available: {sorted(BUILDERS)}"
        )
    return await builder(db, tenant_id, brief, params)


__all__ = ["BUILDERS", "Builder", "run_studio"]
