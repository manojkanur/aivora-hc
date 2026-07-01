"""Mobility Studio output builder.

McKinsey-style internal mobility one-pager built from the mobility_* tables,
role_adjacencies, and the recommendation_library. Uses the deterministic
Mobility Matcher for the top-matches section.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.mobility import (
    EmployeeMobilityProfile,
    MobilityBarrier,
    MobilityEligibilityRule,
    MobilityFramework,
    MobilityKpiDictionary,
    MobilityMatchResult,
    MobilityMovement,
    MobilityMovementEvent,
    MobilityMoveType,
    MobilityOpportunity,
    MobilityRollup,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.role_profiles import (
    RoleAdjacency,
    RoleCapabilityProfile,
)


_STUDIO_ID = "mobility"


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


async def _section_kpis(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    # Prefer mobility_rollups if any rows exist
    rollup = (
        await db.execute(
            select(MobilityRollup)
            .where(MobilityRollup.tenant_id == tenant_id)
            .order_by(desc(MobilityRollup.computed_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    if rollup and rollup.metrics:
        kpis_data = rollup.metrics
    else:
        kpis_data = {}

    # Fallback aggregations
    open_opp = (
        await db.execute(
            select(func.count(MobilityOpportunity.id)).where(
                MobilityOpportunity.tenant_id == tenant_id,
                MobilityOpportunity.status == "open",
            )
        )
    ).scalar() or 0

    completed = (
        await db.execute(
            select(func.count(MobilityMovement.id)).where(
                MobilityMovement.tenant_id == tenant_id,
                MobilityMovement.status.in_(["completed", "moved"]),
            )
        )
    ).scalar() or 0
    proposed = (
        await db.execute(
            select(func.count(MobilityMovement.id)).where(
                MobilityMovement.tenant_id == tenant_id,
                MobilityMovement.status.in_(["proposed", "in_progress", "applied"]),
            )
        )
    ).scalar() or 0
    fill_denom = completed + proposed
    fill_rate = round(completed / fill_denom, 2) if fill_denom else 0.0

    avg_score_row = (
        await db.execute(
            select(func.avg(MobilityMatchResult.score)).where(
                MobilityMatchResult.tenant_id == tenant_id
            )
        )
    ).scalar()
    avg_score = round(_to_float(avg_score_row, 0.0), 2)

    ready_now = (
        await db.execute(
            select(func.count(EmployeeMobilityProfile.id)).where(
                EmployeeMobilityProfile.tenant_id == tenant_id,
                EmployeeMobilityProfile.readiness.in_(["ready", "ready_now"]),
            )
        )
    ).scalar() or 0

    lat_count = (
        await db.execute(
            select(func.count(MobilityMovement.id)).where(
                MobilityMovement.tenant_id == tenant_id,
                MobilityMovement.movement_type == "lateral",
            )
        )
    ).scalar() or 0
    vert_count = (
        await db.execute(
            select(func.count(MobilityMovement.id)).where(
                MobilityMovement.tenant_id == tenant_id,
                MobilityMovement.movement_type.in_(["promotion", "vertical"]),
            )
        )
    ).scalar() or 0
    total_typed = lat_count + vert_count
    if total_typed:
        lat_pct = round(lat_count / total_typed * 100)
        vert_pct = 100 - lat_pct
        lat_vert = f"{lat_pct} / {vert_pct}"
    else:
        lat_vert = " - "

    # Time to move: avg days between movement start and complete
    durations = (
        await db.execute(
            select(MobilityMovement.started_at, MobilityMovement.completed_at).where(
                MobilityMovement.tenant_id == tenant_id,
                MobilityMovement.started_at.isnot(None),
                MobilityMovement.completed_at.isnot(None),
            )
        )
    ).all()
    if durations:
        days = [
            (c - s).days for s, c in durations if c and s and (c - s).days >= 0
        ]
        avg_days = round(sum(days) / len(days)) if days else 0
    else:
        avg_days = 0

    kpis = [
        {
            "code": "internal_fill_rate",
            "label": "Internal Fill Rate",
            "value": kpis_data.get("internal_fill_rate", fill_rate),
            "unit": "pct",
        },
        {
            "code": "avg_match_score",
            "label": "Avg Match Score",
            "value": kpis_data.get("avg_match_score", avg_score),
            "unit": "score",
        },
        {
            "code": "open_opportunities",
            "label": "Open Opportunities",
            "value": kpis_data.get("open_opportunities", int(open_opp)),
            "unit": "count",
        },
        {
            "code": "ready_now_talent",
            "label": "Ready-Now Talent",
            "value": kpis_data.get("ready_now_talent", int(ready_now)),
            "unit": "count",
        },
        {
            "code": "time_to_move_days",
            "label": "Time to Move",
            "value": kpis_data.get("time_to_move_days", avg_days),
            "unit": "days",
        },
        {
            "code": "lateral_vs_vertical",
            "label": "Lateral : Vertical",
            "value": kpis_data.get("lateral_vs_vertical", lat_vert),
            "unit": "ratio",
        },
    ]
    return {"kpis": kpis}


async def _section_framework(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    framework = (
        await db.execute(
            select(MobilityFramework)
            .where(MobilityFramework.tenant_id == tenant_id)
            .order_by(desc(MobilityFramework.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    move_types = (
        await db.execute(select(MobilityMoveType).order_by(MobilityMoveType.code))
    ).scalars().all()

    rule_count = (
        await db.execute(
            select(func.count(MobilityEligibilityRule.id)).where(
                MobilityEligibilityRule.tenant_id == tenant_id,
                MobilityEligibilityRule.is_active.is_(True),
            )
        )
    ).scalar() or 0

    return {
        "framework": {
            "name": framework.name if framework else "Mobility Framework (not yet configured)",
            "mode": framework.mode if framework else "hybrid",
            "status": "active" if framework else "draft",
        },
        "move_types": [
            {
                "code": mt.code,
                "label": mt.label or mt.code.title(),
                "description": mt.description or "",
            }
            for mt in move_types
        ],
        "rule_coverage": {"defined": int(rule_count), "of_total": len(move_types) or 1},
    }


async def _section_supply_demand(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    # Supply by role_family from RoleCapabilityProfile counts via profiles
    supply_rows = (
        await db.execute(
            select(
                RoleCapabilityProfile.role_family,
                func.count(EmployeeMobilityProfile.id),
            )
            .join(
                EmployeeMobilityProfile,
                EmployeeMobilityProfile.current_role_profile_id
                == RoleCapabilityProfile.id,
                isouter=True,
            )
            .where(RoleCapabilityProfile.tenant_id == tenant_id)
            .group_by(RoleCapabilityProfile.role_family)
        )
    ).all()

    demand_rows = (
        await db.execute(
            select(
                RoleCapabilityProfile.role_family,
                func.count(MobilityOpportunity.id),
            )
            .join(
                MobilityOpportunity,
                MobilityOpportunity.target_role_profile_id
                == RoleCapabilityProfile.id,
                isouter=True,
            )
            .where(
                RoleCapabilityProfile.tenant_id == tenant_id,
                MobilityOpportunity.status == "open",
            )
            .group_by(RoleCapabilityProfile.role_family)
        )
    ).all()

    supply_map = {fam or "Unassigned": int(c) for fam, c in supply_rows}
    demand_map = {fam or "Unassigned": int(c) for fam, c in demand_rows}
    families = sorted(set(supply_map) | set(demand_map))
    rows = [
        {
            "family": fam,
            "supply": supply_map.get(fam, 0),
            "demand": demand_map.get(fam, 0),
            "gap": supply_map.get(fam, 0) - demand_map.get(fam, 0),
        }
        for fam in families
    ]
    rows.sort(key=lambda r: abs(r["gap"]), reverse=True)
    return {"families": rows[:8]}


async def _section_top_matches(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    min_score = 0.7
    rows = (
        await db.execute(
            select(MobilityMatchResult)
            .where(
                MobilityMatchResult.tenant_id == tenant_id,
                MobilityMatchResult.score >= min_score,
            )
            .order_by(desc(MobilityMatchResult.score))
            .limit(10)
        )
    ).scalars().all()

    matches: list[dict[str, Any]] = []
    for idx, r in enumerate(rows, start=1):
        prof = (
            await db.execute(
                select(EmployeeMobilityProfile).where(
                    EmployeeMobilityProfile.id == r.profile_id
                )
            )
        ).scalar_one_or_none()
        opp = (
            await db.execute(
                select(MobilityOpportunity).where(
                    MobilityOpportunity.id == r.opportunity_id
                )
            )
        ).scalar_one_or_none()
        current_role_name = None
        if prof and prof.current_role_profile_id:
            cr = (
                await db.execute(
                    select(RoleCapabilityProfile).where(
                        RoleCapabilityProfile.id == prof.current_role_profile_id
                    )
                )
            ).scalar_one_or_none()
            if cr:
                current_role_name = cr.role_name

        breakdown = r.breakdown or {}
        comps = breakdown.get("components") or {
            k: v
            for k, v in breakdown.items()
            if isinstance(v, (int, float))
        }

        matches.append(
            {
                "rank": idx,
                "employee_ref": prof.employee_ref if prof else " - ",
                "current_role": current_role_name or " - ",
                "opportunity": opp.name if opp else " - ",
                "score": round(_to_float(r.score), 2),
                "verdict": r.verdict,
                "breakdown": {k: round(_to_float(v), 2) for k, v in comps.items()},
            }
        )

    return {"matches": matches, "min_score": min_score}


async def _section_role_adjacencies(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(RoleAdjacency).where(RoleAdjacency.tenant_id == tenant_id).limit(60)
        )
    ).scalars().all()
    if not rows:
        return {"rows": [], "cols": [], "cells": []}

    role_ids: set[uuid.UUID] = set()
    for r in rows:
        role_ids.add(r.from_role_profile_id)
        role_ids.add(r.to_role_profile_id)
    role_rows = (
        await db.execute(
            select(RoleCapabilityProfile).where(
                RoleCapabilityProfile.id.in_(role_ids)
            )
        )
    ).scalars().all()
    role_lookup = {r.id: r.role_name for r in role_rows}

    sorted_role_ids = sorted(role_ids, key=lambda i: role_lookup.get(i, "") or "")
    headers = [role_lookup.get(i, str(i)[:8]) for i in sorted_role_ids]
    id_to_idx = {i: idx for idx, i in enumerate(sorted_role_ids)}
    n = len(sorted_role_ids)
    matrix: list[list[float]] = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0
    for r in rows:
        i = id_to_idx[r.from_role_profile_id]
        j = id_to_idx[r.to_role_profile_id]
        d = _to_float(r.distance, 0.5)
        # interpret distance as closeness: 1.0 - distance, clamped
        closeness = max(0.0, min(1.0, 1.0 - d)) if d > 1 else max(0.0, min(1.0, d))
        matrix[i][j] = round(closeness, 2)

    return {"rows": headers, "cols": headers, "cells": matrix}


async def _section_funnel(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    ninety = datetime.now(timezone.utc) - timedelta(days=90)
    stage_events = [
        "identified",
        "applied",
        "shortlisted",
        "interviewed",
        "offered",
        "moved",
    ]
    stages: list[dict[str, Any]] = []
    for ev in stage_events:
        count = (
            await db.execute(
                select(func.count(MobilityMovementEvent.id))
                .join(
                    MobilityMovement,
                    MobilityMovement.id == MobilityMovementEvent.movement_id,
                )
                .where(
                    MobilityMovement.tenant_id == tenant_id,
                    MobilityMovementEvent.event_type == ev,
                    MobilityMovementEvent.created_at >= ninety,
                )
            )
        ).scalar() or 0
        stages.append({"stage": ev, "count": int(count)})

    # Fallback decay if all zeros
    base = stages[0]["count"] if stages else 0
    if base == 0:
        # use proposed/completed counts as anchors
        proposed = (
            await db.execute(
                select(func.count(MobilityMovement.id)).where(
                    MobilityMovement.tenant_id == tenant_id,
                    MobilityMovement.status.in_(["proposed", "in_progress"]),
                )
            )
        ).scalar() or 0
        completed = (
            await db.execute(
                select(func.count(MobilityMovement.id)).where(
                    MobilityMovement.tenant_id == tenant_id,
                    MobilityMovement.status.in_(["completed", "moved"]),
                )
            )
        ).scalar() or 0
        base = max(proposed + completed, 1)
        for idx, s in enumerate(stages):
            s["count"] = max(int(base * max(0.0, 1.0 - 0.15 * idx)), 0)
        stages[-1]["count"] = completed
        base = stages[0]["count"]

    conversion = round(stages[-1]["count"] / base, 3) if base else 0.0
    return {"stages": stages, "conversion": {"identified_to_moved": conversion}}


async def _section_barriers(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(
                MobilityBarrier.type,
                MobilityBarrier.severity,
                func.count(MobilityBarrier.id),
            )
            .where(MobilityBarrier.tenant_id == tenant_id)
            .group_by(MobilityBarrier.type, MobilityBarrier.severity)
            .order_by(func.count(MobilityBarrier.id).desc())
            .limit(8)
        )
    ).all()
    barriers = [
        {
            "type": (t or "unknown").replace("_", " ").title(),
            "severity": sev or "medium",
            "affected": int(c),
        }
        for t, sev, c in rows
    ]
    return {"barriers": barriers}


async def _section_recommendations(db: AsyncSession) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(RecommendationLibrary)
            .where(RecommendationLibrary.category.in_(["mobility", "talent"]))
            .order_by(RecommendationLibrary.tier.nullslast(), RecommendationLibrary.title)
            .limit(6)
        )
    ).scalars().all()
    return {
        "recommendations": [
            {
                "id": r.key,
                "title": r.title,
                "description": r.description,
                "impact": r.default_impact or " - ",
                "effort": r.default_effort or " - ",
                "horizon": r.time_horizon or " - ",
                "tier": r.tier or " - ",
            }
            for r in rows
        ]
    }


async def _section_executive_read(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    deterministic_payload: dict[str, Any],
) -> dict[str, Any]:
    kpis = {k["code"]: k["value"] for k in deterministic_payload["kpis"]["kpis"]}
    barriers = deterministic_payload["barriers"]["barriers"]
    funnel_conv = (
        deterministic_payload["funnel"]
        .get("conversion", {})
        .get("identified_to_moved", 0)
    )
    top_barrier = barriers[0]["type"] if barriers else None

    headline_parts = [
        f"Internal fill rate {kpis.get('internal_fill_rate', ' - ')}",
        f"avg match score {kpis.get('avg_match_score', ' - ')}",
    ]
    if top_barrier:
        headline_parts.append(f"#1 barrier: {top_barrier}")
    headline = " · ".join(headline_parts)

    summary = (
        f"Open opportunities sit at {kpis.get('open_opportunities',' - ')} with "
        f"{kpis.get('ready_now_talent',' - ')} ready-now talent on the bench. "
        f"Pipeline converts identified → moved at {funnel_conv}. "
        + (f"The dominant friction is {top_barrier}. " if top_barrier else "")
        + "Focus next: clear the top barrier and route ready-now talent into the "
        "highest-demand families."
    )
    return {
        "headline": headline,
        "summary": summary,
        "top_themes": [b["type"] for b in barriers[:3]],
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
    kpis = await _section_kpis(db, tenant_id)
    framework = await _section_framework(db, tenant_id)
    supply_demand = await _section_supply_demand(db, tenant_id)
    top_matches = await _section_top_matches(db, tenant_id)
    role_adjacencies = await _section_role_adjacencies(db, tenant_id)
    funnel = await _section_funnel(db, tenant_id)
    barriers = await _section_barriers(db, tenant_id)
    recommendations = await _section_recommendations(db)
    executive = await _section_executive_read(
        db,
        tenant_id,
        {
            "kpis": kpis,
            "barriers": barriers,
            "funnel": funnel,
        },
    )

    org_name = None
    if brief:
        org_name = (brief.get("organization") or {}).get("organizationName")

    sections = [
        {"id": "kpis", "title": "Mobility Health KPIs", "layout": "kpi_grid", "data": kpis},
        {
            "id": "framework",
            "title": "Mobility Framework & Eligibility Posture",
            "layout": "comparison_table",
            "data": framework,
        },
        {
            "id": "supply_demand",
            "title": "Talent Supply vs Opportunity Demand by Job Family",
            "layout": "horizontal_bar_chart",
            "data": supply_demand,
        },
        {
            "id": "top_matches",
            "title": "Top Internal Matches (Live Matcher Output)",
            "layout": "ranked_list",
            "data": top_matches,
            "footnote": "Scores computed by mobility_matcher v1; threshold ≥ 0.7.",
        },
        {
            "id": "role_adjacencies",
            "title": "Role Adjacency Heatmap",
            "layout": "heatmap",
            "data": role_adjacencies,
        },
        {
            "id": "funnel",
            "title": "Movement Funnel & Velocity",
            "layout": "timeline",
            "data": funnel,
        },
        {
            "id": "barriers",
            "title": "Mobility Barriers & Risk Flags",
            "layout": "risk_flags_list",
            "data": barriers,
        },
        {
            "id": "recommendations",
            "title": "Recommended Mobility Plays",
            "layout": "recommendation_cards",
            "data": recommendations,
        },
        {
            "id": "executive_read",
            "title": "Executive Read",
            "layout": "callout_quote",
            "data": executive,
        },
    ]

    return {
        "studio_id": _STUDIO_ID,
        "title": "Mobility Studio",
        "subtitle": (
            f"Internal mobility diagnostic for {org_name}"
            if org_name
            else "Internal mobility diagnostic"
        ),
        "sections": sections,
    }
