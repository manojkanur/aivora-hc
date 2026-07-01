"""Document Engine output builder.

Renders a document authoring cockpit — a 6-section infographic dashboard that
turns abstract "export a document" into a live, template-driven workspace.

Sections:
  1. Template Binding & Document Header — kpi_grid
  2. Section Completion Map             — swimlane
  3. Data Provenance Matrix             — comparison_table
  4. Version History & Change Delta     — timeline
  5. Export Readiness Scorecard         — horizontal_bar_chart
  6. Export Ledger                      — ranked_list

All data is deterministic — assembled from document_templates,
document_template_versions, generated_documents, generated_document_section_overrides,
document_export_profiles, module_document_bindings, hc_platform_exports,
ai_generated_insights, maturity_assessments, benchmark_comparisons,
recommendation_library, activity_log.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import AiGeneratedInsight
from app.models.hc_platform.benchmarks import BenchmarkComparison
from app.models.hc_platform.document_engine import (
    DocumentCategory,
    DocumentExportProfile,
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
    ModuleDocumentBinding,
)
from app.models.hc_platform.exports import HcExport
from app.models.hc_platform.maturity import MaturityAssessment
from app.models.hc_platform.recommendations import RecommendationLibrary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _pick_document(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    params: dict[str, Any],
) -> GeneratedDocument | None:
    """Resolve which generated document the cockpit is about.

    Resolution order:
      1. explicit generated_document_id in params
      2. most recent generated_documents row for tenant
    """
    explicit = params.get("generated_document_id")
    if explicit:
        try:
            doc_id = uuid.UUID(str(explicit))
        except (TypeError, ValueError):
            doc_id = None
        if doc_id is not None:
            doc = await db.get(GeneratedDocument, doc_id)
            if doc is not None and doc.tenant_id == tenant_id:
                return doc

    stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == tenant_id)
        .order_by(desc(GeneratedDocument.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolve_template_version(
    db: AsyncSession, doc: GeneratedDocument | None
) -> tuple[DocumentTemplate | None, DocumentTemplateVersion | None]:
    if doc is None or doc.template_id is None:
        # Fall back to most recent template + its latest version.
        tpl = (
            await db.execute(select(DocumentTemplate).limit(1))
        ).scalar_one_or_none()
        if tpl is None:
            return None, None
        ver = (
            await db.execute(
                select(DocumentTemplateVersion)
                .where(DocumentTemplateVersion.template_id == tpl.id)
                .order_by(desc(DocumentTemplateVersion.version))
                .limit(1)
            )
        ).scalar_one_or_none()
        return tpl, ver

    tpl = await db.get(DocumentTemplate, doc.template_id)
    # Version: prefer doc.meta.template_version_id, else latest.
    target_ver_id: uuid.UUID | None = None
    meta = doc.meta or {}
    if meta.get("template_version_id"):
        try:
            target_ver_id = uuid.UUID(str(meta["template_version_id"]))
        except (TypeError, ValueError):
            target_ver_id = None
    ver: DocumentTemplateVersion | None = None
    if target_ver_id is not None:
        ver = await db.get(DocumentTemplateVersion, target_ver_id)
    if ver is None and tpl is not None:
        ver = (
            await db.execute(
                select(DocumentTemplateVersion)
                .where(DocumentTemplateVersion.template_id == tpl.id)
                .order_by(desc(DocumentTemplateVersion.version))
                .limit(1)
            )
        ).scalar_one_or_none()
    return tpl, ver


def _extract_sections(version: DocumentTemplateVersion | None) -> list[dict[str, Any]]:
    """Pull a normalized list of {section_key, title, order, source_engine?} out
    of a DocumentTemplateVersion.sections JSONB column."""
    if version is None or version.sections is None:
        return []
    raw = version.sections
    sections_list: list[dict[str, Any]] = []
    if isinstance(raw, list):
        sections_list = raw
    elif isinstance(raw, dict):
        if isinstance(raw.get("sections"), list):
            sections_list = raw["sections"]
        else:
            # treat dict keys as section keys
            for idx, (k, v) in enumerate(raw.items()):
                if isinstance(v, dict):
                    v = {**v, "section_key": v.get("section_key", k)}
                    sections_list.append(v)
                else:
                    sections_list.append({"section_key": k, "title": str(v)})

    out: list[dict[str, Any]] = []
    for idx, s in enumerate(sections_list):
        if not isinstance(s, dict):
            continue
        out.append(
            {
                "section_key": s.get("section_key") or s.get("key") or f"section_{idx + 1}",
                "title": s.get("title") or s.get("label") or s.get("name") or f"Section {idx + 1}",
                "order": s.get("order", idx + 1),
                "source_engine": s.get("source_engine") or s.get("engine"),
                "source_table": s.get("source_table"),
                "source_route": s.get("source_route"),
                "required": bool(s.get("required", False)),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


async def _build_header(
    db: AsyncSession,
    doc: GeneratedDocument | None,
    template: DocumentTemplate | None,
    version: DocumentTemplateVersion | None,
    overrides: list[GeneratedDocumentSectionOverride],
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    binding_module_key: str | None = None
    if template is not None:
        binding = (
            await db.execute(
                select(ModuleDocumentBinding)
                .where(ModuleDocumentBinding.template_id == template.id)
                .order_by(desc(ModuleDocumentBinding.is_default))
                .limit(1)
            )
        ).scalar_one_or_none()
        if binding is not None:
            binding_module_key = binding.module_key

    category_label: str | None = None
    if doc is not None and doc.category_id is not None:
        cat = await db.get(DocumentCategory, doc.category_id)
        if cat is not None:
            category_label = cat.label

    word_count_est = 0
    for ov in overrides:
        content = ov.content or {}
        text_blob = ""
        for v in content.values() if isinstance(content, dict) else []:
            if isinstance(v, str):
                text_blob += " " + v
        word_count_est += len(text_blob.split())
    # Fallback: estimate from ir_snapshot
    if word_count_est == 0 and doc and doc.ir_snapshot:
        snap = doc.ir_snapshot
        if isinstance(snap, dict):
            blob = ""
            for v in snap.values():
                if isinstance(v, str):
                    blob += " " + v
            word_count_est = len(blob.split())

    overrides_count = len(overrides)
    sections_count = len(sections)
    auto_count = max(0, sections_count - overrides_count)

    kpis = [
        {"label": "Sections", "value": sections_count},
        {"label": "Overrides Applied", "value": overrides_count},
        {"label": "Auto-Populated", "value": auto_count},
        {"label": "Word Count", "value": word_count_est},
        {
            "label": "Last Saved",
            "value": (
                max(
                    [ov.updated_at for ov in overrides if ov.updated_at]
                    + ([doc.updated_at] if doc and doc.updated_at else [])
                    + ([datetime.now(timezone.utc)] if not overrides and not doc else [])
                ).isoformat()
                if (overrides or doc)
                else None
            ),
        },
        {"label": "Status", "value": doc.status if doc else "draft"},
    ]

    return {
        "document_id": str(doc.id) if doc else None,
        "title": doc.name if doc else "Untitled Document",
        "template": {
            "id": template.id if template else None,
            "name": template.name if template else None,
            "category": category_label or (template.meta or {}).get("category") if template else None,
            "version_label": f"v{version.version}" if version else None,
            "version_id": str(version.id) if version else None,
            "published_at": version.created_at.isoformat() if version and version.created_at else None,
        },
        "binding": {
            "module_id": binding_module_key,
            "binding_type": "primary" if binding_module_key else None,
        },
        "kpis": kpis,
    }


def _build_section_map(
    sections: list[dict[str, Any]],
    overrides: list[GeneratedDocumentSectionOverride],
) -> dict[str, Any]:
    by_section_id: dict[str, GeneratedDocumentSectionOverride] = {
        ov.section_id: ov for ov in overrides
    }
    rows: list[dict[str, Any]] = []
    for s in sections:
        ov = by_section_id.get(s["section_key"])
        if ov is not None:
            status = "edited"
        elif s.get("source_engine"):
            status = "auto"
        else:
            status = "empty"
        wc = 0
        last_by: str | None = None
        last_at: str | None = None
        if ov is not None:
            content = ov.content or {}
            for v in content.values() if isinstance(content, dict) else []:
                if isinstance(v, str):
                    wc += len(v.split())
            last_by = str(ov.edited_by) if ov.edited_by else None
            last_at = ov.updated_at.isoformat() if ov.updated_at else None

        rows.append(
            {
                "section_key": s["section_key"],
                "title": s["title"],
                "order": s["order"],
                "status": status,
                "source_engine": s.get("source_engine"),
                "word_count": wc,
                "chart_count": 1 if (s.get("source_engine") in {"maturity", "benchmark", "scenario"}) else 0,
                "has_override": ov is not None,
                "last_edited_by": last_by,
                "last_edited_at": last_at,
            }
        )
    rows.sort(key=lambda r: r["order"])
    return {"sections": rows}


async def _build_provenance(
    db: AsyncSession,
    doc: GeneratedDocument | None,
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    tenant_id = doc.tenant_id if doc else None
    review_id = None
    if doc:
        ctx = doc.context_payload or {}
        if ctx.get("review_id"):
            try:
                review_id = uuid.UUID(str(ctx["review_id"]))
            except (TypeError, ValueError):
                review_id = None

    # Pre-fetch potential sources once.
    latest_assessment: MaturityAssessment | None = None
    latest_comparison: BenchmarkComparison | None = None
    latest_insight: AiGeneratedInsight | None = None
    rec_count = 0

    if tenant_id is not None:
        if review_id is not None:
            latest_assessment = (
                await db.execute(
                    select(MaturityAssessment)
                    .where(MaturityAssessment.review_id == review_id)
                    .order_by(desc(MaturityAssessment.computed_at))
                    .limit(1)
                )
            ).scalar_one_or_none()
            latest_comparison = (
                await db.execute(
                    select(BenchmarkComparison)
                    .where(BenchmarkComparison.review_id == review_id)
                    .order_by(desc(BenchmarkComparison.computed_at))
                    .limit(1)
                )
            ).scalar_one_or_none()
            latest_insight = (
                await db.execute(
                    select(AiGeneratedInsight)
                    .where(AiGeneratedInsight.review_id == review_id)
                    .order_by(desc(AiGeneratedInsight.created_at))
                    .limit(1)
                )
            ).scalar_one_or_none()
        rec_count = (
            await db.execute(
                select(func.count()).select_from(RecommendationLibrary)
            )
        ).scalar_one() or 0

    def _freshness(ts) -> tuple[str, bool]:
        if ts is None:
            return ("unknown", True)
        delta = datetime.now(timezone.utc) - ts.replace(tzinfo=ts.tzinfo or timezone.utc)
        hours = delta.total_seconds() / 3600.0
        if hours < 24:
            return (f"{int(hours)}h ago", False)
        days = int(hours / 24)
        return (f"{days}d ago", days > 7)

    rows: list[dict[str, Any]] = []
    for s in sections:
        engine = (s.get("source_engine") or "").lower()
        row: dict[str, Any] = {
            "section": s["title"],
            "section_key": s["section_key"],
            "source_engine": s.get("source_engine") or "manual",
            "source_route": s.get("source_route"),
            "source_table": s.get("source_table"),
            "source_record_id": None,
            "freshness": "n/a",
            "is_stale": False,
        }
        if engine == "maturity" and latest_assessment is not None:
            fresh, stale = _freshness(latest_assessment.computed_at)
            row.update(
                {
                    "source_route": s.get("source_route") or "/hc-platform/maturity/assessments/{id}",
                    "source_table": "maturity_assessments",
                    "source_record_id": str(latest_assessment.id),
                    "freshness": fresh,
                    "is_stale": stale,
                }
            )
        elif engine == "benchmark" and latest_comparison is not None:
            fresh, stale = _freshness(latest_comparison.computed_at)
            row.update(
                {
                    "source_route": s.get("source_route") or "/hc-platform/benchmarks/comparisons/{id}",
                    "source_table": "benchmark_comparisons",
                    "source_record_id": str(latest_comparison.id),
                    "freshness": fresh,
                    "is_stale": stale,
                }
            )
        elif engine in {"recommendation_library", "library", "recommendations"}:
            row.update(
                {
                    "source_table": "recommendation_library",
                    "source_record_id": f"{rec_count} items",
                    "freshness": "current",
                    "is_stale": False,
                }
            )
        elif engine in {"ai_advisory", "ai", "insight"} and latest_insight is not None:
            fresh, stale = _freshness(latest_insight.created_at)
            row.update(
                {
                    "source_table": "ai_generated_insights",
                    "source_record_id": str(latest_insight.id),
                    "freshness": fresh,
                    "is_stale": stale,
                }
            )
        rows.append(row)

    return {"rows": rows}


async def _build_history(
    db: AsyncSession,
    doc: GeneratedDocument | None,
    template: DocumentTemplate | None,
    overrides: list[GeneratedDocumentSectionOverride],
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []

    if doc is not None:
        events.append(
            {
                "ts": doc.created_at.isoformat() if doc.created_at else None,
                "type": "document_created",
                "actor": str(doc.created_by) if doc.created_by else "system",
                "template_id": doc.template_id,
            }
        )
    if template is not None:
        versions = (
            await db.execute(
                select(DocumentTemplateVersion)
                .where(DocumentTemplateVersion.template_id == template.id)
                .order_by(DocumentTemplateVersion.version)
            )
        ).scalars().all()
        for v in versions:
            meta = v.meta or {}
            events.append(
                {
                    "ts": v.created_at.isoformat() if v.created_at else None,
                    "type": "template_published",
                    "version": v.version,
                    "version_id": str(v.id),
                    "changelog": meta.get("changelog") or f"Template v{v.version}",
                }
            )

    for ov in overrides:
        content = ov.content or {}
        wc = sum(
            len(v.split())
            for v in (content.values() if isinstance(content, dict) else [])
            if isinstance(v, str)
        )
        events.append(
            {
                "ts": ov.updated_at.isoformat() if ov.updated_at else None,
                "type": "override_saved",
                "actor": str(ov.edited_by) if ov.edited_by else "system",
                "section": ov.section_id,
                "delta": f"{wc} words",
            }
        )

    events.sort(key=lambda e: e["ts"] or "", reverse=True)
    return {"events": events[:25]}


async def _build_readiness(
    db: AsyncSession,
    sections: list[dict[str, Any]],
    overrides: list[GeneratedDocumentSectionOverride],
) -> dict[str, Any]:
    by_section: dict[str, GeneratedDocumentSectionOverride] = {
        ov.section_id: ov for ov in overrides
    }
    empty_required: list[str] = []
    empty_optional: list[str] = []
    edited: list[str] = []
    auto: list[str] = []
    for s in sections:
        ov = by_section.get(s["section_key"])
        if ov is not None:
            edited.append(s["title"])
        elif s.get("source_engine"):
            auto.append(s["title"])
        elif s.get("required"):
            empty_required.append(s["title"])
        else:
            empty_optional.append(s["title"])

    total = max(1, len(sections))
    completion = round(((len(edited) + len(auto)) / total) * 100, 0)

    profiles = (
        await db.execute(
            select(DocumentExportProfile).order_by(DocumentExportProfile.name)
        )
    ).scalars().all()

    rows: list[dict[str, Any]] = []
    for p in profiles:
        fmt = (p.format or "pdf").lower()
        # Use the completion% as the readiness baseline, then dock for empty required sections.
        readiness = max(0.0, completion - 5.0 * len(empty_required))
        warnings = len(empty_optional)
        notes: str | None = None
        if empty_required:
            notes = f"Empty required sections: {', '.join(empty_required[:3])}"
        rows.append(
            {
                "format": fmt.upper(),
                "profile_id": str(p.id),
                "profile_key": p.key,
                "profile_name": p.name,
                "readiness_pct": int(readiness),
                "blocking_issues": len(empty_required),
                "warnings": warnings,
                "est_pages": max(1, int((sum(1 for s in sections) * 2))),
                "notes": notes,
            }
        )

    if not rows:
        # Fallback so the bar chart still renders even without configured profiles.
        for fmt in ("DOCX", "PDF", "HTML"):
            rows.append(
                {
                    "format": fmt,
                    "profile_id": None,
                    "profile_key": fmt.lower(),
                    "profile_name": f"Default {fmt}",
                    "readiness_pct": int(completion),
                    "blocking_issues": len(empty_required),
                    "warnings": len(empty_optional),
                    "est_pages": max(1, len(sections) * 2),
                    "notes": None,
                }
            )

    return {"profiles": rows, "overall_completion_pct": int(completion)}


async def _build_export_ledger(
    db: AsyncSession,
    doc: GeneratedDocument | None,
    tenant_id: uuid.UUID,
) -> dict[str, Any]:
    stmt = (
        select(HcExport).where(HcExport.tenant_id == tenant_id)
    )
    if doc is not None:
        stmt = stmt.where(HcExport.generated_document_id == doc.id)
    stmt = stmt.order_by(desc(HcExport.created_at)).limit(20)
    rows = (await db.execute(stmt)).scalars().all()

    items: list[dict[str, Any]] = []
    fmt_counter: Counter = Counter()
    for r in rows:
        meta = r.meta or {}
        fmt = (r.format or "pdf").upper()
        fmt_counter[fmt] += 1
        items.append(
            {
                "export_id": str(r.id),
                "format": fmt,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "created_by": meta.get("actor_email") or meta.get("created_by"),
                "file_size_kb": meta.get("file_size_kb"),
                "page_count": meta.get("page_count"),
                "download_url": r.storage_path,
                "status": r.status,
                "version_snapshot": meta.get("version_snapshot"),
                "override_count_at_export": meta.get("override_count_at_export"),
            }
        )

    return {
        "exports": items,
        "total_exports": len(items),
        "by_format": dict(fmt_counter),
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict:
    params = params or {}

    doc = await _pick_document(db, tenant_id, params)
    template, version = await _resolve_template_version(db, doc)
    sections = _extract_sections(version)

    overrides: list[GeneratedDocumentSectionOverride] = []
    if doc is not None:
        overrides = list(
            (
                await db.execute(
                    select(GeneratedDocumentSectionOverride).where(
                        GeneratedDocumentSectionOverride.document_id == doc.id
                    )
                )
            ).scalars().all()
        )

    header = await _build_header(db, doc, template, version, overrides, sections)
    section_map = _build_section_map(sections, overrides)
    provenance = await _build_provenance(db, doc, sections)
    history = await _build_history(db, doc, template, overrides)
    readiness = await _build_readiness(db, sections, overrides)
    ledger = await _build_export_ledger(db, doc, tenant_id)

    out_sections = [
        {
            "id": "header",
            "title": "Template Binding & Document Header",
            "layout": "kpi_grid",
            "data": header,
            "footnote": "Template + binding metadata anchors the rest of the cockpit.",
        },
        {
            "id": "section_map",
            "title": "Section Completion Map",
            "layout": "swimlane",
            "data": section_map,
            "footnote": "Per-section status: auto (engine-populated), edited (override saved), or empty.",
        },
        {
            "id": "provenance",
            "title": "Data Provenance Matrix",
            "layout": "comparison_table",
            "data": provenance,
            "footnote": "Each section traced to its upstream engine + freshness - stale rows highlighted.",
        },
        {
            "id": "history",
            "title": "Version History & Change Delta",
            "layout": "timeline",
            "data": history,
            "footnote": "Document creation + template version publishes + override saves, newest first.",
        },
        {
            "id": "readiness",
            "title": "Export Readiness Scorecard",
            "layout": "horizontal_bar_chart",
            "data": readiness,
            "footnote": "Per-format readiness derived from section completion and empty required sections.",
        },
        {
            "id": "export_ledger",
            "title": "Export Ledger",
            "layout": "ranked_list",
            "data": ledger,
            "footnote": "All hc_platform_exports rows for this document with version snapshots.",
        },
    ]

    subtitle = (
        f"{header['title']} · {header['template'].get('name') or 'no template'}"
        if header.get("template")
        else "Document cockpit"
    )

    return {
        "studio_id": "doc-engine",
        "title": "Document Engine",
        "subtitle": subtitle,
        "sections": out_sections,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "document_id": str(doc.id) if doc else None,
            "template_id": template.id if template else None,
            "template_version_id": str(version.id) if version else None,
        },
    }
