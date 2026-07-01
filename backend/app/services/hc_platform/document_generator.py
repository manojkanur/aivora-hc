"""Document generation pipeline.

Builds the Intermediate Representation (IR) from a `document_template_versions`
row + a `context_payload`, applies any existing section overrides, and persists
a new `generated_documents` row. Renderer-agnostic — downstream formats are
handled by `export_runner` + `app/services/export_service_v2.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
)
from app.models.hc_platform.frameworks import Framework
from app.services.hc_platform import document_registry


def _resolve_path(payload: dict[str, Any], dotted: str) -> Any:
    """Walk `a.b.c` against the context payload; returns None when missing."""
    cur: Any = payload
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _render_block(block: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Resolve `{from: 'path.to.value'}` blocks against the payload.

    Anything else passes through unchanged so authored prose / literal blocks
    survive composition.
    """
    if not isinstance(block, dict):
        return {"text": str(block)}
    out: dict[str, Any] = {}
    for k, v in block.items():
        if isinstance(v, dict) and "from" in v and isinstance(v["from"], str):
            resolved = _resolve_path(payload, v["from"])
            out[k] = resolved if resolved is not None else v.get("default")
        else:
            out[k] = v
    return out


def _render_section(
    section: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    rendered_blocks: list[dict[str, Any]] = []
    for block in section.get("blocks", []) or []:
        rendered_blocks.append(_render_block(block, payload))
    return {
        "id": section.get("id"),
        "title": section.get("title"),
        "type": section.get("type", "prose"),
        "layout_hint": section.get("layout_hint"),
        "prompt_key": section.get("prompt_key"),
        "blocks": rendered_blocks,
    }


def _build_ir(
    template: DocumentTemplate,
    version: DocumentTemplateVersion,
    payload: dict[str, Any],
) -> dict[str, Any]:
    raw_sections = (version.sections or {}).get("sections", []) if isinstance(
        version.sections, dict
    ) else (version.sections or [])
    sections = [_render_section(s, payload) for s in raw_sections]
    return {
        "template_id": template.id,
        "template_version": version.version,
        "document_type_key": template.document_type_key,
        "name": template.name,
        "sections": sections,
        "metadata": {
            "schema_version": "doc-ir/v1",
            "rendered_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def _apply_overrides(
    ir: dict[str, Any],
    overrides: list[GeneratedDocumentSectionOverride],
) -> dict[str, Any]:
    """Replace `blocks` (or merge content dict) for any section that has an override."""
    if not overrides:
        return ir
    by_section: dict[str, dict[str, Any]] = {
        o.section_id: (o.content or {}) for o in overrides
    }
    for section in ir.get("sections", []):
        sec_id = section.get("id")
        if sec_id and sec_id in by_section:
            override_content = by_section[sec_id]
            if isinstance(override_content, dict):
                section.update(override_content)
                section["overridden"] = True
    return ir


async def _next_version(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    template_id: str,
) -> int:
    stmt = (
        select(GeneratedDocument.version)
        .where(GeneratedDocument.tenant_id == tenant_id)
        .where(GeneratedDocument.template_id == template_id)
        .order_by(desc(GeneratedDocument.version))
        .limit(1)
    )
    latest = (await db.execute(stmt)).scalar_one_or_none()
    return (latest or 0) + 1


async def _framework_snapshot(
    db: AsyncSession,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    """If the payload references a framework_id, snapshot it for reproducibility."""
    framework_id = payload.get("framework_id")
    if not framework_id:
        return None
    try:
        fid = uuid.UUID(str(framework_id))
    except (ValueError, TypeError):
        return None
    framework = await db.get(Framework, fid)
    if framework is None:
        return None
    return {
        "id": str(framework.id),
        "name": framework.name,
        "framework_type": framework.framework_type,
        "status": framework.status,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


async def generate(
    db: AsyncSession,
    *,
    template_id: str,
    tenant_id: uuid.UUID,
    context_payload: dict[str, Any],
    hc_review_id: uuid.UUID | None = None,
    name: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
) -> GeneratedDocument:
    """Render a `generated_documents` row from the latest template version."""
    template = await document_registry.get_template(db, template_id)
    version = await document_registry.get_latest_version(db, template_id)
    ir = _build_ir(template, version, context_payload)

    # Preserve section overrides from prior generations of the same template
    # within this tenant (keeps a consultant's manual edits sticky on regen).
    prior_doc_stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == tenant_id)
        .where(GeneratedDocument.template_id == template_id)
        .order_by(desc(GeneratedDocument.created_at))
        .limit(1)
    )
    prior_doc = (await db.execute(prior_doc_stmt)).scalar_one_or_none()
    if prior_doc is not None:
        ov_stmt = select(GeneratedDocumentSectionOverride).where(
            GeneratedDocumentSectionOverride.document_id == prior_doc.id
        )
        overrides = list((await db.execute(ov_stmt)).scalars().all())
        ir = _apply_overrides(ir, overrides)

    framework_snapshot = await _framework_snapshot(db, context_payload)
    next_version = await _next_version(db, tenant_id, template_id)

    document = GeneratedDocument(
        tenant_id=tenant_id,
        template_id=template_id,
        document_type_key=template.document_type_key,
        name=name or template.name,
        status="draft",
        ir_snapshot=ir,
        context_payload=context_payload,
        framework_snapshot=framework_snapshot,
        ai_provider="noop",
        ai_provenance={
            "generator": "document_engine.rule_based",
            "template_version": version.version,
        },
        version=next_version,
        created_by=created_by_user_id,
        meta={"hc_review_id": str(hc_review_id) if hc_review_id else None},
    )
    db.add(document)
    await db.flush()
    return document
