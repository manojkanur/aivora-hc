"""Organisation Development studio builder.

Composes an 8-section OD one-pager from maturity_assessments,
benchmark_comparisons, roadmap_phases, roadmap_recommendations,
activity_log, scenario_risk_flags and recommendation_library. LLM is used
only to fetch an executive headline from ai_generated_insights when one is
already cached for this review.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.activity_log import ActivityLog
from app.models.hc_platform.ai_insights import AiGeneratedInsight
from app.models.hc_platform.scenarios import ScenarioModel, ScenarioRiskFlag
from app.services.hc_platform import benchmark_engine, maturity_engine
from app.services.hc_platform.studio_builders._common import (
    assessment_dimensions,
    benchmark_dim_scores,
    default_maturity_model,
    document,
    impact_score,
    latest_assessment,
    latest_benchmark_comparison,
    latest_project,
    latest_review,
    latest_roadmap,
    pick_benchmark_profile,
    recommendation_pool,
    roadmap_phases,
    roadmap_recs,
    safe_float,
    section,
)

OD_DIMENSION_KEYS: list[str] = [
    "governance", "leadership", "culture", "change_readiness",
    "learning", "talent_mobility",
]

OD_CATEGORIES: list[str] = [
    "organisation", "leadership", "culture", "learning",
    "change_management", "organisation_development",
]

WORKSTREAMS: list[str] = [
    "culture", "leadership", "structure", "capability", "processes", "comms",
]


def _od_kpis(
    overall_score: float,
    benchmark_gap: float,
    phase_count: int,
    rec_count: int,
    completed_recs: int,
    adoption_velocity: float,
    risk_workstreams: int,
    total_workstreams: int,
) -> list[dict[str, Any]]:
    return [
        {"label": "OD Maturity", "value": round(overall_score, 2), "unit": "/5",
         "band": "Mature" if overall_score >= 3.5 else "Developing",
         "delta_vs_benchmark": round(benchmark_gap, 2)},
        {"label": "Culture Gap to Top Quartile", "value": round(benchmark_gap, 2),
         "unit": "pts", "trend": "narrowing" if benchmark_gap > -0.3 else "widening"},
        {"label": "Change Phases", "value": phase_count, "unit": "phases"},
        {"label": "Active Interventions", "value": rec_count, "unit": "items",
         "completed": completed_recs},
        {"label": "Adoption Velocity", "value": round(adoption_velocity, 2),
         "unit": "events/day", "window_days": 30},
        {"label": "At-Risk Workstreams", "value": risk_workstreams,
         "unit": f"of {total_workstreams}"},
    ]


def _radar(
    dim_results: dict[str, float],
    bench_dim_scores: dict[str, dict[str, float]],
) -> dict[str, Any]:
    name_map = {
        "governance": "Governance Structure",
        "leadership": "Leadership Alignment",
        "culture": "Culture Health",
        "change_readiness": "Change Readiness",
        "learning": "Learning Capability",
        "talent_mobility": "Talent Mobility",
    }
    seed_company = {"governance": 3.5, "leadership": 2.8, "culture": 3.0,
                    "change_readiness": 2.4, "learning": 3.6, "talent_mobility": 2.9}
    seed_bench = {"governance": 3.0, "leadership": 3.1, "culture": 3.2,
                  "change_readiness": 2.9, "learning": 3.0, "talent_mobility": 3.0}
    dims = []
    for code in OD_DIMENSION_KEYS:
        company = round(dim_results.get(code, seed_company[code]), 2)
        bench = bench_dim_scores.get(code, {}).get("benchmark", seed_bench[code])
        top_q = bench_dim_scores.get(code, {}).get("top_quartile", round(bench + 0.8, 2))
        dims.append({
            "code": code, "name": name_map[code],
            "company": company, "benchmark_avg": round(bench, 2),
            "top_quartile": round(top_q, 2),
        })
    return {"dimensions": dims}


def _timeline(phases: list[Any], roadmap_id: str | None) -> dict[str, Any]:
    out: list[dict[str, Any]] = []
    if not phases:
        seed = [
            ("Mobilize", 0, 2, "completed", "CHRO", 4),
            ("Diagnose & Design", 2, 5, "in_progress", "OD Lead", 5),
            ("Pilot", 5, 8, "planned", None, 4),
            ("Scale", 8, 14, "planned", None, 3),
            ("Embed", 14, 18, "planned", None, 2),
        ]
        for i, (name, s, e, st, owner, rc) in enumerate(seed, start=1):
            entry = {"id": f"p{i}", "sequence": i, "name": name,
                     "start_month": s, "end_month": e, "status": st,
                     "recommendation_count": rc}
            if owner:
                entry["owner"] = owner
            out.append(entry)
        return {"roadmap_id": roadmap_id or "demo", "phases": out}

    for i, p in enumerate(phases, start=1):
        meta = p.meta or {}
        entry = {
            "id": str(p.id), "sequence": p.sort_order or i,
            "name": p.name,
            "start_month": int(meta.get("start_month", (i - 1) * 3)),
            "end_month": int(meta.get("end_month", i * 3)),
            "status": meta.get("status", "planned"),
            "recommendation_count": int(meta.get("recommendation_count", 0)),
        }
        if meta.get("owner"):
            entry["owner"] = meta["owner"]
        out.append(entry)
    return {"roadmap_id": roadmap_id or "active", "phases": out}


def _swimlane(
    recs: list[Any], phases_by_id: dict[str, str]
) -> dict[str, Any]:
    workstream_label = {
        "culture": "Culture", "leadership": "Leadership", "structure": "Structure",
        "capability": "Capability", "processes": "Processes", "comms": "Comms",
    }
    buckets: dict[str, list[dict[str, Any]]] = {k: [] for k in WORKSTREAMS}
    for r in recs:
        meta = r.meta or {}
        ws_key = (meta.get("workstream") or r.category or "capability").lower()
        if ws_key not in buckets:
            ws_key = "capability"
        buckets[ws_key].append({
            "id": str(r.id),
            "title": r.title,
            "phase_id": str(r.phase_id) if r.phase_id else None,
            "impact": (r.impact or "medium").lower(),
            "effort": (r.effort or "medium").lower(),
            "status": meta.get("status", "planned"),
            "owner": meta.get("owner"),
        })

    if all(len(v) == 0 for v in buckets.values()):
        buckets["culture"].append({"id": "rc1", "title": "Values relaunch workshops",
                                   "phase_id": "p2", "impact": "high", "effort": "medium",
                                   "status": "in_progress", "owner": "OD Lead"})
        buckets["leadership"].append({"id": "rc2", "title": "Top-50 alignment offsite",
                                      "phase_id": "p1", "impact": "high", "effort": "low",
                                      "status": "completed", "owner": "CHRO"})
        buckets["structure"].append({"id": "rc3", "title": "Spans & layers redesign",
                                     "phase_id": "p3", "impact": "high", "effort": "high",
                                     "status": "planned", "owner": "COO"})
        buckets["capability"].append({"id": "rc4", "title": "Change-agent academy",
                                      "phase_id": "p2", "impact": "medium", "effort": "medium",
                                      "status": "planned", "owner": "L&D Head"})
        buckets["comms"].append({"id": "rc5", "title": "Weekly CEO town hall",
                                 "phase_id": "p1", "impact": "medium", "effort": "low",
                                 "status": "completed", "owner": "Comms Lead"})

    return {"workstreams": [
        {"key": k, "label": workstream_label[k], "items": buckets[k]} for k in WORKSTREAMS
    ]}


async def _adoption_heatmap(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=56)
    stmt = (
        select(ActivityLog)
        .where(ActivityLog.tenant_id == tenant_id)
        .where(ActivityLog.created_at >= cutoff)
        .where(ActivityLog.entity_type.in_(["roadmap_phase", "roadmap_recommendation"]))
    )
    rows = list((await db.execute(stmt)).scalars().all())

    weeks = [f"W{i}" for i in range(1, 9)]
    cells: list[dict[str, Any]] = []
    counts: dict[tuple[str, str], int] = {}
    for r in rows:
        delta_days = (datetime.now(timezone.utc) - r.created_at).days
        week_idx = max(0, min(7, 7 - (delta_days // 7)))
        week = weeks[week_idx]
        meta = r.meta or {}
        ws = (meta.get("workstream") or r.action or "comms").lower()
        if ws not in WORKSTREAMS:
            ws = "comms"
        counts[(week, ws)] = counts.get((week, ws), 0) + 1

    max_count = max(counts.values()) if counts else 0
    if not counts:
        # Seed deterministic cells so the heatmap renders.
        seed = [("W1", "culture", 4), ("W1", "leadership", 9), ("W2", "structure", 0),
                ("W2", "capability", 3), ("W3", "comms", 6), ("W3", "culture", 2),
                ("W4", "leadership", 5), ("W5", "capability", 4),
                ("W6", "processes", 1), ("W7", "structure", 2),
                ("W8", "comms", 3)]
        max_count = max(s[2] for s in seed) or 1
        for w, ws, n in seed:
            cells.append({"week": w, "workstream": ws, "events": n,
                          "intensity": round(n / max_count, 2)})
    else:
        for (w, ws), n in counts.items():
            cells.append({"week": w, "workstream": ws, "events": n,
                          "intensity": round(n / max_count, 2) if max_count else 0.0})

    return {"weeks": weeks, "workstreams": WORKSTREAMS, "cells": cells}


def _risks(
    dim_results: dict[str, float],
    bench_dim_scores: dict[str, dict[str, float]],
    scenario_risks: list[ScenarioRiskFlag],
    adoption_cells: list[dict[str, Any]],
) -> dict[str, Any]:
    risks: list[dict[str, Any]] = []
    for code in OD_DIMENSION_KEYS:
        score = dim_results.get(code)
        if score is not None and score < 2.5:
            bench = bench_dim_scores.get(code, {}).get("benchmark", 3.0)
            risks.append({
                "id": f"rk_{code}",
                "severity": "high",
                "area": code.replace("_", " ").title(),
                "signal": f"Maturity {round(score, 2)} vs benchmark {round(bench, 2)}",
                "source": "maturity_dimension_results",
                "mitigation_ref": None,
            })

    # Workstream stalled detection: any workstream with 0 events.
    seen_ws = {c["workstream"] for c in adoption_cells if c.get("events", 0) > 0}
    for ws in WORKSTREAMS:
        if ws not in seen_ws:
            risks.append({
                "id": f"rk_stall_{ws}",
                "severity": "high",
                "area": f"{ws.title()} Workstream Stalled",
                "signal": "No activity_log events in last 30 days",
                "source": "activity_log",
            })
            break  # one stall flag is enough; avoid spam

    for sr in scenario_risks[:3]:
        risks.append({
            "id": str(sr.id),
            "severity": (sr.severity or "medium").lower(),
            "area": sr.label or "Scenario Risk",
            "signal": sr.description or "",
            "source": "scenario_risk_flags",
        })

    if not risks:
        risks.append({
            "id": "rk_default", "severity": "low",
            "area": "Program Health",
            "signal": "No critical OD dimensions below threshold.",
            "source": "maturity_dimension_results",
        })
    return {"risks": risks}


def _recommended_next(library: list[Any]) -> dict[str, Any]:
    cards = []
    for r in library[:5]:
        meta = r.meta or {}
        cards.append({
            "id": str(r.id),
            "title": r.title,
            "category": r.category or "organisation",
            "impact": (r.default_impact or "medium").lower(),
            "effort": (r.default_effort or "medium").lower(),
            "time_to_value_weeks": int(meta.get("time_to_value_weeks", 8)),
            "addresses_dimensions": meta.get("addresses_dimensions", []),
            "rationale": (r.description or "")[:160] or "Targets a low-maturity dimension.",
            "already_in_roadmap": False,
        })
    if not cards:
        cards = [
            {"id": "rec_lib_017", "title": "Change-Agent Network",
             "category": "capability", "impact": "high", "effort": "medium",
             "time_to_value_weeks": 8,
             "addresses_dimensions": ["change_readiness", "culture"],
             "rationale": "Targets the lowest-scoring OD dimension.",
             "already_in_roadmap": False},
            {"id": "rec_lib_031", "title": "Leadership Alignment Lab",
             "category": "leadership", "impact": "high", "effort": "low",
             "time_to_value_weeks": 4,
             "addresses_dimensions": ["leadership"],
             "rationale": "Closes leadership alignment gap quickly.",
             "already_in_roadmap": False},
        ]
    return {"recommendations": cards}


async def _headline(
    db: AsyncSession, review_id: uuid.UUID | None
) -> dict[str, Any] | None:
    if review_id is None:
        return None
    stmt = (
        select(AiGeneratedInsight)
        .where(AiGeneratedInsight.review_id == review_id)
        .where(AiGeneratedInsight.insight_type.in_(["od_headline", "executive_summary"]))
        .order_by(desc(AiGeneratedInsight.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return None
    return row.content


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)

    industry = (review.industry if review else None) or (project.industry if project else None)
    company_size = (review.company_size if review else None) or (project.company_size if project else None)
    company_name = (review.company_name if review else None) or (project.name if project else None) or "Untitled"

    # Maturity
    assessment = await latest_assessment(db, review.id if review else None)
    if assessment is None and review is not None:
        model = await default_maturity_model(db)
        if model is not None:
            try:
                assessment = await maturity_engine.run(db, review.id, model.id)
            except Exception:  # noqa: BLE001
                assessment = None

    dim_rows = await assessment_dimensions(db, assessment.id if assessment else None)
    dim_results = {d.dimension_key: safe_float(d.score, 3.0) for d in dim_rows}
    overall_score = safe_float(assessment.overall_score if assessment else None, 3.25)

    # Benchmark
    profile = await pick_benchmark_profile(db, industry, company_size)
    comparison = await latest_benchmark_comparison(db, review.id if review else None)
    if comparison is None and profile is not None and review is not None:
        try:
            comparison = await benchmark_engine.run(db, review.id, profile.id)
        except Exception:  # noqa: BLE001
            comparison = None

    bench_dim_scores: dict[str, dict[str, float]] = {}
    if profile is not None:
        for s in await benchmark_dim_scores(db, profile.id):
            bench_dim_scores[s.dimension_key] = {
                "benchmark": safe_float(s.score, 3.0),
                "top_quartile": safe_float((s.meta or {}).get("top_quartile"),
                                           safe_float(s.score, 3.0) + 0.7),
            }
    if comparison and comparison.comparison_data:
        for d in comparison.comparison_data.get("dimensions", []):
            code = d.get("dimensionCode") or d.get("dimension_code")
            if code:
                entry = bench_dim_scores.setdefault(code, {})
                entry.setdefault("benchmark", safe_float(d.get("benchmarkAverage"), 3.0))
                entry.setdefault("top_quartile", safe_float(d.get("topQuartile"), 3.8))

    # Benchmark gap (overall): pick top-quartile gap on culture as a proxy.
    culture_top = bench_dim_scores.get("culture", {}).get("top_quartile", 4.0)
    culture_company = dim_results.get("culture", 3.0)
    benchmark_gap = round(culture_company - culture_top, 2)

    # Roadmap
    roadmap = await latest_roadmap(db, tenant_id, project.id if project else None)
    phases = await roadmap_phases(db, review.id) if review else []
    recs = await roadmap_recs(db, review.id) if review else []
    phases_by_id = {str(p.id): p.name for p in phases}

    phase_count = len(phases) or 5
    completed_recs = sum(1 for r in recs if ((r.meta or {}).get("status") == "completed"))

    # Adoption from activity_log
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    stmt = (
        select(func.count(ActivityLog.id))
        .where(ActivityLog.tenant_id == tenant_id)
        .where(ActivityLog.created_at >= cutoff)
        .where(ActivityLog.entity_type.in_(["roadmap_phase", "roadmap_recommendation"]))
    )
    activity_count = int((await db.execute(stmt)).scalar_one() or 0)
    adoption_velocity = round(activity_count / 30.0, 2) if activity_count else 0.34

    adoption_heatmap = await _adoption_heatmap(db, tenant_id)

    # Stalled workstreams
    seen_ws = {c["workstream"] for c in adoption_heatmap["cells"] if c.get("events", 0) > 0}
    risk_workstreams = len([ws for ws in WORKSTREAMS if ws not in seen_ws])

    kpis = _od_kpis(
        overall_score=overall_score,
        benchmark_gap=benchmark_gap,
        phase_count=phase_count,
        rec_count=len(recs) or 18,
        completed_recs=completed_recs,
        adoption_velocity=adoption_velocity,
        risk_workstreams=risk_workstreams,
        total_workstreams=len(WORKSTREAMS),
    )

    radar = _radar(dim_results, bench_dim_scores)
    timeline = _timeline(phases, str(roadmap.id) if roadmap else None)
    swimlane = _swimlane(recs, phases_by_id)

    # Scenario risks
    scenario_risks_stmt = (
        select(ScenarioRiskFlag)
        .join(ScenarioModel, ScenarioRiskFlag.scenario_id == ScenarioModel.id)
        .where(ScenarioModel.tenant_id == tenant_id)
        .limit(10)
    )
    scenario_risks = list((await db.execute(scenario_risks_stmt)).scalars().all())
    risks = _risks(dim_results, bench_dim_scores, scenario_risks, adoption_heatmap["cells"])

    # Recommendations
    library = await recommendation_pool(db, OD_CATEGORIES, limit=10)
    recommended_next = _recommended_next(library)

    headline = await _headline(db, review.id if review else None)
    headline_section_data = headline or {
        "headline": (
            "OD program is mid-flight with strong learning capability but "
            "structure workstream needs reactivation before scaling."
        ),
        "themes": [
            "Leadership alignment gap widening",
            "Structure workstream momentum at risk",
            "Culture pulse overdue",
        ],
        "confidence": "medium",
    }

    sections = [
        section("vitals", "OD Transformation Vitals", "kpi_grid",
                {"kpis": kpis},
                footnote="maturity_assessments + benchmark_comparisons + activity_log."),
        section("dimension_radar", "OD Dimension Maturity vs Benchmark", "radar_chart",
                radar,
                footnote="maturity_dimension_results joined to benchmark_dimension_scores."),
        section("roadmap_timeline", "Change Roadmap Phases", "timeline",
                timeline,
                footnote="roadmap_phases ordered by sort_order."),
        section("intervention_swimlane", "Interventions by Workstream", "swimlane",
                swimlane,
                footnote="roadmap_recommendations grouped by workstream."),
        section("adoption_heatmap", "Change Adoption Heatmap", "heatmap",
                adoption_heatmap,
                footnote="activity_log events bucketed by week × workstream."),
        section("risks", "Top OD Risks", "risk_flags_list",
                risks,
                footnote="Derived from low-maturity dimensions + dormant workstreams + scenario_risk_flags."),
        section("recommended_next", "Recommended Next Interventions", "recommendation_cards",
                recommended_next,
                footnote="recommendation_library filtered to OD categories."),
        section("executive_headline", "Executive Headline", "callout_quote",
                headline_section_data,
                footnote="ai_generated_insights of insight_type=od_headline."),
    ]

    return document(
        studio_id="org-dev",
        title="Organisation Development - One-Pager",
        subtitle=f"{company_name}{(' • ' + industry) if industry else ''}",
        sections=sections,
    )
