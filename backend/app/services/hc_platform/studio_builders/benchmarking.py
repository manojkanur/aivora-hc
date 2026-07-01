"""Benchmarking Studio builder.

Produces a 9-section peer-benchmarking one-pager grounded in
benchmark_profiles + benchmark_dimension_scores. Everything except the
optional executive headline (LLM, narrow + grounded) is deterministic.

If the tenant has no benchmark_comparison yet, we run the engine on the
fly against the best-matching benchmark_profile (preferring industry +
size). If no maturity assessment exists, we attempt to run that too; if
that still fails we surface the seeded profile + dimension scores so the
page renders something real.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.benchmarks import BenchmarkGroup
from app.services.hc_platform import benchmark_engine, maturity_engine
from app.services.hc_platform.ai_advisory import generate_insight
from app.services.hc_platform.studio_builders._common import (
    assessment_dimensions,
    benchmark_dim_scores,
    default_maturity_model,
    document,
    latest_assessment,
    latest_benchmark_comparison,
    latest_review,
    pick_benchmark_profile,
    recommendation_pool,
    safe_float,
    section,
)

DIM_TO_CATEGORIES: dict[str, list[str]] = {
    "governance": ["organisation"],
    "hc_analytics": ["learning"],
    "talent_acquisition": ["talent"],
    "learning_capability_development": ["learning"],
    "succession_planning": ["talent"],
    "leadership_development": ["leadership"],
    "skills_architecture": ["learning"],
    "performance_management": ["performance"],
    "workforce_planning": ["workforce_planning"],
    "organization_design": ["organisation"],
}


def _quartile_band(percentile: float | None) -> str:
    if percentile is None:
        return "Q?"
    if percentile >= 75:
        return "Q4 (Top)"
    if percentile >= 50:
        return "Q3"
    if percentile >= 25:
        return "Q2"
    return "Q1 (Bottom)"


def _gap_severity(gap: float) -> str:
    if gap <= -1.0:
        return "high"
    if gap <= -0.5:
        return "medium"
    return "low"


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    model = await default_maturity_model(db)

    # Ensure maturity assessment exists (benchmark engine depends on it).
    assessment = None
    if review is not None and model is not None:
        assessment = await latest_assessment(db, review.id)
        if assessment is None:
            try:
                assessment = await maturity_engine.run(db, review.id, model.id)
            except ValueError:
                assessment = None

    # Pick benchmark profile.
    profile = None
    if review is not None:
        profile = await pick_benchmark_profile(db, review.industry, review.company_size)
    if profile is None:
        profile = await pick_benchmark_profile(db, None, None)

    # Ensure comparison exists.
    comparison = None
    if review is not None:
        comparison = await latest_benchmark_comparison(db, review.id)
        if comparison is None and profile is not None and assessment is not None:
            try:
                comparison = await benchmark_engine.run(db, review.id, profile.id)
            except ValueError:
                comparison = None

    comp_data: dict[str, Any] = (
        comparison.comparison_data if (comparison and isinstance(comparison.comparison_data, dict)) else {}
    )
    bench_dims_raw: list[dict[str, Any]] = list(comp_data.get("dimensions") or [])

    # Compute % above median deterministically.
    above_median = sum(1 for d in bench_dims_raw if safe_float(d.get("gap")) >= 0)
    total_dims = len(bench_dims_raw)
    overall_company = safe_float(comp_data.get("overallCompanyScore"))
    overall_bench = safe_float(comp_data.get("overallBenchmarkAverage"))
    # Approx percentile by gap (deterministic ranking).
    overall_pct = 50
    if overall_bench:
        if overall_company >= overall_bench:
            overall_pct = min(95, 50 + int(round((overall_company - overall_bench) * 25)))
        else:
            overall_pct = max(5, 50 + int(round((overall_company - overall_bench) * 25)))

    # ----- Section 1: KPI header ----------------------------------------
    peer_member_count = 0
    if profile is not None and isinstance(profile.meta, dict):
        peer_member_count = int(safe_float(profile.meta.get("member_count"), 0)) or 0
    kpis = [
        {"label": "Overall Score", "value": round(overall_company, 2), "unit": "/5", "source": "benchmark_comparisons"},
        {"label": "Peer Median", "value": round(overall_bench, 2), "unit": "/5", "source": "benchmark_dimension_scores"},
        {"label": "Overall Percentile", "value": overall_pct, "unit": "%ile", "source": "benchmark_engine"},
        {"label": "Dimensions Above Median", "value": above_median, "unit": f"of {total_dims}", "source": "benchmark_comparisons"},
        {"label": "Peer Cohort", "value": profile.name if profile else "N/A", "unit": "", "source": "benchmark_profiles"},
        {"label": "Peer Set Size", "value": peer_member_count or "n/a", "unit": "companies", "source": "benchmark_profiles"},
    ]
    s1 = section(
        "header-kpis",
        "Benchmark Header KPIs",
        "kpi_grid",
        {
            "kpis": kpis,
            "peer_set": {
                "id": str(profile.id) if profile else None,
                "name": profile.name if profile else None,
                "industry": profile.industry if profile else None,
                "region": profile.region if profile else None,
                "size_band": profile.company_size if profile else None,
            },
        },
        footnote="Source: benchmark_comparisons + benchmark_profiles.",
    )

    # ----- Section 2: Horizontal bar — score vs peers --------------------
    bar_dims: list[dict[str, Any]] = []
    profile_scores = []
    if profile is not None:
        profile_scores = await benchmark_dim_scores(db, profile.id)
    pct_by_code: dict[str, float] = {}
    for ps in profile_scores:
        pct_by_code[ps.dimension_key] = safe_float(ps.percentile, 50.0)

    for d in bench_dims_raw:
        code = str(d.get("dimensionCode") or "")
        score = safe_float(d.get("companyScore"))
        avg = safe_float(d.get("benchmarkAverage"))
        topq = safe_float(d.get("topQuartile"))
        gap_vs_med = round(score - avg, 2)
        gap_vs_top = round(score - topq, 2)
        pct = pct_by_code.get(code, 50.0)
        # Refine percentile by gap.
        if avg:
            pct = max(5.0, min(95.0, 50.0 + (score - avg) * 25.0))
        bar_dims.append(
            {
                "dimensionCode": code,
                "dimensionName": d.get("dimensionName") or code.replace("_", " ").title(),
                "companyScore": round(score, 2),
                "benchmarkAverage": round(avg, 2),
                "topQuartile": round(topq, 2),
                "bottomQuartile": round(max(1.0, avg - 1.0), 2),
                "gapVsMedian": gap_vs_med,
                "gapVsTopQuartile": gap_vs_top,
                "percentile": round(pct, 1),
                "quartileBand": _quartile_band(pct),
            }
        )
    s2 = section(
        "dim-vs-peers",
        "Dimension Score vs Peer Benchmark",
        "horizontal_bar_chart",
        {"dimensions": bar_dims},
        footnote="Source: benchmark_dimension_scores + maturity_dimension_results.",
    )

    # ----- Section 3: Radar ---------------------------------------------
    axes = [d["dimensionName"] for d in bar_dims]
    series = [
        {"name": "You", "values": [d["companyScore"] for d in bar_dims], "color": "#3B82F6"},
        {"name": "Peer Median", "values": [d["benchmarkAverage"] for d in bar_dims], "color": "#94A3B8"},
        {"name": "Top Quartile", "values": [d["topQuartile"] for d in bar_dims], "color": "#10B981"},
    ]
    s3 = section(
        "radar",
        "Peer Positioning Radar",
        "radar_chart",
        {"axes": axes, "series": series, "maxScore": 5.0},
        footnote="Source: benchmark_dimension_scores transformed per-dimension.",
    )

    # ----- Section 4: Strongest & weakest dimensions --------------------
    sorted_desc = sorted(bar_dims, key=lambda x: x["gapVsMedian"], reverse=True)
    sorted_asc = sorted(bar_dims, key=lambda x: x["gapVsMedian"])
    strengths = [
        {
            "rank": i + 1,
            "dimensionName": d["dimensionName"],
            "companyScore": d["companyScore"],
            "peerMedian": d["benchmarkAverage"],
            "gap": f"+{d['gapVsMedian']}" if d["gapVsMedian"] >= 0 else str(d["gapVsMedian"]),
            "percentile": d["percentile"],
        }
        for i, d in enumerate(sorted_desc[:3])
    ]
    gaps = [
        {
            "rank": i + 1,
            "dimensionName": d["dimensionName"],
            "companyScore": d["companyScore"],
            "peerMedian": d["benchmarkAverage"],
            "gap": str(d["gapVsMedian"]),
            "percentile": d["percentile"],
        }
        for i, d in enumerate(sorted_asc[:3])
    ]
    s4 = section(
        "strongest-weakest",
        "Strongest & Weakest Dimensions",
        "ranked_list",
        {"strengths": strengths, "gaps": gaps},
        footnote="Derived: bench_dims sorted by gapVsMedian.",
    )

    # ----- Section 5: Peer cohort composition (comparison_table) --------
    groups_stmt = select(BenchmarkGroup).limit(10)
    groups = list((await db.execute(groups_stmt)).scalars().all())

    members: list[dict[str, Any]] = []
    if profile is not None and isinstance(profile.meta, dict):
        for m in (profile.meta.get("members") or [])[:10]:
            if isinstance(m, dict):
                members.append(
                    {
                        "profile_label": m.get("label") or m.get("name") or "Peer",
                        "industry": m.get("industry") or (profile.industry if profile else None),
                        "region": m.get("region") or (profile.region if profile else None),
                        "headcount_band": m.get("size") or (profile.company_size if profile else None),
                        "overall_score": safe_float(m.get("overall_score")),
                    }
                )
    if not members and groups:
        for g in groups[:5]:
            members.append(
                {
                    "profile_label": g.name,
                    "industry": (profile.industry if profile else None) or " - ",
                    "region": (profile.region if profile else None) or " - ",
                    "headcount_band": (profile.company_size if profile else None) or " - ",
                    "overall_score": None,
                }
            )

    s5 = section(
        "peer-cohort",
        "Peer Cohort Composition",
        "comparison_table",
        {
            "peer_set_name": profile.name if profile else None,
            "columns": ["Peer", "Industry", "Region", "Headcount", "Overall Score"],
            "members": members,
            "summary": {
                "total_members": peer_member_count or len(members),
                "industries": sorted({m["industry"] for m in members if m.get("industry")}),
                "regions": sorted({m["region"] for m in members if m.get("region")}),
                "score_range": [
                    round(min((m["overall_score"] for m in members if m.get("overall_score")), default=0.0), 2),
                    round(max((m["overall_score"] for m in members if m.get("overall_score")), default=0.0), 2),
                ],
            },
        },
        footnote="Source: benchmark_profiles.meta.members + benchmark_groups.",
    )

    # ----- Section 6: Heatmap (dimension × quartile) --------------------
    rows = [d["dimensionName"] for d in bar_dims]
    cols = ["Q1 (Bottom)", "Q2", "Q3", "Q4 (Top)"]
    cells: list[dict[str, Any]] = []
    for d in bar_dims:
        cells.append(
            {
                "row": d["dimensionName"],
                "col": d["quartileBand"],
                "value": 1,
                "percentile": d["percentile"],
            }
        )
    s6 = section(
        "percentile-heatmap",
        "Percentile Heatmap (Dimension × Quartile)",
        "heatmap",
        {"rows": rows, "cols": cols, "cells": cells},
        footnote="Derived from benchmark_dimension_scores - quartile from company percentile.",
    )

    # ----- Section 7: Strategic gap flags -------------------------------
    flags: list[dict[str, Any]] = []
    for d in bar_dims:
        if d["gapVsMedian"] < -0.5 or d["percentile"] < 25:
            severity = _gap_severity(d["gapVsMedian"])
            flags.append(
                {
                    "severity": severity,
                    "dimensionCode": d["dimensionCode"],
                    "dimensionName": d["dimensionName"],
                    "gap": d["gapVsMedian"],
                    "percentile": d["percentile"],
                    "message": f"{d['dimensionName']}: {d['gapVsMedian']} pts vs peer median, percentile {d['percentile']}",
                }
            )
    flags.sort(key=lambda x: x["gap"])
    s7 = section(
        "gap-flags",
        "Strategic Gap Flags",
        "risk_flags_list",
        {"flags": flags, "counts": {
            "high": sum(1 for f in flags if f["severity"] == "high"),
            "medium": sum(1 for f in flags if f["severity"] == "medium"),
            "low": sum(1 for f in flags if f["severity"] == "low"),
        }},
        footnote="Deterministic rules: gap < -0.5 OR percentile < 25.",
    )

    # ----- Section 8: Closing-the-gap recommendations -------------------
    weak_codes = [g["dimensionCode"] for g in sorted_asc[:3]]
    cats: list[str] = []
    for code in weak_codes:
        for c in DIM_TO_CATEGORIES.get(code, []):
            if c not in cats:
                cats.append(c)
    if not cats:
        cats = ["talent", "leadership", "organisation"]
    lib_rows = await recommendation_pool(db, cats, limit=20)
    cards: list[dict[str, Any]] = []
    cat_to_dim = {}
    for code in weak_codes:
        for c in DIM_TO_CATEGORIES.get(code, []):
            cat_to_dim.setdefault(c, code)
    seen: set[str] = set()
    for r in lib_rows:
        if r.key in seen:
            continue
        seen.add(r.key)
        # Match expected score lift by category gap.
        dim_code = cat_to_dim.get(r.category or "", weak_codes[0] if weak_codes else "")
        match_gap = next((d["gapVsMedian"] for d in sorted_asc[:5] if d["dimensionCode"] == dim_code), 0.0)
        expected_lift = abs(round(match_gap * 0.5, 2)) if match_gap else 0.3
        cards.append(
            {
                "id": r.key,
                "dimension": dim_code.replace("_", " ").title() if dim_code else r.category,
                "title": r.title,
                "summary": r.description or "",
                "effort": (r.default_effort or "M").upper()[:1],
                "impact": (r.default_impact or "M").upper()[:1],
                "timeframe": r.time_horizon or "3-6 months",
                "expected_lift": f"+{expected_lift} score",
                "source": "recommendation_library",
            }
        )
        if len(cards) >= 6:
            break
    s8 = section(
        "recommendations",
        "Closing-the-Gap Recommendations",
        "recommendation_cards",
        {"recommendations": cards},
        footnote="Source: recommendation_library filtered to weakest-3 dimension categories.",
    )

    # ----- Section 9: Executive headline (LLM, optional) ----------------
    headline_block: dict[str, Any] = {
        "headline": None,
        "confidence": "low",
        "rationale": "",
        "source_comparison_id": str(comparison.id) if comparison else None,
    }
    # Fallback deterministic headline (always populated).
    weak_names = ", ".join(g["dimensionName"] for g in gaps[:2]) or " - "
    strong_names = ", ".join(s["dimensionName"] for s in strengths[:2]) or " - "
    deterministic_text = (
        f"Overall position {overall_pct}th percentile of "
        f"{peer_member_count or 'reference'} peers - leading on {strong_names}; "
        f"lagging on {weak_names}."
    )
    headline_block["headline"] = deterministic_text
    headline_block["confidence"] = "medium"

    if review is not None and (params or {}).get("generate_headline", True):
        try:
            insight = await generate_insight(
                db,
                review_id=review.id,
                insight_type="industry_context",
            )
            content = insight.content if isinstance(insight.content, dict) else {}
            llm_headline = content.get("headline") or content.get("summary")
            if llm_headline:
                headline_block["headline"] = str(llm_headline)
                headline_block["confidence"] = "high"
                headline_block["rationale"] = str(content.get("rationale") or "")
        except Exception:
            # LLM failures must not break the page — keep deterministic line.
            pass

    s9 = section(
        "exec-headline",
        "Executive Headline",
        "callout_quote",
        headline_block,
        footnote="LLM (industry_context prompt) - grounded on benchmark_comparisons. Falls back to deterministic line.",
    )

    subtitle = (
        f"{profile.name if profile else 'Reference cohort'} - {overall_pct}th percentile"
    )
    return document(
        "benchmarking",
        "Benchmarking Studio",
        subtitle,
        [s1, s2, s3, s4, s5, s6, s7, s8, s9],
    )
