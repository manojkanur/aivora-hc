"""Deterministic benchmark engine.

Ports artifacts/api-server/src/lib/engines/benchmark-engine.ts.

Reads the latest MaturityAssessment + dimension results for a review and the
benchmark_dimension_scores for a benchmark profile, then writes a
BenchmarkComparison row (one per (review_id, benchmark_profile_id) pair).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkDimensionScore,
    BenchmarkProfile,
)
from app.models.hc_platform.maturity import MaturityAssessment, MaturityDimensionResult
from app.services.hc_platform.maturity_engine import map_dimension_to_code

# -----------------------------------------------------------------------------
# Pure helpers.
# -----------------------------------------------------------------------------


def _positioning(score: float, avg: float, top_q: float) -> str:
    if score >= top_q:
        return "leading"
    if score >= avg:
        return "competitive"
    if score >= avg * 0.75:
        return "emerging"
    return "lagging"


def compare_dimensions(
    review_dimensions: list[dict[str, Any]],
    benchmark_scores: list[dict[str, Any]],
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure function — produce a BenchmarkComparisonData JSON.

    review_dimensions items: {name, score} (the dimension result rows).
    benchmark_scores items: {dimension_code, average_score, top_quartile_score, percentile?}.
    """
    by_code: dict[str, dict[str, Any]] = {}
    for bs in benchmark_scores:
        code = str(bs.get("dimension_code") or bs.get("dimensionCode") or "")
        if code:
            by_code[code] = bs

    rows: list[dict[str, Any]] = []
    for dim in review_dimensions:
        name = str(dim.get("name") or "")
        code = map_dimension_to_code(name) if name else str(dim.get("dimensionCode") or "")
        bench = by_code.get(code) or {}
        avg = bench.get("average_score", bench.get("averageScore"))
        top_q = bench.get("top_quartile_score", bench.get("topQuartileScore"))
        avg_f = float(avg) if avg is not None else 3.0
        top_f = float(top_q) if top_q is not None else 4.0
        score = float(dim.get("score") or 0)
        gap = score - avg_f
        rows.append(
            {
                "dimensionCode": code,
                "dimensionName": name,
                "companyScore": score,
                "benchmarkAverage": round(avg_f * 100) / 100,
                "topQuartile": round(top_f * 100) / 100,
                "gap": round(gap * 100) / 100,
                "positioning": _positioning(score, avg_f, top_f),
            }
        )

    if rows:
        oc = round((sum(r["companyScore"] for r in rows) / len(rows)) * 100) / 100
        ob = round((sum(r["benchmarkAverage"] for r in rows) / len(rows)) * 100) / 100
        ot = round((sum(r["topQuartile"] for r in rows) / len(rows)) * 100) / 100
    else:
        oc, ob, ot = 0.0, 0.0, 0.0

    return {
        "dimensions": rows,
        "overallCompanyScore": oc,
        "overallBenchmarkAverage": ob,
        "overallGap": round((oc - ob) * 100) / 100,
        "overallPositioning": _positioning(oc, ob, ot),
        "filters": filters or {},
    }


def _summary_narrative(comparison: dict[str, Any]) -> str:
    dims = comparison["dimensions"]
    above = [d for d in dims if d["positioning"] in {"leading", "competitive"}]
    lagging = [d for d in dims if d["positioning"] == "lagging"]
    pieces = [
        f"Overall positioning: {comparison['overallPositioning']} "
        f"(score {comparison['overallCompanyScore']} vs benchmark "
        f"{comparison['overallBenchmarkAverage']}, gap {comparison['overallGap']:+}).",
        f"Above benchmark in {len(above)} of {len(dims)} dimensions.",
    ]
    if lagging:
        names = ", ".join(d["dimensionName"] or d["dimensionCode"] for d in lagging[:3])
        pieces.append(f"Key gaps: {names}.")
    return " ".join(pieces)


def _gap_data(comparison: dict[str, Any], threshold: float = -0.5) -> dict[str, Any]:
    """Return dimensions where gap < threshold, with computed severity."""
    gaps: list[dict[str, Any]] = []
    for d in comparison["dimensions"]:
        if d["gap"] < threshold:
            severity = "high" if d["gap"] <= -1.0 else "medium"
            gaps.append(
                {
                    "dimensionCode": d["dimensionCode"],
                    "dimensionName": d["dimensionName"],
                    "gap": d["gap"],
                    "severity": severity,
                    "positioning": d["positioning"],
                }
            )
    return {"threshold": threshold, "gaps": gaps, "count": len(gaps)}


# -----------------------------------------------------------------------------
# Async DB orchestration.
# -----------------------------------------------------------------------------


async def run(
    db: AsyncSession,
    review_id: uuid.UUID,
    benchmark_profile_id: uuid.UUID,
) -> BenchmarkComparison:
    """Generate (or refresh) the BenchmarkComparison for a review+profile pair."""
    profile = (
        await db.execute(
            select(BenchmarkProfile).where(BenchmarkProfile.id == benchmark_profile_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise ValueError(f"BenchmarkProfile {benchmark_profile_id} not found")

    assessment = (
        await db.execute(
            select(MaturityAssessment)
            .where(MaturityAssessment.review_id == review_id)
            .order_by(MaturityAssessment.computed_at.desc().nullslast())
        )
    ).scalars().first()
    if assessment is None:
        raise ValueError(
            f"No MaturityAssessment exists for review {review_id}; run the maturity engine first."
        )

    dim_rows = (
        await db.execute(
            select(MaturityDimensionResult).where(
                MaturityDimensionResult.assessment_id == assessment.id
            )
        )
    ).scalars().all()
    review_dims = [
        {
            "name": (r.meta or {}).get("dimension_name") if r.meta else r.dimension_key,
            "dimensionCode": r.dimension_key,
            "score": float(r.score) if r.score is not None else 0.0,
        }
        for r in dim_rows
    ]

    bench_rows = (
        await db.execute(
            select(BenchmarkDimensionScore).where(
                BenchmarkDimensionScore.benchmark_profile_id == benchmark_profile_id
            )
        )
    ).scalars().all()
    bench_scores = [
        {
            "dimension_code": b.dimension_key,
            "average_score": float(b.score) if b.score is not None else None,
            "top_quartile_score": float(b.percentile) if b.percentile is not None else None,
            "percentile": float(b.percentile) if b.percentile is not None else None,
        }
        for b in bench_rows
    ]

    filters = {
        "industry": profile.industry,
        "region": profile.region,
        "companySizeBand": profile.company_size,
    }
    comparison = compare_dimensions(review_dims, bench_scores, filters)
    narrative = _summary_narrative(comparison)
    gap = _gap_data(comparison)

    existing = (
        await db.execute(
            select(BenchmarkComparison).where(
                BenchmarkComparison.review_id == review_id,
                BenchmarkComparison.benchmark_profile_id == benchmark_profile_id,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing is None:
        row = BenchmarkComparison(
            tenant_id=assessment.tenant_id,
            review_id=review_id,
            benchmark_profile_id=benchmark_profile_id,
            comparison_data=comparison,
            overall_positioning=narrative,
            gap_data=gap,
            computed_at=now,
        )
        db.add(row)
        await db.flush()
        return row

    existing.comparison_data = comparison
    existing.overall_positioning = narrative
    existing.gap_data = gap
    existing.computed_at = now
    await db.flush()
    return existing
