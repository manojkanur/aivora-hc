"""Skills Development studio output builder.

Converts the tenant's capability assessments into a dense skills inventory,
gap heatmap, and prioritised learning roadmap. Every section is deterministic
SQL aggregation; LLM only authors the "Executive Read" callout.

Tables read:
  capability_frameworks, capability_framework_items, capability_assessments,
  capability_ratings, skill_tags, framework_item_tags, roadmaps,
  roadmap_phases, roadmap_recommendations, recommendation_library,
  role_capability_profiles, role_capability_requirements,
  ai_generated_insights, ai_prompt_templates
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.capability import (
    CapabilityAssessment,
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityRating,
    FrameworkItemTag,
    SkillTag,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.models.hc_platform.role_profiles import RoleCapabilityProfile

log = logging.getLogger(__name__)

STUDIO_ID = "skills-dev"


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


async def _primary_framework(
    db: AsyncSession, tenant_id: uuid.UUID
) -> CapabilityFramework | None:
    stmt = (
        select(CapabilityFramework)
        .where(CapabilityFramework.tenant_id == tenant_id)
        .order_by(desc(CapabilityFramework.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row
    # fallback: any seeded template
    return (
        await db.execute(
            select(CapabilityFramework)
            .order_by(desc(CapabilityFramework.is_template))
            .limit(1)
        )
    ).scalar_one_or_none()


async def _items(
    db: AsyncSession, framework_id: uuid.UUID
) -> list[CapabilityFrameworkItem]:
    rows = (
        await db.execute(
            select(CapabilityFrameworkItem)
            .where(CapabilityFrameworkItem.framework_id == framework_id)
            .order_by(CapabilityFrameworkItem.sort_order)
        )
    ).scalars().all()
    return list(rows)


async def _ratings_for_framework(
    db: AsyncSession, tenant_id: uuid.UUID, framework_id: uuid.UUID
) -> list[CapabilityRating]:
    rows = (
        await db.execute(
            select(CapabilityRating)
            .join(
                CapabilityAssessment,
                CapabilityAssessment.id == CapabilityRating.assessment_id,
            )
            .where(CapabilityAssessment.tenant_id == tenant_id)
            .where(CapabilityAssessment.framework_id == framework_id)
        )
    ).scalars().all()
    return list(rows)


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


async def _kpis(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    framework: CapabilityFramework | None,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
) -> dict[str, Any]:
    fw_count = (
        await db.execute(
            select(func.count(CapabilityFramework.id)).where(
                CapabilityFramework.tenant_id == tenant_id
            )
        )
    ).scalar() or 0

    currents = [r.current_level for r in ratings if r.current_level is not None]
    targets = [r.target_level for r in ratings if r.target_level is not None]
    crits = [
        r
        for r in ratings
        if r.current_level is not None
        and r.target_level is not None
        and (r.target_level - r.current_level) >= 2
    ]
    avg_cur = round(sum(currents) / len(currents), 2) if currents else 0.0
    avg_tar = round(sum(targets) / len(targets), 2) if targets else 0.0

    tag_count = (await db.execute(select(func.count(SkillTag.id)))).scalar() or 0

    return {
        "kpis": [
            {
                "label": "Capability Frameworks",
                "value": int(fw_count),
                "source": "capability_frameworks",
            },
            {
                "label": "Capabilities Assessed",
                "value": len(items),
                "source": "capability_framework_items",
            },
            {
                "label": "Avg Current Proficiency",
                "value": avg_cur,
                "max": 5,
                "source": "capability_ratings.current_level",
            },
            {
                "label": "Avg Target Proficiency",
                "value": avg_tar,
                "max": 5,
                "source": "capability_ratings.target_level",
            },
            {
                "label": "Critical Gaps (>=2 levels)",
                "value": len(crits),
                "source": "capability_ratings",
            },
            {
                "label": "Skill Tags Tracked",
                "value": int(tag_count),
                "source": "skill_tags",
            },
        ]
    }


def _gaps(
    items: list[CapabilityFrameworkItem], ratings: list[CapabilityRating]
) -> dict[str, Any]:
    by_item: dict[uuid.UUID, list[CapabilityRating]] = defaultdict(list)
    for r in ratings:
        by_item[r.framework_item_id].append(r)
    out: list[dict[str, Any]] = []
    for it in items:
        rs = by_item.get(it.id, [])
        if not rs:
            continue
        cur = [r.current_level for r in rs if r.current_level is not None]
        tar = [r.target_level for r in rs if r.target_level is not None]
        if not cur or not tar:
            continue
        avg_cur = sum(cur) / len(cur)
        avg_tar = sum(tar) / len(tar)
        gap = round(avg_tar - avg_cur, 2)
        if gap <= 0:
            continue
        weight = (it.meta or {}).get("weight", "high") if it.meta else "high"
        out.append(
            {
                "capability": it.name,
                "domain": it.category or "General",
                "current": round(avg_cur, 2),
                "target": round(avg_tar, 2),
                "gap": gap,
                "weight": weight,
                "item_id": str(it.id),
            }
        )
    out.sort(key=lambda r: -r["gap"])
    return {"gaps": out[:10]}


def _domain_profile(
    items: list[CapabilityFrameworkItem], ratings: list[CapabilityRating]
) -> dict[str, Any]:
    by_item: dict[uuid.UUID, list[CapabilityRating]] = defaultdict(list)
    for r in ratings:
        by_item[r.framework_item_id].append(r)
    by_domain_cur: dict[str, list[float]] = defaultdict(list)
    by_domain_tar: dict[str, list[float]] = defaultdict(list)
    for it in items:
        dom = it.category or "General"
        for r in by_item.get(it.id, []):
            if r.current_level is not None:
                by_domain_cur[dom].append(float(r.current_level))
            if r.target_level is not None:
                by_domain_tar[dom].append(float(r.target_level))

    axes = sorted(set(by_domain_cur) | set(by_domain_tar))
    if not axes:
        # Use item categories as axes even with no ratings
        axes = sorted({(it.category or "General") for it in items}) or [
            "Leadership",
            "Digital",
            "People Analytics",
            "Talent Strategy",
            "Change",
        ]
    cur_vals = [
        round(sum(by_domain_cur.get(a, [0])) / max(1, len(by_domain_cur.get(a, [0]))), 2)
        if by_domain_cur.get(a)
        else 0.0
        for a in axes
    ]
    tar_vals = [
        round(sum(by_domain_tar.get(a, [0])) / max(1, len(by_domain_tar.get(a, [0]))), 2)
        if by_domain_tar.get(a)
        else 0.0
        for a in axes
    ]
    return {
        "axes": axes[:8],
        "series": [
            {"name": "Current", "values": cur_vals[:8]},
            {"name": "Target", "values": tar_vals[:8]},
        ],
    }


async def _role_heatmap(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
) -> dict[str, Any]:
    # Map ratings -> role profile via assessment.role_profile_id
    rating_role: dict[uuid.UUID, uuid.UUID | None] = {}
    if ratings:
        asid_set = {r.assessment_id for r in ratings}
        assess_rows = (
            await db.execute(
                select(CapabilityAssessment).where(
                    CapabilityAssessment.id.in_(asid_set)
                )
            )
        ).scalars().all()
        ass_role = {a.id: a.role_profile_id for a in assess_rows}
        for r in ratings:
            rating_role[r.id] = ass_role.get(r.assessment_id)

    role_rows = (
        await db.execute(
            select(RoleCapabilityProfile).where(
                RoleCapabilityProfile.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    role_name = {r.id: r.role_name for r in role_rows}

    by_role_item_cur: dict[tuple[str, str], list[float]] = defaultdict(list)
    by_role_item_tar: dict[tuple[str, str], list[float]] = defaultdict(list)
    item_by_id = {it.id: it for it in items}
    for r in ratings:
        item = item_by_id.get(r.framework_item_id)
        if not item:
            continue
        role_id = rating_role.get(r.id)
        rname = role_name.get(role_id, "Org-wide") if role_id else "Org-wide"
        col = item.category or item.name
        if r.current_level is not None:
            by_role_item_cur[(rname, col)].append(float(r.current_level))
        if r.target_level is not None:
            by_role_item_tar[(rname, col)].append(float(r.target_level))

    rows = sorted({k[0] for k in by_role_item_cur})
    cols = sorted({k[1] for k in by_role_item_cur})

    if not rows:
        rows = [r.role_name for r in role_rows[:5]] or [
            "HRBP",
            "TA Lead",
            "L&D Mgr",
            "Comp Analyst",
            "CHRO Office",
        ]
    if not cols:
        cols = sorted({(it.category or "General") for it in items})[:5] or [
            "Analytics",
            "AI Literacy",
            "Coaching",
            "Strategic WFP",
            "DEI",
        ]

    cells: list[dict[str, Any]] = []
    for row in rows:
        for col in cols:
            curs = by_role_item_cur.get((row, col), [])
            tars = by_role_item_tar.get((row, col), [])
            if not curs:
                cells.append(
                    {"row": row, "col": col, "value": None, "gap": None}
                )
                continue
            avg_cur = sum(curs) / len(curs)
            avg_tar = sum(tars) / len(tars) if tars else avg_cur
            cells.append(
                {
                    "row": row,
                    "col": col,
                    "value": round(avg_cur, 2),
                    "gap": round(avg_tar - avg_cur, 2),
                }
            )
    return {"rows": rows[:8], "cols": cols[:8], "cells": cells}


async def _skill_tag_ranking(
    db: AsyncSession,
    items: list[CapabilityFrameworkItem],
    ratings: list[CapabilityRating],
) -> dict[str, Any]:
    if not items:
        return {"tags": []}
    item_ids = [it.id for it in items]
    tag_rows = (
        await db.execute(
            select(FrameworkItemTag.framework_item_id, SkillTag)
            .join(SkillTag, SkillTag.id == FrameworkItemTag.tag_id)
            .where(FrameworkItemTag.framework_item_id.in_(item_ids))
        )
    ).all()

    # Item gap lookup
    gap_by_item: dict[uuid.UUID, float] = {}
    by_item: dict[uuid.UUID, list[CapabilityRating]] = defaultdict(list)
    for r in ratings:
        by_item[r.framework_item_id].append(r)
    for it_id, rs in by_item.items():
        curs = [r.current_level for r in rs if r.current_level is not None]
        tars = [r.target_level for r in rs if r.target_level is not None]
        if curs and tars:
            gap_by_item[it_id] = (sum(tars) / len(tars)) - (sum(curs) / len(curs))

    by_tag_count: dict[str, int] = defaultdict(int)
    by_tag_gap: dict[str, list[float]] = defaultdict(list)
    by_tag_cat: dict[str, str] = {}
    by_tag_label: dict[str, str] = {}
    for item_id, tag in tag_rows:
        by_tag_count[tag.code] += 1
        by_tag_cat[tag.code] = tag.category
        by_tag_label[tag.code] = tag.label
        if item_id in gap_by_item:
            by_tag_gap[tag.code].append(gap_by_item[item_id])

    out: list[dict[str, Any]] = []
    for code, freq in by_tag_count.items():
        gaps = by_tag_gap.get(code, [])
        avg_gap = round(sum(gaps) / len(gaps), 2) if gaps else 0.0
        out.append(
            {
                "tag": by_tag_label.get(code, code),
                "category": by_tag_cat.get(code, "general"),
                "frequency": freq,
                "avg_gap": avg_gap,
                "score": round(freq * max(avg_gap, 0.1), 2),
            }
        )
    out.sort(key=lambda r: -r["score"])
    return {"tags": out[:10]}


async def _recommendations(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(RoadmapRecommendation)
            .where(RoadmapRecommendation.tenant_id == tenant_id)
            .order_by(RoadmapRecommendation.sort_order)
            .limit(8)
        )
    ).scalars().all()

    recs: list[dict[str, Any]] = []
    for r in rows:
        recs.append(
            {
                "id": str(r.id),
                "title": r.title,
                "capability": r.category or " - ",
                "effort": (r.effort or "M")[:1].upper(),
                "impact": (r.impact or "H")[:1].upper(),
                "horizon": r.time_horizon or "0-6mo",
                "owner": (r.meta or {}).get("owner") if r.meta else None,
                "linked_gap_item_id": None,
                "source": "roadmap_recommendations",
            }
        )

    if not recs:
        # Pull from library
        lib_rows = (
            await db.execute(
                select(RecommendationLibrary)
                .where(
                    (RecommendationLibrary.category == "learning")
                    | (RecommendationLibrary.title.ilike("%academy%"))
                    | (RecommendationLibrary.title.ilike("%literac%"))
                    | (RecommendationLibrary.title.ilike("%skill%"))
                )
                .limit(6)
            )
        ).scalars().all()
        for r in lib_rows:
            recs.append(
                {
                    "id": r.key,
                    "title": r.title,
                    "capability": r.category or " - ",
                    "effort": (r.default_effort or "M")[:1].upper(),
                    "impact": (r.default_impact or "H")[:1].upper(),
                    "horizon": r.time_horizon or "0-6mo",
                    "owner": None,
                    "linked_gap_item_id": None,
                    "source": "recommendation_library",
                }
            )
    if not recs:
        recs = [
            {
                "id": "rec_analytics_academy",
                "title": "Launch People Analytics Academy",
                "capability": "Workforce Analytics",
                "effort": "M",
                "impact": "H",
                "horizon": "0-6mo",
                "owner": "CHRO",
                "linked_gap_item_id": None,
                "source": "fallback",
            },
            {
                "id": "rec_ai_sprint",
                "title": "AI Literacy Sprint for HRBPs",
                "capability": "AI Literacy",
                "effort": "S",
                "impact": "H",
                "horizon": "0-3mo",
                "owner": "L&D",
                "linked_gap_item_id": None,
                "source": "fallback",
            },
        ]
    return {"recommendations": recs}


async def _roadmap_timeline(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    roadmaps = (
        await db.execute(
            select(Roadmap).where(Roadmap.tenant_id == tenant_id).limit(1)
        )
    ).scalars().all()
    if roadmaps:
        rm = roadmaps[0]
        phases = (
            await db.execute(
                select(RoadmapPhase)
                .where(RoadmapPhase.tenant_id == tenant_id)
                .order_by(RoadmapPhase.sort_order)
            )
        ).scalars().all()
        out_phases: list[dict[str, Any]] = []
        for p in phases:
            recs = (
                await db.execute(
                    select(RoadmapRecommendation)
                    .where(RoadmapRecommendation.phase_id == p.id)
                    .order_by(RoadmapRecommendation.sort_order)
                )
            ).scalars().all()
            out_phases.append(
                {
                    "phase": p.name,
                    "start": p.start_horizon,
                    "end": p.end_horizon,
                    "items": [{"title": r.title, "rec_id": str(r.id)} for r in recs],
                }
            )
        if out_phases:
            return {"phases": out_phases}

    return {
        "phases": [
            {
                "phase": "Now (0-3mo)",
                "start": "0mo",
                "end": "3mo",
                "items": [{"title": "AI Literacy Sprint"}],
            },
            {
                "phase": "Next (3-9mo)",
                "start": "3mo",
                "end": "9mo",
                "items": [{"title": "People Analytics Academy"}],
            },
            {
                "phase": "Later (9-18mo)",
                "start": "9mo",
                "end": "18mo",
                "items": [{"title": "Strategic WFP Certification"}],
            },
        ]
    }


async def _executive_read(
    db: AsyncSession, tenant_id: uuid.UUID, gaps: dict[str, Any]
) -> dict[str, Any]:
    top_gaps = (gaps or {}).get("gaps", [])
    if top_gaps:
        names = ", ".join(g["capability"] for g in top_gaps[:2])
        headline = f"{names} are the two largest enterprise-wide capability deficits."
        summary = (
            f"The top gap, {top_gaps[0]['capability']}, runs {top_gaps[0]['gap']} levels below target. "
            "Prioritise a sequenced learning roadmap - sprint-style literacy programs in the next "
            "quarter, then a full academy track within the year - to close the deficit."
        )
        confidence = "medium"
    else:
        headline = "Insufficient ratings to determine top capability deficits."
        summary = (
            "Once capability ratings are captured against the framework, this section will narrate "
            "the largest gaps and recommend a phased remediation."
        )
        confidence = "low"

    # Try LLM ribbon via ai_advisory if a review exists
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
                insight_type="key_findings",
            )
            c = insight.content or {}
            if isinstance(c, dict):
                headline = c.get("headline") or headline
                summary = c.get("summary") or summary
        except Exception as exc:  # noqa: BLE001
            log.info("skills-dev LLM ribbon skipped: %s", exc)

    return {"headline": headline, "summary": summary, "confidence": confidence}


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
    items = await _items(db, framework.id) if framework else []
    ratings = (
        await _ratings_for_framework(db, tenant_id, framework.id) if framework else []
    )

    kpis = await _kpis(db, tenant_id, framework, items, ratings)
    gaps = _gaps(items, ratings)
    domain_profile = _domain_profile(items, ratings)
    role_heatmap = await _role_heatmap(db, tenant_id, items, ratings)
    skill_tags = await _skill_tag_ranking(db, items, ratings)
    recs = await _recommendations(db, tenant_id)
    roadmap = await _roadmap_timeline(db, tenant_id)
    exec_read = await _executive_read(db, tenant_id, gaps)

    return {
        "studio_id": STUDIO_ID,
        "title": "Skills Development",
        "subtitle": exec_read["headline"],
        "sections": [
            {
                "id": "kpis",
                "title": "Skills Posture KPIs",
                "layout": "kpi_grid",
                "data": kpis,
                "footnote": "capability_frameworks, capability_framework_items, capability_ratings, skill_tags.",
            },
            {
                "id": "gaps",
                "title": "Top 10 Capability Gaps",
                "layout": "horizontal_bar_chart",
                "data": gaps,
                "footnote": "capability_ratings target - current, ordered DESC.",
            },
            {
                "id": "domain_profile",
                "title": "Current vs Target Proficiency by Domain",
                "layout": "radar_chart",
                "data": domain_profile,
                "footnote": "capability_framework_items grouped by category; ratings averaged.",
            },
            {
                "id": "role_heatmap",
                "title": "Role × Capability Heatmap",
                "layout": "heatmap",
                "data": role_heatmap,
                "footnote": "capability_ratings joined to role_capability_profiles via assessment.role_profile_id.",
            },
            {
                "id": "skill_tags",
                "title": "Top Skill Tags by Demand-Shortage",
                "layout": "ranked_list",
                "data": skill_tags,
                "footnote": "framework_item_tags × skill_tags weighted by frequency × avg gap.",
            },
            {
                "id": "recommendations",
                "title": "Recommended Interventions",
                "layout": "recommendation_cards",
                "data": recs,
                "footnote": "roadmap_recommendations (fallback: recommendation_library).",
            },
            {
                "id": "roadmap",
                "title": "Learning Roadmap Timeline",
                "layout": "timeline",
                "data": roadmap,
                "footnote": "roadmaps + roadmap_phases + roadmap_recommendations.",
            },
            {
                "id": "executive_read",
                "title": "Executive Read",
                "layout": "callout_quote",
                "data": exec_read,
                "footnote": "ai_generated_insights - LLM ribbon only; numbers are deterministic above.",
            },
        ],
    }
