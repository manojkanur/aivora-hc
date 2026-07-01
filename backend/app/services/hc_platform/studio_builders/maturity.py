"""Maturity Assessment studio builder.

Produces a 7-section, McKinsey-style maturity one-pager keyed entirely on
deterministic engine outputs:
  1. Overall KPI strip
  2. Per-dimension heatmap weighted by maturity_models.dimensions[].weight
  3. Radar vs target (+ optional benchmark overlay)
  4. Gap-to-target horizontal bars
  5. Prioritization signals (priorityScore from the engine)
  6. Risk flags (the five deterministic engine rules)
  7. Recommendation cards from recommendation_library
  8. Audit-trail comparison table linking back to hc_reviews.diagnostic_results

No LLM is used. If a maturity assessment for the tenant's latest review
doesn't exist yet, the maturity engine is invoked on the fly so a fresh
demo tenant still renders. If nothing at all exists, we surface the seeded
maturity_model + reference recommendations so the section blocks always
populate with real DB rows.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.hc_platform import maturity_engine
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

# ---------------------------------------------------------------------------
# Color helpers (band → hex)
# ---------------------------------------------------------------------------

BAND_COLOR: dict[str, str] = {
    "initial": "#ef4444",
    "emerging": "#ef4444",
    "developing": "#f59e0b",
    "defined": "#eab308",
    "managed": "#22c55e",
    "mature": "#22c55e",
    "optimized": "#10b981",
    "leading": "#10b981",
}


def _color_for_band(band: str | None) -> str:
    if not band:
        return "#64748b"
    return BAND_COLOR.get(band.lower(), "#64748b")


def _color_for_gap(gap: float) -> str:
    if gap >= 1.5:
        return "#ef4444"
    if gap >= 1.0:
        return "#f59e0b"
    if gap >= 0.5:
        return "#eab308"
    return "#22c55e"


# Dimension category → recommendation_library category mapping.
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
    "culture": ["culture"],
}


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    target = 4.0
    review = await latest_review(db, tenant_id)
    model = await default_maturity_model(db)

    # 1. Ensure we have an assessment. If the tenant has a review but no
    # assessment yet, run the engine now so the studio is non-empty.
    assessment = None
    if review is not None and model is not None:
        assessment = await latest_assessment(db, review.id)
        if assessment is None:
            try:
                assessment = await maturity_engine.run(db, review.id, model.id)
            except ValueError:
                assessment = None

    dim_rows = await assessment_dimensions(db, assessment.id if assessment else None)

    # Build weight map from the model JSON.
    weight_map: dict[str, float] = {}
    model_dims_meta: dict[str, dict[str, Any]] = {}
    if model is not None and isinstance(model.dimensions, list):
        for d in model.dimensions:
            if not isinstance(d, dict):
                continue
            key = str(d.get("key") or d.get("code") or "")
            if not key:
                continue
            weight_map[key] = safe_float(d.get("weight"), 1.0)
            model_dims_meta[key] = d

    # ----- Section 1: Overall KPI strip ----------------------------------
    overall_score = safe_float(assessment.overall_score if assessment else 0.0)
    overall_band = (assessment.overall_band if assessment else None) or "Unknown"
    band_narrative = ""
    if assessment is not None and isinstance(assessment.meta, dict):
        band_narrative = str(assessment.meta.get("interpretation") or "")

    kpis = [
        {
            "label": "Overall HC Maturity",
            "value": round(overall_score, 2),
            "unit": "/5",
            "band": overall_band,
            "source": "maturity_assessments",
        },
        {
            "label": "Target",
            "value": target,
            "unit": "/5",
            "source": "maturity_engine",
        },
        {
            "label": "Gap to Target",
            "value": round(max(0.0, target - overall_score), 2),
            "unit": "pts",
            "source": "maturity_dimension_results",
        },
        {
            "label": "Dimensions Measured",
            "value": len(dim_rows),
            "unit": "",
            "source": "maturity_dimension_results",
        },
        {
            "label": "Maturity Model",
            "value": model.name if model is not None else "Not loaded",
            "unit": f"v{model.version}" if model is not None else "",
            "source": "maturity_models",
        },
    ]
    s1 = section(
        "overall-kpis",
        "Strategic Posture Snapshot",
        "kpi_grid",
        {
            "kpis": kpis,
            "overall_band_narrative": band_narrative,
        },
        footnote="Source: maturity_assessments + maturity_models (deterministic).",
    )

    # ----- Section 2: Dimension heatmap (weighted) -----------------------
    cells: list[dict[str, Any]] = []
    for d in dim_rows:
        score = safe_float(d.score)
        meta = d.meta or {}
        label = (meta.get("dimension_name") if isinstance(meta, dict) else None) or d.dimension_key.replace("_", " ").title()
        weight = weight_map.get(d.dimension_key, 1.0)
        cells.append(
            {
                "dimensionKey": d.dimension_key,
                "label": label,
                "score": round(score, 2),
                "band": d.band_name,
                "weight": round(weight, 3),
                "criticality": d.criticality,
                "readiness": d.readiness,
                "color": _color_for_band(d.band_name),
            }
        )
    s2 = section(
        "heatmap",
        "Dimension Heatmap (Weighted)",
        "heatmap",
        {
            "cells": cells,
            "bandLegend": [
                {"band": "Initial", "min": 1.0, "max": 1.5, "color": BAND_COLOR["initial"]},
                {"band": "Developing", "min": 1.5, "max": 2.5, "color": BAND_COLOR["developing"]},
                {"band": "Defined", "min": 2.5, "max": 3.5, "color": BAND_COLOR["defined"]},
                {"band": "Managed", "min": 3.5, "max": 4.5, "color": BAND_COLOR["managed"]},
                {"band": "Optimized", "min": 4.5, "max": 5.0, "color": BAND_COLOR["optimized"]},
            ],
        },
        footnote="Source: maturity_dimension_results joined to maturity_models.dimensions[].weight.",
    )

    # ----- Section 3: Radar vs target (+ optional benchmark) -------------
    axes = [c["dimensionKey"] for c in cells]
    series: list[dict[str, Any]] = [
        {
            "name": "Current",
            "values": [c["score"] for c in cells],
            "color": "#3B82F6",
        },
        {
            "name": "Target",
            "values": [target for _ in cells],
            "color": "#10B981",
        },
    ]

    # Try to overlay benchmark p50 if a comparison exists.
    if review is not None:
        comparison = await latest_benchmark_comparison(db, review.id)
        if comparison is not None and isinstance(comparison.comparison_data, dict):
            bench_dims = comparison.comparison_data.get("dimensions") or []
            by_code = {str(b.get("dimensionCode") or ""): b for b in bench_dims if isinstance(b, dict)}
            bench_vals = [safe_float(by_code.get(c["dimensionKey"], {}).get("benchmarkAverage")) for c in cells]
            if any(v > 0 for v in bench_vals):
                series.append(
                    {
                        "name": "Benchmark P50",
                        "values": [round(v, 2) for v in bench_vals],
                        "color": "#94A3B8",
                        "source": "benchmark_dimension_scores",
                    }
                )
    s3 = section(
        "radar",
        "Maturity Radar vs Target",
        "radar_chart",
        {"axes": axes, "series": series, "maxScore": 5.0},
        footnote="Source: maturity_dimension_results; benchmark series joined from benchmark_dimension_scores when present.",
    )

    # ----- Section 4: Gap-to-target horizontal bars ---------------------
    bars: list[dict[str, Any]] = []
    for c in cells:
        gap = round(target - c["score"], 2) if c["score"] is not None else target
        gap = max(0.0, gap)
        bars.append(
            {
                "label": c["label"],
                "gap": gap,
                "current": c["score"],
                "target": target,
                "band": c["band"],
                "barColor": _color_for_gap(gap),
            }
        )
    bars.sort(key=lambda b: b["gap"], reverse=True)
    s4 = section(
        "gap-bars",
        "Gap to Target by Dimension",
        "horizontal_bar_chart",
        {"bars": bars, "target": target},
        footnote="Source: maturity_dimension_results.meta.gap_size (engine-computed).",
    )

    # ----- Section 5: Prioritization signals ----------------------------
    prio_items: list[dict[str, Any]] = []
    if assessment is not None and isinstance(assessment.meta, dict):
        signals = assessment.meta.get("prioritization_signals") or []
        for i, p in enumerate(signals, start=1):
            if not isinstance(p, dict):
                continue
            badges: list[str] = []
            if p.get("dependency") == "blocking":
                badges.append("BLOCKING")
            if p.get("criticality") in {"high", "critical"}:
                badges.append("HIGH CRITICALITY")
            if p.get("readiness") == "not_ready":
                badges.append("NOT READY")
            prio_items.append(
                {
                    "rank": i,
                    "dimensionKey": p.get("dimensionCode"),
                    "label": p.get("dimensionName")
                    or str(p.get("dimensionCode", "")).replace("_", " ").title(),
                    "priorityScore": safe_float(p.get("priorityScore")),
                    "gapSize": safe_float(p.get("gapSize")),
                    "criticality": p.get("criticality"),
                    "dependency": p.get("dependency"),
                    "readiness": p.get("readiness"),
                    "badges": badges,
                }
            )
    s5 = section(
        "prioritization",
        "Prioritization Signals (Where to Invest First)",
        "ranked_list",
        {"items": prio_items},
        footnote="Source: maturity_assessments.meta.prioritization_signals (gap×2 + criticality + dependency + readiness).",
    )

    # ----- Section 6: Risk flags ----------------------------------------
    flags_raw: list[dict[str, Any]] = []
    if assessment is not None and isinstance(assessment.meta, dict):
        flags_raw = list(assessment.meta.get("risk_flags") or [])
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for f in flags_raw:
        sev = str(f.get("severity") or "").lower()
        if sev in counts:
            counts[sev] += 1
    s6 = section(
        "risk-flags",
        "Risk Flags",
        "risk_flags_list",
        {"flags": flags_raw, "counts": counts},
        footnote="Source: maturity_engine deterministic risk rules (5 fixed thresholds).",
    )

    # ----- Section 7: Recommended actions -------------------------------
    # Build a category list ordered by priority of the weakest dims.
    cat_order: list[str] = []
    for p in prio_items:
        for cat in DIM_TO_CATEGORIES.get(str(p.get("dimensionKey") or ""), []):
            if cat not in cat_order:
                cat_order.append(cat)
    if not cat_order:
        cat_order = ["talent", "leadership", "learning", "organisation"]

    library_rows = await recommendation_pool(db, cat_order, limit=20)
    # Try to associate each library row to the weakest dim that maps to it.
    dim_by_cat: dict[str, dict[str, Any]] = {}
    for p in prio_items:
        for cat in DIM_TO_CATEGORIES.get(str(p.get("dimensionKey") or ""), []):
            dim_by_cat.setdefault(cat, p)

    cards: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for r in library_rows:
        if r.key in seen_keys:
            continue
        seen_keys.add(r.key)
        dim = dim_by_cat.get(r.category or "", {})
        cards.append(
            {
                "dimensionKey": dim.get("dimensionKey"),
                "recommendationId": r.key,
                "title": r.title,
                "summary": r.description or "",
                "effort": (r.default_effort or "M").upper()[:1],
                "impact": (r.default_impact or "M").upper()[:1],
                "horizon": r.time_horizon or "3-6m",
                "category": r.category,
                "source": "recommendation_library",
            }
        )
        if len(cards) >= 8:
            break
    s7 = section(
        "recommendations",
        "Recommended Next Actions",
        "recommendation_cards",
        {"cards": cards},
        footnote="Source: recommendation_library filtered by weakest-dimension categories.",
    )

    # ----- Section 8: Audit trail (comparison_table) --------------------
    rows_at: list[dict[str, Any]] = []
    raw_source_field = "diagnostic_results.dimensions"
    raw_dims: list[dict[str, Any]] = []
    if review is not None:
        dr = review.diagnostic_results or {}
        if isinstance(dr, dict):
            raw_dims = list(dr.get("dimensions") or [])
        if not raw_dims and isinstance(review.intake_data, dict):
            ratings = review.intake_data.get("maturity_ratings") or {}
            if isinstance(ratings, dict):
                raw_source_field = "intake_data.maturity_ratings"
                raw_dims = [{"name": k, "score": v} for k, v in ratings.items()]

    final_by_code = {d.dimension_key: d for d in dim_rows}
    for raw in raw_dims:
        raw_name = str(raw.get("name") or raw.get("key") or "")
        raw_score = safe_float(raw.get("score"))
        # Re-derive mapped code via the engine's mapper to keep the audit honest.
        mapped_code = maturity_engine.map_dimension_to_code(raw_name) if raw_name else ""
        final = final_by_code.get(mapped_code)
        rows_at.append(
            {
                "dimensionKey": mapped_code or raw_name,
                "rawName": raw_name,
                "rawScore": round(raw_score, 2),
                "mappedCode": mapped_code,
                "finalScore": round(safe_float(final.score), 2) if final else None,
                "finalBand": final.band_name if final else None,
            }
        )
    s8 = section(
        "audit-trail",
        "Audit Trail - Source Answers",
        "comparison_table",
        {
            "reviewId": str(review.id) if review else None,
            "inputsHash": assessment.inputs_hash if assessment else None,
            "sourceField": raw_source_field,
            "columns": ["Dimension", "Raw Name", "Raw Score", "Mapped Code", "Final Score", "Final Band"],
            "rows": rows_at,
        },
        footnote="Source: hc_reviews.diagnostic_results → maturity_engine.map_dimension_to_code → maturity_dimension_results.",
    )

    subtitle = (
        f"Overall {round(overall_score, 2)}/5 - {overall_band} band"
        if assessment is not None
        else "Reference maturity model - no assessment yet"
    )
    return document(
        "maturity",
        "Maturity Assessment",
        subtitle,
        [s1, s2, s3, s4, s5, s6, s7, s8],
    )
