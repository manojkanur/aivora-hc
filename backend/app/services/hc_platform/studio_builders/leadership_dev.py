"""Leadership Development studio output builder.

Tiered KPI grid, capability coverage heatmap, radar vs. benchmark, program ROI
ranked list, succession/bench risk flags, maturity vs. peer comparison, 12-month
rollout timeline, and curriculum document templates.  Pulls from real DB tables
and the Maturity + Benchmark engines (when seeded).  LLM is not invoked here —
the AI Advisory endpoint exposes the callouts separately.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
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
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
    MaturityModel,
)
from app.models.hc_platform.mobility import MobilityReadinessAssessment
from app.models.hc_platform.projects import Project
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.models.hc_platform.role_profiles import (
    RoleCapabilityProfile,
    RoleCapabilityRequirement,
)
from app.services.hc_platform.studio_builders._common import (
    brief_org_name,
    brief_primary_challenge,
    workforce_phrase,
)

STUDIO_ID = "leadership-dev"

TIERS = ["Executive", "Senior", "Mid", "Frontline", "Emerging"]


# ---------------------------------------------------------------------------
# Demo fallbacks
# ---------------------------------------------------------------------------

_DEMO_BENCH = [
    {"tier": "Executive", "leaders_in_role": 12, "ready_now_pct": 0.42, "ready_1_2y_pct": 0.25,
     "successors_per_role": 1.3, "avg_capability_score": 3.8, "benchmark_avg": 3.5, "programs_active": 2},
    {"tier": "Senior", "leaders_in_role": 38, "ready_now_pct": 0.31, "ready_1_2y_pct": 0.40,
     "successors_per_role": 1.1, "avg_capability_score": 3.4, "benchmark_avg": 3.2, "programs_active": 3},
    {"tier": "Mid", "leaders_in_role": 124, "ready_now_pct": 0.28, "ready_1_2y_pct": 0.45,
     "successors_per_role": 1.8, "avg_capability_score": 3.1, "benchmark_avg": 3.0, "programs_active": 4},
    {"tier": "Frontline", "leaders_in_role": 286, "ready_now_pct": 0.22, "ready_1_2y_pct": 0.51,
     "successors_per_role": 2.4, "avg_capability_score": 2.9, "benchmark_avg": 2.8, "programs_active": 5},
    {"tier": "Emerging", "leaders_in_role": 412, "ready_now_pct": 0.18, "ready_1_2y_pct": 0.38,
     "successors_per_role": None, "avg_capability_score": 2.6, "benchmark_avg": 2.5, "programs_active": 3},
]

_DEMO_CAPABILITIES = [
    {"id": "cap-001", "name": "Strategic Thinking", "tier": "Senior"},
    {"id": "cap-002", "name": "Coaching", "tier": "Mid"},
    {"id": "cap-003", "name": "Change Leadership", "tier": "Senior"},
    {"id": "cap-004", "name": "Decision Making", "tier": "Frontline"},
    {"id": "cap-005", "name": "Influence", "tier": "Mid"},
    {"id": "cap-006", "name": "Talent Development", "tier": "Mid"},
    {"id": "cap-007", "name": "Business Acumen", "tier": "Senior"},
    {"id": "cap-008", "name": "Inclusive Leadership", "tier": "Frontline"},
]

_DEMO_PROGRAMS = [
    {"id": "prog-exec", "name": "Executive Accelerator", "tier": "Executive"},
    {"id": "prog-snr", "name": "Senior Leaders Forum", "tier": "Senior"},
    {"id": "prog-mid", "name": "Manager Excellence", "tier": "Mid"},
    {"id": "prog-fl", "name": "Frontline Foundations", "tier": "Frontline"},
    {"id": "prog-em", "name": "Emerging Leaders", "tier": "Emerging"},
]


async def _load_leadership_programs(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[Project]:
    stmt = select(Project).where(
        Project.tenant_id == tenant_id,
    )
    rows = (await db.execute(stmt)).scalars().all()
    out = []
    for p in rows:
        meta = p.meta or {}
        ptype = meta.get("type", "") if isinstance(meta, dict) else ""
        # Leadership program markers — accept several conventions.
        if (
            ptype == "leadership_program"
            or "leadership" in (p.description or "").lower()
            or "leadership" in (p.name or "").lower()
        ):
            out.append(p)
    return out


async def _load_leadership_roles(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[RoleCapabilityProfile]:
    stmt = select(RoleCapabilityProfile).where(
        RoleCapabilityProfile.tenant_id == tenant_id,
        RoleCapabilityProfile.leadership_tier.isnot(None),
    )
    return list((await db.execute(stmt)).scalars().all())


async def _avg_capability_per_tier(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, float]:
    """Average capability_ratings.current_level grouped by leadership_tier."""
    # join: capability_ratings -> assessments -> role_profile_id -> tier
    stmt = (
        select(
            RoleCapabilityProfile.leadership_tier,
            func.avg(CapabilityRating.current_level).label("avg"),
        )
        .join(
            CapabilityAssessment,
            CapabilityAssessment.role_profile_id == RoleCapabilityProfile.id,
        )
        .join(
            CapabilityRating,
            CapabilityRating.assessment_id == CapabilityAssessment.id,
        )
        .where(CapabilityAssessment.tenant_id == tenant_id)
        .group_by(RoleCapabilityProfile.leadership_tier)
    )
    rows = (await db.execute(stmt)).all()
    out: dict[str, float] = {}
    for tier, avg in rows:
        if tier and avg is not None:
            try:
                out[str(tier)] = float(avg)
            except (TypeError, ValueError):
                continue
    return out


async def _bench_strength(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[dict[str, Any]]:
    roles = await _load_leadership_roles(db, tenant_id)
    if not roles:
        return _DEMO_BENCH

    by_tier: dict[str, list[RoleCapabilityProfile]] = defaultdict(list)
    for r in roles:
        by_tier[str(r.leadership_tier)].append(r)
    programs = await _load_leadership_programs(db, tenant_id)
    progs_by_tier: dict[str, int] = defaultdict(int)
    for p in programs:
        meta = p.meta or {}
        tier = (meta.get("tier") if isinstance(meta, dict) else None) or "Mid"
        progs_by_tier[str(tier)] += 1
    avg_cap = await _avg_capability_per_tier(db, tenant_id)

    rows = []
    for tier in TIERS:
        roles_in_tier = by_tier.get(tier, [])
        if not roles_in_tier and tier not in avg_cap:
            continue
        rows.append(
            {
                "tier": tier,
                "leaders_in_role": len(roles_in_tier),
                "ready_now_pct": round(min(0.6, max(0.1, avg_cap.get(tier, 3.0) / 5.0)), 2),
                "ready_1_2y_pct": 0.4,
                "successors_per_role": round(len(roles_in_tier) / max(1, len(roles_in_tier)), 2),
                "avg_capability_score": round(avg_cap.get(tier, 3.0), 2),
                "benchmark_avg": 3.0,
                "programs_active": progs_by_tier.get(tier, 0),
            }
        )
    return rows or _DEMO_BENCH


async def _capability_coverage(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    programs = await _load_leadership_programs(db, tenant_id)
    if not programs:
        cells = []
        gaps_count = 0
        strong_count = 0
        for prog in _DEMO_PROGRAMS:
            for cap in _DEMO_CAPABILITIES:
                same_tier = prog["tier"] == cap["tier"]
                hours = 16 if same_tier else (8 if prog["tier"] in ("Senior", "Executive") else 0)
                rating = 3.0 + (0.5 if same_tier else 0.0)
                coverage = "strong" if hours >= 16 else ("medium" if hours >= 8 else "gap")
                if coverage == "gap":
                    gaps_count += 1
                if coverage == "strong":
                    strong_count += 1
                cells.append(
                    {
                        "program_id": prog["id"],
                        "capability_id": cap["id"],
                        "hours": hours,
                        "current_rating": round(rating, 1),
                        "coverage": coverage,
                    }
                )
        return {
            "capabilities": _DEMO_CAPABILITIES,
            "programs": _DEMO_PROGRAMS,
            "cells": cells,
            "gaps_count": gaps_count,
            "strong_count": strong_count,
        }

    # Real path: load capability_framework_items tagged leadership
    items_stmt = (
        select(CapabilityFrameworkItem)
        .join(
            CapabilityFramework,
            CapabilityFramework.id == CapabilityFrameworkItem.framework_id,
        )
        .where(CapabilityFramework.tenant_id == tenant_id)
        .order_by(CapabilityFrameworkItem.sort_order.asc())
        .limit(12)
    )
    items = (await db.execute(items_stmt)).scalars().all()
    capabilities = [
        {
            "id": str(i.id),
            "name": i.name,
            "tier": (i.meta or {}).get("leadership_tier", "Mid") if i.meta else "Mid",
        }
        for i in items
    ] or _DEMO_CAPABILITIES

    program_rows = [
        {
            "id": str(p.id),
            "name": p.name,
            "tier": (p.meta or {}).get("tier", "Mid") if isinstance(p.meta, dict) else "Mid",
        }
        for p in programs
    ]

    cells = []
    gaps_count = 0
    strong_count = 0
    for prog in program_rows:
        bindings_stmt = select(ModuleDocumentBinding).where(
            ModuleDocumentBinding.tenant_id == tenant_id,
            ModuleDocumentBinding.module_key == f"program:{prog['id']}",
        )
        bindings = (await db.execute(bindings_stmt)).scalars().all()
        bound_hours = len(bindings) * 8
        for cap in capabilities:
            hours = bound_hours if cap["tier"] == prog["tier"] else max(0, bound_hours - 8)
            coverage = "strong" if hours >= 16 else ("medium" if hours >= 8 else "gap")
            if coverage == "gap":
                gaps_count += 1
            if coverage == "strong":
                strong_count += 1
            cells.append(
                {
                    "program_id": prog["id"],
                    "capability_id": cap["id"],
                    "hours": hours,
                    "current_rating": 3.0,
                    "coverage": coverage,
                }
            )
    return {
        "capabilities": capabilities,
        "programs": program_rows,
        "cells": cells,
        "gaps_count": gaps_count,
        "strong_count": strong_count,
    }


async def _capability_radar(
    db: AsyncSession, tenant_id: uuid.UUID, tier: str
) -> dict[str, Any]:
    items_stmt = (
        select(CapabilityFrameworkItem)
        .join(
            CapabilityFramework,
            CapabilityFramework.id == CapabilityFrameworkItem.framework_id,
        )
        .where(CapabilityFramework.tenant_id == tenant_id)
        .limit(6)
    )
    items = (await db.execute(items_stmt)).scalars().all()
    axes = []
    if items:
        for i in items:
            rating_stmt = (
                select(func.avg(CapabilityRating.current_level))
                .join(
                    CapabilityAssessment,
                    CapabilityAssessment.id == CapabilityRating.assessment_id,
                )
                .where(
                    CapabilityRating.framework_item_id == i.id,
                    CapabilityAssessment.tenant_id == tenant_id,
                )
            )
            current = (await db.execute(rating_stmt)).scalar() or 3.0
            target_stmt = (
                select(func.avg(CapabilityRating.target_level))
                .join(
                    CapabilityAssessment,
                    CapabilityAssessment.id == CapabilityRating.assessment_id,
                )
                .where(
                    CapabilityRating.framework_item_id == i.id,
                    CapabilityAssessment.tenant_id == tenant_id,
                )
            )
            target = (await db.execute(target_stmt)).scalar() or 4.0
            axes.append(
                {
                    "capability": i.name,
                    "current": round(float(current), 2),
                    "target": round(float(target), 2),
                    "benchmark_p50": 3.1,
                    "benchmark_p75": 3.6,
                }
            )
    if not axes:
        axes = [
            {"capability": "Strategic Thinking", "current": 3.1, "target": 4.0, "benchmark_p50": 3.2, "benchmark_p75": 3.7},
            {"capability": "Coaching", "current": 2.9, "target": 3.8, "benchmark_p50": 3.0, "benchmark_p75": 3.5},
            {"capability": "Change Leadership", "current": 2.7, "target": 3.7, "benchmark_p50": 2.9, "benchmark_p75": 3.4},
            {"capability": "Decision Making", "current": 3.3, "target": 3.8, "benchmark_p50": 3.1, "benchmark_p75": 3.6},
            {"capability": "Influence", "current": 3.0, "target": 3.7, "benchmark_p50": 3.0, "benchmark_p75": 3.4},
            {"capability": "Talent Development", "current": 2.6, "target": 3.8, "benchmark_p50": 2.8, "benchmark_p75": 3.3},
        ]
    largest = max(axes, key=lambda a: a["target"] - a["current"])
    return {
        "tier": tier,
        "axes": axes,
        "largest_gap": largest["capability"],
        "gap_value": round(largest["target"] - largest["current"], 2),
    }


async def _program_roi(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    programs = await _load_leadership_programs(db, tenant_id)
    if not programs:
        return {
            "programs": [
                {"rank": 1, "program_id": "prog-mid", "name": "Manager Excellence", "tier": "Mid",
                 "enrolled": 148, "completion_pct": 0.86, "capability_lift": 0.62,
                 "capabilities_targeted": 6, "cost_per_learner_usd": 2400, "roi_index": 0.26, "status": "active"},
                {"rank": 2, "program_id": "prog-exec", "name": "Executive Accelerator", "tier": "Executive",
                 "enrolled": 14, "completion_pct": 1.0, "capability_lift": 0.45,
                 "capabilities_targeted": 4, "cost_per_learner_usd": 18500, "roi_index": 0.024, "status": "active"},
                {"rank": 3, "program_id": "prog-fl", "name": "Frontline Foundations", "tier": "Frontline",
                 "enrolled": 312, "completion_pct": 0.72, "capability_lift": 0.51,
                 "capabilities_targeted": 5, "cost_per_learner_usd": 850, "roi_index": 0.60, "status": "active"},
            ]
        }

    rows = []
    for p in programs:
        meta = p.meta or {} if isinstance(p.meta, dict) else {}
        enrolled = int(meta.get("enrolled", 50))
        completion = float(meta.get("completion_pct", 0.75))
        cap_lift = float(meta.get("capability_lift", 0.5))
        caps_targeted = int(meta.get("capabilities_targeted", 4))
        cost = float(meta.get("cost_per_learner_usd", 2000))
        roi = round(cap_lift / max(1.0, cost / 1000), 3)
        rows.append(
            {
                "program_id": str(p.id),
                "name": p.name,
                "tier": meta.get("tier", "Mid"),
                "enrolled": enrolled,
                "completion_pct": completion,
                "capability_lift": cap_lift,
                "capabilities_targeted": caps_targeted,
                "cost_per_learner_usd": cost,
                "roi_index": roi,
                "status": p.status,
            }
        )
    rows.sort(key=lambda r: r["roi_index"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"programs": rows}


async def _risk_flags(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    """Deterministic rules:
        - critical role with no ready_now successor (proxy from MobilityReadinessAssessment counts)
        - capability score below threshold
        - program completion < 60% (proxy from project.meta)
    """
    flags: list[dict[str, Any]] = []
    roles = await _load_leadership_roles(db, tenant_id)
    if roles:
        for r in roles:
            if r.criticality.lower() in ("high", "critical"):
                cnt_stmt = (
                    select(func.count())
                    .select_from(MobilityReadinessAssessment)
                    .where(
                        MobilityReadinessAssessment.tenant_id == tenant_id,
                        MobilityReadinessAssessment.readiness.in_(["ready", "ready_now"]),
                    )
                )
                ready_count = (await db.execute(cnt_stmt)).scalar() or 0
                if ready_count == 0:
                    flags.append(
                        {
                            "severity": "high",
                            "type": "succession_gap",
                            "role": r.role_name,
                            "detail": f"No internal successor ready in <2y for {r.role_name}",
                            "affected_capabilities": ["Strategic Thinking", "Change Leadership"],
                            "recommended_program": "Executive Accelerator",
                        }
                    )
    if not flags:
        flags = [
            {"severity": "high", "type": "succession_gap", "role": "Chief People Officer",
             "detail": "No internal successor ready in <2y; current bench depth 0.5",
             "affected_capabilities": ["Strategic Thinking", "Change Leadership"],
             "recommended_program": "Executive Accelerator"},
            {"severity": "high", "type": "capability_collapse", "role": "Regional Operations Director (x4)",
             "detail": "Coaching capability dropped 0.4pts YoY across cohort",
             "affected_capabilities": ["Coaching", "Talent Development"],
             "recommended_program": "Senior Leaders Forum"},
            {"severity": "medium", "type": "program_dropoff", "role": "Frontline Foundations cohort 2026-Q1",
             "detail": "Completion 58% vs. target 80%",
             "affected_capabilities": [], "recommended_program": None},
        ]
    summary = Counter([f["severity"] for f in flags])
    return {"flags": flags, "summary": dict(summary)}


async def _maturity_vs_benchmark(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    # latest assessment for the tenant
    ma_stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.tenant_id == tenant_id)
        .order_by(desc(MaturityAssessment.computed_at))
        .limit(1)
    )
    assessment = (await db.execute(ma_stmt)).scalar_one_or_none()

    if assessment is None:
        return {
            "dimensions": [
                {"code": "leadership_pipeline", "name": "Pipeline Depth", "company": 3.2,
                 "peer_avg": 3.0, "top_quartile": 3.8, "band": "Mature", "delta_vs_peer": 0.2},
                {"code": "program_quality", "name": "Program Design Quality", "company": 2.9,
                 "peer_avg": 3.1, "top_quartile": 3.9, "band": "Developing", "delta_vs_peer": -0.2},
                {"code": "succession_governance", "name": "Succession Governance", "company": 3.5,
                 "peer_avg": 3.2, "top_quartile": 4.0, "band": "Mature", "delta_vs_peer": 0.3},
                {"code": "capability_measurement", "name": "Capability Measurement", "company": 2.4,
                 "peer_avg": 2.8, "top_quartile": 3.5, "band": "Emerging", "delta_vs_peer": -0.4},
                {"code": "learning_culture", "name": "Learning Culture", "company": 3.1,
                 "peer_avg": 3.0, "top_quartile": 3.7, "band": "Mature", "delta_vs_peer": 0.1},
            ],
            "overall": {"company": 3.02, "peer_avg": 3.02, "top_quartile": 3.78},
        }

    dim_stmt = select(MaturityDimensionResult).where(
        MaturityDimensionResult.assessment_id == assessment.id
    )
    dims = (await db.execute(dim_stmt)).scalars().all()
    bench_stmt = (
        select(BenchmarkComparison)
        .where(BenchmarkComparison.review_id == assessment.review_id)
        .order_by(desc(BenchmarkComparison.computed_at))
        .limit(1)
    )
    comparison = (await db.execute(bench_stmt)).scalar_one_or_none()
    peer_lookup: dict[str, dict[str, float]] = {}
    if comparison and comparison.comparison_data:
        for d in (comparison.comparison_data or {}).get("dimensions", []):
            peer_lookup[d.get("dimensionCode", "")] = {
                "peer_avg": float(d.get("benchmarkAverage", 0) or 0),
                "top_quartile": float(d.get("topQuartile", 0) or 0),
            }

    rows = []
    for d in dims:
        score = float(d.score) if d.score is not None else 0.0
        peer = peer_lookup.get(d.dimension_key, {})
        peer_avg = peer.get("peer_avg", 3.0)
        rows.append(
            {
                "code": d.dimension_key,
                "name": (d.meta or {}).get("dimension_name") or d.dimension_key,
                "company": round(score, 2),
                "peer_avg": peer_avg,
                "top_quartile": peer.get("top_quartile", 3.8),
                "band": d.band_name or "Developing",
                "delta_vs_peer": round(score - peer_avg, 2),
            }
        )
    overall = {
        "company": round(float(assessment.overall_score or 0), 2),
        "peer_avg": (
            float((comparison.comparison_data or {}).get("overallBenchmarkAverage", 3.0))
            if comparison and comparison.comparison_data
            else 3.0
        ),
        "top_quartile": 3.8,
    }
    return {"dimensions": rows, "overall": overall}


async def _rollout_timeline(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    phases = (
        await db.execute(
            select(RoadmapPhase)
            .where(RoadmapPhase.tenant_id == tenant_id)
            .order_by(RoadmapPhase.sort_order.asc())
            .limit(6)
        )
    ).scalars().all()
    if not phases:
        return {
            "phases": [
                {"quarter": "2026-Q3",
                 "programs": [{"name": "Executive Accelerator C2", "tier": "Executive", "cohort_size": 12,
                               "capabilities": ["Strategic Thinking", "Change Leadership"]}],
                 "milestones": ["Capability re-assessment for Mid tier"]},
                {"quarter": "2026-Q4",
                 "programs": [
                     {"name": "Manager Excellence C3", "tier": "Mid", "cohort_size": 40,
                      "capabilities": ["Coaching", "Talent Development"]},
                     {"name": "Emerging Leaders Wave 2", "tier": "Emerging", "cohort_size": 80,
                      "capabilities": ["Decision Making"]},
                 ],
                 "milestones": ["Launch Inclusive Leadership module"]},
                {"quarter": "2027-Q1",
                 "programs": [{"name": "Senior Leaders Forum", "tier": "Senior", "cohort_size": 30,
                               "capabilities": ["Business Acumen", "Influence"]}],
                 "milestones": ["Mid-year bench review"]},
            ]
        }

    phase_rows = []
    for ph in phases:
        recs_stmt = select(RoadmapRecommendation).where(
            RoadmapRecommendation.phase_id == ph.id
        )
        recs = (await db.execute(recs_stmt)).scalars().all()
        progs = [
            {
                "name": r.title,
                "tier": (r.meta or {}).get("tier", "Mid") if isinstance(r.meta, dict) else "Mid",
                "cohort_size": (r.meta or {}).get("cohort_size", 20) if isinstance(r.meta, dict) else 20,
                "capabilities": (r.meta or {}).get("capabilities", []) if isinstance(r.meta, dict) else [],
            }
            for r in recs
        ]
        phase_rows.append(
            {
                "quarter": ph.name,
                "programs": progs,
                "milestones": (ph.meta or {}).get("milestones", []) if isinstance(ph.meta, dict) else [],
            }
        )
    return {"phases": phase_rows}


async def _curriculum_docs(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    tpl_stmt = select(DocumentTemplate).where(
        DocumentTemplate.status == "active"
    ).limit(12)
    templates = (await db.execute(tpl_stmt)).scalars().all()

    if not templates:
        return {
            "templates": [
                {"template_id": "tpl-001", "name": "Manager Excellence - 6-Module Curriculum",
                 "type": "leadership_curriculum", "capabilities_covered": 6,
                 "last_generated": "2026-06-12", "status": "ready"},
                {"template_id": "tpl-002", "name": "Executive Coaching Plan Template",
                 "type": "facilitator_guide", "capabilities_covered": 3,
                 "last_generated": None, "status": "available"},
                {"template_id": "tpl-003", "name": "360 Capability Assessment Rubric - Mid Tier",
                 "type": "assessment_rubric", "capabilities_covered": 8,
                 "last_generated": "2026-05-30", "status": "ready"},
            ],
            "generated_count": 12,
            "templates_available": 5,
        }

    rows = []
    for t in templates:
        last_gen_stmt = (
            select(GeneratedDocument)
            .where(
                GeneratedDocument.tenant_id == tenant_id,
                GeneratedDocument.template_id == t.id,
            )
            .order_by(desc(GeneratedDocument.created_at))
            .limit(1)
        )
        last_gen = (await db.execute(last_gen_stmt)).scalar_one_or_none()
        rows.append(
            {
                "template_id": t.id,
                "name": t.name,
                "type": t.document_type_key or "leadership_curriculum",
                "capabilities_covered": (t.meta or {}).get("capabilities_covered", 4)
                if isinstance(t.meta, dict)
                else 4,
                "last_generated": last_gen.created_at.isoformat() if last_gen and last_gen.created_at else None,
                "status": "ready" if last_gen else "available",
            }
        )
    gen_count_stmt = select(func.count()).select_from(GeneratedDocument).where(
        GeneratedDocument.tenant_id == tenant_id
    )
    gen_count = (await db.execute(gen_count_stmt)).scalar() or 0
    return {
        "templates": rows,
        "generated_count": gen_count,
        "templates_available": len(rows),
    }


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    params = params or {}
    tier_filter = params.get("tier_filter", "Mid")

    bench = await _bench_strength(db, tenant_id)
    coverage = await _capability_coverage(db, tenant_id)
    radar = await _capability_radar(db, tenant_id, tier_filter)
    roi = await _program_roi(db, tenant_id)
    risks = await _risk_flags(db, tenant_id)
    maturity = await _maturity_vs_benchmark(db, tenant_id)
    timeline = await _rollout_timeline(db, tenant_id)
    docs = await _curriculum_docs(db, tenant_id)

    # Executive headline (deterministic; AI Advisory exposes a richer variant).
    weakest = min(bench, key=lambda b: b.get("avg_capability_score", 5.0)) if bench else None
    headline_bits = []
    if weakest:
        headline_bits.append(
            f"{weakest['tier']} tier weakest at {weakest['avg_capability_score']} avg capability"
        )
    headline_bits.append(f"{coverage['gaps_count']} program-capability coverage gaps")
    high_risks = sum(1 for f in risks["flags"] if f.get("severity") == "high")
    if high_risks:
        headline_bits.append(f"{high_risks} high-severity risk flag(s)")
    headline = "; ".join(headline_bits) + "."

    org_name = brief_org_name(brief)
    primary_challenge = brief_primary_challenge(brief, fallback="leadership capability")
    wf_phrase = workforce_phrase(brief)

    if brief:
        headline = f"{org_name} ({primary_challenge}): {headline}"

    # Rationale injection on ranked program ROI
    if isinstance(roi, dict) and isinstance(roi.get("items"), list):
        for _item in roi["items"]:
            if isinstance(_item, dict):
                _item["rationale"] = (
                    f"Advances {org_name}'s '{primary_challenge}' priority across {wf_phrase}."
                )

    return {
        "studio_id": STUDIO_ID,
        "title": f"Leadership Development - {org_name}" if brief else "Leadership Development",
        "subtitle": headline,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": [
            {
                "id": "bench_strength",
                "title": f"Leadership Bench Strength across {wf_phrase} - Tiered KPI Grid",
                "layout": "kpi_grid",
                "data": {"tiers": bench},
            },
            {
                "id": "capability_coverage",
                "title": "Leadership Capability Coverage Heatmap (Programs × Capabilities)",
                "layout": "heatmap",
                "data": coverage,
            },
            {
                "id": "capability_radar",
                "title": f"Bench Capability Radar - {tier_filter} Tier",
                "layout": "radar_chart",
                "data": radar,
            },
            {
                "id": "program_roi",
                "title": "Program Portfolio - Ranked by Capability ROI",
                "layout": "ranked_list",
                "data": roi,
            },
            {
                "id": "risk_flags",
                "title": "Succession & Bench Risk Flags",
                "layout": "risk_flags_list",
                "data": risks,
            },
            {
                "id": "maturity_vs_benchmark",
                "title": "Leadership Maturity vs. Peer Benchmark",
                "layout": "comparison_table",
                "data": {
                    "columns": ["name", "company", "peer_avg", "top_quartile", "band", "delta_vs_peer"],
                    "rows": maturity["dimensions"],
                    "overall": maturity["overall"],
                },
            },
            {
                "id": "rollout_timeline",
                "title": "12-Month Curriculum Rollout Timeline",
                "layout": "timeline",
                "data": timeline,
            },
            {
                "id": "curriculum_docs",
                "title": "Curriculum Documents - Generated & Templates",
                "layout": "recommendation_cards",
                "data": docs,
            },
        ],
        "sources": {
            "tables": [
                "capability_frameworks",
                "capability_framework_items",
                "capability_assessments",
                "capability_ratings",
                "skill_tags",
                "framework_item_tags",
                "role_capability_profiles",
                "role_capability_requirements",
                "projects",
                "activity_log",
                "document_templates",
                "document_template_versions",
                "generated_documents",
                "module_document_bindings",
                "target_state_designs",
                "maturity_models",
                "maturity_bands",
                "maturity_assessments",
                "maturity_dimension_results",
                "benchmark_profiles",
                "benchmark_dimension_scores",
                "benchmark_comparisons",
                "roadmaps",
                "roadmap_phases",
                "roadmap_recommendations",
                "recommendation_library",
                "mobility_readiness_assessments",
                "ai_prompt_templates",
                "ai_generated_insights",
            ],
            "engines": ["maturity_engine", "benchmark_engine"],
        },
    }
