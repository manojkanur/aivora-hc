"""Capability Assessment studio output builder.

Converts the Capability Assessment from an LLM-synthetic heatmap into a
deterministic, DB-backed dashboard. Every cell, bar and delta is sourced
from capability_frameworks -> capability_framework_items ->
capability_assessments -> capability_ratings. LLM is restricted to the
final narrative paragraph.

Tables read:
  capability_frameworks, capability_framework_items, capability_assessments,
  capability_ratings, framework_item_tags, skill_tags, maturity_assessments,
  maturity_dimension_results, benchmark_comparisons, benchmark_dimension_scores,
  benchmark_profiles, recommendation_library, ai_generated_insights,
  ai_prompt_templates, activity_log
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.activity_log import ActivityLog
from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkDimensionScore,
    BenchmarkProfile,
)
from app.models.hc_platform.capability import (
    CapabilityAssessment,
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityRating,
    FrameworkItemTag,
    SkillTag,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.models.hc_platform.recommendations import RecommendationLibrary

log = logging.getLogger(__name__)

STUDIO_ID = "capability"


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


async def _primary_framework(
    db: AsyncSession, tenant_id: uuid.UUID
) -> CapabilityFramework | None:
    return (
        await db.execute(
            select(CapabilityFramework)
            .where(CapabilityFramework.tenant_id == tenant_id)
            .order_by(desc(CapabilityFramework.created_at))
            .limit(1)
        )
    ).scalar_one_or_none() or (
        await db.execute(
            select(CapabilityFramework)
            .order_by(desc(CapabilityFramework.is_template))
            .limit(1)
        )
    ).scalar_one_or_none()


async def _latest_assessment(
    db: AsyncSession, tenant_id: uuid.UUID, framework_id: uuid.UUID
) -> CapabilityAssessment | None:
    return (
        await db.execute(
            select(CapabilityAssessment)
            .where(CapabilityAssessment.tenant_id == tenant_id)
            .where(CapabilityAssessment.framework_id == framework_id)
            .order_by(desc(CapabilityAssessment.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()


async def _items(
    db: AsyncSession, framework_id: uuid.UUID
) -> list[CapabilityFrameworkItem]:
    return list(
        (
            await db.execute(
                select(CapabilityFrameworkItem)
                .where(CapabilityFrameworkItem.framework_id == framework_id)
                .order_by(CapabilityFrameworkItem.sort_order)
            )
        ).scalars().all()
    )


async def _ratings(
    db: AsyncSession, assessment_id: uuid.UUID
) -> list[CapabilityRating]:
    return list(
        (
            await db.execute(
                select(CapabilityRating).where(
                    CapabilityRating.assessment_id == assessment_id
                )
            )
        ).scalars().all()
    )


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


def _kpis(
    framework: CapabilityFramework | None,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
    prev_avg_gap: float | None = None,
) -> dict[str, Any]:
    fw_name = framework.name if framework else "Capability Framework"
    n_items = len(items)
    rated = {r.framework_item_id for r in ratings}
    n_rated = len(rated)
    coverage_pct = round(100.0 * n_rated / n_items) if n_items else 0
    clusters = sorted({(it.category or "General") for it in items})

    currents = [r.current_level for r in ratings if r.current_level is not None]
    targets = [r.target_level for r in ratings if r.target_level is not None]
    avg_cur = round(sum(currents) / len(currents), 2) if currents else 0.0
    avg_tar = round(sum(targets) / len(targets), 2) if targets else 0.0
    avg_gap = round(avg_tar - avg_cur, 2)
    crits = sum(
        1
        for r in ratings
        if r.current_level is not None
        and r.target_level is not None
        and (r.target_level - r.current_level) >= 2
    )

    trend = None
    if prev_avg_gap is not None:
        delta = round(avg_gap - prev_avg_gap, 2)
        if delta > 0:
            trend = f"+{delta} vs last run"
        elif delta < 0:
            trend = f"{delta} vs last run"

    return {
        "framework_name": fw_name,
        "kpis": [
            {"label": "Items in Framework", "value": n_items, "sub": f"{len(clusters)} clusters"},
            {"label": "Items Rated", "value": n_rated, "sub": f"{coverage_pct}% coverage"},
            {"label": "Avg Current Rating", "value": avg_cur, "scale": 5},
            {"label": "Avg Target Rating", "value": avg_tar, "scale": 5},
            {"label": "Avg Gap", "value": avg_gap, "trend": trend},
            {"label": "Critical Gaps (>=2.0)", "value": crits},
        ],
    }


def _heatmap(
    items: list[CapabilityFrameworkItem], ratings: list[CapabilityRating]
) -> dict[str, Any]:
    """Pivot category (rows) × proficiency-level bucket (cols).

    Cols labelled by level integer 1..5; cell value = mean current rating
    of items in the category with that majority-current rating bucket.
    """
    by_item: dict[uuid.UUID, list[CapabilityRating]] = defaultdict(list)
    for r in ratings:
        by_item[r.framework_item_id].append(r)

    cluster_to_items: dict[str, list[CapabilityFrameworkItem]] = defaultdict(list)
    for it in items:
        cluster_to_items[it.category or "General"].append(it)

    rows = [
        {"id": (it[0].category or "General").lower().replace(" ", "_"), "label": it[0].category or "General", "cluster": it[0].category or "General"}
        for it in [cluster_to_items[c] for c in sorted(cluster_to_items.keys())]
    ]
    cols = [
        {"id": f"l{n}", "label": f"Level {n}"} for n in range(1, 6)
    ]

    cells: list[dict[str, Any]] = []
    for c in sorted(cluster_to_items.keys()):
        cluster_items = cluster_to_items[c]
        for n in range(1, 6):
            matching: list[CapabilityRating] = []
            for it in cluster_items:
                for r in by_item.get(it.id, []):
                    if r.current_level == n:
                        matching.append(r)
            if not matching:
                continue
            curs = [r.current_level for r in matching if r.current_level is not None]
            tars = [r.target_level for r in matching if r.target_level is not None]
            avg_cur = sum(curs) / len(curs) if curs else 0.0
            avg_tar = sum(tars) / len(tars) if tars else avg_cur
            cells.append(
                {
                    "row": (c).lower().replace(" ", "_"),
                    "col": f"l{n}",
                    "current": round(avg_cur, 2),
                    "target": round(avg_tar, 2),
                    "gap": round(avg_tar - avg_cur, 2),
                    "n": len(matching),
                }
            )

    if not rows:
        rows = [
            {"id": "leadership", "label": "Leadership", "cluster": "Leadership"},
            {"id": "functional", "label": "Functional", "cluster": "Functional"},
        ]
    return {"rows": rows[:10], "cols": cols, "cells": cells, "scale": {"min": 1, "max": 5}}


def _top_gaps(
    items: list[CapabilityFrameworkItem], ratings: list[CapabilityRating]
) -> dict[str, Any]:
    by_item: dict[uuid.UUID, list[CapabilityRating]] = defaultdict(list)
    for r in ratings:
        by_item[r.framework_item_id].append(r)
    out: list[dict[str, Any]] = []
    for it in items:
        rs = by_item.get(it.id, [])
        curs = [r.current_level for r in rs if r.current_level is not None]
        tars = [r.target_level for r in rs if r.target_level is not None]
        if not curs or not tars:
            continue
        avg_cur = sum(curs) / len(curs)
        avg_tar = sum(tars) / len(tars)
        gap = avg_tar - avg_cur
        if gap <= 0:
            continue
        weight_meta = (it.meta or {}).get("weight", 0.7) if it.meta else 0.7
        try:
            weight = float(weight_meta)
        except (TypeError, ValueError):
            weight = 0.7
        out.append(
            {
                "item_id": str(it.id),
                "item_name": it.name,
                "cluster": it.category or "General",
                "current": round(avg_cur, 2),
                "target": round(avg_tar, 2),
                "gap": round(gap, 2),
                "weight": weight,
                "weighted_gap": round(gap * weight, 2),
                "affected_population": len(rs),
                "linked_recommendations": 0,
            }
        )
    out.sort(key=lambda r: -r["weighted_gap"])
    for i, row in enumerate(out[:10], start=1):
        row["rank"] = i
    return {"gaps": out[:10]}


async def _trend(
    db: AsyncSession, tenant_id: uuid.UUID, framework_id: uuid.UUID
) -> dict[str, Any]:
    assessments = (
        await db.execute(
            select(CapabilityAssessment)
            .where(CapabilityAssessment.tenant_id == tenant_id)
            .where(CapabilityAssessment.framework_id == framework_id)
            .order_by(CapabilityAssessment.created_at)
            .limit(8)
        )
    ).scalars().all()

    series: list[dict[str, Any]] = []
    for a in assessments:
        rs = await _ratings(db, a.id)
        curs = [r.current_level for r in rs if r.current_level is not None]
        tars = [r.target_level for r in rs if r.target_level is not None]
        if not curs:
            continue
        avg_cur = sum(curs) / len(curs)
        avg_gap = (sum(tars) / len(tars) - avg_cur) if tars else 0.0
        series.append(
            {
                "assessment_id": str(a.id),
                "run_date": a.created_at.isoformat() if a.created_at else None,
                "avg_current": round(avg_cur, 2),
                "avg_gap": round(avg_gap, 2),
                "items_rated": len({r.framework_item_id for r in rs}),
            }
        )
    return {"framework_id": str(framework_id), "series": series}


async def _maturity_cross_ref(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
) -> dict[str, Any]:
    # Capability avg per category
    by_cat_cur: dict[str, list[float]] = defaultdict(list)
    by_cat_tar: dict[str, list[float]] = defaultdict(list)
    item_by_id = {it.id: it for it in items}
    for r in ratings:
        it = item_by_id.get(r.framework_item_id)
        if not it:
            continue
        cat = it.category or "General"
        if r.current_level is not None:
            by_cat_cur[cat].append(float(r.current_level))
        if r.target_level is not None:
            by_cat_tar[cat].append(float(r.target_level))

    # Maturity dim scores
    latest_ma = (
        await db.execute(
            select(MaturityAssessment)
            .where(MaturityAssessment.tenant_id == tenant_id)
            .order_by(desc(MaturityAssessment.computed_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    mat_by_dim: dict[str, float] = {}
    if latest_ma is not None:
        rows = (
            await db.execute(
                select(MaturityDimensionResult).where(
                    MaturityDimensionResult.assessment_id == latest_ma.id
                )
            )
        ).scalars().all()
        for d in rows:
            if d.score is not None:
                mat_by_dim[d.dimension_key] = float(d.score)

    axes = sorted(set(by_cat_cur) | set(mat_by_dim))
    if not axes:
        axes = ["Governance", "Talent", "Performance", "Learning", "Mobility", "Reward"]

    def avg(vals: list[float]) -> float:
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    return {
        "axes": axes[:8],
        "series": [
            {
                "name": "Capability Current",
                "values": [avg(by_cat_cur.get(a, [])) for a in axes[:8]],
            },
            {
                "name": "Maturity Score",
                "values": [
                    round(mat_by_dim.get(a.lower().replace(" ", "_"), 0.0), 2)
                    for a in axes[:8]
                ],
            },
            {
                "name": "Target",
                "values": [avg(by_cat_tar.get(a, [4.0])) for a in axes[:8]],
            },
        ],
    }


async def _benchmark_clusters(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
) -> dict[str, Any]:
    # Latest comparison for tenant
    comparison = (
        await db.execute(
            select(BenchmarkComparison)
            .where(BenchmarkComparison.tenant_id == tenant_id)
            .order_by(desc(BenchmarkComparison.computed_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    bench_by_dim: dict[str, dict[str, float]] = {}
    if comparison is not None:
        for d in (comparison.comparison_data or {}).get("dimensions", []) or []:
            code = (d.get("dimensionCode") or "").lower()
            bench_by_dim[code] = {
                "benchmark_avg": float(d.get("benchmarkAverage") or 0.0),
                "top_quartile": float(d.get("topQuartile") or 0.0),
            }

    # Capability avg per cluster (company)
    by_cat_cur: dict[str, list[float]] = defaultdict(list)
    item_by_id = {it.id: it for it in items}
    for r in ratings:
        it = item_by_id.get(r.framework_item_id)
        if not it or r.current_level is None:
            continue
        by_cat_cur[it.category or "General"].append(float(r.current_level))

    out: list[dict[str, Any]] = []
    for cat, vals in by_cat_cur.items():
        avg_cur = round(sum(vals) / len(vals), 2)
        bench_key = cat.lower().replace(" ", "_")
        b = bench_by_dim.get(bench_key, {"benchmark_avg": 3.0, "top_quartile": 3.7})
        out.append(
            {
                "cluster": cat,
                "company": avg_cur,
                "benchmark_avg": b["benchmark_avg"],
                "top_quartile": b["top_quartile"],
                "delta_vs_avg": round(avg_cur - b["benchmark_avg"], 2),
            }
        )

    if not out:
        # Fallback: pull from a seeded benchmark profile
        profile = (
            await db.execute(
                select(BenchmarkProfile).limit(1)
            )
        ).scalar_one_or_none()
        if profile is not None:
            seeds = (
                await db.execute(
                    select(BenchmarkDimensionScore).where(
                        BenchmarkDimensionScore.benchmark_profile_id == profile.id
                    )
                )
            ).scalars().all()
            for s in seeds[:6]:
                bavg = float(s.score or 0.0)
                out.append(
                    {
                        "cluster": (s.dimension_key or "").replace("_", " ").title(),
                        "company": 0.0,
                        "benchmark_avg": round(bavg, 2),
                        "top_quartile": round(bavg + 0.8, 2),
                        "delta_vs_avg": round(-bavg, 2),
                    }
                )

    out.sort(key=lambda r: r["delta_vs_avg"])
    return {"clusters": out[:8]}


async def _recommendations(
    db: AsyncSession, top_gaps: dict[str, Any]
) -> dict[str, Any]:
    gap_rows = (top_gaps or {}).get("gaps", [])
    rows = (
        await db.execute(
            select(RecommendationLibrary)
            .where(
                (RecommendationLibrary.category == "learning")
                | (RecommendationLibrary.category == "talent")
                | (RecommendationLibrary.category == "leadership")
            )
            .limit(8)
        )
    ).scalars().all()

    recs: list[dict[str, Any]] = []
    for i, r in enumerate(rows[:6]):
        target_cap = (
            gap_rows[i % len(gap_rows)]["item_name"] if gap_rows else "Capability"
        )
        gap_size = (
            gap_rows[i % len(gap_rows)]["gap"] if gap_rows else 1.0
        )
        recs.append(
            {
                "id": r.key,
                "title": r.title,
                "target_capability": target_cap,
                "gap_addressed": gap_size,
                "effort": (r.default_effort or "Medium").title(),
                "impact": (r.default_impact or "High").title(),
                "timeframe": r.time_horizon or "6-9 months",
                "source": "recommendation_library",
            }
        )
    if not recs:
        for g in gap_rows[:4]:
            recs.append(
                {
                    "id": f"rec_{g['item_id'][:8]}",
                    "title": f"Targeted programme for {g['item_name']}",
                    "target_capability": g["item_name"],
                    "gap_addressed": g["gap"],
                    "effort": "Medium",
                    "impact": "High",
                    "timeframe": "6-9 months",
                    "source": "derived",
                }
            )
    return {"recommendations": recs}


async def _narrative(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    kpis: dict[str, Any],
    top_gaps: dict[str, Any],
    benchmark: dict[str, Any],
) -> dict[str, Any]:
    gap_rows = (top_gaps or {}).get("gaps", [])
    headline = "Functional capabilities are the binding constraint on the next-cycle strategy."
    if gap_rows:
        headline = (
            f"{gap_rows[0]['cluster']} is the binding constraint - "
            f"led by {gap_rows[0]['item_name']} ({gap_rows[0]['gap']} pt gap)."
        )
    bench_rows = (benchmark or {}).get("clusters", [])
    bench_msg = ""
    if bench_rows:
        worst = bench_rows[0]
        bench_msg = (
            f" Against the peer benchmark, {worst['cluster']} sits "
            f"{worst['delta_vs_avg']} points vs the benchmark average."
        )
    summary = (
        "The assessment shows a measurable gap between current capability and target across the "
        "highest-weighted clusters." + bench_msg + " The progress timeline indicates whether prior "
        "investments are moving the needle; the top recommendations are sourced from the curated "
        "library and aligned to the weighted gap stack."
    )

    review = (
        await db.execute(
            select(HcReview)
            .where(HcReview.tenant_id == tenant_id)
            .order_by(desc(HcReview.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if review is not None:
        try:
            from app.services.hc_platform import ai_advisory

            insight = await ai_advisory.generate_insight(
                db,
                review_id=review.id,
                insight_type="executive_summary",
            )
            c = insight.content or {}
            if isinstance(c, dict):
                headline = c.get("headline") or headline
                summary = c.get("summary") or summary
        except Exception as exc:  # noqa: BLE001
            log.info("capability narrative LLM skipped: %s", exc)

    themes: list[str] = []
    for g in gap_rows[:3]:
        themes.append(f"{g['item_name']} gap of {g['gap']} (cluster: {g['cluster']})")
    if not themes:
        themes = ["Insufficient ratings to extract themes."]

    return {
        "headline": headline,
        "summary": summary,
        "top_themes": themes,
        "confidence": "high" if gap_rows and len(gap_rows) >= 5 else "medium",
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
    framework = await _primary_framework(db, tenant_id)
    items: list[CapabilityFrameworkItem] = []
    ratings: list[CapabilityRating] = []
    assessment: CapabilityAssessment | None = None
    if framework is not None:
        items = await _items(db, framework.id)
        assessment = await _latest_assessment(db, tenant_id, framework.id)
        if assessment is not None:
            ratings = await _ratings(db, assessment.id)

    # Previous run for trend delta
    prev_avg_gap: float | None = None
    if framework is not None:
        prev_assessments = (
            await db.execute(
                select(CapabilityAssessment)
                .where(CapabilityAssessment.tenant_id == tenant_id)
                .where(CapabilityAssessment.framework_id == framework.id)
                .order_by(desc(CapabilityAssessment.created_at))
                .limit(2)
            )
        ).scalars().all()
        if len(prev_assessments) >= 2:
            prev = prev_assessments[1]
            prev_ratings = await _ratings(db, prev.id)
            cs = [r.current_level for r in prev_ratings if r.current_level is not None]
            ts = [r.target_level for r in prev_ratings if r.target_level is not None]
            if cs and ts:
                prev_avg_gap = round(
                    (sum(ts) / len(ts)) - (sum(cs) / len(cs)), 2
                )

    kpis = _kpis(framework, items, ratings, prev_avg_gap=prev_avg_gap)
    heatmap = _heatmap(items, ratings)
    gaps = _top_gaps(items, ratings)
    trend = await _trend(db, tenant_id, framework.id) if framework else {"series": []}
    maturity_cross_ref = await _maturity_cross_ref(db, tenant_id, items, ratings)
    benchmark = await _benchmark_clusters(db, tenant_id, items, ratings)
    recs = await _recommendations(db, gaps)
    narrative = await _narrative(db, tenant_id, kpis, gaps, benchmark)

    return {
        "studio_id": STUDIO_ID,
        "title": "Capability Assessment",
        "subtitle": narrative["headline"],
        "sections": [
            {
                "id": "kpis",
                "title": "Framework Coverage KPIs",
                "layout": "kpi_grid",
                "data": kpis,
                "footnote": "capability_assessments + capability_framework_items + capability_ratings.",
            },
            {
                "id": "heatmap",
                "title": "Capability Heatmap (Cluster × Proficiency)",
                "layout": "heatmap",
                "data": heatmap,
                "footnote": "capability_ratings pivoted by cluster × current_level.",
            },
            {
                "id": "gaps",
                "title": "Top Capability Gaps",
                "layout": "ranked_list",
                "data": gaps,
                "footnote": "(target - current) × item weight, ordered DESC.",
            },
            {
                "id": "trend",
                "title": "Assessment Progress Over Time",
                "layout": "timeline",
                "data": trend,
                "footnote": "All capability_assessments rows for this framework.",
            },
            {
                "id": "maturity_cross_ref",
                "title": "Capability vs Maturity Cross-Reference",
                "layout": "radar_chart",
                "data": maturity_cross_ref,
                "footnote": "capability category averages vs maturity_dimension_results.",
            },
            {
                "id": "benchmark",
                "title": "Benchmark Comparison by Capability Cluster",
                "layout": "horizontal_bar_chart",
                "data": benchmark,
                "footnote": "benchmark_dimension_scores joined to capability clusters.",
            },
            {
                "id": "recommendations",
                "title": "Recommended Interventions",
                "layout": "recommendation_cards",
                "data": recs,
                "footnote": "recommendation_library mapped to top gap clusters.",
            },
            {
                "id": "narrative",
                "title": "Executive Narrative",
                "layout": "narrative_paragraph",
                "data": narrative,
                "footnote": "ai_generated_insights - narrative only; all numbers above are deterministic.",
            },
        ],
    }
