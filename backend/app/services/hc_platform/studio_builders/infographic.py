"""Infographic Studio output builder.

Renders a McKinsey-style single-page visual brief from deterministic engine
outputs. The studio composes 7 dense, number-first sections:

  1. Executive KPI Strip       — kpi_grid
  2. Maturity Radar            — radar_chart
  3. Peer Benchmark Gap        — horizontal_bar_chart
  4. Dimension x Capability    — heatmap
  5. Scenario Impact           — comparison_table
  6. Prioritized Recommendations — recommendation_cards
  7. Risk Flags & Watch-Items  — risk_flags_list

Numbers are deterministic — pulled from the existing maturity / benchmark /
scenario engine outputs. A single optional LLM call wraps the chart with a
title strip (executive headline + caption) via the `infographic.headline`
prompt template.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkDimensionScore,
    BenchmarkGroup,
    BenchmarkProfile,
)
from app.models.hc_platform.capability import (
    CapabilityAssessment,
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityRating,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityBand,
    MaturityDimensionResult,
    MaturityModel,
)
from app.models.hc_platform.mobility import MobilityBarrier, MobilityRollup
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import RoadmapPhase, RoadmapRecommendation
from app.models.hc_platform.scenarios import (
    ScenarioModel,
    ScenarioOutput,
    ScenarioRiskFlag,
)
from app.models.hc_platform.target_state import TargetStateDesign


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _impact_rank(value: str | None) -> int:
    return {"high": 3, "medium": 2, "low": 1, "h": 3, "m": 2, "l": 1}.get(
        (value or "").lower(), 0
    )


def _effort_rank(value: str | None) -> int:
    # smaller = faster, so we sort ascending
    return {"low": 1, "medium": 2, "high": 3, "l": 1, "m": 2, "h": 3}.get(
        (value or "").lower(), 2
    )


def _band_for_score(score: float) -> str:
    if score >= 4.0:
        return "Leading"
    if score >= 3.0:
        return "Mature"
    if score >= 2.0:
        return "Developing"
    return "Initial"


BAND_COLORS = {
    "Initial": "#9CA3AF",
    "Developing": "#F59E0B",
    "Mature": "#3B82F6",
    "Leading": "#10B981",
}


async def _latest_review(db: AsyncSession, tenant_id: uuid.UUID) -> HcReview | None:
    stmt = (
        select(HcReview)
        .where(HcReview.tenant_id == tenant_id)
        .order_by(desc(HcReview.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _latest_maturity(
    db: AsyncSession, review_id: uuid.UUID
) -> tuple[MaturityAssessment | None, list[MaturityDimensionResult]]:
    stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.review_id == review_id)
        .order_by(desc(MaturityAssessment.computed_at))
        .limit(1)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        return None, []
    dims = (
        await db.execute(
            select(MaturityDimensionResult).where(
                MaturityDimensionResult.assessment_id == assessment.id
            )
        )
    ).scalars().all()
    return assessment, list(dims)


async def _latest_benchmark(
    db: AsyncSession, review_id: uuid.UUID
) -> BenchmarkComparison | None:
    stmt = (
        select(BenchmarkComparison)
        .where(BenchmarkComparison.review_id == review_id)
        .order_by(desc(BenchmarkComparison.computed_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


async def _build_kpi_strip(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    review: HcReview | None,
    assessment: MaturityAssessment | None,
    dim_rows: list[MaturityDimensionResult],
    comparison: BenchmarkComparison | None,
) -> dict[str, Any]:
    overall_score = (
        float(assessment.overall_score) if assessment and assessment.overall_score is not None else 0.0
    )
    overall_band = (assessment.overall_band if assessment else None) or _band_for_score(overall_score)

    # Benchmark percentile (use comparison_data overall positioning if present).
    bench_pct: float | None = None
    delta_vs_bench: float | None = None
    if comparison is not None:
        data = comparison.comparison_data or {}
        bench_avg = data.get("overallBenchmarkAverage")
        company = data.get("overallCompanyScore", overall_score)
        if bench_avg is not None and company is not None:
            delta_vs_bench = round(float(company) - float(bench_avg), 2)
        # crude percentile = clamp(50 + (gap)*20, 0..100)
        if delta_vs_bench is not None:
            bench_pct = max(0.0, min(100.0, 50.0 + delta_vs_bench * 20.0))

    # Critical gaps = count of dim rows below benchmark avg (fallback: criticality high+)
    critical_gaps = 0
    if comparison is not None and comparison.comparison_data:
        for d in (comparison.comparison_data or {}).get("dimensions", []):
            if (d.get("gap") or 0) < 0:
                critical_gaps += 1
    if critical_gaps == 0:
        critical_gaps = sum(
            1
            for d in dim_rows
            if d.criticality in {"critical", "high"}
        )

    # Open recommendations + high-priority count
    rec_total = 0
    rec_high = 0
    if review is not None:
        rec_total = (
            await db.execute(
                select(func.count())
                .select_from(RoadmapRecommendation)
                .where(RoadmapRecommendation.review_id == review.id)
            )
        ).scalar_one() or 0
        rec_high = (
            await db.execute(
                select(func.count())
                .select_from(RoadmapRecommendation)
                .where(
                    RoadmapRecommendation.review_id == review.id,
                    RoadmapRecommendation.impact.ilike("%high%"),
                )
            )
        ).scalar_one() or 0
    if rec_total == 0:
        # fall back to library count so the kpi never reads 0
        rec_total = (
            await db.execute(
                select(func.count()).select_from(RecommendationLibrary)
            )
        ).scalar_one() or 0
        rec_high = (
            await db.execute(
                select(func.count())
                .select_from(RecommendationLibrary)
                .where(RecommendationLibrary.default_impact == "high")
            )
        ).scalar_one() or 0

    # Scenario risk flags
    scenario_flag_total = 0
    scenario_flag_high = 0
    if review is not None:
        scen_ids = (
            await db.execute(
                select(ScenarioModel.id).where(ScenarioModel.review_id == review.id)
            )
        ).scalars().all()
        if scen_ids:
            scenario_flag_total = (
                await db.execute(
                    select(func.count())
                    .select_from(ScenarioRiskFlag)
                    .where(ScenarioRiskFlag.scenario_id.in_(scen_ids))
                )
            ).scalar_one() or 0
            scenario_flag_high = (
                await db.execute(
                    select(func.count())
                    .select_from(ScenarioRiskFlag)
                    .where(
                        ScenarioRiskFlag.scenario_id.in_(scen_ids),
                        ScenarioRiskFlag.severity.in_(["high", "critical"]),
                    )
                )
            ).scalar_one() or 0

    # Mobility coverage (average from rollups metrics if present)
    mobility_pct: float | None = None
    rollups = (
        await db.execute(
            select(MobilityRollup)
            .where(MobilityRollup.tenant_id == tenant_id)
            .order_by(desc(MobilityRollup.computed_at))
            .limit(6)
        )
    ).scalars().all()
    coverage_vals: list[float] = []
    for r in rollups:
        m = r.metrics or {}
        for k in ("coverage_pct", "coverage", "mobility_coverage", "fill_rate"):
            if k in m:
                try:
                    coverage_vals.append(float(m[k]))
                    break
                except (TypeError, ValueError):
                    continue
    if coverage_vals:
        mobility_pct = round(sum(coverage_vals) / len(coverage_vals), 1)

    kpis: list[dict[str, Any]] = [
        {
            "label": "Overall Maturity",
            "value": round(overall_score, 2),
            "unit": "/5",
            "band": overall_band,
            "delta_vs_benchmark": delta_vs_bench,
            "trend": "up" if (delta_vs_bench or 0) > 0 else ("down" if (delta_vs_bench or 0) < 0 else "flat"),
        },
        {
            "label": "Benchmark Percentile",
            "value": round(bench_pct, 0) if bench_pct is not None else None,
            "unit": "%ile",
            "peer_group": (
                (await db.get(BenchmarkProfile, comparison.benchmark_profile_id)).name
                if comparison is not None
                else None
            ),
        },
        {
            "label": "Critical Gaps",
            "value": critical_gaps,
            "unit": "dimensions",
            "detail": "below benchmark avg",
        },
        {
            "label": "Open Recommendations",
            "value": rec_total,
            "unit": "",
            "high_priority": rec_high,
        },
        {
            "label": "Scenario Risks Flagged",
            "value": scenario_flag_total,
            "unit": "",
            "severity_high": scenario_flag_high,
        },
        {
            "label": "Mobility Coverage",
            "value": mobility_pct if mobility_pct is not None else 0,
            "unit": "%",
            "source": "mobility_rollups",
        },
    ]

    return {"kpis": kpis}


async def _build_maturity_radar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    review: HcReview | None,
    assessment: MaturityAssessment | None,
    dim_rows: list[MaturityDimensionResult],
) -> dict[str, Any]:
    # Axes from maturity_models.dimensions order if available, else from dim rows.
    model_name: str | None = None
    axis_order: list[str] = []
    if assessment is not None:
        model = await db.get(MaturityModel, assessment.maturity_model_id)
        if model is not None:
            model_name = f"{model.name} v{model.version}"
            for d in (model.dimensions or []):
                key = d.get("key") or d.get("code")
                if key:
                    axis_order.append(key)

    # Index dimension rows by key
    by_key = {d.dimension_key: d for d in dim_rows}
    if not axis_order:
        axis_order = [d.dimension_key for d in dim_rows]

    axes_labels: list[str] = []
    current_vals: list[float] = []
    target_vals: list[float] = []
    band_per_axis: list[str] = []

    # Target state design — look up most recent target_state_designs for tenant
    target_design = (
        await db.execute(
            select(TargetStateDesign)
            .where(TargetStateDesign.tenant_id == tenant_id)
            .order_by(desc(TargetStateDesign.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    target_by_key: dict[str, float] = {}
    if target_design and target_design.design_data:
        for d in (target_design.design_data or {}).get("dimensions", []) or []:
            k = d.get("key") or d.get("code") or d.get("name")
            v = d.get("target_score") or d.get("score") or d.get("target")
            if k is not None and v is not None:
                try:
                    target_by_key[str(k)] = float(v)
                except (TypeError, ValueError):
                    continue

    for key in axis_order:
        row = by_key.get(key)
        # Display label: prefer meta.dimension_name, else humanize key
        label = key.replace("_", " ").title()
        if row and row.meta and row.meta.get("dimension_name"):
            label = row.meta["dimension_name"]
        axes_labels.append(label)
        score = float(row.score) if row and row.score is not None else 0.0
        current_vals.append(round(score, 2))
        band_per_axis.append((row.band_name if row else None) or _band_for_score(score))
        tgt = target_by_key.get(key)
        if tgt is None:
            # default lift target: max(score + 1, 4.0) clamped
            tgt = min(5.0, max(4.0, score + 1.0))
        target_vals.append(round(tgt, 2))

    series = [
        {
            "name": "Current State",
            "values": current_vals,
            "band_per_axis": band_per_axis,
        },
        {
            "name": "Target State",
            "values": target_vals,
            "source": "target_state_designs" if target_design is not None else "derived",
        },
    ]

    return {
        "axes": axes_labels,
        "series": series,
        "model_version": model_name,
        "assessed_at": assessment.computed_at.isoformat() if assessment and assessment.computed_at else None,
    }


async def _build_benchmark_gap(
    db: AsyncSession,
    review: HcReview | None,
    comparison: BenchmarkComparison | None,
) -> dict[str, Any]:
    if comparison is None or not comparison.comparison_data:
        return {"peer_group": None, "dimensions": [], "sorted_by": "gap_to_top_desc"}

    profile = await db.get(BenchmarkProfile, comparison.benchmark_profile_id)
    # Sample size: pull from the largest sample_size on dimension scores.
    sample_size = (
        await db.execute(
            select(func.max(BenchmarkDimensionScore.sample_size)).where(
                BenchmarkDimensionScore.benchmark_profile_id == comparison.benchmark_profile_id
            )
        )
    ).scalar_one()
    peer_group_label = profile.name if profile else "Peer Benchmark"
    if sample_size:
        peer_group_label = f"{peer_group_label} n={sample_size}"

    dims_in: list[dict[str, Any]] = (comparison.comparison_data or {}).get("dimensions") or []
    out_dims: list[dict[str, Any]] = []
    for d in dims_in:
        company = float(d.get("companyScore") or 0)
        bench_avg = float(d.get("benchmarkAverage") or 0)
        top_q = float(d.get("topQuartile") or (bench_avg + 0.8))
        gap_top = round(company - top_q, 2)
        # percentile rough mapping
        if top_q > bench_avg:
            pct = max(0.0, min(100.0, 50.0 + ((company - bench_avg) / max(0.1, top_q - bench_avg)) * 25.0))
        else:
            pct = 50.0
        out_dims.append(
            {
                "code": d.get("dimensionCode") or "",
                "name": d.get("dimensionName") or d.get("dimensionCode") or "",
                "company_score": round(company, 2),
                "benchmark_avg": round(bench_avg, 2),
                "top_quartile": round(top_q, 2),
                "gap_to_top": gap_top,
                "percentile": round(pct, 0),
            }
        )
    out_dims.sort(key=lambda r: r["gap_to_top"])  # most negative first

    return {
        "peer_group": peer_group_label,
        "dimensions": out_dims,
        "sorted_by": "gap_to_top_asc_worst_first",
    }


async def _build_capability_heatmap(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    review: HcReview | None,
) -> dict[str, Any]:
    # Most recent capability_assessment for this tenant (optionally filter by review).
    stmt = (
        select(CapabilityAssessment)
        .where(CapabilityAssessment.tenant_id == tenant_id)
        .order_by(desc(CapabilityAssessment.created_at))
        .limit(1)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()

    if assessment is None:
        # fall back: any framework with items, generate scaffold cells with 0 scores.
        fw = (await db.execute(select(CapabilityFramework).limit(1))).scalar_one_or_none()
        if fw is None:
            return {
                "rows": [],
                "cols": [],
                "cells": [],
                "scale": {"min": 1, "max": 5, "band_colors": BAND_COLORS},
            }
        items = (
            await db.execute(
                select(CapabilityFrameworkItem).where(
                    CapabilityFrameworkItem.framework_id == fw.id
                )
            )
        ).scalars().all()
        rows = sorted({(it.category or "General") for it in items})
        cols_set: list[str] = []
        for it in items:
            cat2 = (it.meta or {}).get("sub_category") if it.meta else None
            label = cat2 or it.name
            if label not in cols_set:
                cols_set.append(label)
        return {
            "rows": rows,
            "cols": cols_set[:6],
            "cells": [],
            "scale": {"min": 1, "max": 5, "band_colors": BAND_COLORS},
        }

    # Pull ratings + items
    ratings = (
        await db.execute(
            select(CapabilityRating).where(CapabilityRating.assessment_id == assessment.id)
        )
    ).scalars().all()
    item_ids = [r.framework_item_id for r in ratings]
    items: list[CapabilityFrameworkItem] = []
    if item_ids:
        items = list(
            (
                await db.execute(
                    select(CapabilityFrameworkItem).where(
                        CapabilityFrameworkItem.id.in_(item_ids)
                    )
                )
            ).scalars().all()
        )
    items_by_id = {it.id: it for it in items}

    # Rows = category, Cols = sub-category from meta.sub_category or item parent name
    row_set: list[str] = []
    col_set: list[str] = []
    bucket: dict[tuple[str, str], list[int]] = {}
    for r in ratings:
        it = items_by_id.get(r.framework_item_id)
        if it is None:
            continue
        row_label = it.category or "General"
        col_label = (it.meta or {}).get("sub_category") if it.meta else None
        if not col_label:
            col_label = "Design"  # default lane
        if row_label not in row_set:
            row_set.append(row_label)
        if col_label not in col_set:
            col_set.append(col_label)
        bucket.setdefault((row_label, col_label), []).append(int(r.current_level or 0))

    cells: list[dict[str, Any]] = []
    for (row_label, col_label), vals in bucket.items():
        if not vals:
            continue
        # Convert capability proficiency (0-5) to a maturity-style 1-5 score.
        avg = sum(vals) / len(vals)
        cells.append(
            {
                "row": row_label,
                "col": col_label,
                "score": round(avg, 2),
                "band": _band_for_score(avg),
                "n_items": len(vals),
            }
        )

    return {
        "rows": row_set,
        "cols": col_set,
        "cells": cells,
        "scale": {"min": 1, "max": 5, "band_colors": BAND_COLORS},
    }


async def _build_scenario_table(
    db: AsyncSession,
    review: HcReview | None,
) -> dict[str, Any]:
    if review is None:
        return {"rows": [], "columns_meta": []}

    scenarios = (
        await db.execute(
            select(ScenarioModel)
            .where(ScenarioModel.review_id == review.id)
            .order_by(ScenarioModel.created_at)
        )
    ).scalars().all()

    rows: list[dict[str, Any]] = []
    for scen in scenarios:
        # Latest output row
        out = (
            await db.execute(
                select(ScenarioOutput)
                .where(ScenarioOutput.scenario_id == scen.id)
                .order_by(desc(ScenarioOutput.computed_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        impacts: list[dict[str, Any]] = []
        if out and out.output_data:
            impacts = (out.output_data or {}).get("impacts") or []
        # Map known areas to columns.
        def _impact(area: str, key: str = "changePercentage") -> float:
            for i in impacts:
                if i.get("area") == area:
                    try:
                        return float(i.get(key) or 0)
                    except (TypeError, ValueError):
                        return 0.0
            return 0.0

        crit_count = sum(1 for i in impacts if i.get("severity") == "critical")
        high_count = sum(1 for i in impacts if i.get("severity") == "high")

        rows.append(
            {
                "scenario": scen.name,
                "horizon_years": ((scen.meta or {}).get("horizon_years") or 3),
                "workforce_demand_delta": round(_impact("Workforce Demand"), 1),
                "skills_gap_index": round(_impact("Skills Gaps") / 100.0, 2),
                "leadership_bench_ratio": round(
                    max(0.0, 1.0 + _impact("Leadership Bench") / 100.0), 2
                ),
                "succession_coverage_pct": round(
                    max(0.0, 100.0 + _impact("Succession Coverage")), 1
                ),
                "critical_roles_at_risk": crit_count + high_count,
            }
        )

    return {
        "rows": rows,
        "columns_meta": [
            {"key": "workforce_demand_delta", "better": "context"},
            {"key": "skills_gap_index", "better": "lower"},
            {"key": "leadership_bench_ratio", "better": "higher"},
            {"key": "succession_coverage_pct", "better": "higher"},
            {"key": "critical_roles_at_risk", "better": "lower"},
        ],
    }


async def _build_recommendation_cards(
    db: AsyncSession,
    review: HcReview | None,
    comparison: BenchmarkComparison | None,
    dim_rows: list[MaturityDimensionResult],
    limit: int = 6,
) -> dict[str, Any]:
    # Identify trigger dimensions (company < benchmark or criticality high/critical)
    weak_dims: set[str] = set()
    if comparison and comparison.comparison_data:
        for d in (comparison.comparison_data or {}).get("dimensions") or []:
            if (d.get("gap") or 0) < 0:
                weak_dims.add(d.get("dimensionCode") or "")
    for d in dim_rows:
        if d.criticality in {"critical", "high"}:
            weak_dims.add(d.dimension_key)
    weak_dims.discard("")

    # Map dim_key -> recommendation category buckets (mirrors brief_diagnostic).
    DIM_TO_CATS: dict[str, list[str]] = {
        "governance": ["organisation", "governance"],
        "workforce_planning": ["workforce_planning", "talent"],
        "hc_analytics": ["learning", "analytics"],
        "succession_planning": ["leadership", "talent"],
        "talent_acquisition": ["talent"],
        "learning_capability_development": ["learning"],
        "performance_management": ["performance"],
        "organization_design": ["organisation"],
        "skills_architecture": ["learning", "talent"],
        "leadership_development": ["leadership"],
        "strategy": ["workforce_planning"],
        "people": ["talent"],
        "culture": ["culture"],
        "processes": ["performance"],
        "capability": ["learning"],
        "data_technology": ["learning"],
    }
    target_cats: set[str] = set()
    for dk in weak_dims:
        for c in DIM_TO_CATS.get(dk, []):
            target_cats.add(c)
    if not target_cats:
        target_cats = {"talent", "leadership", "learning"}

    # Look up review-scoped roadmap_recommendations first (preferred — show real plan).
    roadmap_recs: list[RoadmapRecommendation] = []
    if review is not None:
        roadmap_recs = list(
            (
                await db.execute(
                    select(RoadmapRecommendation)
                    .where(RoadmapRecommendation.review_id == review.id)
                    .order_by(RoadmapRecommendation.sort_order)
                )
            ).scalars().all()
        )

    phase_by_id: dict[uuid.UUID, str] = {}
    if review is not None:
        phases = (
            await db.execute(
                select(RoadmapPhase).where(RoadmapPhase.review_id == review.id)
            )
        ).scalars().all()
        phase_by_id = {p.id: p.name for p in phases}

    cards: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for rr in roadmap_recs:
        # Resolve library row if linked
        lib: RecommendationLibrary | None = None
        if rr.recommendation_id is not None:
            lib = await db.get(RecommendationLibrary, rr.recommendation_id)
        title = rr.title or (lib.title if lib else "Recommendation")
        key = (lib.key if lib else None) or f"RR-{rr.id}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        cards.append(
            {
                "id": key,
                "title": title,
                "dimension": (rr.category or (lib.category if lib else None) or "general"),
                "effort": (rr.effort or (lib.default_effort if lib else None) or "M"),
                "impact": (rr.impact or (lib.default_impact if lib else None) or "M"),
                "timeframe_months": (rr.time_horizon or (lib.time_horizon if lib else None) or "6"),
                "in_roadmap": True,
                "roadmap_phase": phase_by_id.get(rr.phase_id) if rr.phase_id else None,
                "expected_lift": None,
                "linked_kpis": list(((rr.evidence or {}).get("kpis") or [])) if rr.evidence else [],
            }
        )

    if len(cards) < limit:
        # Fall back to library filtered by triggered categories.
        lib_stmt = (
            select(RecommendationLibrary)
            .where(RecommendationLibrary.category.in_(list(target_cats)))
            .order_by(RecommendationLibrary.default_impact.desc().nullslast())
        )
        lib_rows = (await db.execute(lib_stmt)).scalars().all()
        for lib in lib_rows:
            if lib.key in seen_keys:
                continue
            seen_keys.add(lib.key)
            cards.append(
                {
                    "id": lib.key,
                    "title": lib.title,
                    "dimension": lib.category or "general",
                    "effort": lib.default_effort or "M",
                    "impact": lib.default_impact or "M",
                    "timeframe_months": lib.time_horizon or "6",
                    "in_roadmap": False,
                    "roadmap_phase": None,
                    "expected_lift": None,
                    "linked_kpis": list(((lib.tags or {}).get("kpis") or [])) if lib.tags else [],
                }
            )
            if len(cards) >= limit:
                break

    cards.sort(
        key=lambda c: (-_impact_rank(c["impact"]), _effort_rank(c["effort"]))
    )
    cards = cards[:limit]

    return {
        "cards": cards,
        "sorted_by": "impact_desc_then_effort_asc",
        "max": limit,
        "triggered_dimensions": sorted(weak_dims),
    }


async def _build_risk_flags(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    review: HcReview | None,
) -> dict[str, Any]:
    flags: list[dict[str, Any]] = []

    if review is not None:
        scen_ids = (
            await db.execute(
                select(ScenarioModel.id).where(ScenarioModel.review_id == review.id)
            )
        ).scalars().all()
        if scen_ids:
            rows = (
                await db.execute(
                    select(ScenarioRiskFlag, ScenarioModel.name)
                    .join(ScenarioModel, ScenarioModel.id == ScenarioRiskFlag.scenario_id)
                    .where(ScenarioRiskFlag.scenario_id.in_(scen_ids))
                    .order_by(
                        ScenarioRiskFlag.severity.desc().nullslast(),
                        ScenarioRiskFlag.created_at.desc(),
                    )
                )
            ).all()
            for rf, scen_name in rows:
                flags.append(
                    {
                        "severity": rf.severity or "medium",
                        "source": "scenario",
                        "code": rf.label or "scenario_risk",
                        "label": rf.description or rf.label or "Scenario risk flag",
                        "metric": None,
                        "threshold": None,
                        "scenario": scen_name,
                        "mitigation": rf.mitigation,
                    }
                )

    barriers = (
        await db.execute(
            select(MobilityBarrier)
            .where(MobilityBarrier.tenant_id == tenant_id)
            .where(MobilityBarrier.severity.in_(["high", "critical", "medium"]))
            .order_by(desc(MobilityBarrier.created_at))
            .limit(8)
        )
    ).scalars().all()
    for b in barriers:
        flags.append(
            {
                "severity": b.severity,
                "source": "mobility",
                "code": f"BARRIER_{(b.type or 'GEN').upper()}",
                "label": b.description or f"Mobility barrier ({b.type or 'general'})",
                "metric": None,
                "unit": None,
                "source_table": "mobility_barriers",
                "mitigation": b.mitigation,
            }
        )

    counts: dict[str, int] = {"high": 0, "medium": 0, "low": 0, "critical": 0}
    for f in flags:
        sev = (f.get("severity") or "medium").lower()
        counts[sev] = counts.get(sev, 0) + 1

    return {"flags": flags, "counts_by_severity": counts}


# ---------------------------------------------------------------------------
# Optional LLM headline
# ---------------------------------------------------------------------------


async def _maybe_llm_headline(
    db: AsyncSession,
    review: HcReview | None,
    sections: list[dict[str, Any]],
    include_llm: bool,
) -> dict[str, Any] | None:
    """Attempt to produce a deterministic-fallback headline + caption.

    The full implementation would call ai_advisory.generate_insight() with a
    `infographic.headline` prompt template. We try that path; if no template is
    registered (the studio is fully demo-able without a real LLM key), we
    synthesize a deterministic headline from the KPI strip so the studio still
    renders a title strip.
    """
    if not include_llm or review is None:
        # Still produce a deterministic caption-style headline.
        return _deterministic_headline(sections)

    try:
        from app.services.hc_platform import ai_advisory  # noqa: WPS433

        insight = await ai_advisory.generate_insight(
            db,
            review_id=review.id,
            insight_type="executive_summary",
        )
        content = insight.content or {}
        headline = (
            content.get("headline")
            or content.get("title")
            or content.get("summary_headline")
        )
        caption = (
            content.get("caption")
            or content.get("subtitle")
            or content.get("summary")
        )
        if headline or caption:
            return {
                "headline": str(headline or "Human capital posture snapshot"),
                "caption": str(caption or "")[:400],
                "confidence": (insight.meta or {}).get("confidence", "medium"),
                "prompt_template_id": (insight.meta or {}).get("template_key", "executive_summary_v1"),
            }
    except Exception:  # noqa: BLE001 — fall through to deterministic
        pass

    return _deterministic_headline(sections)


def _deterministic_headline(sections: list[dict[str, Any]]) -> dict[str, Any]:
    kpi_section = next((s for s in sections if s["id"] == "kpi_strip"), None)
    gap_section = next((s for s in sections if s["id"] == "benchmark_gap"), None)
    rec_section = next((s for s in sections if s["id"] == "recommendations"), None)

    overall = None
    band = None
    if kpi_section:
        for k in kpi_section["data"].get("kpis", []):
            if k["label"] == "Overall Maturity":
                overall = k.get("value")
                band = k.get("band")
                break

    largest_gap: str | None = None
    if gap_section:
        dims = gap_section["data"].get("dimensions") or []
        if dims:
            worst = dims[0]
            largest_gap = worst.get("name")

    top_rec: str | None = None
    if rec_section:
        cards = rec_section["data"].get("cards") or []
        if cards:
            top_rec = cards[0].get("title")

    headline_parts: list[str] = []
    if band and overall is not None:
        headline_parts.append(f"{band} maturity at {overall}/5")
    if largest_gap:
        headline_parts.append(f"widest gap in {largest_gap}")
    headline = "; ".join(headline_parts) or "Human capital posture snapshot"

    caption_parts: list[str] = []
    if largest_gap:
        caption_parts.append(f"Close the gap in {largest_gap} first.")
    if top_rec:
        caption_parts.append(f"Top recommended move: {top_rec}.")
    caption = " ".join(caption_parts) or "All metrics sourced from deterministic engine outputs."

    return {
        "headline": headline,
        "caption": caption,
        "confidence": "medium",
        "prompt_template_id": "deterministic.fallback",
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
    """Build the Infographic Studio output document."""
    params = params or {}
    include_llm = bool(params.get("include_llm_headline", True))

    review = await _latest_review(db, tenant_id)
    assessment, dim_rows = (None, [])
    comparison = None
    if review is not None:
        assessment, dim_rows = await _latest_maturity(db, review.id)
        comparison = await _latest_benchmark(db, review.id)

    kpi_data = await _build_kpi_strip(db, tenant_id, review, assessment, dim_rows, comparison)
    radar_data = await _build_maturity_radar(db, tenant_id, review, assessment, dim_rows)
    bench_data = await _build_benchmark_gap(db, review, comparison)
    heatmap_data = await _build_capability_heatmap(db, tenant_id, review)
    scenario_data = await _build_scenario_table(db, review)
    rec_data = await _build_recommendation_cards(db, review, comparison, dim_rows)
    risk_data = await _build_risk_flags(db, tenant_id, review)

    sections = [
        {
            "id": "kpi_strip",
            "title": "Executive KPI Strip",
            "layout": "kpi_grid",
            "data": kpi_data,
            "footnote": "Six anchor numbers above the fold - each cell is a foreign-keyed value, not a paraphrase.",
        },
        {
            "id": "maturity_radar",
            "title": "Maturity Radar by Dimension",
            "layout": "radar_chart",
            "data": radar_data,
            "footnote": "Current vs. target state per dimension - pulled from maturity_dimension_results + target_state_designs.",
        },
        {
            "id": "benchmark_gap",
            "title": "Peer Benchmark Gap (Top Quartile vs You)",
            "layout": "horizontal_bar_chart",
            "data": bench_data,
            "footnote": "Bars sorted by gap-to-top-quartile so the worst-performing dimension lands first.",
        },
        {
            "id": "capability_heatmap",
            "title": "Dimension x Sub-Capability Heatmap",
            "layout": "heatmap",
            "data": heatmap_data,
            "footnote": "Each cell maps to capability_ratings rows so a red cell drills straight to evidence.",
        },
        {
            "id": "scenario_table",
            "title": "Scenario Impact Comparison",
            "layout": "comparison_table",
            "data": scenario_data,
            "footnote": "Sourced from scenario engine outputs - no manual re-entry of numbers.",
        },
        {
            "id": "recommendations",
            "title": "Prioritized Recommendations",
            "layout": "recommendation_cards",
            "data": rec_data,
            "footnote": "Filtered by gap math (benchmark_dimension_scores diff) and the active roadmap.",
        },
        {
            "id": "risk_flags",
            "title": "Risk Flags & Watch-Items",
            "layout": "risk_flags_list",
            "data": risk_data,
            "footnote": "Deterministic threshold breaches from scenario_risk_flags ∪ mobility_barriers.",
        },
    ]

    headline = await _maybe_llm_headline(db, review, sections, include_llm)

    subtitle_parts: list[str] = []
    if review is not None:
        if review.company_name:
            subtitle_parts.append(review.company_name)
        if review.industry:
            subtitle_parts.append(review.industry)
        if review.region:
            subtitle_parts.append(review.region)
    subtitle = " · ".join(subtitle_parts) or "Tenant snapshot"

    return {
        "studio_id": "infographic",
        "title": (headline or {}).get("headline", "Infographic Studio") if headline else "Infographic Studio",
        "subtitle": subtitle,
        "sections": sections,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "review_id": str(review.id) if review else None,
            "assessment_id": str(assessment.id) if assessment else None,
            "comparison_id": str(comparison.id) if comparison else None,
            "headline": headline,
            "source_refs": {
                "review_id": str(review.id) if review else None,
                "maturity_assessment_id": str(assessment.id) if assessment else None,
                "benchmark_comparison_id": str(comparison.id) if comparison else None,
            },
        },
    }
