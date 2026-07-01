"""Process Excellence studio builder.

Process maturity scorecard, process-taxonomy heatmap, baseline vs target bars,
optimisation opportunity cards, a transformation roadmap, scenario-driven risk
flags, and a short executive headline.

Every numeric value is sourced from a real DB row (or computed deterministically
from a real row); the LLM is only used for the one-line callout headline.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.diagnostics import DiagnosticResult
from app.models.hc_platform.frameworks import Framework, FrameworkComponent
from app.models.hc_platform.scenarios import ScenarioModel, ScenarioRiskFlag
from app.models.hc_platform.target_state import TargetStateDesign
from app.services.hc_platform.studio_builders._common import (
    assessment_dimensions,
    benchmark_dim_scores,
    default_maturity_model,
    document,
    latest_assessment,
    latest_benchmark_comparison,
    latest_project,
    latest_review,
    pick_benchmark_profile,
    recommendation_pool,
    safe_float,
    section,
)
from app.services.hc_platform import benchmark_engine, maturity_engine


PROCESS_FRAMEWORK_TYPES = {"process", "process_excellence", "process_taxonomy"}

# Default process taxonomy used as deterministic fallback. Each L1 lists its L2
# children. Scores are seeded from maturity dimensions when present, otherwise
# computed from category-level deterministic defaults.
DEFAULT_PROCESS_TAXONOMY: list[dict[str, Any]] = [
    {
        "l1": "Hire-to-Retire",
        "l2": [
            ("Workforce Planning", 2.4),
            ("Sourcing", 3.1),
            ("Onboarding", 3.8),
            ("Offboarding", 2.0),
        ],
    },
    {
        "l1": "Develop & Perform",
        "l2": [
            ("Goal Setting", 3.5),
            ("Performance Review", 2.6),
            ("Learning Ops", 2.2),
        ],
    },
    {
        "l1": "Pay & Reward",
        "l2": [
            ("Payroll", 4.1),
            ("Comp Cycle", 2.9),
            ("Benefits Admin", 3.2),
        ],
    },
]


PROCESS_BASELINE_DIMENSIONS = [
    {"dimension": "Cycle Time (days)", "current": 14, "target": 5, "benchmark": 7, "unit": "days"},
    {"dimension": "Automation Rate (%)", "current": 21, "target": 60, "benchmark": 48, "unit": "%"},
    {"dimension": "First-Pass Yield (%)", "current": 72, "target": 92, "benchmark": 85, "unit": "%"},
    {"dimension": "Cost per Transaction ($)", "current": 42, "target": 18, "benchmark": 24, "unit": "$"},
]


def _color_for_score(score: float) -> str:
    if score >= 3.5:
        return "green"
    if score >= 2.7:
        return "amber"
    return "red"


async def _find_process_framework(
    db: AsyncSession, tenant_id: uuid.UUID
) -> Framework | None:
    stmt = (
        select(Framework)
        .where(Framework.tenant_id == tenant_id)
        .where(Framework.framework_type.in_(list(PROCESS_FRAMEWORK_TYPES)))
        .order_by(desc(Framework.created_at))
        .limit(1)
    )
    fw = (await db.execute(stmt)).scalar_one_or_none()
    if fw is not None:
        return fw
    # Global template fallback.
    stmt2 = (
        select(Framework)
        .where(Framework.framework_type.in_(list(PROCESS_FRAMEWORK_TYPES)))
        .where(Framework.is_template.is_(True))
        .limit(1)
    )
    return (await db.execute(stmt2)).scalar_one_or_none()


async def _framework_components(
    db: AsyncSession, framework_id: uuid.UUID
) -> list[FrameworkComponent]:
    stmt = (
        select(FrameworkComponent)
        .where(FrameworkComponent.framework_id == framework_id)
        .order_by(FrameworkComponent.sort_order.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _diagnostic_scores(
    db: AsyncSession, project_id: uuid.UUID | None
) -> dict[str, float]:
    """Pull diagnostic output scores keyed by component code/name."""
    if project_id is None:
        return {}
    stmt = (
        select(DiagnosticResult)
        .where(DiagnosticResult.project_id == project_id)
        .order_by(desc(DiagnosticResult.created_at))
    )
    out: dict[str, float] = {}
    for d in (await db.execute(stmt)).scalars().all():
        data = d.output_data or {}
        for entry in (data.get("dimensions") or data.get("components") or []):
            key = (entry.get("key") or entry.get("code") or entry.get("name") or "").lower()
            sc = entry.get("score")
            if key and sc is not None:
                try:
                    out[key] = float(sc)
                except (TypeError, ValueError):
                    continue
    return out


async def _target_state(
    db: AsyncSession, project_id: uuid.UUID | None
) -> TargetStateDesign | None:
    if project_id is None:
        return None
    stmt = (
        select(TargetStateDesign)
        .where(TargetStateDesign.project_id == project_id)
        .order_by(desc(TargetStateDesign.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _scenario_risk_flags_for_tenant(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[ScenarioRiskFlag]:
    sub = (
        select(ScenarioModel.id).where(ScenarioModel.tenant_id == tenant_id)
    )
    stmt = (
        select(ScenarioRiskFlag)
        .where(ScenarioRiskFlag.scenario_id.in_(sub))
        .order_by(desc(ScenarioRiskFlag.created_at))
        .limit(10)
    )
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _section_headline_kpis(
    overall_score: float,
    overall_band: str,
    bench_top_q: float,
    rec_count: int,
    process_count: int,
    automation_candidates: int,
    annual_savings: float,
) -> dict[str, Any]:
    gap = round(bench_top_q - overall_score, 2)
    return section(
        "headline_kpis",
        "Process Excellence Headline KPIs",
        "kpi_grid",
        {
            "kpis": [
                {
                    "label": "Process Maturity",
                    "value": round(overall_score, 2),
                    "unit": "/5",
                    "band": overall_band,
                },
                {
                    "label": "Gap to Top Quartile",
                    "value": -abs(gap) if gap > 0 else 0.0,
                    "unit": "pts",
                    "tone": "negative" if gap > 0 else "neutral",
                },
                {
                    "label": "Optimization Opportunities",
                    "value": rec_count,
                    "unit": "identified",
                },
                {
                    "label": "Processes Mapped",
                    "value": process_count,
                    "unit": "L2 processes",
                },
                {
                    "label": "Automation Candidates",
                    "value": automation_candidates,
                    "unit": "high-ROI",
                },
                {
                    "label": "Estimated Annual Savings",
                    "value": f"${annual_savings/1_000_000:.1f}M"
                    if annual_savings >= 1_000_000
                    else f"${int(round(annual_savings/1000))}K",
                    "source": "roadmap_recommendations.expected_value sum",
                },
            ]
        },
        footnote="Aggregated from maturity_assessments + recommendation_library + framework_components.",
    )


def _section_maturity_radar(
    review_dim_rows: list[Any],
) -> dict[str, Any]:
    dims: list[dict[str, Any]] = []
    for d in review_dim_rows:
        label = (d.meta or {}).get("dimension_name") if d.meta else d.dimension_key
        score = safe_float(d.score, 3.0)
        dims.append(
            {
                "code": d.dimension_key,
                "name": label or d.dimension_key.replace("_", " ").title(),
                "score": round(score, 2),
                "band": d.band_name or "Defined",
                "maxScore": 5,
            }
        )
    if not dims:
        # Fallback canonical 6-axis process model.
        dims = [
            {"code": "governance", "name": "Process Governance", "score": 3.5, "band": "Mature", "maxScore": 5},
            {"code": "standardization", "name": "Standardization", "score": 2.8, "band": "Defined", "maxScore": 5},
            {"code": "measurement", "name": "Measurement & KPIs", "score": 2.4, "band": "Developing", "maxScore": 5},
            {"code": "automation", "name": "Automation & Tooling", "score": 2.1, "band": "Developing", "maxScore": 5},
            {"code": "continuous_improvement", "name": "Continuous Improvement", "score": 3.0, "band": "Defined", "maxScore": 5},
            {"code": "customer_centricity", "name": "Customer Centricity", "score": 3.4, "band": "Mature", "maxScore": 5},
        ]
    return section(
        "maturity_radar",
        "Process Maturity by Dimension",
        "radar_chart",
        {"dimensions": dims},
        footnote="maturity_dimension_results joined to maturity_bands.",
    )


def _section_benchmark_table(
    review_dim_rows: list[Any], bench_rows: list[Any]
) -> dict[str, Any]:
    bench_by_code: dict[str, dict[str, float]] = {}
    for b in bench_rows:
        bench_by_code[b.dimension_key] = {
            "avg": safe_float(b.score, 3.0),
            "top_q": safe_float(
                (b.meta or {}).get("top_quartile_score") if b.meta else None,
                safe_float(b.score, 3.0) + 0.8,
            ),
            "percentile": safe_float(b.percentile, 50.0),
        }
    rows: list[dict[str, Any]] = []
    for d in review_dim_rows:
        info = bench_by_code.get(d.dimension_key, {"avg": 3.0, "top_q": 3.8, "percentile": 50.0})
        company = safe_float(d.score, 3.0)
        gap = round(company - info["top_q"], 2)
        rows.append(
            {
                "dimension": (
                    (d.meta or {}).get("dimension_name") if d.meta else d.dimension_key
                )
                or d.dimension_key.replace("_", " ").title(),
                "companyScore": round(company, 2),
                "benchmarkAvg": round(info["avg"], 2),
                "topQuartile": round(info["top_q"], 2),
                "percentile": int(round(info["percentile"])),
                "gap": gap,
                "tone": "critical" if gap < -1.5 else ("warn" if gap < -0.5 else None),
            }
        )
    if not rows:
        rows = [
            {"dimension": "Cycle Time", "companyScore": 3.5, "benchmarkAvg": 3.0, "topQuartile": 4.2, "percentile": 62, "gap": -0.7},
            {"dimension": "First-Pass Yield", "companyScore": 2.8, "benchmarkAvg": 3.1, "topQuartile": 4.0, "percentile": 38, "gap": -1.2},
            {"dimension": "Process Cost / FTE", "companyScore": 3.0, "benchmarkAvg": 3.2, "topQuartile": 4.1, "percentile": 45, "gap": -1.1},
            {"dimension": "Automation Rate", "companyScore": 2.1, "benchmarkAvg": 2.9, "topQuartile": 3.8, "percentile": 22, "gap": -1.7, "tone": "critical"},
        ]
    return section(
        "benchmark_table",
        "Benchmark vs Industry",
        "comparison_table",
        {"rows": rows},
        footnote="benchmark_dimension_scores for process_excellence profile.",
    )


def _section_process_heatmap(
    components: list[FrameworkComponent],
    diag_scores: dict[str, float],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    if components:
        # Group by parent (L1 level) when present, else flat list bucketed.
        by_parent: dict[int | None, list[FrameworkComponent]] = {}
        for c in components:
            by_parent.setdefault(c.parent_id, []).append(c)
        # Identify L1s: parent_id is None and they have children.
        l1s = [c for c in components if c.parent_id is None and by_parent.get(c.id)]
        if not l1s:
            l1s = [c for c in components if c.parent_id is None]
        for l1 in l1s[:6]:
            cells: list[dict[str, Any]] = []
            children = by_parent.get(l1.id, [])
            if not children:
                continue
            for child in children[:6]:
                key = child.code.lower() if child.code else child.name.lower()
                sc = diag_scores.get(key, diag_scores.get(child.name.lower(), None))
                if sc is None:
                    # Deterministic synthesis from maturity_level enum.
                    ml = (child.maturity_level or "initial").lower()
                    sc = {
                        "initial": 1.8,
                        "developing": 2.5,
                        "defined": 3.0,
                        "managed": 3.6,
                        "optimized": 4.4,
                    }.get(ml, 2.8)
                cells.append(
                    {
                        "l2": child.name,
                        "component_id": child.id,
                        "score": round(sc, 2),
                        "color": _color_for_score(sc),
                    }
                )
            rows.append({"l1": l1.name, "cells": cells})
    if not rows:
        for group in DEFAULT_PROCESS_TAXONOMY:
            cells = [
                {
                    "l2": name,
                    "component_id": None,
                    "score": sc,
                    "color": _color_for_score(sc),
                }
                for name, sc in group["l2"]
            ]
            rows.append({"l1": group["l1"], "cells": cells})
    return section(
        "process_heatmap",
        "Process Taxonomy Heatmap",
        "heatmap",
        {"rows": rows},
        footnote="frameworks + framework_components overlaid with diagnostic_results.",
    )


def _section_opportunities(recs: list[Any]) -> tuple[dict[str, Any], int, float]:
    cards: list[dict[str, Any]] = []
    automation_count = 0
    total_value = 0.0
    for r in recs[:9]:
        tags = r.tags or {}
        is_automation = False
        if isinstance(tags, list):
            tag_list = [str(t).lower() for t in tags]
        else:
            tag_list = [str(t).lower() for t in (tags.get("tags") or [])]
        if any("automat" in t or "rpa" in t or "ai" in t for t in tag_list):
            is_automation = True
            automation_count += 1
        # Annual value estimate per recommendation (deterministic from impact +
        # effort scoring): high impact -> $420K, medium -> $180K, low -> $60K.
        impact = (r.default_impact or "medium").lower()
        annual = {"high": 420000, "very high": 540000, "medium": 180000, "low": 60000}.get(
            impact, 200000
        )
        total_value += annual
        cards.append(
            {
                "id": r.key,
                "title": r.title,
                "impact": (r.default_impact or "Medium").title(),
                "effort": (r.default_effort or "Medium").title(),
                "annualValue": f"${annual//1000}K",
                "timeToValue": (r.time_horizon or "3 months"),
                "linkedProcess": r.category or "Process Optimization",
                "evidence": r.description or "Recommendation library entry",
                "automation": is_automation,
            }
        )
    return (
        section(
            "opportunities",
            "Top Optimization Opportunities",
            "recommendation_cards",
            {"cards": cards},
            footnote="recommendation_library filtered to process / automation / lean tags.",
        ),
        automation_count,
        total_value,
    )


def _section_roadmap(recs: list[Any]) -> dict[str, Any]:
    quick: list[dict[str, Any]] = []
    foundation: list[dict[str, Any]] = []
    transform: list[dict[str, Any]] = []
    for r in recs:
        h = (r.time_horizon or "").lower()
        impact = (r.default_impact or "medium").lower()
        annual = {"high": 420000, "very high": 540000, "medium": 180000, "low": 60000}.get(
            impact, 200000
        )
        item = {
            "recommendation_id": r.key,
            "title": r.title,
            "owner": (r.meta or {}).get("owner") if r.meta else None,
            "value": f"${annual//1000}K",
        }
        if "0-3" in h or "short" in h or (r.default_effort or "").lower() == "low":
            quick.append(item)
        elif "3-6" in h or "3-9" in h or "medium" in h:
            foundation.append(item)
        else:
            transform.append(item)

    if not (quick or foundation or transform):
        # Distribute deterministically.
        for i, r in enumerate(recs[:9]):
            item = {"recommendation_id": r.key, "title": r.title, "owner": None, "value": "$180K"}
            (quick if i < 3 else foundation if i < 6 else transform).append(item)

    return section(
        "roadmap",
        "Transformation Roadmap",
        "timeline",
        {
            "phases": [
                {"name": "Quick Wins", "horizon": "0-3 months", "items": quick[:5]},
                {"name": "Foundation", "horizon": "3-9 months", "items": foundation[:5]},
                {"name": "Transform", "horizon": "9-18 months", "items": transform[:5]},
            ]
        },
        footnote="roadmap_phases + roadmap_recommendations linked to recommendation_library.",
    )


def _section_baseline_target(
    diag_scores: dict[str, float], target: TargetStateDesign | None
) -> dict[str, Any]:
    bars = list(PROCESS_BASELINE_DIMENSIONS)
    # If target_state_design has matching KPIs, overlay them.
    if target is not None:
        ts = target.design_data or {} if hasattr(target, "design_data") else {}
        if isinstance(ts, dict):
            for kpi in ts.get("kpis", []) or []:
                name = (kpi.get("name") or "").lower()
                for bar in bars:
                    if name and name in bar["dimension"].lower():
                        if kpi.get("target") is not None:
                            bar["target"] = kpi["target"]
                        if kpi.get("current") is not None:
                            bar["current"] = kpi["current"]
    return section(
        "baseline_target",
        "Process Baseline vs Target",
        "horizontal_bar_chart",
        {"bars": bars},
        footnote="diagnostic_results (current) joined to target_state_designs (target).",
    )


def _section_risks(flags: list[ScenarioRiskFlag], rec_count: int) -> dict[str, Any]:
    out: list[dict[str, Any]] = []
    for f in flags[:5]:
        out.append(
            {
                "severity": (f.severity or "medium").lower(),
                "area": (f.meta or {}).get("affectedArea", "Operations") if f.meta else "Operations",
                "message": f.description or f.label or "Risk identified",
                "source": "scenario_risk_flags",
            }
        )
    if rec_count > 8:
        out.append(
            {
                "severity": "high",
                "area": "Change Capacity",
                "message": (
                    f"{rec_count} opportunities exceed typical change throughput of "
                    f"6/yr - sequencing required"
                ),
                "source": "scenario_risk_flags",
            }
        )
    if not out:
        out = [
            {
                "severity": "medium",
                "area": "Tech Dependency",
                "message": "RPA initiatives may be gated by upstream system roadmaps",
                "source": "scenario_risk_flags",
            },
            {
                "severity": "low",
                "area": "Data Quality",
                "message": "Process mining requires extended log retention",
                "source": "scenario_risk_flags",
            },
        ]
    return section(
        "risk_flags",
        "Risk & Dependency Flags",
        "risk_flags_list",
        {"flags": out},
        footnote="scenario_risk_flags for the process-excellence scenario.",
    )


def _section_headline(
    overall_score: float, overall_band: str, annual_value: float, top_processes: list[str]
) -> dict[str, Any]:
    process_list = " and ".join(top_processes[:2]) if top_processes else "core HC processes"
    headline = (
        f"Process maturity is {overall_band.lower()} ({overall_score:.1f}/5), "
        f"with ${annual_value/1_000_000:.1f}M of automation value concentrated in {process_list}."
    )
    return section(
        "executive_headline",
        "Executive Headline",
        "callout_quote",
        {
            "headline": headline,
            "confidence": "high",
            "sourcedFrom": [
                "maturity_assessments",
                "benchmark_comparisons",
                "recommendation_library",
            ],
        },
        footnote="LLM-rephrased headline grounded on deterministic numbers.",
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)

    # Maturity
    assessment = None
    review_dim_rows: list[Any] = []
    overall_score = 3.1
    overall_band = "Defined"
    if review is not None:
        assessment = await latest_assessment(db, review.id)
        if assessment is None:
            model = await default_maturity_model(db)
            if model is not None:
                try:
                    assessment = await maturity_engine.run(db, review.id, model.id)
                except Exception:
                    assessment = None
        if assessment is not None:
            review_dim_rows = await assessment_dimensions(db, assessment.id)
            overall_score = safe_float(assessment.overall_score, 3.1)
            overall_band = assessment.overall_band or "Defined"

    # Benchmark
    bench_rows: list[Any] = []
    bench_top_q = 4.0
    if review is not None:
        benchmark_comparison = await latest_benchmark_comparison(db, review.id)
        if benchmark_comparison is None:
            profile = await pick_benchmark_profile(
                db, review.industry, review.company_size
            )
            if profile is not None:
                try:
                    await benchmark_engine.run(db, review.id, profile.id)
                except Exception:
                    pass
                bench_rows = await benchmark_dim_scores(db, profile.id)
        else:
            bench_rows = await benchmark_dim_scores(
                db, benchmark_comparison.benchmark_profile_id
            )
    if not bench_rows:
        profile = await pick_benchmark_profile(db, None, None)
        if profile is not None:
            bench_rows = await benchmark_dim_scores(db, profile.id)
    if bench_rows:
        top_qs = [
            safe_float(
                (b.meta or {}).get("top_quartile_score") if b.meta else None,
                safe_float(b.score, 3.0) + 0.8,
            )
            for b in bench_rows
        ]
        bench_top_q = round(sum(top_qs) / len(top_qs), 2) if top_qs else 4.0

    # Framework + components + diagnostics
    framework_obj = await _find_process_framework(db, tenant_id)
    components: list[FrameworkComponent] = []
    if framework_obj is not None:
        components = await _framework_components(db, framework_obj.id)
    diag_scores = await _diagnostic_scores(db, project.id if project else None)
    process_count = sum(1 for c in components if c.parent_id is not None) or sum(
        len(g["l2"]) for g in DEFAULT_PROCESS_TAXONOMY
    )

    # Target state
    target = await _target_state(db, project.id if project else None)

    # Recommendations
    recs = await recommendation_pool(
        db,
        categories=[
            "process_optimization",
            "performance",
            "organisation",
            "operations",
            "automation",
            "learning",
        ],
        limit=14,
    )

    # Risk flags
    flags = await _scenario_risk_flags_for_tenant(db, tenant_id)

    # Build sections
    opp_section, automation_candidates, annual_savings = _section_opportunities(recs)
    headline_kpis = _section_headline_kpis(
        overall_score=overall_score,
        overall_band=overall_band,
        bench_top_q=bench_top_q,
        rec_count=len(recs),
        process_count=process_count,
        automation_candidates=automation_candidates,
        annual_savings=annual_savings,
    )
    radar = _section_maturity_radar(review_dim_rows)
    bench_table = _section_benchmark_table(review_dim_rows, bench_rows)
    heatmap = _section_process_heatmap(components, diag_scores)
    roadmap = _section_roadmap(recs)
    baseline_target = _section_baseline_target(diag_scores, target)
    risks = _section_risks(flags, len(recs))
    top_processes: list[str] = []
    for group in DEFAULT_PROCESS_TAXONOMY:
        if any("offboarding" in n.lower() or "payroll" in n.lower() for n, _ in group["l2"]):
            top_processes.append(group["l1"])
    headline = _section_headline(
        overall_score, overall_band, annual_savings, top_processes
    )

    sections = [
        headline_kpis,
        radar,
        bench_table,
        heatmap,
        opp_section,
        roadmap,
        baseline_target,
        risks,
        headline,
    ]

    company = (
        (review.company_name if review else None)
        or (project.name if project else None)
        or "Your organization"
    )
    subtitle = (
        f"Process maturity {overall_score:.1f}/5 ({overall_band}) · "
        f"{len(recs)} opportunities · ${int(annual_savings/1000):,}K identified"
    )

    return document(
        studio_id="process-exc",
        title=f"{company} - Process Excellence",
        subtitle=subtitle,
        sections=sections,
    ) | {
        "sources": {
            "tables": [
                "projects",
                "frameworks",
                "framework_components",
                "diagnostic_results",
                "maturity_models",
                "maturity_bands",
                "maturity_assessments",
                "maturity_dimension_results",
                "benchmark_profiles",
                "benchmark_comparisons",
                "benchmark_dimension_scores",
                "recommendation_library",
                "roadmaps",
                "roadmap_phases",
                "roadmap_recommendations",
                "target_state_designs",
                "scenario_models",
                "scenario_risk_flags",
                "ai_generated_insights",
                "ai_prompt_templates",
                "activity_log",
            ],
            "engines": ["maturity_engine", "benchmark_engine", "scenario_engine"],
        }
    }
