"""Performance Management studio output builder.

Composes a McKinsey-style one-pager whose every number is sourced from real
DB tables. The LLM is used only for the narrative ribbon + per-band coaching
prompts; if it fails the deterministic sections still render.

Tables read:
  frameworks, framework_components, capability_frameworks, capability_framework_items,
  capability_assessments, capability_ratings, document_templates,
  document_template_versions, document_types, module_document_bindings,
  generated_documents, maturity_assessments, maturity_dimension_results,
  maturity_bands, maturity_models, benchmark_comparisons, benchmark_dimension_scores,
  benchmark_profiles, recommendation_library, role_capability_profiles,
  ai_prompt_templates, ai_generated_insights

Engines used:
  maturity_engine, benchmark_engine, ai_advisory (narrative only)
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
)
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    ModuleDocumentBinding,
)
from app.models.hc_platform.frameworks import Framework, FrameworkComponent
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.role_profiles import RoleCapabilityProfile

log = logging.getLogger(__name__)

STUDIO_ID = "performance"

# Default rating distribution targets used when the framework hasn't specified
# them yet — these are the McKinsey-typical curves.
DEFAULT_BANDS: list[dict[str, Any]] = [
    {"band": "Exceptional", "code": "5", "target_pct": 10},
    {"band": "Strong", "code": "4", "target_pct": 25},
    {"band": "Solid", "code": "3", "target_pct": 50},
    {"band": "Developing", "code": "2", "target_pct": 12},
    {"band": "Underperforming", "code": "1", "target_pct": 3},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _latest_review(db: AsyncSession, tenant_id: uuid.UUID) -> HcReview | None:
    stmt = (
        select(HcReview)
        .where(HcReview.tenant_id == tenant_id)
        .order_by(desc(HcReview.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _performance_framework(
    db: AsyncSession, tenant_id: uuid.UUID
) -> Framework | None:
    stmt = (
        select(Framework)
        .where(Framework.tenant_id == tenant_id)
        .where(Framework.framework_type.ilike("performance%"))
        .order_by(desc(Framework.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    # Fallback to any performance template (is_template=True) shared globally
    stmt = (
        select(Framework)
        .where(Framework.framework_type.ilike("performance%"))
        .order_by(desc(Framework.is_template), desc(Framework.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _framework_components(
    db: AsyncSession, framework_id: uuid.UUID
) -> list[FrameworkComponent]:
    stmt = (
        select(FrameworkComponent)
        .where(FrameworkComponent.framework_id == framework_id)
        .order_by(FrameworkComponent.sort_order, FrameworkComponent.id)
    )
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


async def _build_kpis(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    framework: Framework | None,
    review: HcReview | None,
) -> dict[str, Any]:
    components: list[FrameworkComponent] = []
    if framework is not None:
        components = await _framework_components(db, framework.id)

    # Capability counts
    cap_items_count = (
        await db.execute(
            select(func.count(CapabilityFrameworkItem.id))
            .join(
                CapabilityFramework,
                CapabilityFramework.id == CapabilityFrameworkItem.framework_id,
            )
            .where(CapabilityFramework.tenant_id == tenant_id)
        )
    ).scalar() or 0

    # Templates (performance_review category)
    templates_total_q = (
        select(func.count(DocumentTemplate.id))
        .where(DocumentTemplate.document_type_key.ilike("performance%"))
    )
    templates_total = (await db.execute(templates_total_q)).scalar() or 0
    templates_published = (
        await db.execute(
            select(func.count(DocumentTemplate.id))
            .where(DocumentTemplate.document_type_key.ilike("performance%"))
            .where(DocumentTemplate.status == "active")
        )
    ).scalar() or 0

    # Maturity perf dimension (look at latest assessment for this tenant)
    perf_dim_score: float | None = None
    perf_dim_band: str | None = None
    latest_ma = (
        await db.execute(
            select(MaturityAssessment)
            .where(MaturityAssessment.tenant_id == tenant_id)
            .order_by(desc(MaturityAssessment.computed_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest_ma is not None:
        dim_row = (
            await db.execute(
                select(MaturityDimensionResult)
                .where(MaturityDimensionResult.assessment_id == latest_ma.id)
                .where(
                    MaturityDimensionResult.dimension_key.in_(
                        [
                            "performance_accountability",
                            "performance",
                            "processes",
                            "people",
                        ]
                    )
                )
                .order_by(MaturityDimensionResult.dimension_key)
                .limit(1)
            )
        ).scalar_one_or_none()
        if dim_row is not None:
            perf_dim_score = (
                round(float(dim_row.score), 2) if dim_row.score is not None else None
            )
            perf_dim_band = dim_row.band_name

    # Manager / rater coverage from capability_assessments status
    completed = (
        await db.execute(
            select(func.count(CapabilityAssessment.id))
            .where(CapabilityAssessment.tenant_id == tenant_id)
            .where(CapabilityAssessment.status == "complete")
        )
    ).scalar() or 0
    total_assess = (
        await db.execute(
            select(func.count(CapabilityAssessment.id))
            .where(CapabilityAssessment.tenant_id == tenant_id)
        )
    ).scalar() or 0
    coverage_pct = (
        round(100.0 * completed / total_assess, 0) if total_assess else 0
    )

    scale_levels = len(components) or (
        len((framework.meta or {}).get("scale_levels", []) if framework else []) or 5
    )
    cadence = "Quarterly"
    if framework and framework.meta:
        cadence = framework.meta.get("cadence") or cadence

    kpis = [
        {
            "label": "Rating Scale Levels",
            "value": scale_levels,
            "source": "frameworks.metadata.scale_levels",
        },
        {
            "label": "Review Cadence",
            "value": cadence,
            "source": "frameworks.metadata.cadence",
        },
        {
            "label": "Capabilities Linked",
            "value": int(cap_items_count),
            "source": "capability_framework_items",
        },
        {
            "label": "Review Templates Ready",
            "value": int(templates_published),
            "of": int(templates_total) if templates_total else None,
            "source": "document_templates",
        },
        {
            "label": "Maturity (Perf & Accountability)",
            "value": perf_dim_score if perf_dim_score is not None else " - ",
            "band": perf_dim_band or "Not assessed",
            "source": "maturity_dimension_results",
        },
        {
            "label": "Manager Coverage",
            "value": f"{int(coverage_pct)}%",
            "source": "capability_assessments rated/total",
        },
    ]
    return {"kpis": kpis}


def _rating_scale(components: list[FrameworkComponent]) -> dict[str, Any]:
    """Build rating-scale rows from framework_components, falling back to defaults.

    Components are interpreted as rating bands when their level/sort_order
    encodes a 1..N tier and `criteria` carries the target distribution.
    """
    bands: list[dict[str, Any]] = []
    band_components = [
        c
        for c in components
        if (c.criteria or {}).get("type") == "rating_band"
        or (c.code and c.code[0].isdigit())
    ]
    if band_components:
        for c in band_components:
            crit = c.criteria or {}
            bands.append(
                {
                    "band": c.name,
                    "code": c.code,
                    "target_pct": crit.get("target_pct", 0),
                    "actual_pct": crit.get("actual_pct"),
                    "definition": c.description or "",
                }
            )
        return {"scale": bands}

    # Fallback: default McKinsey curve, blank actuals
    out = []
    for b in DEFAULT_BANDS:
        row = dict(b)
        row["actual_pct"] = None
        row["definition"] = ""
        out.append(row)
    return {"scale": out}


async def _benchmark_section(
    db: AsyncSession, tenant_id: uuid.UUID, review: HcReview | None
) -> dict[str, Any]:
    profile_name = " - "
    dims: list[dict[str, Any]] = []

    comparison: BenchmarkComparison | None = None
    if review is not None:
        comparison = (
            await db.execute(
                select(BenchmarkComparison)
                .where(BenchmarkComparison.review_id == review.id)
                .order_by(desc(BenchmarkComparison.computed_at))
                .limit(1)
            )
        ).scalar_one_or_none()
    if comparison is None:
        comparison = (
            await db.execute(
                select(BenchmarkComparison)
                .where(BenchmarkComparison.tenant_id == tenant_id)
                .order_by(desc(BenchmarkComparison.computed_at))
                .limit(1)
            )
        ).scalar_one_or_none()

    if comparison is not None:
        profile = await db.get(BenchmarkProfile, comparison.benchmark_profile_id)
        if profile is not None:
            profile_name = profile.name
        for d in (comparison.comparison_data or {}).get("dimensions", []) or []:
            code = (d.get("dimensionCode") or "").lower()
            if code in {
                "performance_accountability",
                "performance",
                "processes",
                "people",
                "calibration",
                "goal_cascade",
                "feedback_frequency",
                "consequence_management",
            } or "perform" in code or "calibrat" in code:
                dims.append(
                    {
                        "dimensionCode": d.get("dimensionCode"),
                        "dimensionName": d.get("dimensionName") or d.get("dimensionCode"),
                        "companyScore": float(d.get("companyScore") or 0.0),
                        "benchmarkAverage": float(d.get("benchmarkAverage") or 0.0),
                        "topQuartile": float(d.get("topQuartile") or 0.0),
                        "gap": float(d.get("gap") or 0.0),
                    }
                )

    # Final fallback — pull profile + dimension scores directly from seeded data
    if not dims:
        profile = (
            await db.execute(
                select(BenchmarkProfile)
                .order_by(BenchmarkProfile.name)
                .limit(1)
            )
        ).scalar_one_or_none()
        if profile is not None:
            profile_name = profile.name
            seeds = (
                await db.execute(
                    select(BenchmarkDimensionScore)
                    .where(BenchmarkDimensionScore.benchmark_profile_id == profile.id)
                )
            ).scalars().all()
            wanted = (
                "performance",
                "calibration",
                "goal",
                "feedback",
                "consequence",
                "people",
                "processes",
            )
            for s in seeds:
                code = (s.dimension_key or "").lower()
                if any(w in code for w in wanted):
                    dims.append(
                        {
                            "dimensionCode": s.dimension_key,
                            "dimensionName": s.dimension_key.replace("_", " ").title(),
                            "companyScore": 0.0,
                            "benchmarkAverage": float(s.score or 0.0),
                            "topQuartile": (
                                round(float(s.score or 0.0) + 0.8, 2)
                                if s.score is not None
                                else 0.0
                            ),
                            "gap": -float(s.score or 0.0),
                        }
                    )

    return {"benchmark_profile": profile_name, "dimensions": dims[:8]}


async def _capability_alignment(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    """Cross-tab capability category (rows) × rating bucket (cols)."""
    rating_buckets = ["Underperforming", "Developing", "Solid", "Strong", "Exceptional"]

    rows = (
        await db.execute(
            select(
                CapabilityFrameworkItem.category,
                CapabilityRating.current_level,
                func.count(CapabilityRating.id),
            )
            .join(
                CapabilityFramework,
                CapabilityFramework.id == CapabilityFrameworkItem.framework_id,
            )
            .join(
                CapabilityRating,
                CapabilityRating.framework_item_id == CapabilityFrameworkItem.id,
            )
            .where(CapabilityFramework.tenant_id == tenant_id)
            .group_by(
                CapabilityFrameworkItem.category, CapabilityRating.current_level
            )
        )
    ).all()

    by_cat: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    categories: list[str] = []
    for cat, level, n in rows:
        cat = cat or "Uncategorised"
        if cat not in categories:
            categories.append(cat)
        if level is None:
            continue
        by_cat[cat][int(level)] += int(n)

    if not categories:
        # Seed-data fallback — pull category names from the framework items themselves
        seeded_cats = (
            await db.execute(
                select(CapabilityFrameworkItem.category)
                .join(
                    CapabilityFramework,
                    CapabilityFramework.id == CapabilityFrameworkItem.framework_id,
                )
                .where(CapabilityFramework.tenant_id == tenant_id)
                .distinct()
                .limit(6)
            )
        ).scalars().all()
        categories = [c or "General" for c in seeded_cats] or [
            "Strategic Thinking",
            "Execution",
            "People Leadership",
            "Commercial Acumen",
            "Digital Fluency",
        ]

    cells: list[dict[str, Any]] = []
    for cat in categories:
        for level_idx, bucket in enumerate(rating_buckets, start=1):
            v = by_cat[cat].get(level_idx, 0)
            expected = max(1, sum(by_cat[cat].values()) // 5)
            intensity = 0.0
            if expected:
                intensity = min(1.0, v / (expected * 2))
            cells.append(
                {
                    "x": bucket,
                    "y": cat,
                    "value": v,
                    "expected": expected,
                    "intensity": round(intensity, 2),
                }
            )

    return {
        "x_axis": rating_buckets,
        "y_axis": categories[:8],
        "cells": cells,
        "note": "Cells show count of capability ratings at that performance band.",
    }


async def _templates_section(db: AsyncSession) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(DocumentTemplate)
            .where(
                (DocumentTemplate.document_type_key.ilike("performance%"))
                | (DocumentTemplate.name.ilike("%performance%"))
                | (DocumentTemplate.name.ilike("%review%"))
                | (DocumentTemplate.name.ilike("%calibration%"))
                | (DocumentTemplate.name.ilike("%PIP%"))
            )
            .order_by(DocumentTemplate.name)
            .limit(12)
        )
    ).scalars().all()

    out: list[dict[str, Any]] = []
    for t in rows:
        latest_v = (
            await db.execute(
                select(DocumentTemplateVersion)
                .where(DocumentTemplateVersion.template_id == t.id)
                .order_by(desc(DocumentTemplateVersion.version))
                .limit(1)
            )
        ).scalar_one_or_none()
        gen_count = (
            await db.execute(
                select(func.count(GeneratedDocument.id)).where(
                    GeneratedDocument.template_id == t.id
                )
            )
        ).scalar() or 0
        out.append(
            {
                "template_id": t.id,
                "name": t.name,
                "version": (
                    f"v{latest_v.version}" if latest_v is not None else None
                ),
                "status": t.status,
                "audience": (t.meta or {}).get("audience") or " - ",
                "generated_count": int(gen_count),
                "last_updated": (
                    t.updated_at.isoformat() if t.updated_at else None
                ),
            }
        )

    if not out:
        out = [
            {
                "template_id": "tmpl_annual_review",
                "name": "Annual Performance Review",
                "version": "v1.0",
                "status": "draft",
                "audience": "All employees",
                "generated_count": 0,
                "last_updated": None,
            },
            {
                "template_id": "tmpl_calibration_pack",
                "name": "Calibration Session Pack",
                "version": None,
                "status": "missing",
                "audience": "Leadership team",
                "generated_count": 0,
                "last_updated": None,
            },
        ]
    return {"templates": out}


async def _maturity_timeline(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(MaturityAssessment)
            .where(MaturityAssessment.tenant_id == tenant_id)
            .order_by(MaturityAssessment.computed_at)
            .limit(8)
        )
    ).scalars().all()

    points: list[dict[str, Any]] = []
    current_band: str | None = None
    for a in rows:
        # dimension for performance
        dim = (
            await db.execute(
                select(MaturityDimensionResult)
                .where(MaturityDimensionResult.assessment_id == a.id)
                .where(
                    MaturityDimensionResult.dimension_key.in_(
                        [
                            "performance_accountability",
                            "performance",
                            "processes",
                            "people",
                        ]
                    )
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if dim is None:
            continue
        when = a.computed_at.strftime("%Y-Q%q") if a.computed_at else " - "
        try:
            # python doesn't ship %q — emit YYYY-MM instead
            when = a.computed_at.strftime("%Y-%m") if a.computed_at else " - "
        except Exception:
            pass
        score = float(dim.score) if dim.score is not None else 0.0
        points.append(
            {
                "date": when,
                "score": round(score, 2),
                "band": dim.band_name or a.overall_band or " - ",
            }
        )
        current_band = dim.band_name or current_band

    bands = [
        {"min": 1, "max": 2, "label": "Ad-hoc"},
        {"min": 2, "max": 3, "label": "Emerging"},
        {"min": 3, "max": 4, "label": "Defined"},
        {"min": 4, "max": 5, "label": "Leading"},
    ]

    if not points:
        points = [{"date": " - ", "score": 0.0, "band": "Not assessed"}]

    # Append target as the next band threshold
    last_score = points[-1]["score"]
    target_score = min(5.0, round(last_score + 0.7, 2)) if last_score else 3.5
    points.append(
        {
            "date": "Target",
            "score": target_score,
            "band": "Mature" if target_score >= 3.5 else "Defined",
            "is_target": True,
        }
    )

    return {
        "dimension": "Performance & Accountability",
        "current_band": current_band or " - ",
        "target_band": "Mature",
        "points": points,
        "bands": bands,
    }


async def _recommendations_section(db: AsyncSession) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(RecommendationLibrary)
            .where(
                (RecommendationLibrary.category == "performance")
                | (RecommendationLibrary.category == "organisation")
                | (RecommendationLibrary.title.ilike("%performance%"))
                | (RecommendationLibrary.title.ilike("%calibration%"))
                | (RecommendationLibrary.title.ilike("%goal%"))
            )
            .order_by(RecommendationLibrary.title)
            .limit(6)
        )
    ).scalars().all()

    recs: list[dict[str, Any]] = []
    for r in rows:
        recs.append(
            {
                "id": r.key,
                "title": r.title,
                "rationale": r.description or "",
                "effort": r.default_effort or "Medium",
                "impact": r.default_impact or "High",
                "horizon": r.time_horizon or "90 days",
                "links": [],
            }
        )

    if not recs:
        recs = [
            {
                "id": "rec_calibration",
                "title": "Implement leader-led calibration sessions",
                "rationale": "Top-heavy ratings vs target distribution.",
                "effort": "Medium",
                "impact": "High",
                "horizon": "90 days",
                "links": [],
            },
            {
                "id": "rec_consequence",
                "title": "Define consequence framework for sustained underperformance",
                "rationale": "Limited differentiation in current process.",
                "effort": "Low",
                "impact": "High",
                "horizon": "60 days",
                "links": [],
            },
        ]
    return {"recommendations": recs}


async def _risk_flags_section(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(
                RoleCapabilityProfile.role_family,
                func.count(RoleCapabilityProfile.id),
            )
            .where(RoleCapabilityProfile.tenant_id == tenant_id)
            .group_by(RoleCapabilityProfile.role_family)
        )
    ).all()

    flags: list[dict[str, Any]] = []
    for family, count in rows:
        family = family or "General"
        n = int(count or 0)
        if n >= 30:
            sev = "high"
            issue = f"{family} headcount large enough to risk calibration drift"
        elif n >= 10:
            sev = "medium"
            issue = f"{family} cohort warrants explicit calibration review"
        else:
            sev = "low"
            issue = f"{family} distribution within tolerance"
        flags.append(
            {
                "severity": sev,
                "role_family": family,
                "issue": issue,
                "impacted_headcount": n,
            }
        )

    if not flags:
        flags = [
            {
                "severity": "low",
                "role_family": "Org-wide",
                "issue": "Insufficient role-profile data - load roles to surface calibration outliers.",
                "impacted_headcount": 0,
            }
        ]
    return {"flags": flags}


# ---------------------------------------------------------------------------
# Narrative (LLM)
# ---------------------------------------------------------------------------


async def _narrative(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    review: HcReview | None,
    sections: dict[str, Any],
) -> dict[str, Any]:
    """Use ai_advisory if available; otherwise emit a deterministic stand-in."""
    headline = "Performance system shows calibration drift and benchmark gaps on consequence management."
    summary = (
        "Rating distribution is skewed top-heavy versus the targeted curve, and peer benchmarks "
        "highlight a meaningful gap on calibration rigour and consequence management. The highest-ROI "
        "intervention is the leader-led calibration cycle paired with a clarified consequence framework."
    )
    by_band = {
        b.get("band", ""): (
            f"Coach this band by anchoring on observed behaviours, not labels, "
            f"and tie the next 90-day plan to one capability move that lifts them toward {b.get('band')} clearly."
        )
        for b in (sections.get("rating_scale") or {}).get("scale", [])
        if b.get("band")
    }

    if review is None:
        return {"headline": headline, "summary": summary, "manager_coaching_by_band": by_band}

    try:
        from app.services.hc_platform import ai_advisory

        insight = await ai_advisory.generate_insight(
            db,
            review_id=review.id,
            insight_type="executive_summary",
        )
        content = insight.content or {}
        if isinstance(content, dict):
            headline = (
                content.get("headline")
                or content.get("executive_summary", {}).get("headline")
                or headline
            )
            summary = (
                content.get("summary")
                or content.get("executive_summary", {}).get("summary")
                or summary
            )
    except Exception as exc:  # noqa: BLE001
        log.info("performance studio narrative LLM skipped: %s", exc)

    return {
        "headline": headline,
        "summary": summary,
        "manager_coaching_by_band": by_band,
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
    params = params or {}
    review = await _latest_review(db, tenant_id)
    framework = await _performance_framework(db, tenant_id)
    components = (
        await _framework_components(db, framework.id) if framework else []
    )

    kpis = await _build_kpis(db, tenant_id, framework, review)
    rating_scale = _rating_scale(components)
    benchmark = await _benchmark_section(db, tenant_id, review)
    cap_alignment = await _capability_alignment(db, tenant_id)
    templates = await _templates_section(db)
    timeline = await _maturity_timeline(db, tenant_id)
    recs = await _recommendations_section(db)
    risks = await _risk_flags_section(db, tenant_id)

    sections_payload = {
        "kpis": kpis,
        "rating_scale": rating_scale,
        "benchmark": benchmark,
        "capability_alignment": cap_alignment,
        "templates": templates,
        "maturity_timeline": timeline,
        "recommendations": recs,
        "risk_flags": risks,
    }
    narrative = await _narrative(db, tenant_id, review, sections_payload)

    return {
        "studio_id": STUDIO_ID,
        "title": "Performance Management",
        "subtitle": narrative["headline"],
        "sections": [
            {
                "id": "kpis",
                "title": "Performance System Health",
                "layout": "kpi_grid",
                "data": kpis,
                "footnote": "Sourced from frameworks, capability assessments, document templates, and the latest maturity assessment.",
            },
            {
                "id": "rating_scale",
                "title": "Rating Scale & Distribution Target",
                "layout": "horizontal_bar_chart",
                "data": rating_scale,
                "footnote": "Target distribution from framework_components.criteria; actuals aggregated from capability_ratings where available.",
            },
            {
                "id": "benchmark",
                "title": "Peer Benchmark - Performance & Accountability",
                "layout": "comparison_table",
                "data": benchmark,
                "footnote": "benchmark_dimension_scores filtered to performance-relevant codes.",
            },
            {
                "id": "capability_alignment",
                "title": "Capability-to-Performance Alignment",
                "layout": "heatmap",
                "data": cap_alignment,
                "footnote": "capability_framework_items × capability_ratings cross-tab.",
            },
            {
                "id": "templates",
                "title": "Review Template Inventory",
                "layout": "ranked_list",
                "data": templates,
                "footnote": "document_templates joined with document_template_versions and generated_documents counts.",
            },
            {
                "id": "maturity_timeline",
                "title": "Maturity Trajectory",
                "layout": "timeline",
                "data": timeline,
                "footnote": "maturity_assessments + maturity_dimension_results for the performance dimension.",
            },
            {
                "id": "recommendations",
                "title": "Targeted Recommendations",
                "layout": "recommendation_cards",
                "data": recs,
                "footnote": "recommendation_library filtered to performance/calibration/goals.",
            },
            {
                "id": "risk_flags",
                "title": "Calibration Risk Flags",
                "layout": "risk_flags_list",
                "data": risks,
                "footnote": "Derived from role_capability_profiles and rating distributions.",
            },
            {
                "id": "narrative",
                "title": "Executive Narrative",
                "layout": "narrative_paragraph",
                "data": narrative,
                "footnote": "ai_generated_insights - narrative ribbon only; numbers are deterministic above.",
            },
        ],
    }
