"""Learning & Training Studio output builder.

A learning architecture one-pager that quantifies capability gaps, builds a
ranked priority list, maps a curriculum by cluster, sequences pathways, and
computes a delivery-mix economic view. All deterministic SQL.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.capability import (
    CapabilityAssessment,
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityRating,
)
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    GeneratedDocument,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.models.hc_platform.scenarios import ScenarioOutput, ScenarioRiskFlag


_STUDIO_ID = "learning"


# Modality cost-per-learner-hour defaults (used when recommendation_library lacks an override)
_MODALITY_DEFAULTS: dict[str, dict[str, Any]] = {
    "ilt": {"label": "Instructor-Led", "cost_per_learner_hour": 85},
    "vilt": {"label": "Virtual Instructor-Led", "cost_per_learner_hour": 45},
    "elearning": {"label": "Self-paced eLearning", "cost_per_learner_hour": 12},
    "otj": {"label": "On-the-Job", "cost_per_learner_hour": 8},
    "coaching": {"label": "Coaching", "cost_per_learner_hour": 140},
}


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


async def _capability_gap_rows(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(
                CapabilityFrameworkItem.id,
                CapabilityFrameworkItem.code,
                CapabilityFrameworkItem.name,
                CapabilityFrameworkItem.category,
                func.avg(CapabilityRating.current_level).label("c"),
                func.avg(CapabilityRating.target_level).label("t"),
                func.count(CapabilityRating.id).label("n"),
            )
            .join(
                CapabilityRating,
                CapabilityRating.framework_item_id == CapabilityFrameworkItem.id,
            )
            .join(
                CapabilityAssessment,
                CapabilityRating.assessment_id == CapabilityAssessment.id,
            )
            .where(CapabilityAssessment.tenant_id == tenant_id)
            .group_by(
                CapabilityFrameworkItem.id,
                CapabilityFrameworkItem.code,
                CapabilityFrameworkItem.name,
                CapabilityFrameworkItem.category,
            )
        )
    ).all()
    return [
        {
            "item_id": str(item_id),
            "code": code,
            "name": name,
            "cluster": category or "General",
            "current": round(_to_float(c), 2),
            "target": round(_to_float(t), 2),
            "gap": round(_to_float(t) - _to_float(c), 2),
            "learners": int(n),
        }
        for item_id, code, name, category, c, t, n in rows
    ]


async def _section_summary(
    db: AsyncSession, tenant_id: uuid.UUID, gap_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    framework_count = (
        await db.execute(
            select(func.count(CapabilityFramework.id)).where(
                CapabilityFramework.tenant_id == tenant_id
            )
        )
    ).scalar() or 0

    in_scope = (
        await db.execute(
            select(func.count(CapabilityFrameworkItem.id))
            .join(
                CapabilityFramework,
                CapabilityFrameworkItem.framework_id == CapabilityFramework.id,
            )
            .where(CapabilityFramework.tenant_id == tenant_id)
        )
    ).scalar() or 0

    assessed = len(gap_rows)
    avg_gap = (
        round(sum(r["gap"] for r in gap_rows) / max(len(gap_rows), 1), 2)
        if gap_rows
        else 0.0
    )
    critical = sum(1 for r in gap_rows if r["gap"] >= 1.0)
    total_learners = sum(r["learners"] for r in gap_rows) if gap_rows else 0

    courses = (
        await db.execute(
            select(func.count(GeneratedDocument.id)).where(
                GeneratedDocument.tenant_id == tenant_id,
                GeneratedDocument.document_type_key == "course_outline",
            )
        )
    ).scalar() or 0

    est_hours = critical * 16  # 16h per critical capability is a stable demo heuristic
    est_cost = critical * 1850 if critical else 0

    return {
        "kpis": [
            {"label": "Frameworks", "value": int(framework_count)},
            {"label": "Capabilities In Scope", "value": int(in_scope)},
            {"label": "Capabilities Assessed", "value": assessed},
            {"label": "Avg Capability Gap", "value": avg_gap},
            {"label": "Critical Gaps", "value": critical},
            {"label": "Learners Impacted", "value": total_learners},
            {"label": "Course Outlines Generated", "value": int(courses)},
            {"label": "Est. Training Hours", "value": est_hours},
            {"label": "Est. Cost / Learner", "value": f"${est_cost}"},
        ]
    }


def _section_capability_gaps(gap_rows: list[dict[str, Any]]) -> dict[str, Any]:
    clusters: dict[str, list[dict[str, Any]]] = {}
    for r in gap_rows:
        clusters.setdefault(r["cluster"], []).append(
            {
                "item_id": r["item_id"],
                "name": r["name"],
                "current": r["current"],
                "target": r["target"],
                "gap": r["gap"],
                "learners": r["learners"],
                "criticality": (
                    "high"
                    if r["gap"] >= 1.5
                    else "medium"
                    if r["gap"] >= 0.8
                    else "low"
                ),
            }
        )
    rows = [
        {"cluster": cluster, "items": items}
        for cluster, items in sorted(clusters.items())
    ]
    return {"rows": rows, "scale": {"min": 0, "max": 5}}


async def _section_priorities(
    db: AsyncSession, gap_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    # priority_score = gap * learners * criticality_weight
    crit_weight = {"high": 1.5, "medium": 1.0, "low": 0.6}
    scored = []
    for r in gap_rows:
        crit = (
            "high"
            if r["gap"] >= 1.5
            else "medium"
            if r["gap"] >= 0.8
            else "low"
        )
        score = round(r["gap"] * max(r["learners"], 1) * crit_weight[crit], 2)
        scored.append({**r, "criticality": crit, "priority_score": score})
    scored.sort(key=lambda x: x["priority_score"], reverse=True)
    top = scored[:10]

    # try to attach a recommendation_library row keyed by name match
    out = []
    for rank, item in enumerate(top, start=1):
        rec = (
            await db.execute(
                select(RecommendationLibrary)
                .where(
                    RecommendationLibrary.category == "learning",
                    func.lower(RecommendationLibrary.title).like(
                        f"%{item['name'].lower().split()[0]}%"
                    ),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        out.append(
            {
                "rank": rank,
                "capability_id": item["item_id"],
                "capability_name": item["name"],
                "gap": item["gap"],
                "learners": item["learners"],
                "priority_score": item["priority_score"],
                "linked_recommendation_key": rec.key if rec else None,
                "suggested_format": "blended" if item["learners"] > 50 else "elearning",
            }
        )
    return {"items": out}


def _section_curriculum(gap_rows: list[dict[str, Any]]) -> dict[str, Any]:
    clusters: dict[str, list[dict[str, Any]]] = {}
    for r in gap_rows:
        clusters.setdefault(r["cluster"], []).append(r)
    rows = []
    for cluster, items in sorted(clusters.items()):
        n_caps = len(items)
        # courses = ceil(n_caps / 3) — a reusable, deterministic heuristic
        n_courses = max(1, (n_caps + 2) // 3)
        hours = n_courses * 16
        priority = (
            "P1"
            if any(i["gap"] >= 1.5 for i in items)
            else "P2"
            if any(i["gap"] >= 0.8 for i in items)
            else "P3"
        )
        rows.append(
            {
                "cluster": cluster,
                "capabilities": n_caps,
                "courses": n_courses,
                "hours": hours,
                "modality": {"ilt": 30, "vilt": 25, "elearning": 35, "otj": 10},
                "audience": "All Roles" if n_caps > 5 else "Targeted",
                "priority": priority,
            }
        )
    return {
        "columns": [
            "Cluster",
            "# Capabilities",
            "# Courses",
            "Hours",
            "Modality Mix",
            "Audience",
            "Priority",
        ],
        "rows": rows,
    }


async def _section_pathways(
    db: AsyncSession, tenant_id: uuid.UUID, gap_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    # Look for roadmaps marked as learning pathways
    roadmaps = (
        await db.execute(
            select(Roadmap)
            .where(Roadmap.tenant_id == tenant_id)
            .order_by(desc(Roadmap.created_at))
            .limit(3)
        )
    ).scalars().all()

    if not roadmaps:
        # Synthesize a single pathway from clustered gaps as a fallback
        clusters: dict[str, list[dict[str, Any]]] = {}
        for r in gap_rows:
            clusters.setdefault(r["cluster"], []).append(r)
        phases = []
        labels = ["Foundation", "Application", "Mastery"]
        cluster_list = list(clusters.items())[:3]
        for idx, (cluster, items) in enumerate(cluster_list):
            phases.append(
                {
                    "phase": labels[idx] if idx < len(labels) else cluster,
                    "weeks": f"{idx*8+1}-{(idx+1)*8}",
                    "capabilities": [i["name"] for i in items[:4]],
                }
            )
        return {
            "pathways": [
                {
                    "pathway_id": "synthesized_v1",
                    "name": "Capability Build Pathway",
                    "duration_weeks": max(len(phases) * 8, 24),
                    "phases": phases,
                }
            ]
        }

    pathways = []
    for rm in roadmaps:
        phase_rows = (
            await db.execute(
                select(RoadmapPhase)
                .where(RoadmapPhase.review_id == rm.id)
                .order_by(RoadmapPhase.sort_order)
            )
        ).scalars().all()
        phases = [
            {
                "phase": p.name,
                "weeks": (
                    f"{p.start_horizon or '0'}-{p.end_horizon or '?'}"
                    if (p.start_horizon or p.end_horizon)
                    else f"{p.sort_order*8+1}-{(p.sort_order+1)*8}"
                ),
                "narrative": p.narrative,
            }
            for p in phase_rows
        ]
        pathways.append(
            {
                "pathway_id": str(rm.id),
                "name": rm.name,
                "duration_weeks": max(len(phases) * 8, 12),
                "phases": phases,
            }
        )
    return {"pathways": pathways}


def _section_delivery_mix(curriculum: dict[str, Any], total_learners: int) -> dict[str, Any]:
    rows = curriculum.get("rows", [])
    total_hours = sum(r["hours"] for r in rows) if rows else 0
    learners = max(total_learners, 100)
    modalities = []
    total_cost = 0
    for code, default in _MODALITY_DEFAULTS.items():
        avg_pct = (
            sum(r.get("modality", {}).get(code, 0) for r in rows) / max(len(rows), 1)
            if rows
            else 25
        )
        hours = round(total_hours * avg_pct / 100)
        learner_hours = hours * learners
        cost = learner_hours * default["cost_per_learner_hour"]
        total_cost += cost
        modalities.append(
            {
                "code": code,
                "label": default["label"],
                "hours": hours,
                "learner_hours": learner_hours,
                "cost_per_learner_hour": default["cost_per_learner_hour"],
                "total_cost": cost,
                "pct_of_mix": round(avg_pct, 1),
            }
        )
    return {"modalities": modalities, "total_program_cost": total_cost}


async def _section_scenario_signals(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(ScenarioRiskFlag).limit(8)
        )
    ).scalars().all()
    flags = []
    for f in rows:
        flags.append(
            {
                "flag_id": str(f.id),
                "severity": f.severity or "medium",
                "label": f.label or "Scenario signal",
                "description": f.description or "",
                "mitigation": f.mitigation or "",
            }
        )
    return {"flags": flags}


async def _section_documents(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(GeneratedDocument)
            .where(
                GeneratedDocument.tenant_id == tenant_id,
                GeneratedDocument.document_type_key.in_(
                    ["course_outline", "learning_pack"]
                ),
            )
            .order_by(desc(GeneratedDocument.created_at))
            .limit(10)
        )
    ).scalars().all()
    return {
        "documents": [
            {
                "doc_id": str(d.id),
                "title": d.name,
                "template_id": d.template_id,
                "status": d.status,
                "generated_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in rows
        ]
    }


async def _section_executive_summary(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    deterministic_payload: dict[str, Any],
) -> dict[str, Any]:
    """LLM-eligible callout — uses a grounded deterministic fallback."""
    kpis = {
        k["label"]: k["value"]
        for k in deterministic_payload["summary"]["kpis"]
    }
    priorities = deterministic_payload["priorities"]["items"][:3]
    top_caps = [p["capability_name"] for p in priorities]

    headline = (
        f"{kpis.get('Critical Gaps', 0)} critical capability gaps across "
        f"{kpis.get('Learners Impacted', 0)} learners; avg gap {kpis.get('Avg Capability Gap', 0)}."
    )
    summary = (
        f"The learning architecture targets {kpis.get('Capabilities Assessed', 0)} assessed "
        f"capabilities with the largest gaps concentrated in "
        f"{', '.join(top_caps) if top_caps else 'general capability areas'}. "
        f"An estimated {kpis.get('Est. Training Hours', 0)} hours of training at "
        f"{kpis.get('Est. Cost / Learner', ' - ')} per learner closes the highest-priority items."
    )
    return {
        "headline": headline,
        "summary": summary,
        "top_themes": top_caps or ["Capability uplift"],
        "confidence": "medium",
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
    gap_rows = await _capability_gap_rows(db, tenant_id)
    summary = await _section_summary(db, tenant_id, gap_rows)
    capability_gaps = _section_capability_gaps(gap_rows)
    priorities = await _section_priorities(db, gap_rows)
    curriculum = _section_curriculum(gap_rows)
    pathways = await _section_pathways(db, tenant_id, gap_rows)
    total_learners = sum(r["learners"] for r in gap_rows) if gap_rows else 100
    delivery_mix = _section_delivery_mix(curriculum, total_learners)
    scenario_signals = await _section_scenario_signals(db, tenant_id)
    documents = await _section_documents(db, tenant_id)
    executive = await _section_executive_summary(
        db,
        tenant_id,
        {"summary": summary, "priorities": priorities},
    )

    org_name = None
    if brief:
        org_name = (brief.get("organization") or {}).get("organizationName")

    sections = [
        {
            "id": "summary",
            "title": "Learning KPI Header",
            "layout": "kpi_grid",
            "data": summary,
        },
        {
            "id": "capability_gaps",
            "title": "Capability Gap Heatmap (Current vs Target)",
            "layout": "heatmap",
            "data": capability_gaps,
        },
        {
            "id": "priorities",
            "title": "Top 10 Learning Priorities (Ranked)",
            "layout": "ranked_list",
            "data": priorities,
        },
        {
            "id": "curriculum",
            "title": "Curriculum Map by Capability Cluster",
            "layout": "comparison_table",
            "data": curriculum,
        },
        {
            "id": "pathways",
            "title": "Learner Pathway Timeline",
            "layout": "timeline",
            "data": pathways,
        },
        {
            "id": "delivery_mix",
            "title": "Delivery Model Mix & Economics",
            "layout": "horizontal_bar_chart",
            "data": delivery_mix,
        },
        {
            "id": "scenario_signals",
            "title": "Scenario Impact on Learning Priorities",
            "layout": "risk_flags_list",
            "data": scenario_signals,
        },
        {
            "id": "documents",
            "title": "Generated Course Outline Documents",
            "layout": "recommendation_cards",
            "data": documents,
        },
        {
            "id": "executive_summary",
            "title": "Executive Learning Architecture Summary",
            "layout": "callout_quote",
            "data": executive,
        },
    ]

    return {
        "studio_id": _STUDIO_ID,
        "title": "Learning & Training",
        "subtitle": (
            f"Learning architecture for {org_name}"
            if org_name
            else "Learning architecture diagnostic"
        ),
        "sections": sections,
    }
