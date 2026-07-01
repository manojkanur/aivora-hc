"""Employee Experience Studio output builder.

Infographic-style EX dashboard with maturity radar, benchmark comparison,
journey swimlane (maturity dimensions + activity_log signals), workforce
segments, recommended initiatives, and activity pulse trend.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.activity_log import ActivityLog
from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkDimensionScore,
    BenchmarkProfile,
)
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityBand,
    MaturityDimensionResult,
    MaturityModel,
)
from app.models.hc_platform.mobility import EmployeeMobilityProfile
from app.models.hc_platform.projects import Project
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapRecommendation,
)
from app.models.hc_platform.scenarios import ScenarioRiskFlag


_STUDIO_ID = "employee-exp"


_JOURNEY_STAGES = [
    "attract",
    "onboard",
    "develop",
    "perform",
    "recognize",
    "grow",
    "exit",
]


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


async def _latest_ex_assessment(
    db: AsyncSession, tenant_id: uuid.UUID
) -> MaturityAssessment | None:
    # Prefer an EX-specific model if seeded; otherwise fall back to latest assessment
    ex_model = (
        await db.execute(
            select(MaturityModel).where(
                MaturityModel.key.in_(["ex_maturity_v1", "employee_experience"])
            )
        )
    ).scalar_one_or_none()

    stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.tenant_id == tenant_id)
        .order_by(desc(MaturityAssessment.computed_at))
        .limit(1)
    )
    if ex_model is not None:
        stmt = stmt.where(MaturityAssessment.maturity_model_id == ex_model.id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _section_kpis(
    db: AsyncSession, tenant_id: uuid.UUID, assessment: MaturityAssessment | None
) -> dict[str, Any]:
    ninety = datetime.now(timezone.utc) - timedelta(days=90)

    # Engagement / flight risk from employee_mobility_profiles meta
    profiles = (
        await db.execute(
            select(EmployeeMobilityProfile).where(
                EmployeeMobilityProfile.tenant_id == tenant_id
            )
        )
    ).scalars().all()

    eng_values: list[float] = []
    flight_values: list[float] = []
    for p in profiles:
        m = p.meta or {}
        if isinstance(m, dict):
            if "engagement_score" in m:
                eng_values.append(_to_float(m["engagement_score"]))
            if "flight_risk_score" in m:
                flight_values.append(_to_float(m["flight_risk_score"]))

    avg_engagement = (
        round(sum(eng_values) / len(eng_values), 1) if eng_values else 0
    )
    flight_high = (
        round(sum(1 for v in flight_values if v > 0.6) / len(flight_values) * 100, 1)
        if flight_values
        else 0
    )

    active_ex_projects = (
        await db.execute(
            select(func.count(Project.id)).where(
                Project.tenant_id == tenant_id,
                Project.status == "active",
            )
        )
    ).scalar() or 0

    signals_90d = (
        await db.execute(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.tenant_id == tenant_id,
                ActivityLog.created_at >= ninety,
            )
        )
    ).scalar() or 0

    overall_score = (
        round(_to_float(assessment.overall_score), 2) if assessment else 0.0
    )
    overall_band = assessment.overall_band if assessment else "Unknown"

    kpis = [
        {
            "label": "EX Maturity",
            "value": overall_score,
            "scale": 5,
            "band": overall_band,
        },
        {
            "label": "Avg Engagement",
            "value": avg_engagement,
            "unit": "%",
        },
        {
            "label": "Flight Risk Cohort",
            "value": flight_high,
            "unit": "% > 0.6",
        },
        {
            "label": "Active EX Initiatives",
            "value": int(active_ex_projects),
        },
        {
            "label": "EX Signals (90d)",
            "value": int(signals_90d),
        },
        {
            "label": "Profiles Analyzed",
            "value": len(profiles),
        },
    ]
    return {"kpis": kpis}


async def _section_maturity_radar(
    db: AsyncSession, tenant_id: uuid.UUID, assessment: MaturityAssessment | None
) -> dict[str, Any]:
    if assessment is None:
        return {"dimensions": []}
    rows = (
        await db.execute(
            select(MaturityDimensionResult)
            .where(MaturityDimensionResult.assessment_id == assessment.id)
            .order_by(MaturityDimensionResult.dimension_key)
        )
    ).scalars().all()
    dims = [
        {
            "code": r.dimension_key,
            "name": (r.meta or {}).get("dimension_name") if r.meta else r.dimension_key,
            "score": round(_to_float(r.score), 2),
            "target": 4.0,
            "band": r.band_name,
        }
        for r in rows
    ]
    return {"dimensions": dims}


async def _section_benchmark(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    comp = (
        await db.execute(
            select(BenchmarkComparison)
            .where(BenchmarkComparison.tenant_id == tenant_id)
            .order_by(desc(BenchmarkComparison.computed_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if comp is None:
        return {"rows": [], "profile_name": None}

    profile = await db.get(BenchmarkProfile, comp.benchmark_profile_id)
    data = comp.comparison_data or {}
    rows = []
    for d in data.get("dimensions", []):
        rows.append(
            {
                "dimension": d.get("dimensionName") or d.get("dimensionCode"),
                "company": _to_float(d.get("companyScore")),
                "peer_avg": _to_float(d.get("benchmarkAverage")),
                "top_quartile": _to_float(d.get("topQuartile")),
                "gap_to_top": round(
                    _to_float(d.get("companyScore")) - _to_float(d.get("topQuartile")),
                    2,
                ),
                "positioning": d.get("positioning", "unknown"),
            }
        )
    return {
        "rows": rows,
        "profile_name": profile.name if profile else None,
        "overall_positioning": comp.overall_positioning,
    }


async def _section_journey_swimlane(
    db: AsyncSession, tenant_id: uuid.UUID, assessment: MaturityAssessment | None
) -> dict[str, Any]:
    ninety = datetime.now(timezone.utc) - timedelta(days=90)

    # maturity score per stage (if dimensions align)
    dim_score: dict[str, float] = {}
    if assessment is not None:
        rows = (
            await db.execute(
                select(MaturityDimensionResult).where(
                    MaturityDimensionResult.assessment_id == assessment.id
                )
            )
        ).scalars().all()
        for r in rows:
            key = (r.dimension_key or "").lower()
            for stage in _JOURNEY_STAGES:
                if stage in key:
                    dim_score[stage] = round(_to_float(r.score), 2)
                    break

    # activity_log signals by stage tag
    signal_rows = (
        await db.execute(
            select(ActivityLog.entity_type, func.count(ActivityLog.id))
            .where(
                ActivityLog.tenant_id == tenant_id,
                ActivityLog.created_at >= ninety,
            )
            .group_by(ActivityLog.entity_type)
        )
    ).all()
    signal_by_type = {(t or "").lower(): int(c) for t, c in signal_rows}

    stages_out = []
    for stage in _JOURNEY_STAGES:
        count = sum(c for t, c in signal_by_type.items() if stage in t)
        maturity = dim_score.get(stage, 0.0)
        # Heat heuristic: signals normalized + (5 - maturity)/5
        heat = round(min(1.0, count / 200) * 0.5 + (5 - maturity) / 5 * 0.5, 2)
        stages_out.append(
            {
                "key": stage,
                "label": stage.title(),
                "maturity": maturity,
                "pain_heat": heat,
                "signal_count": count,
            }
        )
    return {"stages": stages_out}


async def _section_segments(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    profiles = (
        await db.execute(
            select(EmployeeMobilityProfile).where(
                EmployeeMobilityProfile.tenant_id == tenant_id
            )
        )
    ).scalars().all()

    segments: dict[str, dict[str, Any]] = {}
    for p in profiles:
        tenure = p.tenure_months or 0
        if tenure <= 24:
            seg = "Early Career"
        elif tenure <= 84:
            seg = "Mid Career"
        else:
            seg = "Leaders"
        s = segments.setdefault(
            seg,
            {
                "segment": seg,
                "headcount": 0,
                "engagement_sum": 0.0,
                "engagement_n": 0,
                "flight_sum": 0.0,
                "flight_n": 0,
            },
        )
        s["headcount"] += 1
        m = p.meta or {}
        if isinstance(m, dict):
            if "engagement_score" in m:
                s["engagement_sum"] += _to_float(m["engagement_score"])
                s["engagement_n"] += 1
            if "flight_risk_score" in m:
                s["flight_sum"] += _to_float(m["flight_risk_score"])
                s["flight_n"] += 1

    out = []
    for seg in segments.values():
        eng = (
            round(seg["engagement_sum"] / seg["engagement_n"], 1)
            if seg["engagement_n"]
            else 0
        )
        flt = (
            round(seg["flight_sum"] / seg["flight_n"], 2)
            if seg["flight_n"]
            else 0
        )
        priority = (
            "high" if flt > 0.55 else "medium" if flt > 0.35 else "low"
        )
        out.append(
            {
                "segment": seg["segment"],
                "headcount": seg["headcount"],
                "engagement": eng,
                "flight_risk": flt,
                "ex_priority": priority,
            }
        )
    return {"segments": out}


async def _section_recommendations(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    # First look in roadmap_recommendations for EX-tagged items
    rm_rows = (
        await db.execute(
            select(RoadmapRecommendation)
            .where(
                RoadmapRecommendation.tenant_id == tenant_id,
                RoadmapRecommendation.category.in_(
                    ["employee_experience", "culture", "engagement", "ex"]
                ),
            )
            .order_by(RoadmapRecommendation.sort_order)
            .limit(6)
        )
    ).scalars().all()

    if rm_rows:
        recs = [
            {
                "id": str(r.id),
                "title": r.title,
                "description": r.description,
                "impact": r.impact,
                "effort": r.effort,
                "horizon": r.time_horizon,
                "tier": r.tier,
            }
            for r in rm_rows
        ]
    else:
        # fallback to library
        lib_rows = (
            await db.execute(
                select(RecommendationLibrary)
                .where(
                    RecommendationLibrary.category.in_(
                        ["culture", "engagement", "talent"]
                    )
                )
                .order_by(RecommendationLibrary.tier.nullslast())
                .limit(6)
            )
        ).scalars().all()
        recs = [
            {
                "id": r.key,
                "title": r.title,
                "description": r.description,
                "impact": r.default_impact,
                "effort": r.default_effort,
                "horizon": r.time_horizon,
                "tier": r.tier,
            }
            for r in lib_rows
        ]
    return {"recommendations": recs}


async def _section_activity_pulse(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    ninety = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (
        await db.execute(
            select(
                func.date_trunc("week", ActivityLog.created_at).label("week"),
                ActivityLog.action,
                func.count(ActivityLog.id),
            )
            .where(
                ActivityLog.tenant_id == tenant_id,
                ActivityLog.created_at >= ninety,
            )
            .group_by("week", ActivityLog.action)
            .order_by("week")
        )
    ).all()
    buckets: dict[str, dict[str, Any]] = {}
    for week, action, count in rows:
        wk_key = week.date().isoformat() if week else "unknown"
        buckets.setdefault(wk_key, {"week": wk_key})
        buckets[wk_key][action or "other"] = int(count)
    return {"buckets": list(buckets.values())}


async def _section_risk_flags(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    assessment: MaturityAssessment | None,
    segments: dict[str, Any],
) -> dict[str, Any]:
    flags = []
    # Maturity-dimension low score flags
    if assessment is not None:
        rows = (
            await db.execute(
                select(MaturityDimensionResult)
                .where(
                    MaturityDimensionResult.assessment_id == assessment.id,
                    MaturityDimensionResult.score < 2.5,
                )
                .order_by(MaturityDimensionResult.score)
                .limit(3)
            )
        ).scalars().all()
        for r in rows:
            flags.append(
                {
                    "severity": "high" if _to_float(r.score) < 2.0 else "medium",
                    "area": r.dimension_key,
                    "message": (
                        f"{r.dimension_key} score {round(_to_float(r.score),2)} - below maturity threshold"
                    ),
                    "source": "maturity_dimension_results",
                }
            )

    # Segment flight risk flags
    for s in segments.get("segments", []):
        if s["flight_risk"] > 0.55:
            flags.append(
                {
                    "severity": "high",
                    "area": s["segment"],
                    "message": (
                        f"{s['segment']} segment shows flight risk {s['flight_risk']} across "
                        f"{s['headcount']} employees"
                    ),
                    "source": "employee_mobility_profiles",
                }
            )

    # Scenario-derived flags
    scen_rows = (
        await db.execute(
            select(ScenarioRiskFlag).limit(3)
        )
    ).scalars().all()
    for r in scen_rows:
        flags.append(
            {
                "severity": r.severity or "medium",
                "area": r.label or "Scenario",
                "message": r.description or "Scenario risk flagged",
                "source": "scenario_risk_flags",
            }
        )

    return {"flags": flags}


async def _section_headline(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    deterministic_payload: dict[str, Any],
) -> dict[str, Any]:
    kpis_list = deterministic_payload["kpis"]["kpis"]
    kpis = {k["label"]: k for k in kpis_list}
    bench = deterministic_payload.get("benchmark_table", {}).get("rows", [])
    segs = deterministic_payload.get("segments", {}).get("segments", [])

    maturity_band = kpis.get("EX Maturity", {}).get("band", "Unknown")
    maturity_score = kpis.get("EX Maturity", {}).get("value", 0)
    worst_dim = min(bench, key=lambda r: r["gap_to_top"]) if bench else None
    riskiest_seg = (
        max(segs, key=lambda s: s["flight_risk"]) if segs else None
    )

    parts = [
        f"EX is {maturity_band} ({maturity_score}/5)",
    ]
    if worst_dim:
        parts.append(
            f"weakest dimension {worst_dim['dimension']} lags top quartile by {abs(worst_dim['gap_to_top'])}"
        )
    if riskiest_seg:
        parts.append(
            f"{riskiest_seg['segment']} segment carries {riskiest_seg['flight_risk']} flight risk"
        )
    text = "; ".join(parts) + "."
    return {
        "text": text,
        "confidence": "medium",
        "sources": [
            "maturity_assessments",
            "benchmark_comparisons",
            "employee_mobility_profiles",
        ],
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    assessment = await _latest_ex_assessment(db, tenant_id)

    kpis = await _section_kpis(db, tenant_id, assessment)
    radar = await _section_maturity_radar(db, tenant_id, assessment)
    benchmark = await _section_benchmark(db, tenant_id)
    journey = await _section_journey_swimlane(db, tenant_id, assessment)
    segments = await _section_segments(db, tenant_id)
    recommendations = await _section_recommendations(db, tenant_id)
    pulse = await _section_activity_pulse(db, tenant_id)
    risk_flags = await _section_risk_flags(db, tenant_id, assessment, segments)
    headline = await _section_headline(
        db,
        tenant_id,
        {
            "kpis": kpis,
            "benchmark_table": benchmark,
            "segments": segments,
        },
    )

    org_name = None
    if brief:
        org_name = (brief.get("organization") or {}).get("organizationName")

    sections = [
        {"id": "kpis", "title": "EX Health KPIs", "layout": "kpi_grid", "data": kpis},
        {
            "id": "maturity_radar",
            "title": "EX Maturity by Dimension",
            "layout": "radar_chart",
            "data": radar,
        },
        {
            "id": "benchmark_table",
            "title": "Benchmark vs Industry",
            "layout": "comparison_table",
            "data": benchmark,
        },
        {
            # TODO: replace demo items with real top engagement drivers
            # ranked from engagement_survey_responses when computed.
            "id": "engagement_drivers",
            "title": "Top Culture & Engagement Drivers",
            "layout": "ranked_list",
            "data": {
                "items": [
                    {"rank": 1, "title": "Manager quality", "score": 0.86,
                     "subtitle": "Strongest correlation with intent-to-stay"},
                    {"rank": 2, "title": "Career growth & mobility", "score": 0.79,
                     "subtitle": "Top driver among high-potential segment"},
                    {"rank": 3, "title": "Recognition", "score": 0.72,
                     "subtitle": "Weakest among tenured 5y+ population"},
                    {"rank": 4, "title": "Psychological safety", "score": 0.68,
                     "subtitle": "Significant variance across functions"},
                    {"rank": 5, "title": "Workload sustainability", "score": 0.61,
                     "subtitle": "Flagged risk in Engineering + Ops"},
                ],
                "scoreFormat": "percent",
            },
            "footnote": "Demo values — wire to real engagement_survey_responses driver analysis.",
        },
        {
            "id": "journey_swimlane",
            "title": "Employee Journey Swimlane with Pain Heat",
            "layout": "swimlane",
            "data": journey,
        },
        {
            "id": "segments",
            "title": "Workforce Segments & Flight Risk",
            "layout": "horizontal_bar_chart",
            "data": segments,
        },
        {
            "id": "recommendations",
            "title": "Top Improvement Initiatives",
            "layout": "recommendation_cards",
            "data": recommendations,
        },
        {
            "id": "activity_pulse",
            "title": "EX Activity Pulse (90d)",
            "layout": "timeline",
            "data": pulse,
        },
        {
            "id": "risk_flags",
            "title": "EX Risk Flags",
            "layout": "risk_flags_list",
            "data": risk_flags,
        },
        {
            "id": "headline",
            "title": "Executive Headline",
            "layout": "callout_quote",
            "data": headline,
        },
    ]

    return {
        "studio_id": _STUDIO_ID,
        "title": "Employee Experience",
        "subtitle": (
            f"EX dashboard for {org_name}"
            if org_name
            else "Employee experience diagnostic"
        ),
        "sections": sections,
    }
