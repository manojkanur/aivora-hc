"""Playbook Studio builder.

Renders an 8-section playbook dashboard from projects + roadmaps +
roadmap_phases + roadmap_recommendations + recommendation_library +
document_templates + generated_documents + scenario_risk_flags +
ai_generated_insights + activity_log. Deterministic except for the executive
narrative section, which reads the most recent ai_generated_insight of
insight_type='playbook_narrative' (or executive_summary) if one is cached.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import AiGeneratedInsight
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    GeneratedDocument,
    ModuleDocumentBinding,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.scenarios import ScenarioModel, ScenarioRiskFlag
from app.services.hc_platform.studio_builders._common import (
    document,
    effort_score,
    horizon_weeks,
    impact_score,
    latest_project,
    latest_review,
    latest_roadmap,
    recommendation_pool,
    roadmap_phases,
    roadmap_recs,
    safe_float,
    section,
)

WORKSTREAMS = ["Governance", "Capability", "Mobility", "Performance", "Tech"]

PLAYBOOK_CATEGORIES = [
    "organisation", "leadership", "capability", "performance",
    "talent", "comp_and_benefits", "learning", "culture",
    "workforce_planning",
]


def _kpis(
    phase_count: int,
    rec_count: int,
    total_weeks: int,
    fte_weeks: int,
    workstream_count: int,
    doc_count: int,
    owner_count: int,
    quick_wins: int,
) -> list[dict[str, Any]]:
    return [
        {"label": "Phases", "value": phase_count, "icon": "layers"},
        {"label": "Recommendations", "value": rec_count, "icon": "list-checks"},
        {"label": "Total Duration (weeks)", "value": total_weeks, "icon": "calendar"},
        {"label": "Estimated FTE-weeks", "value": fte_weeks, "icon": "users"},
        {"label": "Workstreams", "value": workstream_count, "icon": "git-branch"},
        {"label": "Document Artifacts", "value": doc_count, "icon": "file-text"},
        {"label": "Owners Assigned", "value": owner_count, "icon": "user-check"},
        {"label": "Quick Wins (<8 wks)", "value": quick_wins, "icon": "zap"},
    ]


def _swimlane(
    phases: list[Any],
    recs: list[Any],
) -> dict[str, Any]:
    # Bucket recs by phase + workstream for swimlane bars.
    if not phases:
        # Seed phases
        seed_phases = [
            {"phase_id": "p1", "name": "Foundation", "order": 1,
             "start_week": 0, "end_week": 8, "status": "planned",
             "bars": [{"workstream": "Governance", "start_week": 0,
                       "end_week": 6, "recommendation_count": 3, "owner": "CHRO"},
                      {"workstream": "Tech", "start_week": 2,
                       "end_week": 8, "recommendation_count": 2, "owner": "CIO"}]},
            {"phase_id": "p2", "name": "Build", "order": 2,
             "start_week": 8, "end_week": 20, "status": "planned",
             "bars": [{"workstream": "Capability", "start_week": 8,
                       "end_week": 20, "recommendation_count": 5,
                       "owner": "L&D Head"},
                      {"workstream": "Performance", "start_week": 12,
                       "end_week": 20, "recommendation_count": 2,
                       "owner": "PMO"}]},
            {"phase_id": "p3", "name": "Scale", "order": 3,
             "start_week": 20, "end_week": 30, "status": "planned",
             "bars": [{"workstream": "Mobility", "start_week": 20,
                       "end_week": 28, "recommendation_count": 3,
                       "owner": "Talent Head"}]},
            {"phase_id": "p4", "name": "Sustain", "order": 4,
             "start_week": 30, "end_week": 36, "status": "planned",
             "bars": [{"workstream": "Governance", "start_week": 30,
                       "end_week": 36, "recommendation_count": 2,
                       "owner": "CHRO"}]},
        ]
        return {"workstreams": WORKSTREAMS, "phases": seed_phases}

    phase_blob: list[dict[str, Any]] = []
    cursor = 0
    for i, p in enumerate(phases, start=1):
        meta = p.meta or {}
        start_week = int(meta.get("start_week", cursor))
        duration = int(meta.get("duration_weeks", 8))
        end_week = int(meta.get("end_week", start_week + duration))
        cursor = end_week

        # Aggregate bars for this phase by workstream
        bars_map: dict[str, dict[str, Any]] = {}
        for r in recs:
            if r.phase_id != p.id:
                continue
            ws_raw = ((r.meta or {}).get("workstream") or r.category or "Capability").title()
            if ws_raw not in WORKSTREAMS:
                ws_raw = "Capability"
            owner = (r.meta or {}).get("owner_role") or (r.meta or {}).get("owner")
            bar = bars_map.setdefault(ws_raw, {
                "workstream": ws_raw,
                "start_week": start_week,
                "end_week": end_week,
                "recommendation_count": 0,
                "owner": owner,
            })
            bar["recommendation_count"] += 1
            if owner and not bar.get("owner"):
                bar["owner"] = owner

        phase_blob.append({
            "phase_id": str(p.id),
            "name": p.name,
            "order": p.sort_order or i,
            "start_week": start_week,
            "end_week": end_week,
            "status": meta.get("status", "planned"),
            "bars": list(bars_map.values()),
        })
    return {"workstreams": WORKSTREAMS, "phases": phase_blob}


def _ranked_recs(
    recs: list[Any],
    phases_by_id: dict[str, str],
    library: list[RecommendationLibrary],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    if recs:
        for r in recs:
            meta = r.meta or {}
            phase_name = phases_by_id.get(str(r.phase_id), None) if r.phase_id else None
            impact = impact_score(r.impact)
            effort = effort_score(r.effort)
            ttv = horizon_weeks(r.time_horizon)
            rows.append({
                "id": str(r.id),
                "library_code": (r.meta or {}).get("library_code"),
                "title": r.title,
                "workstream": (meta.get("workstream") or r.category or "Capability").title(),
                "phase": phase_name,
                "impact_score": impact,
                "effort_score": effort,
                "cost_band": meta.get("cost_band", "Medium"),
                "time_to_value_weeks": ttv,
                "priority_rank": 0,
                "owner_role": meta.get("owner_role") or meta.get("owner"),
                "linked_dimensions": meta.get("addresses_dimensions", []),
                "quick_win": ttv <= 8 and impact >= 3.5,
                "dependencies": meta.get("dependencies", []),
            })
    else:
        for r in library[:8]:
            ttv = horizon_weeks(r.time_horizon)
            rows.append({
                "id": str(r.id),
                "library_code": r.key,
                "title": r.title,
                "workstream": (r.category or "Capability").title(),
                "phase": "Foundation",
                "impact_score": impact_score(r.default_impact),
                "effort_score": effort_score(r.default_effort),
                "cost_band": "Medium",
                "time_to_value_weeks": ttv,
                "priority_rank": 0,
                "owner_role": "CHRO",
                "linked_dimensions": list((r.tags or {}).keys()) if isinstance(r.tags, dict) else [],
                "quick_win": ttv <= 8 and impact_score(r.default_impact) >= 3.5,
                "dependencies": [],
            })

    rows.sort(key=lambda x: (x["impact_score"], -x["effort_score"]), reverse=True)
    for i, row in enumerate(rows, start=1):
        row["priority_rank"] = i
    return {"recommendations": rows}


def _raci_heatmap(recs_ranked: list[dict[str, Any]]) -> dict[str, Any]:
    roles_order = ["CHRO", "CIO", "L&D Head", "TA Head", "Comp Head",
                   "Business Unit Lead", "CFO"]
    counts: dict[tuple[str, str], int] = {}
    for r in recs_ranked:
        owner = r.get("owner_role") or "CHRO"
        if owner not in roles_order:
            roles_order.append(owner)
        workstream = r.get("workstream") or "Capability"
        key = (owner, workstream)
        counts[key] = counts.get(key, 0) + 1

    if not counts:
        seed = [("CHRO", "Governance", "A", 4),
                ("L&D Head", "Capability", "R", 6),
                ("CFO", "Capability", "C", 2),
                ("Business Unit Lead", "Mobility", "I", 3),
                ("TA Head", "Mobility", "R", 4),
                ("CIO", "Tech", "A", 3)]
        cells = [{"role": r, "workstream": w, "assignment": a, "count": c}
                 for r, w, a, c in seed]
    else:
        cells = []
        for (role, ws), count in counts.items():
            cells.append({"role": role, "workstream": ws, "assignment": "R", "count": count})

    return {
        "roles": roles_order[:8],
        "workstreams": WORKSTREAMS,
        "cells": cells,
        "legend": {"R": "Responsible", "A": "Accountable",
                   "C": "Consulted", "I": "Informed"},
    }


def _phase_metrics(phases: list[Any], recs: list[Any]) -> dict[str, Any]:
    out: list[dict[str, Any]] = []
    if not phases:
        seed = [("Foundation", 8, 22, 5, "Low"),
                ("Build", 12, 58, 7, "Medium"),
                ("Scale", 10, 42, 4, "Medium"),
                ("Sustain", 6, 20, 2, "Low")]
        for name, dw, fw, rc, cb in seed:
            out.append({"name": name, "duration_weeks": dw, "fte_weeks": fw,
                        "recommendation_count": rc, "cost_band": cb})
        return {"phases": out}

    rec_by_phase: dict[uuid.UUID, list[Any]] = {}
    for r in recs:
        if r.phase_id:
            rec_by_phase.setdefault(r.phase_id, []).append(r)

    for p in phases:
        meta = p.meta or {}
        dur = int(meta.get("duration_weeks", 8))
        rc_list = rec_by_phase.get(p.id, [])
        fte_weeks = sum(int(((rr.meta or {}).get("fte_weeks") or 4)) for rr in rc_list) or len(rc_list) * 4
        cost_band = meta.get("cost_band", "Medium")
        out.append({"name": p.name, "duration_weeks": dur,
                    "fte_weeks": fte_weeks,
                    "recommendation_count": len(rc_list),
                    "cost_band": cost_band})
    return {"phases": out}


def _risks(
    scenario_risks: list[ScenarioRiskFlag],
    recs_ranked: list[dict[str, Any]],
) -> dict[str, Any]:
    risks: list[dict[str, Any]] = []
    for sr in scenario_risks[:5]:
        risks.append({
            "id": str(sr.id),
            "type": "risk",
            "severity": (sr.severity or "medium").lower(),
            "phase": (sr.meta or {}).get("phase"),
            "title": sr.label or "Scenario risk",
            "linked_recommendations": (sr.meta or {}).get("linked_recommendations", []),
            "mitigation": sr.mitigation or "",
            "owner": (sr.meta or {}).get("owner"),
        })

    # Derived dependency gates
    for r in recs_ranked:
        deps = r.get("dependencies") or []
        if deps:
            risks.append({
                "id": f"dep_{r['id']}",
                "type": "dependency",
                "severity": "medium",
                "phase": r.get("phase"),
                "title": f"{r['title']} blocked by {len(deps)} dependency(ies)",
                "linked_recommendations": [r["id"]],
                "mitigation": "Sequence prerequisite recommendations first.",
                "owner": r.get("owner_role"),
            })
            if len(risks) >= 6:
                break

    if not risks:
        risks.append({
            "id": "r_default", "type": "risk", "severity": "low",
            "phase": None,
            "title": "No critical risks logged",
            "linked_recommendations": [],
            "mitigation": "Re-run scenario engine after intake updates.",
            "owner": "CHRO",
        })
    return {"risks": risks}


async def _documents(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> dict[str, Any]:
    # Generated documents tied to this tenant
    gd_stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == tenant_id)
        .order_by(desc(GeneratedDocument.created_at))
        .limit(20)
    )
    gd_rows = list((await db.execute(gd_stmt)).scalars().all())

    # Module bindings → expected templates
    bind_stmt = select(ModuleDocumentBinding).where(
        (ModuleDocumentBinding.tenant_id == tenant_id)
        | (ModuleDocumentBinding.tenant_id.is_(None))
    )
    bindings = list((await db.execute(bind_stmt)).scalars().all())
    expected_template_ids = {b.template_id for b in bindings}

    templates: dict[str, DocumentTemplate] = {}
    if expected_template_ids:
        t_stmt = select(DocumentTemplate).where(DocumentTemplate.id.in_(expected_template_ids))
        for t in (await db.execute(t_stmt)).scalars().all():
            templates[t.id] = t

    docs: list[dict[str, Any]] = []
    generated_template_ids = set()
    for d in gd_rows:
        meta = d.meta or {}
        docs.append({
            "template_code": d.template_id,
            "title": d.name,
            "type": d.document_type_key or "operating",
            "status": d.status,
            "phase": meta.get("phase"),
            "owner": meta.get("owner") or meta.get("owner_role"),
            "linked_recommendation": meta.get("linked_recommendation"),
            "generated_at": d.created_at.isoformat() if d.created_at else None,
            "version": str(d.version),
        })
        if d.template_id:
            generated_template_ids.add(d.template_id)

    # Pending template rows (expected but not yet generated)
    for tpl_id in expected_template_ids - generated_template_ids:
        tpl = templates.get(tpl_id)
        if tpl is None:
            continue
        docs.append({
            "template_code": tpl.id,
            "title": tpl.name,
            "type": tpl.document_type_key or "operating",
            "status": "pending",
            "phase": None,
            "owner": None,
            "linked_recommendation": None,
            "generated_at": None,
            "version": None,
        })

    if not docs:
        docs = [
            {"template_code": "GOV-CHARTER-V1", "title": "HC Governance Council Charter",
             "type": "governance", "status": "pending", "phase": "Foundation",
             "owner": "CHRO", "linked_recommendation": None,
             "generated_at": None, "version": None},
            {"template_code": "RACI-V1", "title": "Program RACI Matrix",
             "type": "governance", "status": "pending", "phase": "Foundation",
             "owner": "PMO", "linked_recommendation": None,
             "generated_at": None, "version": None},
        ]
    return {"documents": docs}


async def _narrative(
    db: AsyncSession, review_id: uuid.UUID | None
) -> dict[str, Any]:
    if review_id is None:
        return _default_narrative()
    stmt = (
        select(AiGeneratedInsight)
        .where(AiGeneratedInsight.review_id == review_id)
        .where(AiGeneratedInsight.insight_type.in_(["playbook_narrative", "executive_summary"]))
        .order_by(desc(AiGeneratedInsight.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return _default_narrative()
    return row.content or _default_narrative()


def _default_narrative() -> dict[str, Any]:
    return {
        "headline": (
            "36-week program, front-loaded on governance, peaks in Build phase "
            "at 58 FTE-weeks."
        ),
        "summary": (
            "The playbook sequences governance and capability foundations "
            "before scaling mobility and performance interventions. Foundation "
            "phase establishes the HC Governance Council and RACI; Build phase "
            "rolls out the capability framework and change-agent academy; "
            "Scale phase activates mobility moves and performance redesign; "
            "Sustain phase embeds governance rituals. The CFO checkpoint at "
            "week 18 is the single most important gate."
        ),
        "top_themes": [
            "Governance-first sequencing",
            "Capability rollout is the critical path",
            "CFO gate at week 18",
        ],
        "confidence": "medium",
    }


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)
    review_id = review.id if review else None

    roadmap = await latest_roadmap(db, tenant_id, project.id if project else None)

    phases = await roadmap_phases(db, review_id) if review_id else []
    recs = await roadmap_recs(db, review_id) if review_id else []
    phases_by_id = {str(p.id): p.name for p in phases}

    # KPI math
    phase_count = len(phases) or 4
    rec_count = len(recs) or 18
    total_weeks = 36
    if phases:
        durations = []
        for p in phases:
            d = int((p.meta or {}).get("duration_weeks", 0))
            if d:
                durations.append(d)
        total_weeks = sum(durations) or 36

    fte_weeks = sum(
        int(((r.meta or {}).get("fte_weeks") or 4)) for r in recs
    ) or (rec_count * 8)

    workstream_count = len({
        ((r.meta or {}).get("workstream") or r.category or "Capability").title()
        for r in recs
    }) or len(WORKSTREAMS)

    # Doc count
    gd_count_stmt = (
        select(GeneratedDocument)
        .where(GeneratedDocument.tenant_id == tenant_id)
    )
    doc_count = len(list((await db.execute(gd_count_stmt)).scalars().all())) or 7

    owners = {(r.meta or {}).get("owner_role") or (r.meta or {}).get("owner")
              for r in recs if (r.meta or {}).get("owner_role") or (r.meta or {}).get("owner")}
    owner_count = len(owners) or 9

    library = await recommendation_pool(db, PLAYBOOK_CATEGORIES, limit=20)
    ranked = _ranked_recs(recs, phases_by_id, library)
    quick_wins = sum(1 for r in ranked["recommendations"] if r.get("quick_win"))

    kpis = _kpis(phase_count, rec_count, total_weeks, fte_weeks,
                 workstream_count, doc_count, owner_count, quick_wins)

    swimlane = _swimlane(phases, recs)
    raci = _raci_heatmap(ranked["recommendations"])
    phase_metrics = _phase_metrics(phases, recs)

    # Scenario risks (any belonging to this tenant)
    sr_stmt = (
        select(ScenarioRiskFlag)
        .join(ScenarioModel, ScenarioRiskFlag.scenario_id == ScenarioModel.id)
        .where(ScenarioModel.tenant_id == tenant_id)
        .limit(10)
    )
    scenario_risks = list((await db.execute(sr_stmt)).scalars().all())
    risks = _risks(scenario_risks, ranked["recommendations"])

    documents_block = await _documents(db, tenant_id)
    narrative = await _narrative(db, review_id)

    company_name = (review.company_name if review else None) or (project.name if project else None) or "Untitled"

    sections_payload = [
        section("header_kpis", "Playbook Header KPIs", "kpi_grid",
                {"project_id": str(project.id) if project else None,
                 "roadmap_id": str(roadmap.id) if roadmap else None,
                 "kpis": kpis},
                footnote="Aggregated from projects, roadmaps, roadmap_phases, roadmap_recommendations."),
        section("swimlane", "Roadmap Swimlane (Phases × Workstreams)", "swimlane",
                swimlane,
                footnote="roadmap_phases joined with roadmap_recommendations by workstream."),
        section("recommendations", "Ranked Recommendations (Impact × Effort)", "recommendation_cards",
                ranked,
                footnote="Sorted by impact desc, effort asc; recommendation_library backs each row."),
        section("raci_heatmap", "RACI Coverage Heatmap", "heatmap",
                raci,
                footnote="roadmap_recommendations.owner_role × workstream counts."),
        section("phase_metrics", "Phase Duration & Effort Comparison", "horizontal_bar_chart",
                phase_metrics,
                footnote="Duration + FTE-weeks per phase."),
        section("risks", "Risks, Dependencies & Decision Gates", "risk_flags_list",
                risks,
                footnote="scenario_risk_flags + recommendation dependencies."),
        section("documents", "Document Artifact Tracker", "comparison_table",
                documents_block,
                footnote="generated_documents + module_document_bindings."),
        section("narrative", "Executive Narrative", "narrative_paragraph",
                narrative,
                footnote="ai_generated_insights of insight_type=playbook_narrative."),
    ]

    return document(
        studio_id="playbook",
        title="Playbook Studio - One-Pager",
        subtitle=f"{company_name} • {total_weeks}-week program",
        sections=sections_payload,
    )
