"""Deck Generator studio builder.

Composer/assembler only — no LLM calls. Reads generated_documents,
document_templates, document_export_profiles, module_document_bindings,
hc_platform_exports, and the engine output tables, then renders a deck
preview as an 8-section dashboard. PPTX rendering itself is handled by the
export runner.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import AiGeneratedInsight
from app.models.hc_platform.benchmarks import BenchmarkComparison
from app.models.hc_platform.document_engine import (
    DocumentExportProfile,
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
    ModuleDocumentBinding,
)
from app.models.hc_platform.exports import HcExport
from app.models.hc_platform.maturity import MaturityAssessment
from app.models.hc_platform.mobility import MobilityMatchResult
from app.models.hc_platform.roadmaps import RoadmapOutput, RoadmapPhase
from app.models.hc_platform.scenarios import ScenarioOutput
from app.services.hc_platform.studio_builders._common import (
    document,
    latest_project,
    latest_review,
    safe_float,
    section,
)


PILLARS: list[tuple[str, int]] = [
    ("Diagnostic", 6),
    ("Maturity", 7),
    ("Benchmark", 7),
    ("Scenario", 3),
    ("Roadmap", 4),
    ("Mobility", 2),
]


def _kpi_grid(
    slides_total: int,
    slides_ready: int,
    source_documents: int,
    engine_outputs_linked: int,
    export_profile_name: str,
    last_refresh: str,
    draft_doc_id: str | None,
) -> dict[str, Any]:
    return {
        "slides_ready": slides_ready,
        "slides_total": slides_total,
        "source_documents": source_documents,
        "engine_outputs_linked": engine_outputs_linked,
        "export_profile": export_profile_name,
        "estimated_pages": slides_total,
        "last_refresh": last_refresh,
        "draft_workspace_id": draft_doc_id,
    }


def _slides_from_template(
    sections_blob: dict[str, Any] | list[Any] | None,
    bindings: dict[str, str],
    engine_row_ids: dict[str, str | None],
    engine_updated_at: dict[str, str | None],
) -> list[dict[str, Any]]:
    """Resolve template sections into slide rows with source table + row id."""
    raw_sections: list[Any] = []
    if isinstance(sections_blob, dict):
        raw_sections = sections_blob.get("sections") or sections_blob.get("slides") or []
    elif isinstance(sections_blob, list):
        raw_sections = sections_blob

    if not raw_sections:
        # Seed a sensible deck outline.
        raw_sections = [
            {"id": "exec_summary", "title": "Executive Summary", "binding": "ai_generated_insights"},
            {"id": "scope", "title": "Scope & Approach", "binding": "ai_generated_insights"},
            {"id": "maturity_radar", "title": "Maturity Radar", "binding": "maturity_dimension_results", "chart_type": "radar"},
            {"id": "dim_scores", "title": "Dimension Scores", "binding": "maturity_dimension_results"},
            {"id": "benchmark", "title": "Benchmark vs Top Quartile", "binding": "benchmark_dimension_scores"},
            {"id": "benchmark_gap", "title": "Gap Analysis", "binding": "benchmark_comparisons"},
            {"id": "scenario_a", "title": "Scenario A - Workforce Demand", "binding": "scenario_outputs"},
            {"id": "scenario_b", "title": "Scenario B - Cost Envelope", "binding": "scenario_outputs"},
            {"id": "roadmap_overview", "title": "Roadmap Overview", "binding": "roadmap_outputs"},
            {"id": "roadmap_phase2", "title": "Roadmap - Phase 2", "binding": "roadmap_phases"},
            {"id": "mobility", "title": "Mobility Match Results", "binding": "mobility_match_results"},
            {"id": "next_steps", "title": "Next Steps", "binding": "ai_generated_insights"},
        ]

    slides: list[dict[str, Any]] = []
    for i, s in enumerate(raw_sections, start=1):
        binding = s.get("binding") or s.get("source_table") or "ai_generated_insights"
        source_row_id = engine_row_ids.get(binding)
        last_updated = engine_updated_at.get(binding)

        status = "ready"
        if source_row_id is None:
            status = "missing"
        elif last_updated:
            try:
                ts = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                if ts < datetime.now(timezone.utc) - timedelta(days=30):
                    status = "stale"
            except ValueError:
                pass

        entry: dict[str, Any] = {
            "slide_no": i,
            "title": s.get("title") or f"Slide {i}",
            "source_table": binding,
            "source_row_id": source_row_id,
            "status": status,
            "last_updated": last_updated,
            "binding_id": bindings.get(binding),
        }
        if s.get("chart_type"):
            entry["chart_type"] = s["chart_type"]
        slides.append(entry)
    return slides


def _coverage(slides: list[dict[str, Any]]) -> dict[str, Any]:
    pillar_map = {
        "Diagnostic": ["ai_generated_insights"],
        "Maturity": ["maturity_assessments", "maturity_dimension_results"],
        "Benchmark": ["benchmark_comparisons", "benchmark_dimension_scores"],
        "Scenario": ["scenario_outputs"],
        "Roadmap": ["roadmap_outputs", "roadmap_phases"],
        "Mobility": ["mobility_match_results"],
    }
    rows = []
    for pillar, expected in PILLARS:
        bindings = pillar_map.get(pillar, [])
        ready = sum(
            1 for s in slides
            if s["source_table"] in bindings and s["status"] == "ready"
        )
        # Cap ready at expected, scale missing into the pct calc.
        ready = min(ready, expected)
        pct = round((ready / expected) * 100) if expected else 0
        rows.append({"pillar": pillar, "ready": ready, "expected": expected, "pct": pct})
    return {"pillars": rows}


def _export_profile_block(
    selected: DocumentExportProfile | None,
    available: list[DocumentExportProfile],
) -> dict[str, Any]:
    if selected:
        opts = selected.options or {}
        meta = selected.meta or {}
        return {
            "selected_profile_id": str(selected.id),
            "profile_name": selected.name,
            "primary_color": opts.get("primary_color") or meta.get("primary_color") or "#0B2545",
            "secondary_color": opts.get("secondary_color") or meta.get("secondary_color") or "#8DA9C4",
            "font_family": opts.get("font_family") or meta.get("font_family") or "Inter",
            "logo_url": opts.get("logo_url") or meta.get("logo_url"),
            "footer_text": opts.get("footer_text") or meta.get("footer_text") or "Aivora HC - Confidential",
            "slide_master": opts.get("slide_master") or meta.get("slide_master") or "navy_minimal_v2",
            "available_profiles": [
                {"id": str(p.id), "name": p.name} for p in available
            ],
        }
    return {
        "selected_profile_id": None,
        "profile_name": "BCG-Style Navy",
        "primary_color": "#0B2545",
        "secondary_color": "#8DA9C4",
        "font_family": "Inter",
        "logo_url": None,
        "footer_text": "Aivora HC - Confidential",
        "slide_master": "navy_minimal_v2",
        "available_profiles": [{"id": str(p.id), "name": p.name} for p in available],
    }


def _linked_outputs(
    maturity: MaturityAssessment | None,
    benchmark: BenchmarkComparison | None,
    scenarios: list[ScenarioOutput],
    mobility: MobilityMatchResult | None,
) -> dict[str, Any]:
    outputs: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    if maturity:
        computed = maturity.computed_at or now
        outputs.append({
            "engine": "Maturity",
            "output_id": str(maturity.id),
            "label": f"Maturity Assessment {maturity.overall_band or ''}".strip(),
            "score": safe_float(maturity.overall_score, 0.0),
            "computed_at": computed.isoformat() if computed else None,
            "slides_using": [3, 4, 5],
        })
    if benchmark:
        computed = benchmark.computed_at or now
        outputs.append({
            "engine": "Benchmark",
            "output_id": str(benchmark.id),
            "label": "Benchmark Comparison",
            "score": None,
            "computed_at": computed.isoformat() if computed else None,
            "slides_using": [5, 6],
        })
    for so in scenarios[:3]:
        computed = so.computed_at or now
        stale = computed < (now - timedelta(days=30))
        entry = {
            "engine": "Scenario",
            "output_id": str(so.id),
            "label": so.period_label or "Scenario run",
            "computed_at": computed.isoformat() if computed else None,
            "slides_using": [7, 8],
        }
        if stale:
            entry["stale"] = True
        outputs.append(entry)
    if mobility:
        outputs.append({
            "engine": "Mobility",
            "output_id": str(mobility.id),
            "label": "Mobility match run",
            "computed_at": mobility.created_at.isoformat() if mobility.created_at else None,
            "slides_using": [11],
        })

    if not outputs:
        outputs.append({
            "engine": "Maturity", "output_id": None,
            "label": "No engine runs yet - run Maturity first.",
            "score": None, "computed_at": None, "slides_using": [],
        })
    return {"outputs": outputs}


def _recent_exports(exports: list[HcExport]) -> dict[str, Any]:
    out = []
    for e in exports:
        out.append({
            "export_id": str(e.id),
            "file_name": (e.meta or {}).get("file_name") or f"deck_{e.id}.pptx",
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "created_by": (e.meta or {}).get("created_by") or "system",
            "size_kb": (e.meta or {}).get("size_kb") or 0,
            "slide_count": (e.meta or {}).get("slide_count") or 0,
            "download_url": e.storage_path or f"/hc-platform/exports/{e.id}/download",
            "linked_document_id": str(e.generated_document_id) if e.generated_document_id else None,
            "export_profile_id": (e.meta or {}).get("export_profile_id"),
        })
    if not out:
        out.append({
            "export_id": None,
            "file_name": "No prior exports.",
            "created_at": None,
            "created_by": None,
            "size_kb": 0,
            "slide_count": 0,
            "download_url": None,
            "linked_document_id": None,
            "export_profile_id": None,
        })
    return {"exports": out}


def _preflight(
    slides: list[dict[str, Any]],
    insight_drafts: int,
    export_profile: DocumentExportProfile | None,
) -> dict[str, Any]:
    flags: list[dict[str, Any]] = []
    for s in slides:
        if s["status"] == "stale":
            flags.append({
                "severity": "warn",
                "code": "STALE_ENGINE_OUTPUT",
                "message": f"Slide {s['slide_no']} ({s['title']}) source last updated >30 days ago.",
                "slide_refs": [s["slide_no"]],
                "action": "Re-run the source engine before exporting.",
            })
        elif s["status"] == "missing":
            flags.append({
                "severity": "error",
                "code": "MISSING_SOURCE",
                "message": f"Slide {s['slide_no']} expects {s['source_table']} row, none found.",
                "slide_refs": [s["slide_no"]],
                "action": "Open the upstream studio to generate the missing row.",
            })

    if insight_drafts > 0:
        flags.append({
            "severity": "info",
            "code": "UNREVIEWED_INSIGHT",
            "message": f"{insight_drafts} AI insight(s) still in draft.",
            "action": "Review insights before publishing the deck.",
        })

    if export_profile and not (
        (export_profile.options or {}).get("logo_url")
        or (export_profile.meta or {}).get("logo_url")
    ):
        flags.append({
            "severity": "info",
            "code": "MISSING_LOGO",
            "message": "Export profile has no logo asset configured.",
            "action": "Upload a logo to the document_export_profiles row.",
        })

    if not flags:
        flags.append({
            "severity": "info", "code": "READY",
            "message": "All deck sources are fresh and bound.",
            "action": None,
        })
    return {"flags": flags}


def _outline(slides: list[dict[str, Any]]) -> dict[str, Any]:
    groups = {
        "Context": ["ai_generated_insights"],
        "Diagnosis": ["maturity_assessments", "maturity_dimension_results"],
        "Benchmark": ["benchmark_comparisons", "benchmark_dimension_scores"],
        "Future State": ["scenario_outputs"],
        "Roadmap": ["roadmap_outputs", "roadmap_phases"],
        "Appendix": ["mobility_match_results"],
    }
    out = []
    used_slides: set[int] = set()
    for section_name, bindings in groups.items():
        slide_rows = []
        for s in slides:
            if s["source_table"] in bindings and s["slide_no"] not in used_slides:
                slide_rows.append({
                    "no": s["slide_no"],
                    "title": s["title"],
                    "status": s["status"],
                })
                used_slides.add(s["slide_no"])
        if slide_rows:
            out.append({"section": section_name, "slides": slide_rows})

    # Catch any slides not matched (e.g. unknown bindings)
    leftover = [s for s in slides if s["slide_no"] not in used_slides]
    if leftover:
        out.append({
            "section": "Other",
            "slides": [
                {"no": s["slide_no"], "title": s["title"], "status": s["status"]}
                for s in leftover
            ],
        })
    return {"sections": out}


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)
    review_id = review.id if review else None

    # Generated documents — pick the latest draft for the project as the workspace doc.
    doc_stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == tenant_id)
        .order_by(desc(GeneratedDocument.created_at))
        .limit(20)
    )
    generated_docs = list((await db.execute(doc_stmt)).scalars().all())
    draft_doc = generated_docs[0] if generated_docs else None

    # Document template + sections
    template_sections = None
    template: DocumentTemplate | None = None
    if draft_doc and draft_doc.template_id:
        template = await db.get(DocumentTemplate, draft_doc.template_id)
        if template:
            vstmt = (
                select(DocumentTemplateVersion)
                .where(DocumentTemplateVersion.template_id == template.id)
                .order_by(desc(DocumentTemplateVersion.version))
                .limit(1)
            )
            version = (await db.execute(vstmt)).scalar_one_or_none()
            if version and version.sections:
                template_sections = version.sections

    # Module bindings
    bind_stmt = select(ModuleDocumentBinding).where(
        (ModuleDocumentBinding.tenant_id == tenant_id)
        | (ModuleDocumentBinding.tenant_id.is_(None))
    )
    binding_rows = list((await db.execute(bind_stmt)).scalars().all())
    bindings_map = {b.module_key: str(b.id) for b in binding_rows}

    # Engine outputs
    maturity_stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.tenant_id == tenant_id)
        .order_by(desc(MaturityAssessment.computed_at).nullslast())
        .limit(1)
    )
    maturity = (await db.execute(maturity_stmt)).scalar_one_or_none()

    bench_stmt = (
        select(BenchmarkComparison)
        .where(BenchmarkComparison.tenant_id == tenant_id)
        .order_by(desc(BenchmarkComparison.computed_at).nullslast())
        .limit(1)
    )
    benchmark = (await db.execute(bench_stmt)).scalar_one_or_none()

    scenarios_stmt = (
        select(ScenarioOutput)
        .order_by(desc(ScenarioOutput.computed_at).nullslast())
        .limit(5)
    )
    scenarios = list((await db.execute(scenarios_stmt)).scalars().all())

    mobility_stmt = (
        select(MobilityMatchResult)
        .where(MobilityMatchResult.tenant_id == tenant_id)
        .order_by(desc(MobilityMatchResult.created_at))
        .limit(1)
    )
    mobility = (await db.execute(mobility_stmt)).scalar_one_or_none()

    insight_stmt = (
        select(AiGeneratedInsight)
        .where(AiGeneratedInsight.tenant_id == tenant_id)
        .order_by(desc(AiGeneratedInsight.created_at))
        .limit(1)
    )
    insight = (await db.execute(insight_stmt)).scalar_one_or_none()

    roadmap_phase_stmt = (
        select(RoadmapPhase)
        .where(RoadmapPhase.tenant_id == tenant_id)
        .order_by(RoadmapPhase.sort_order.asc())
        .limit(1)
    )
    roadmap_phase = (await db.execute(roadmap_phase_stmt)).scalar_one_or_none()

    roadmap_output_stmt = (
        select(RoadmapOutput)
        .where(RoadmapOutput.tenant_id == tenant_id)
        .order_by(desc(RoadmapOutput.computed_at).nullslast())
        .limit(1)
    )
    roadmap_output = (await db.execute(roadmap_output_stmt)).scalar_one_or_none()

    def _id(x: Any) -> str | None:
        return str(x.id) if x is not None else None

    def _ts(x: Any, attr: str = "computed_at") -> str | None:
        ts = getattr(x, attr, None) if x is not None else None
        return ts.isoformat() if ts else None

    engine_row_ids: dict[str, str | None] = {
        "ai_generated_insights": _id(insight),
        "maturity_assessments": _id(maturity),
        "maturity_dimension_results": _id(maturity),
        "benchmark_comparisons": _id(benchmark),
        "benchmark_dimension_scores": _id(benchmark),
        "scenario_outputs": _id(scenarios[0]) if scenarios else None,
        "roadmap_outputs": _id(roadmap_output),
        "roadmap_phases": _id(roadmap_phase),
        "mobility_match_results": _id(mobility),
    }
    engine_updated_at: dict[str, str | None] = {
        "ai_generated_insights": _ts(insight, "created_at"),
        "maturity_assessments": _ts(maturity, "computed_at"),
        "maturity_dimension_results": _ts(maturity, "computed_at"),
        "benchmark_comparisons": _ts(benchmark, "computed_at"),
        "benchmark_dimension_scores": _ts(benchmark, "computed_at"),
        "scenario_outputs": _ts(scenarios[0]) if scenarios else None,
        "roadmap_outputs": _ts(roadmap_output, "computed_at"),
        "roadmap_phases": _ts(roadmap_phase, "created_at"),
        "mobility_match_results": _ts(mobility, "created_at"),
    }

    slides = _slides_from_template(template_sections, bindings_map,
                                   engine_row_ids, engine_updated_at)
    slides_total = len(slides)
    slides_ready = sum(1 for s in slides if s["status"] == "ready")

    # Export profile
    profile_stmt = select(DocumentExportProfile).order_by(DocumentExportProfile.created_at.asc())
    all_profiles = list((await db.execute(profile_stmt)).scalars().all())
    selected_profile = all_profiles[0] if all_profiles else None

    # Exports
    export_stmt = (
        select(HcExport)
        .where(HcExport.tenant_id == tenant_id)
        .where(HcExport.format == "pptx")
        .order_by(desc(HcExport.created_at))
        .limit(5)
    )
    exports = list((await db.execute(export_stmt)).scalars().all())
    # Some seed DBs may store format=pdf or similar — broaden if empty.
    if not exports:
        export_stmt2 = (
            select(HcExport)
            .where(HcExport.tenant_id == tenant_id)
            .order_by(desc(HcExport.created_at))
            .limit(5)
        )
        exports = list((await db.execute(export_stmt2)).scalars().all())

    # Drafts count (for preflight)
    draft_count_stmt = (
        select(AiGeneratedInsight)
        .where(AiGeneratedInsight.tenant_id == tenant_id)
        .where(AiGeneratedInsight.generator_type.in_(["draft", "mock"]))
    )
    draft_insights = list((await db.execute(draft_count_stmt)).scalars().all())

    # Build sections
    kpi_data = _kpi_grid(
        slides_total=slides_total,
        slides_ready=slides_ready,
        source_documents=len(generated_docs),
        engine_outputs_linked=sum(1 for v in engine_row_ids.values() if v is not None),
        export_profile_name=selected_profile.name if selected_profile else "BCG-Style Navy",
        last_refresh=datetime.now(timezone.utc).isoformat(),
        draft_doc_id=str(draft_doc.id) if draft_doc else None,
    )

    company_name = (review.company_name if review else None) or (project.name if project else None) or "Untitled"

    sections_payload = [
        section("composition_kpis", "Deck Composition KPIs", "kpi_grid",
                {"kpis": [
                    {"label": "Slides Ready", "value": kpi_data["slides_ready"], "unit": f"of {kpi_data['slides_total']}"},
                    {"label": "Source Documents", "value": kpi_data["source_documents"], "unit": "docs"},
                    {"label": "Engine Outputs Linked", "value": kpi_data["engine_outputs_linked"], "unit": "outputs"},
                    {"label": "Export Profile", "value": kpi_data["export_profile"], "unit": "style"},
                    {"label": "Estimated Pages", "value": kpi_data["estimated_pages"], "unit": "pp"},
                    {"label": "Last Refresh", "value": kpi_data["last_refresh"], "unit": "iso"},
                ], **kpi_data},
                footnote="Counts pulled from generated_documents and engine tables."),
        section("slide_source_map", "Slide-by-Slide Source Map", "comparison_table",
                {"slides": slides},
                footnote="Every slide is resolved against module_document_bindings + engine output rows."),
        section("coverage", "Content Coverage Scorecard", "horizontal_bar_chart",
                _coverage(slides),
                footnote="Ready vs expected slides per pillar (per document_template version)."),
        section("export_profile", "Export Profile & Branding", "callout_quote",
                _export_profile_block(selected_profile, all_profiles),
                footnote="document_export_profiles row tokens applied to the PPTX."),
        section("linked_outputs", "Linked Engine Outputs", "ranked_list",
                _linked_outputs(maturity, benchmark, scenarios, mobility),
                footnote="Recency-ranked engine runs feeding the deck."),
        section("recent_exports", "Recent Deck Exports", "timeline",
                _recent_exports(exports),
                footnote="hc_platform_exports rows filtered to PPTX."),
        section("preflight", "Pre-Export Risk Flags", "risk_flags_list",
                _preflight(slides, len(draft_insights), selected_profile),
                footnote="Deterministic preflight checks; no LLM."),
        section("outline", "Deck Outline Preview", "swimlane",
                _outline(slides),
                footnote="Slides grouped by document_template.structure_json sections."),
    ]

    return document(
        studio_id="deck-gen",
        title="Deck Generator - Preview",
        subtitle=f"{company_name} • {slides_total}-slide deck",
        sections=sections_payload,
    )
