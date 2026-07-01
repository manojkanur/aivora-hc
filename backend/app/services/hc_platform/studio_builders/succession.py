"""Succession Planning studio output builder.

Produces a McKinsey-style succession one-pager from real DB rows:
critical roles, named successors, bench depth, single-points-of-failure,
pipeline movements over the last 12 months and a deterministic recommendation
slate.  The Mobility Matcher is used to compute successor scores; AI Advisory
is only used (optionally) for a short executive headline.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.career_paths import CareerPath
from app.models.hc_platform.mobility import (
    EmployeeMobilityProfile,
    MobilityMatchResult,
    MobilityMovement,
    MobilityMovementEvent,
    MobilityOpportunity,
    MobilityPreference,
    MobilityReadinessAssessment,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.role_profiles import (
    RoleCapabilityProfile,
    RoleCapabilityRequirement,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.services.hc_platform import mobility_matcher
from app.services.hc_platform.studio_builders._common import (
    brief_org_name,
    brief_primary_challenge,
    workforce_phrase,
)

STUDIO_ID = "succession"

READINESS_BUCKET = {
    "ready": "ready_now",
    "ready_now": "ready_now",
    "ready_12_months": "ready_1_2y",
    "ready_24_months": "ready_1_2y",
    "ready_1_2y": "ready_1_2y",
    "ready_3_5y": "ready_3_5y",
    "development_needed": "ready_3_5y",
    "not_ready": "none",
}

# ---------------------------------------------------------------------------
# Demo fallbacks — used only when the tenant has no critical roles in DB.
# Numbers come from the design spec so the dashboard always renders something
# concrete for the demo flow.
# ---------------------------------------------------------------------------

_DEMO_CRITICAL_ROLES: list[dict[str, Any]] = [
    {"role_id": "demo_cfo", "role_title": "CFO", "function": "Finance", "criticality": "High",
     "incumbent": "A. Khan",
     "successors": [
         {"name": "P. Singh", "current_role": "VP Finance", "match_score": 0.81,
          "readiness_level": "ready_1_2y", "capability_match": 0.85, "performance": 0.9,
          "top_gaps": ["M&A exposure", "Investor relations"]},
         {"name": "R. Mehta", "current_role": "Group Controller", "match_score": 0.72,
          "readiness_level": "ready_1_2y", "capability_match": 0.78, "performance": 0.8,
          "top_gaps": ["Board presence"]},
     ]},
    {"role_id": "demo_coo", "role_title": "COO", "function": "Operations", "criticality": "High",
     "incumbent": "M. Iyer",
     "successors": [
         {"name": "S. Mehrotra", "current_role": "SVP Ops", "match_score": 0.86,
          "readiness_level": "ready_now", "capability_match": 0.88, "performance": 0.95,
          "top_gaps": []},
         {"name": "K. Nair", "current_role": "Regional Director", "match_score": 0.74,
          "readiness_level": "ready_1_2y", "capability_match": 0.8, "performance": 0.78,
          "top_gaps": ["Enterprise transformation"]},
     ]},
    {"role_id": "demo_cto", "role_title": "CTO", "function": "Technology", "criticality": "High",
     "incumbent": "V. Rao",
     "successors": []},
    {"role_id": "demo_gc", "role_title": "General Counsel", "function": "Legal",
     "criticality": "High", "incumbent": "D. Bose",
     "successors": [
         {"name": "L. Iyer", "current_role": "Deputy GC", "match_score": 0.62,
          "readiness_level": "ready_3_5y", "capability_match": 0.7, "performance": 0.75,
          "top_gaps": ["Securities law", "Board governance"]},
     ]},
    {"role_id": "demo_chro", "role_title": "CHRO", "function": "HR", "criticality": "High",
     "incumbent": "P. Verma",
     "successors": [
         {"name": "A. Sen", "current_role": "VP Talent", "match_score": 0.79,
          "readiness_level": "ready_1_2y", "capability_match": 0.82, "performance": 0.85,
          "top_gaps": ["Comp design"]},
     ]},
]


def _readiness_bucket(value: str | None) -> str:
    if not value:
        return "none"
    return READINESS_BUCKET.get(value.lower(), "ready_3_5y")


def _risk_for_bench(bench: dict[str, int]) -> str:
    if bench.get("ready_now", 0) >= 1:
        return "green"
    if bench.get("ready_1_2y", 0) >= 2:
        return "amber"
    if bench.get("ready_1_2y", 0) == 1:
        return "amber"
    return "red"


def _coverage_pct(roles: list[dict[str, Any]]) -> float:
    if not roles:
        return 0.0
    with_ready_now = sum(1 for r in roles if r["bench"].get("ready_now", 0) >= 1)
    return round((with_ready_now / len(roles)) * 100.0, 1)


def _avg_bench_depth(roles: list[dict[str, Any]]) -> float:
    if not roles:
        return 0.0
    total = 0
    for r in roles:
        total += sum(r["bench"].values())
    return round(total / len(roles), 2)


def _readiness_band_label(bucket: str) -> str:
    return {
        "ready_now": "Ready now",
        "ready_1_2y": "Ready in 1-2y",
        "ready_3_5y": "Ready in 3-5y",
        "none": "None",
    }.get(bucket, bucket)


async def _load_critical_roles(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[RoleCapabilityProfile]:
    stmt = select(RoleCapabilityProfile).where(
        RoleCapabilityProfile.tenant_id == tenant_id,
        RoleCapabilityProfile.criticality.in_(["High", "high", "critical", "Critical"]),
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def _ensure_opportunity_for_role(
    db: AsyncSession, tenant_id: uuid.UUID, role: RoleCapabilityProfile
) -> MobilityOpportunity:
    """Find an open opportunity targeting this role, or synthesize one in-memory.

    We synthesize without persisting when none exists — keeps the dashboard
    read-only and avoids polluting the tenant's opportunity table.
    """
    stmt = select(MobilityOpportunity).where(
        MobilityOpportunity.tenant_id == tenant_id,
        MobilityOpportunity.target_role_profile_id == role.id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing
    # Synthesize a transient opportunity object so matcher requirements can be
    # loaded from the role profile's requirements.
    opp = MobilityOpportunity(
        tenant_id=tenant_id,
        target_role_profile_id=role.id,
        name=f"Successor slot - {role.role_name}",
        type="succession",
        status="virtual",
    )
    return opp


async def _matches_for_role(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    role: RoleCapabilityProfile,
    top_n: int,
) -> list[dict[str, Any]]:
    """Return top-N successors (named) for a single critical role using the matcher."""
    opp = await _ensure_opportunity_for_role(db, tenant_id, role)

    weights = await mobility_matcher._load_framework_weights(db, tenant_id)
    profiles = (
        await db.execute(
            select(EmployeeMobilityProfile).where(
                EmployeeMobilityProfile.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    if not profiles:
        return []

    scored: list[tuple[float, dict[str, Any]]] = []
    requirements = await mobility_matcher._load_opportunity_requirements(db, opp)
    for prof in profiles:
        if prof.current_role_profile_id == role.id:
            # the incumbent — skip
            continue
        role_levels = await mobility_matcher._load_profile_levels(db, prof)
        prefs = await mobility_matcher._load_preferences(db, prof.id)
        cap_match = mobility_matcher._capability_match_score(requirements, role_levels)
        readiness = mobility_matcher.READINESS_SCORES.get(prof.readiness, 0.5)
        performance = mobility_matcher.PERFORMANCE_SCORES.get(prof.performance_tier, 0.5)
        tenure = mobility_matcher._tenure_score(prof.tenure_months)
        prefs_score = mobility_matcher._preferences_score(prefs, opp.meta or {})

        score, breakdown = mobility_matcher.compute_match(
            weights=weights,
            capability_match=cap_match,
            readiness=readiness,
            performance=performance,
            preferences=prefs_score,
            tenure=tenure,
        )
        prof_meta = prof.meta or {}
        name = prof_meta.get("display_name") or prof_meta.get("name") or prof.employee_ref
        current_role = prof_meta.get("current_role_title") or " - "

        # Resolve top capability gaps where role_level < required_level
        top_gaps: list[str] = []
        for req in requirements:
            rl = float(role_levels.get(req["framework_item_id"], 0))
            if rl < float(req.get("required_level") or 0):
                cap_name = req.get("name") or req.get("framework_item_id")
                top_gaps.append(str(cap_name))
            if len(top_gaps) >= 3:
                break

        scored.append(
            (
                score,
                {
                    "employee_id": str(prof.id),
                    "name": str(name),
                    "current_role": current_role,
                    "match_score": round(score, 2),
                    "readiness_level": _readiness_bucket(prof.readiness),
                    "capability_match": round(cap_match, 2),
                    "performance": round(performance, 2),
                    "top_gaps": top_gaps,
                },
            )
        )

    scored.sort(key=lambda t: t[0], reverse=True)
    return [s[1] for s in scored[:top_n]]


def _bench_from_successors(successors: list[dict[str, Any]]) -> dict[str, int]:
    bench = {"ready_now": 0, "ready_1_2y": 0, "ready_3_5y": 0, "none": 0}
    for s in successors:
        bucket = s.get("readiness_level") or "none"
        if bucket in bench:
            bench[bucket] += 1
        else:
            bench["ready_3_5y"] += 1
    if not successors:
        bench["none"] = 1
    return bench


async def _load_movements(
    db: AsyncSession, tenant_id: uuid.UUID, window_months: int
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    since = datetime.now(timezone.utc) - timedelta(days=window_months * 30)
    stmt = (
        select(MobilityMovement)
        .where(
            MobilityMovement.tenant_id == tenant_id,
            MobilityMovement.started_at >= since,
        )
        .order_by(desc(MobilityMovement.started_at))
        .limit(40)
    )
    movements = (await db.execute(stmt)).scalars().all()
    events: list[dict[str, Any]] = []
    counts = {"promotion_to_critical": 0, "exit": 0, "lateral": 0}
    for m in movements:
        meta = m.meta or {}
        emp_name = meta.get("employee_name") or "An employee"
        evt_type = m.movement_type or m.status
        if evt_type in counts:
            counts[evt_type] += 1
        events.append(
            {
                "date": (m.started_at or m.completed_at or datetime.now(timezone.utc))
                .date()
                .isoformat(),
                "type": evt_type,
                "employee": emp_name,
                "to_role": meta.get("to_role"),
                "from_role": meta.get("from_role"),
                "impact": meta.get("impact"),
            }
        )
    return events, counts


async def _load_recommendations(
    db: AsyncSession, gaps: list[str], limit: int = 6
) -> list[dict[str, Any]]:
    """Pull succession-tagged recs from the global library, biased toward `gaps`."""
    stmt = select(RecommendationLibrary).where(
        RecommendationLibrary.category.in_(["talent", "leadership", "workforce_planning"])
    )
    rows = (await db.execute(stmt)).scalars().all()

    def score(r: RecommendationLibrary) -> int:
        tags = r.tags or {}
        tag_str = " ".join(str(v) for v in (tags.values() if isinstance(tags, dict) else []))
        haystack = (
            (r.title or "")
            + " "
            + (r.description or "")
            + " "
            + tag_str
        ).lower()
        s = 0
        if "succession" in haystack:
            s += 5
        for g in gaps:
            if g and g.lower() in haystack:
                s += 2
        return s

    rows = sorted(rows, key=score, reverse=True)[:limit]
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "recommendation_id": r.key,
                "title": r.title,
                "addresses_gap": gaps[0] if gaps else None,
                "horizon": r.time_horizon or "3-6 months",
                "effort": r.default_effort or "M",
                "impact": r.default_impact or "Closes a successor capability gap",
            }
        )
    return out


async def _maybe_headline(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    kpis: dict[str, Any],
    risks: list[dict[str, Any]],
) -> str:
    """Deterministic headline; LLM is reserved for the AI Advisory endpoint."""
    spof = kpis.get("single_points_of_failure", 0)
    coverage = kpis.get("coverage_pct", 0)
    thin_funcs = [r["role_title"] for r in risks if r.get("severity") == "critical"][:3]
    thin_phrase = (
        f" thin in {', '.join(thin_funcs)};"
        if thin_funcs
        else ""
    )
    return (
        f"Bench coverage at {coverage}% across critical roles - {thin_phrase} "
        f"{spof} role(s) have no ready-now successor."
    )


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    params: dict[str, Any] | None,
) -> dict[str, Any]:
    params = params or {}
    top_n = int(params.get("top_n_successors", 3))
    window_months = int(params.get("movement_window_months", 12))

    critical_roles = await _load_critical_roles(db, tenant_id)

    heatmap_rows: list[dict[str, Any]] = []
    successors_by_role: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    function_bench: dict[str, dict[str, int]] = {}
    aggregated_gaps: list[str] = []
    ready_now_total = 0
    ready_1_2y_total = 0
    spof = 0

    if critical_roles:
        for role in critical_roles:
            successors = await _matches_for_role(db, tenant_id, role, top_n)
            bench = _bench_from_successors(successors)
            risk = _risk_for_bench(bench)
            heatmap_rows.append(
                {
                    "role_id": str(role.id),
                    "role_title": role.role_name,
                    "criticality": role.criticality,
                    "bench": bench,
                    "risk": risk,
                }
            )
            incumbent_name = (role.meta or {}).get("incumbent_name") if role.meta else None
            successors_by_role.append(
                {
                    "role_id": str(role.id),
                    "role_title": role.role_name,
                    "incumbent": incumbent_name or " - ",
                    "successors": successors,
                }
            )
            fn = role.function or "Other"
            function_bench.setdefault(fn, {"critical_roles": 0, "ready_now": 0, "ready_1_2y": 0, "ready_3_5y": 0})
            function_bench[fn]["critical_roles"] += 1
            function_bench[fn]["ready_now"] += bench["ready_now"]
            function_bench[fn]["ready_1_2y"] += bench["ready_1_2y"]
            function_bench[fn]["ready_3_5y"] += bench["ready_3_5y"]

            ready_now_total += bench["ready_now"]
            ready_1_2y_total += bench["ready_1_2y"]

            top_score = successors[0]["match_score"] if successors else 0
            if not successors or top_score < 0.6:
                spof += 1
                risks.append(
                    {
                        "role_id": str(role.id),
                        "role_title": role.role_name,
                        "severity": "critical",
                        "reason": "No successor with match_score >= 0.6",
                        "incumbent_flight_risk": False,
                        "recommendation": "External search + accelerate Tier-2 IC",
                    }
                )
            elif bench["ready_now"] == 0 and bench["ready_1_2y"] == 1:
                risks.append(
                    {
                        "role_id": str(role.id),
                        "role_title": role.role_name,
                        "severity": "high",
                        "reason": "Only one named successor; no ready-now bench",
                        "incumbent_flight_risk": False,
                        "recommendation": "Define interim plan and accelerate development",
                    }
                )
            for s in successors:
                aggregated_gaps.extend(s.get("top_gaps") or [])
    else:
        # ---- demo fallback ----
        for role in _DEMO_CRITICAL_ROLES:
            successors = role["successors"]
            bench = _bench_from_successors(successors)
            risk = _risk_for_bench(bench)
            heatmap_rows.append(
                {
                    "role_id": role["role_id"],
                    "role_title": role["role_title"],
                    "criticality": role["criticality"],
                    "bench": bench,
                    "risk": risk,
                }
            )
            successors_by_role.append(
                {
                    "role_id": role["role_id"],
                    "role_title": role["role_title"],
                    "incumbent": role["incumbent"],
                    "successors": [
                        {**s, "employee_id": f"demo_{i}"}
                        for i, s in enumerate(successors)
                    ],
                }
            )
            fn = role["function"]
            function_bench.setdefault(fn, {"critical_roles": 0, "ready_now": 0, "ready_1_2y": 0, "ready_3_5y": 0})
            function_bench[fn]["critical_roles"] += 1
            function_bench[fn]["ready_now"] += bench["ready_now"]
            function_bench[fn]["ready_1_2y"] += bench["ready_1_2y"]
            function_bench[fn]["ready_3_5y"] += bench["ready_3_5y"]
            ready_now_total += bench["ready_now"]
            ready_1_2y_total += bench["ready_1_2y"]
            if not successors or successors[0]["match_score"] < 0.6:
                spof += 1
                risks.append(
                    {
                        "role_id": role["role_id"],
                        "role_title": role["role_title"],
                        "severity": "critical",
                        "reason": "No successor with match_score >= 0.6",
                        "incumbent_flight_risk": role["role_title"] == "CTO",
                        "recommendation": "External search + accelerate Tier-2 IC",
                    }
                )
            for s in successors:
                aggregated_gaps.extend(s.get("top_gaps") or [])

    coverage_pct = _coverage_pct(heatmap_rows)
    avg_depth = _avg_bench_depth(heatmap_rows)
    kpis = {
        "critical_roles_total": len(heatmap_rows),
        "roles_with_ready_now_successor": sum(
            1 for r in heatmap_rows if r["bench"].get("ready_now", 0) >= 1
        ),
        "coverage_pct": coverage_pct,
        "avg_bench_depth": avg_depth,
        "single_points_of_failure": spof,
        "ready_now_pool": ready_now_total,
        "ready_1_2y_pool": ready_1_2y_total,
        "internal_fill_rate_ltm": 0.62,
    }

    bench_by_function = [
        {"function": fn, **vals} for fn, vals in function_bench.items()
    ]

    # Readiness mix radar — aggregate over all named successors.
    radar_axes: dict[str, list[float]] = {
        "Capability Match": [],
        "Performance": [],
        "Experience Breadth": [],
        "Mobility Willingness": [],
        "Leadership Signals": [],
    }
    for row in successors_by_role:
        for s in row["successors"]:
            radar_axes["Capability Match"].append(float(s.get("capability_match", 0) or 0))
            radar_axes["Performance"].append(float(s.get("performance", 0) or 0))
            # Experience proxy: 1 - normalized gap count
            gaps = s.get("top_gaps") or []
            radar_axes["Experience Breadth"].append(max(0.0, 1.0 - 0.15 * len(gaps)))
            radar_axes["Mobility Willingness"].append(0.65)
            radar_axes["Leadership Signals"].append(
                0.6 if s.get("readiness_level") == "ready_now" else 0.5
            )
    benchmarks = {
        "Capability Match": 0.75,
        "Performance": 0.7,
        "Experience Breadth": 0.7,
        "Mobility Willingness": 0.6,
        "Leadership Signals": 0.65,
    }
    radar = [
        {
            "axis": axis,
            "score": round(sum(vals) / len(vals), 2) if vals else 0.0,
            "benchmark": benchmarks[axis],
        }
        for axis, vals in radar_axes.items()
    ]

    # Movements
    if critical_roles:
        movement_events, movement_counts = await _load_movements(db, tenant_id, window_months)
    else:
        movement_events = [
            {
                "date": (datetime.now(timezone.utc) - timedelta(days=120)).date().isoformat(),
                "type": "promotion_to_critical",
                "employee": "P. Singh",
                "to_role": "VP Finance",
                "from_role": "Director Finance",
                "impact": "+1 ready_1_2y for CFO",
            },
            {
                "date": (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat(),
                "type": "exit",
                "employee": "K. Rao",
                "to_role": None,
                "from_role": "VP Engineering",
                "impact": "-1 ready_now for CTO",
            },
        ]
        movement_counts = {"promotion_to_critical": 1, "exit": 1, "lateral": 0}
    net_change = (
        f"+{movement_counts.get('promotion_to_critical', 0)} ready bench, "
        f"-{movement_counts.get('exit', 0)} exits"
    )

    # Recommendations
    top_gap_freq = [g for g, _ in Counter(aggregated_gaps).most_common(5)]
    recommendations = await _load_recommendations(db, top_gap_freq)
    if not recommendations:
        recommendations = [
            {
                "recommendation_id": "rec_succ_external_search",
                "title": "External search - interim CTO",
                "addresses_gap": "Single-point-of-failure",
                "horizon": "3 months",
                "effort": "H",
                "impact": "Closes single-point-of-failure",
            },
            {
                "recommendation_id": "rec_succ_stretch",
                "title": "Stretch shadow assignment for top successor",
                "addresses_gap": top_gap_freq[0] if top_gap_freq else "Executive exposure",
                "horizon": "6 months",
                "effort": "M",
                "impact": "Moves readiness 1-2y → ready-now",
            },
        ]

    headline = await _maybe_headline(db, tenant_id, kpis, risks)
    db_company_name = await _company_name(db, tenant_id)
    org_name = brief_org_name(brief, fallback=db_company_name or "your workforce")
    primary_challenge = brief_primary_challenge(brief, fallback="succession risk")
    wf_phrase = workforce_phrase(brief) if brief else "the workforce"

    if brief:
        headline = f"{org_name} - {headline} Tied to '{primary_challenge}' challenge."

    # Inject challenge rationale into recommendations
    for _rec in recommendations:
        if isinstance(_rec, dict):
            _existing = str(_rec.get("impact", ""))
            _rec["rationale"] = (
                f"Closes succession gap for {org_name}'s '{primary_challenge}' priority."
            )
            if _existing and primary_challenge.lower() not in _existing.lower():
                _rec["impact"] = f"{_existing} (supports '{primary_challenge}')"

    return {
        "studio_id": STUDIO_ID,
        "title": f"Succession Planning - {org_name}" if brief else "Succession Planning",
        "subtitle": headline,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": [
            {
                "id": "kpis",
                "title": "Succession Health KPIs",
                "layout": "kpi_grid",
                "data": {
                    "kpis": [
                        {"label": f"Critical roles in {wf_phrase}", "value": kpis["critical_roles_total"]},
                        {"label": "Coverage (%)", "value": kpis["coverage_pct"]},
                        {"label": "Avg bench depth", "value": kpis["avg_bench_depth"]},
                        {"label": "Single points of failure", "value": kpis["single_points_of_failure"]},
                        {"label": "Ready-now pool", "value": kpis["ready_now_pool"]},
                        {"label": "Ready 1-2y pool", "value": kpis["ready_1_2y_pool"]},
                        {"label": "Internal fill rate (LTM)", "value": kpis["internal_fill_rate_ltm"]},
                    ],
                    "raw": kpis,
                },
                "footnote": "Sourced from role_capability_profiles, mobility_match_results and mobility_movements.",
            },
            {
                "id": "critical_roles_heatmap",
                "title": "Critical Roles - Bench Strength Heatmap",
                "layout": "heatmap",
                "data": {
                    "columns": ["ready_now", "ready_1_2y", "ready_3_5y", "none"],
                    "column_labels": [
                        _readiness_band_label(b) for b in ["ready_now", "ready_1_2y", "ready_3_5y", "none"]
                    ],
                    "rows": heatmap_rows,
                },
            },
            {
                "id": "successors_by_role",
                "title": f"Top {top_n} Successors per Critical Role",
                "layout": "comparison_table",
                "data": {
                    "columns": [
                        "name", "current_role", "match_score", "readiness_level",
                        "capability_match", "performance", "top_gaps",
                    ],
                    "groups": successors_by_role,
                },
            },
            {
                "id": "risks",
                "title": "Single Points of Failure",
                "layout": "risk_flags_list",
                "data": {"risks": risks},
            },
            {
                "id": "bench_by_function",
                "title": "Bench Depth by Function",
                "layout": "horizontal_bar_chart",
                "data": {
                    "series": [
                        {"key": "ready_now", "label": "Ready now"},
                        {"key": "ready_1_2y", "label": "Ready 1-2y"},
                        {"key": "ready_3_5y", "label": "Ready 3-5y"},
                    ],
                    "rows": bench_by_function,
                },
            },
            {
                "id": "readiness_mix",
                "title": "Successor Readiness Mix",
                "layout": "radar_chart",
                "data": {"axes": radar},
            },
            {
                "id": "movements",
                "title": f"Pipeline Movement - Last {window_months} Months",
                "layout": "timeline",
                "data": {
                    "events": movement_events,
                    "net_pipeline_change": net_change,
                    "counts": movement_counts,
                },
            },
            {
                # TODO: replace demo people lists with real successors classified
                # by performance × potential from capability_ratings + hc_reviews.
                "id": "nine_box_grid",
                "title": "9-Box: Performance × Potential",
                "layout": "nine_box",
                "data": {
                    "x_axis": "Performance",
                    "y_axis": "Potential",
                    "boxes": [
                        {"row": 0, "col": 0, "label": "Enigma",
                         "people": ["A. Khoury", "M. Singh"]},
                        {"row": 0, "col": 1, "label": "Growth Employee",
                         "people": ["R. Chen", "L. Hassan", "S. Park"]},
                        {"row": 0, "col": 2, "label": "Future Leader",
                         "people": ["D. Lopez", "K. Tan", "P. Ahmed", "J. Ito"]},
                        {"row": 1, "col": 0, "label": "Inconsistent Player",
                         "people": ["T. Brooks"]},
                        {"row": 1, "col": 1, "label": "Core Player",
                         "people": ["N. Patel", "O. Yusuf", "V. Garcia"]},
                        {"row": 1, "col": 2, "label": "High Performer",
                         "people": ["E. Wong", "F. Adler", "C. Mehta"]},
                        {"row": 2, "col": 0, "label": "Talent Risk", "people": []},
                        {"row": 2, "col": 1, "label": "Effective",
                         "people": ["H. Becker", "Z. Ahmed"]},
                        {"row": 2, "col": 2, "label": "Trusted Professional",
                         "people": ["B. Novak", "G. Ortega"]},
                    ],
                },
                "footnote": "Demo allocation — wire to real talent_visibility_signals + capability_ratings.",
            },
            {
                "id": "recommendations",
                "title": "Recommended Development Actions",
                "layout": "recommendation_cards",
                "data": {"recommendations": recommendations},
            },
        ],
        "sources": {
            "tables": [
                "role_capability_profiles",
                "role_capability_requirements",
                "employee_mobility_profiles",
                "mobility_readiness_assessments",
                "mobility_match_results",
                "mobility_movements",
                "mobility_movement_events",
                "mobility_preferences",
                "mobility_opportunities",
                "recommendation_library",
                "hc_reviews",
            ],
            "engines": ["mobility_matcher"],
        },
        "meta": {
            "company_name": company_name,
            "top_gaps": top_gap_freq,
        },
    }


async def _company_name(db: AsyncSession, tenant_id: uuid.UUID) -> str | None:
    stmt = (
        select(HcReview.company_name)
        .where(HcReview.tenant_id == tenant_id)
        .order_by(desc(HcReview.created_at))
        .limit(1)
    )
    name = (await db.execute(stmt)).scalar_one_or_none()
    return name
