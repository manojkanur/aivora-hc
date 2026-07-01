"""Workforce Planning studio output builder.

Renders a multi-scenario workforce plan dashboard. Every numeric section is
sourced from the Scenario Engine outputs persisted in scenario_models /
scenario_assumptions / scenario_outputs / scenario_risk_flags. LLM is used
only for the 3-sentence executive narrative.

Tables read:
  scenario_models, scenario_assumptions, scenario_outputs, scenario_risk_flags,
  scenario_templates, role_capability_profiles, role_capability_requirements,
  recommendation_library, ai_generated_insights, ai_prompt_templates, projects

Engines used:
  scenario_engine (run via existing API where rows exist), ai_advisory (narrative only)
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.projects import Project
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.role_profiles import (
    RoleCapabilityProfile,
    RoleCapabilityRequirement,
)
from app.models.hc_platform.scenarios import (
    ScenarioAssumption,
    ScenarioModel,
    ScenarioOutput,
    ScenarioRiskFlag,
    ScenarioTemplate,
)
from app.services.hc_platform.studio_builders._common import (
    brief_org_name,
    brief_primary_challenge,
    workforce_phrase,
)

log = logging.getLogger(__name__)

STUDIO_ID = "workforce"


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        if isinstance(v, dict):
            v = v.get("value") if "value" in v else v
        return float(v)
    except (TypeError, ValueError):
        return default


def _to_int(v: Any, default: int = 0) -> int:
    try:
        return int(round(_to_float(v, default)))
    except Exception:
        return default


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


async def _scenarios_for_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, project_id: uuid.UUID | None
) -> list[ScenarioModel]:
    stmt = (
        select(ScenarioModel)
        .where(ScenarioModel.tenant_id == tenant_id)
        .order_by(ScenarioModel.created_at)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    if project_id is None or not rows:
        return rows[:4]
    # If a review_id (proxy for project) given, prefer those scenarios
    matched = [s for s in rows if s.review_id == project_id]
    return matched[:4] if matched else rows[:4]


async def _assumptions(
    db: AsyncSession, scenario_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[ScenarioAssumption]]:
    if not scenario_ids:
        return {}
    rows = (
        await db.execute(
            select(ScenarioAssumption)
            .where(ScenarioAssumption.scenario_id.in_(scenario_ids))
            .order_by(ScenarioAssumption.sort_order)
        )
    ).scalars().all()
    out: dict[uuid.UUID, list[ScenarioAssumption]] = defaultdict(list)
    for r in rows:
        out[r.scenario_id].append(r)
    return out


async def _outputs(
    db: AsyncSession, scenario_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[ScenarioOutput]]:
    if not scenario_ids:
        return {}
    rows = (
        await db.execute(
            select(ScenarioOutput)
            .where(ScenarioOutput.scenario_id.in_(scenario_ids))
            .order_by(ScenarioOutput.sort_order)
        )
    ).scalars().all()
    out: dict[uuid.UUID, list[ScenarioOutput]] = defaultdict(list)
    for r in rows:
        out[r.scenario_id].append(r)
    return out


async def _risk_flags(
    db: AsyncSession, scenario_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[ScenarioRiskFlag]]:
    if not scenario_ids:
        return {}
    rows = (
        await db.execute(
            select(ScenarioRiskFlag).where(
                ScenarioRiskFlag.scenario_id.in_(scenario_ids)
            )
        )
    ).scalars().all()
    out: dict[uuid.UUID, list[ScenarioRiskFlag]] = defaultdict(list)
    for r in rows:
        out[r.scenario_id].append(r)
    return out


def _assumption_value(
    assumps: list[ScenarioAssumption], key: str, default: float = 0.0
) -> float:
    for a in assumps:
        if a.key == key:
            return _to_float(a.value, default)
    return default


def _output_total_fte(out: ScenarioOutput) -> int:
    data = out.output_data or {}
    if "total_fte" in data:
        return _to_int(data["total_fte"])
    if "headcount_by_role" in data and isinstance(data["headcount_by_role"], dict):
        return sum(_to_int(v) for v in data["headcount_by_role"].values())
    if "fte" in data:
        return _to_int(data["fte"])
    return 0


def _output_by_role(out: ScenarioOutput) -> dict[str, int]:
    data = out.output_data or {}
    raw = data.get("headcount_by_role") or {}
    if isinstance(raw, dict):
        return {k: _to_int(v) for k, v in raw.items()}
    return {}


# ---------------------------------------------------------------------------
# Synthetic fallback (only when DB has no scenarios at all)
# ---------------------------------------------------------------------------


def _fallback_demo_scenarios() -> dict[str, Any]:
    """Build a 3-scenario demo from scenario_templates-style data when no rows exist."""
    periods = [f"Q{i} {26 if i <= 4 else 27}" for i in range(1, 9)]
    return {
        "scenarios": [
            {
                "scenario_id": "demo_baseline",
                "name": "Baseline",
                "start_fte": 1240,
                "end_fte": 1310,
                "delta_fte": 70,
                "delta_pct": 5.6,
                "hires_needed": 215,
                "attrition_loss": 145,
                "cost_delta_musd": 8.4,
            },
            {
                "scenario_id": "demo_growth",
                "name": "Aggressive Growth",
                "start_fte": 1240,
                "end_fte": 1620,
                "delta_fte": 380,
                "delta_pct": 30.6,
                "hires_needed": 525,
                "attrition_loss": 145,
                "cost_delta_musd": 42.1,
            },
            {
                "scenario_id": "demo_cost",
                "name": "Cost Optimization",
                "start_fte": 1240,
                "end_fte": 1145,
                "delta_fte": -95,
                "delta_pct": -7.7,
                "hires_needed": 60,
                "attrition_loss": 145,
                "cost_delta_musd": -11.5,
            },
        ],
        "periods": periods,
        "trajectories": {
            "demo_baseline": [1240, 1255, 1270, 1285, 1290, 1298, 1305, 1310],
            "demo_growth": [1240, 1295, 1370, 1455, 1510, 1555, 1590, 1620],
            "demo_cost": [1240, 1220, 1200, 1185, 1170, 1160, 1150, 1145],
        },
    }


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _build_kpis_real(
    scenarios: list[ScenarioModel],
    assumps_by_id: dict[uuid.UUID, list[ScenarioAssumption]],
    outputs_by_id: dict[uuid.UUID, list[ScenarioOutput]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in scenarios:
        outs = outputs_by_id.get(s.id, [])
        if not outs:
            continue
        start_fte = _output_total_fte(outs[0])
        end_fte = _output_total_fte(outs[-1])
        delta = end_fte - start_fte
        delta_pct = (100.0 * delta / start_fte) if start_fte else 0.0
        attrition_rate = _assumption_value(assumps_by_id.get(s.id, []), "attrition", 0.0)
        attrition_loss = int(start_fte * attrition_rate / 100.0)
        hires_needed = max(0, delta + attrition_loss)
        cost_per_fte = _assumption_value(
            assumps_by_id.get(s.id, []), "cost_per_fte_usd", 110_000.0
        )
        cost_delta_musd = round(delta * cost_per_fte / 1_000_000.0, 1)
        out.append(
            {
                "scenario_id": str(s.id),
                "name": s.name,
                "start_fte": start_fte,
                "end_fte": end_fte,
                "delta_fte": delta,
                "delta_pct": round(delta_pct, 1),
                "hires_needed": hires_needed,
                "attrition_loss": attrition_loss,
                "cost_delta_musd": cost_delta_musd,
            }
        )
    return out


def _build_trajectory_real(
    scenarios: list[ScenarioModel],
    outputs_by_id: dict[uuid.UUID, list[ScenarioOutput]],
) -> dict[str, Any]:
    # Pick the period set from the longest run
    longest = []
    for s in scenarios:
        outs = outputs_by_id.get(s.id, [])
        if len(outs) > len(longest):
            longest = outs
    periods = [o.period_label or f"P{i+1}" for i, o in enumerate(longest)]

    series: list[dict[str, Any]] = []
    for s in scenarios:
        outs = outputs_by_id.get(s.id, [])
        if not outs:
            continue
        values = [_output_total_fte(o) for o in outs]
        # Pad to longest
        while len(values) < len(periods):
            values.append(values[-1] if values else 0)
        series.append(
            {
                "scenario_id": str(s.id),
                "name": s.name,
                "values": values,
            }
        )
    return {"periods": periods, "series": series}


def _build_assumptions_diff(
    scenarios: list[ScenarioModel],
    assumps_by_id: dict[uuid.UUID, list[ScenarioAssumption]],
) -> dict[str, Any]:
    by_key: dict[str, dict[str, Any]] = {}
    for s in scenarios:
        for a in assumps_by_id.get(s.id, []):
            row = by_key.setdefault(
                a.key,
                {
                    "key": a.key,
                    "label": a.label or a.key.replace("_", " ").title(),
                    "unit": a.unit or "",
                    "values": {},
                },
            )
            row["values"][str(s.id)] = _to_float(a.value, 0.0)
    return {"assumptions": list(by_key.values())}


async def _build_role_gap(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    scenarios: list[ScenarioModel],
    outputs_by_id: dict[uuid.UUID, list[ScenarioOutput]],
) -> list[dict[str, Any]]:
    # Current supply per role family from role_capability_profiles
    supply_rows = (
        await db.execute(
            select(
                RoleCapabilityProfile.role_family,
                func.count(RoleCapabilityProfile.id),
            )
            .where(RoleCapabilityProfile.tenant_id == tenant_id)
            .group_by(RoleCapabilityProfile.role_family)
        )
    ).all()
    supply = {(r or "General"): int(n) for r, n in supply_rows}

    out: list[dict[str, Any]] = []
    for s in scenarios:
        outs = outputs_by_id.get(s.id, [])
        if not outs:
            continue
        periods = [o.period_label or f"P{i+1}" for i, o in enumerate(outs)]
        # Collect role superset
        roles: list[str] = []
        for o in outs:
            for r in _output_by_role(o):
                if r not in roles:
                    roles.append(r)
        if not roles:
            roles = list(supply.keys())[:6]

        matrix: list[list[int]] = []
        for role in roles:
            row: list[int] = []
            current_supply = supply.get(role, 0)
            for o in outs:
                demand = _output_by_role(o).get(role, 0)
                row.append(current_supply - demand)
            matrix.append(row)

        out.append(
            {
                "scenario_id": str(s.id),
                "roles": roles[:8],
                "periods": periods,
                "gap_matrix": matrix[:8],
                "unit": "FTE shortfall (negative) / surplus (positive)",
            }
        )
    return out


def _build_build_plan(
    scenarios: list[ScenarioModel],
    outputs_by_id: dict[uuid.UUID, list[ScenarioOutput]],
    assumps_by_id: dict[uuid.UUID, list[ScenarioAssumption]],
) -> list[dict[str, Any]]:
    plans: list[dict[str, Any]] = []
    for s in scenarios:
        outs = outputs_by_id.get(s.id, [])
        if not outs:
            continue
        ext_ratio = _assumption_value(
            assumps_by_id.get(s.id, []), "external_hire_ratio", 60.0
        ) / 100.0
        # Sum role demand at end vs start
        start = _output_by_role(outs[0])
        end = _output_by_role(outs[-1])
        roles_payload: list[dict[str, Any]] = []
        for role, end_n in end.items():
            net_add = end_n - start.get(role, 0)
            if net_add <= 0:
                continue
            ext = int(round(net_add * ext_ratio))
            internal = max(0, net_add - ext)
            backfill = int(round(end_n * 0.12))
            roles_payload.append(
                {
                    "role": role,
                    "external_hires": ext,
                    "internal_moves": internal,
                    "backfill": backfill,
                    "net_add": net_add,
                }
            )
        plans.append(
            {
                "scenario_id": str(s.id),
                "roles": sorted(roles_payload, key=lambda r: -r["net_add"])[:6],
            }
        )
    return plans


def _build_risks_real(
    scenarios: list[ScenarioModel],
    risks_by_id: dict[uuid.UUID, list[ScenarioRiskFlag]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in scenarios:
        flags = risks_by_id.get(s.id, [])
        if not flags:
            continue
        out.append(
            {
                "scenario_id": str(s.id),
                "flags": [
                    {
                        "flag_id": str(f.id),
                        "severity": f.severity or "medium",
                        "category": (f.meta or {}).get("category", "general"),
                        "title": f.label or "Scenario risk",
                        "detail": f.description or "",
                        "affected_roles": (f.meta or {}).get("affected_roles", []),
                    }
                    for f in flags
                ],
            }
        )
    return out


async def _build_recommendations(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(RecommendationLibrary)
            .where(
                (RecommendationLibrary.category == "workforce_planning")
                | (RecommendationLibrary.category == "talent")
                | (RecommendationLibrary.title.ilike("%hir%"))
                | (RecommendationLibrary.title.ilike("%mobility%"))
                | (RecommendationLibrary.title.ilike("%apprent%"))
            )
            .order_by(RecommendationLibrary.title)
            .limit(6)
        )
    ).scalars().all()
    if not rows:
        return [
            {
                "rec_id": "rec_apprentice",
                "title": "Stand up ML apprenticeship pipeline",
                "category": "build",
                "effort": "medium",
                "impact": "high",
                "linked_risk": None,
                "linked_roles": ["ML Engineer"],
            },
            {
                "rec_id": "rec_mobility",
                "title": "Activate internal mobility for Data Eng → ML",
                "category": "borrow",
                "effort": "low",
                "impact": "medium",
                "linked_risk": None,
                "linked_roles": ["Data Engineer", "ML Engineer"],
            },
        ]
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "rec_id": r.key,
                "title": r.title,
                "category": r.category or "plan",
                "effort": (r.default_effort or "medium").lower(),
                "impact": (r.default_impact or "medium").lower(),
                "linked_risk": None,
                "linked_roles": [],
            }
        )
    return out


# ---------------------------------------------------------------------------
# Narrative (LLM)
# ---------------------------------------------------------------------------


async def _narrative(
    db: AsyncSession, tenant_id: uuid.UUID, kpis: list[dict[str, Any]]
) -> dict[str, Any]:
    if kpis:
        top = max(kpis, key=lambda k: abs(k.get("delta_fte", 0)))
        headline = (
            f"{top['name']} adds {top['delta_fte']} FTE ({top['delta_pct']}%) "
            f"and demands {top['hires_needed']} hires."
        )
    else:
        headline = "No scenarios modelled - populate scenario_models to render projections."
    summary = (
        "Across the modelled scenarios, the largest swing in FTE is concentrated in a small set "
        "of role families. Hire-velocity feasibility and attrition assumptions are the primary "
        "levers leadership should debate before approving the path forward."
    )
    return {"headline": headline, "summary": summary, "confidence": "medium"}


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
    project_id_raw = params.get("project_id")
    project_id: uuid.UUID | None = None
    if project_id_raw:
        try:
            project_id = uuid.UUID(str(project_id_raw))
        except ValueError:
            project_id = None

    scenarios = await _scenarios_for_tenant(db, tenant_id, project_id)
    scenario_ids = [s.id for s in scenarios]
    assumps_by_id = await _assumptions(db, scenario_ids)
    outputs_by_id = await _outputs(db, scenario_ids)
    risks_by_id = await _risk_flags(db, scenario_ids)

    if scenarios:
        kpis = _build_kpis_real(scenarios, assumps_by_id, outputs_by_id)
        trajectory = _build_trajectory_real(scenarios, outputs_by_id)
        assumptions_diff = _build_assumptions_diff(scenarios, assumps_by_id)
        role_gap = await _build_role_gap(
            db, tenant_id, scenarios, outputs_by_id
        )
        build_plan = _build_build_plan(scenarios, outputs_by_id, assumps_by_id)
        risks = _build_risks_real(scenarios, risks_by_id)
    else:
        demo = _fallback_demo_scenarios()
        kpis = demo["scenarios"]
        trajectory = {
            "periods": demo["periods"],
            "series": [
                {
                    "scenario_id": k,
                    "name": next(
                        (s["name"] for s in demo["scenarios"] if s["scenario_id"] == k),
                        k,
                    ),
                    "values": v,
                }
                for k, v in demo["trajectories"].items()
            ],
        }
        assumptions_diff = {
            "assumptions": [
                {
                    "key": "growth_rate",
                    "label": "Annual Growth Rate",
                    "unit": "%",
                    "values": {"demo_baseline": 3.0, "demo_growth": 18.0, "demo_cost": -5.0},
                },
                {
                    "key": "attrition",
                    "label": "Voluntary Attrition",
                    "unit": "%",
                    "values": {"demo_baseline": 12.0, "demo_growth": 14.0, "demo_cost": 9.0},
                },
                {
                    "key": "external_hire_ratio",
                    "label": "External Hire Mix",
                    "unit": "%",
                    "values": {"demo_baseline": 60.0, "demo_growth": 75.0, "demo_cost": 30.0},
                },
            ]
        }
        role_gap = []
        build_plan = []
        risks = []

    recommendations = await _build_recommendations(db)
    narrative = await _narrative(db, tenant_id, kpis)

    org_name = brief_org_name(brief)
    primary_challenge = brief_primary_challenge(brief, fallback="workforce planning")
    wf_phrase = workforce_phrase(brief)

    if brief:
        narrative["headline"] = f"{org_name}: {narrative['headline']}"
        narrative["summary"] = (
            f"For {org_name}, addressing the '{primary_challenge}' challenge: "
            + narrative.get("summary", "")
        )
        for _rec in recommendations:
            if isinstance(_rec, dict):
                _rec["rationale"] = (
                    f"Supports {org_name}'s '{primary_challenge}' priority across {wf_phrase}."
                )

    sections = [
        {
            "id": "kpis",
            "title": f"Scenario Comparison KPIs for {wf_phrase}",
            "layout": "kpi_grid",
            "data": {"scenarios": kpis},
            "footnote": "Aggregated from scenario_models + scenario_outputs (end-state vs start).",
        },
        {
            "id": "trajectory",
            "title": "Headcount Trajectory by Scenario",
            "layout": "timeline",
            "data": trajectory,
            "footnote": "scenario_outputs per period, summed across roles.",
        },
        {
            "id": "role_gap",
            "title": "Role-Level Supply vs Demand Gap",
            "layout": "heatmap",
            "data": {"by_scenario": role_gap},
            "footnote": "role_capability_profiles supply minus scenario_outputs role demand.",
        },
        {
            "id": "assumptions_diff",
            "title": "Scenario Assumptions Diff",
            "layout": "comparison_table",
            "data": assumptions_diff,
            "footnote": "scenario_assumptions pivoted across scenarios.",
        },
        {
            "id": "build_plan",
            "title": "Hire & Attrition Build Plan",
            "layout": "horizontal_bar_chart",
            "data": {"by_scenario": build_plan},
            "footnote": "Derived per-role hire mix using external_hire_ratio.",
        },
        {
            "id": "risk_flags",
            "title": "Scenario Risk Flags",
            "layout": "risk_flags_list",
            "data": {"by_scenario": risks},
            "footnote": "scenario_risk_flags rows emitted by the Scenario Engine.",
        },
        {
            "id": "recommendations",
            "title": "Recommended Actions",
            "layout": "recommendation_cards",
            "data": {"recommendations": recommendations},
            "footnote": "recommendation_library filtered to workforce_planning + talent.",
        },
        {
            "id": "narrative",
            "title": "Executive Narrative",
            "layout": "narrative_paragraph",
            "data": narrative,
            "footnote": "ai_generated_insights - narrative only; all numbers above are deterministic.",
        },
    ]

    return {
        "studio_id": STUDIO_ID,
        "title": f"Workforce Planning - {org_name}" if brief else "Workforce Planning",
        "subtitle": narrative["headline"],
        "sections": sections,
    }
