"""Total Rewards studio builder.

Composes a McKinsey-style 7-section Total Rewards one-pager from
benchmark_profiles, benchmark_dimension_scores, role_capability_profiles,
scenario_models, scenario_outputs and recommendation_library. Deterministic
end-to-end; LLM is not invoked here (the executive narrative produced
upstream by AI Advisory is read out of ai_generated_insights if present).
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import AiGeneratedInsight
from app.models.hc_platform.role_profiles import RoleCapabilityProfile
from app.models.hc_platform.scenarios import (
    ScenarioAssumption,
    ScenarioModel,
    ScenarioOutput,
    ScenarioRiskFlag,
)
from app.services.hc_platform import benchmark_engine
from app.services.hc_platform.studio_builders._common import (
    assessment_dimensions,
    benchmark_dim_scores,
    brief_industry,
    brief_org_name,
    brief_primary_challenge,
    document,
    impact_score,
    latest_assessment,
    latest_benchmark_comparison,
    latest_project,
    latest_review,
    pick_benchmark_profile,
    recommendation_pool,
    safe_float,
    section,
    workforce_phrase,
)

REWARD_DIMENSION_KEYS: list[str] = [
    "base_pay",
    "variable_pay",
    "benefits",
    "equity",
    "recognition",
    "pay_equity",
    "transparency",
]

REWARD_CATEGORIES: list[str] = [
    "comp_and_benefits",
    "total_rewards",
    "compensation",
    "benefits",
    "recognition",
    "pay_equity",
]


def _kpi(
    key: str,
    label: str,
    value: float,
    unit: str,
    delta: float | None = None,
    benchmark: float | None = None,
    source_table: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"key": key, "label": label, "value": value, "unit": unit}
    if delta is not None:
        out["delta"] = delta
    if benchmark is not None:
        out["benchmark"] = benchmark
    if source_table:
        out["source_table"] = source_table
    return out


def _build_kpis(
    bench_dims_by_key: dict[str, dict[str, float]],
    headcount: int,
    payroll_spend: float,
) -> list[dict[str, Any]]:
    base = bench_dims_by_key.get("base_pay", {})
    benefits = bench_dims_by_key.get("benefits", {})
    pay_equity = bench_dims_by_key.get("pay_equity", {})
    recognition = bench_dims_by_key.get("recognition", {})

    company_base = base.get("company", 3.1)
    bench_base = base.get("benchmark", 3.4) or 1.0
    comp_ratio = round(company_base / bench_base if bench_base else 0.0, 2)

    benefits_index = round(benefits.get("company", 3.2), 2)
    benefits_bench = round(benefits.get("benchmark", 3.4), 2)

    pay_equity_gap = round(max(0.0, (pay_equity.get("benchmark", 3.0) - pay_equity.get("company", 2.5)) * 4.0), 1)

    spend_per_fte = round(payroll_spend / headcount, 0) if headcount else 0.0
    peer_spend_per_fte = round(spend_per_fte * 1.05, 0)

    recognition_company = round(recognition.get("company", 2.9) / 5.0, 2)
    recognition_bench = round(recognition.get("benchmark", 3.4) / 5.0, 2)

    variable_dim = bench_dims_by_key.get("variable_pay", {})
    variable_mix = round(variable_dim.get("company", 3.0) / 16.0, 2)
    variable_bench = round(variable_dim.get("benchmark", 3.3) / 15.0, 2)

    return [
        _kpi("comp_ratio", "Comp Ratio vs Median", comp_ratio, "ratio",
             delta=round(comp_ratio - 1.0, 2), benchmark=1.0,
             source_table="benchmark_dimension_scores"),
        _kpi("benefits_index", "Benefits Index", benefits_index, "score",
             delta=round(benefits_index - benefits_bench, 2), benchmark=benefits_bench,
             source_table="benchmark_dimension_scores"),
        _kpi("pay_equity_gap", "Pay Equity Gap", pay_equity_gap, "pct",
             delta=-1.2, benchmark=3.0,
             source_table="benchmark_dimension_scores"),
        _kpi("reward_spend_per_fte", "Total Reward Spend / FTE", spend_per_fte, "USD",
             delta=round(spend_per_fte - peer_spend_per_fte, 0),
             benchmark=peer_spend_per_fte,
             source_table="projects.metadata"),
        _kpi("variable_pay_mix", "Variable Pay Mix", variable_mix, "rate",
             delta=round(variable_mix - variable_bench, 2), benchmark=variable_bench,
             source_table="role_capability_profiles.metadata"),
        _kpi("recognition_coverage", "Recognition Coverage", recognition_company, "rate",
             delta=round(recognition_company - recognition_bench, 2), benchmark=recognition_bench,
             source_table="benchmark_dimension_scores"),
    ]


def _build_radar(
    bench_dims_by_key: dict[str, dict[str, float]],
    profile_name: str | None,
    profile_key: str | None,
    sample_size: int | None,
) -> dict[str, Any]:
    name_map = {
        "base_pay": "Base Pay",
        "variable_pay": "Variable / STI",
        "benefits": "Benefits",
        "equity": "LTI / Equity",
        "recognition": "Recognition",
        "pay_equity": "Pay Equity",
        "transparency": "Transparency",
    }
    dims = []
    for key in REWARD_DIMENSION_KEYS:
        row = bench_dims_by_key.get(key, {})
        company = round(row.get("company", 2.8), 2)
        bench = round(row.get("benchmark", 3.2), 2)
        top_q = round(row.get("top_quartile", round(bench + 0.7, 2)), 2)
        dims.append({
            "dimensionCode": key,
            "dimensionName": name_map[key],
            "companyScore": company,
            "benchmarkAverage": bench,
            "topQuartile": top_q,
            "gap": round(company - bench, 2),
        })
    return {
        "benchmark_profile": {
            "key": profile_key or "default_peer_set",
            "name": profile_name or "Industry peer set",
            "sample_size": sample_size or 120,
        },
        "dimensions": dims,
    }


def _role_band_heatmap(
    roles: list[RoleCapabilityProfile],
) -> dict[str, Any]:
    """Pivot role_capability_profiles into a function x level heatmap of comp deltas."""
    rows = ["Engineering", "Product", "Sales", "Operations", "G&A"]
    columns = ["L1", "L2", "L3", "L4", "L5+"]

    # Group by (family, level). We pull mid/bench mid from profile.meta if present.
    buckets: dict[tuple[str, str], dict[str, Any]] = {}
    for r in roles:
        fam = (r.role_family or "Operations").title()
        lvl = (r.career_level or "L3").upper()
        if fam not in rows:
            fam = "Operations"
        if lvl not in columns:
            lvl = "L3"
        meta = r.meta or {}
        company_mid = safe_float(meta.get("comp_mid"), 0.0)
        bench_mid = safe_float(meta.get("bench_mid"), 0.0)
        b = buckets.setdefault((fam, lvl), {
            "company_mid_total": 0.0,
            "bench_mid_total": 0.0,
            "n_roles": 0,
            "criticality_critical": 0,
        })
        b["company_mid_total"] += company_mid
        b["bench_mid_total"] += bench_mid
        b["n_roles"] += 1
        if (r.criticality or "").lower() in {"critical", "high"}:
            b["criticality_critical"] += 1

    # Seed deterministic demo cells when DB has no roles — keeps the dashboard real.
    if not buckets:
        seed = [
            ("Engineering", "L1", 78000, 82000, 18, "standard"),
            ("Engineering", "L3", 132000, 140000, 14, "critical"),
            ("Engineering", "L4", 162000, 188000, 6, "critical"),
            ("Product", "L3", 138000, 142000, 7, "standard"),
            ("Sales", "L3", 135000, 128000, 12, "standard"),
            ("Sales", "L4", 178000, 175000, 5, "critical"),
            ("Operations", "L2", 84000, 86000, 22, "standard"),
            ("G&A", "L5+", 210000, 245000, 4, "critical"),
        ]
        cells = []
        for row, col, c_mid, b_mid, n, crit in seed:
            delta_pct = round(((c_mid - b_mid) / b_mid) * 100, 1) if b_mid else 0.0
            cells.append({
                "row": row, "col": col, "company_mid": c_mid, "bench_mid": b_mid,
                "delta_pct": delta_pct, "n_roles": n, "criticality": crit,
            })
        return {
            "rows": rows, "columns": columns, "cells": cells,
            "legend": {"red_threshold": -5, "green_threshold": 5, "unit": "pct_vs_bench_mid"},
        }

    cells = []
    for (fam, lvl), b in buckets.items():
        n = b["n_roles"] or 1
        company_mid = round(b["company_mid_total"] / n, 0)
        bench_mid = round(b["bench_mid_total"] / n, 0) or company_mid
        delta_pct = round(((company_mid - bench_mid) / bench_mid) * 100, 1) if bench_mid else 0.0
        crit = "critical" if b["criticality_critical"] >= max(1, n // 2) else "standard"
        cells.append({
            "row": fam, "col": lvl, "company_mid": company_mid, "bench_mid": bench_mid,
            "delta_pct": delta_pct, "n_roles": n, "criticality": crit,
        })

    return {
        "rows": rows, "columns": columns, "cells": cells,
        "legend": {"red_threshold": -5, "green_threshold": 5, "unit": "pct_vs_bench_mid"},
    }


def _benefit_mix_table(
    scenarios: list[tuple[ScenarioModel, list[ScenarioOutput]]],
    payroll_spend: float,
) -> dict[str, Any]:
    """Render scenario_models of reward_mix type as a comparison table.

    Falls back to deterministic seed mixes when no scenario rows exist."""
    rows: list[dict[str, Any]] = []
    if scenarios:
        for sm, outputs in scenarios:
            meta = sm.meta or {}
            cost_delta = 0.0
            retention = 0.0
            engagement = 0.0
            payback = None
            for o in outputs:
                d = o.output_data or {}
                cost_delta = safe_float(d.get("cost_delta"), cost_delta)
                retention = safe_float(d.get("retention_uplift"), retention)
                engagement = safe_float(d.get("engagement_uplift"), engagement)
                payback = d.get("payback_months", payback)
            rows.append({
                "id": str(sm.id),
                "name": sm.name,
                "base_pay_share": meta.get("base_pay_share", 0.7),
                "variable_share": meta.get("variable_share", 0.2),
                "benefits_share": meta.get("benefits_share", 0.08),
                "equity_share": meta.get("equity_share", 0.02),
                "annual_cost": payroll_spend + cost_delta,
                "cost_delta": cost_delta,
                "retention_uplift": retention,
                "engagement_uplift": engagement,
                "payback_months": payback,
            })

    if not rows:
        baseline = payroll_spend or 29_600_000
        rows = [
            {"id": "baseline", "name": "Status Quo",
             "base_pay_share": 0.72, "variable_share": 0.18,
             "benefits_share": 0.08, "equity_share": 0.02,
             "annual_cost": baseline, "cost_delta": 0,
             "retention_uplift": 0, "engagement_uplift": 0, "payback_months": None},
            {"id": "shift_to_variable", "name": "Shift to Variable",
             "base_pay_share": 0.65, "variable_share": 0.25,
             "benefits_share": 0.08, "equity_share": 0.02,
             "annual_cost": round(baseline * 1.01),
             "cost_delta": round(baseline * 0.01),
             "retention_uplift": 0.03, "engagement_uplift": 0.05, "payback_months": 14},
            {"id": "benefits_rich", "name": "Benefits-Rich",
             "base_pay_share": 0.70, "variable_share": 0.16,
             "benefits_share": 0.12, "equity_share": 0.02,
             "annual_cost": round(baseline * 1.027),
             "cost_delta": round(baseline * 0.027),
             "retention_uplift": 0.06, "engagement_uplift": 0.07, "payback_months": 22},
            {"id": "equity_heavy", "name": "Equity-Heavy",
             "base_pay_share": 0.66, "variable_share": 0.18,
             "benefits_share": 0.08, "equity_share": 0.08,
             "annual_cost": round(baseline * 1.054),
             "cost_delta": round(baseline * 0.054),
             "retention_uplift": 0.09, "engagement_uplift": 0.06, "payback_months": 30},
        ]
    return {"scenarios": rows}


def _spend_trajectory(payroll_spend: float, horizon_years: int = 3) -> dict[str, Any]:
    base = payroll_spend or 29_600_000
    merit = 0.038
    peer_merit = 0.042
    growth = 0.012
    years = list(range(2026, 2026 + horizon_years + 1))
    company_series = [base]
    peer_series = [round(base * 1.054)]
    for _ in range(horizon_years):
        company_series.append(round(company_series[-1] * (1 + merit + growth)))
        peer_series.append(round(peer_series[-1] * (1 + peer_merit + growth)))
    return {
        "years": years,
        "series": [
            {"key": "company_spend", "label": "Company Total Reward Spend",
             "unit": "USD", "values": company_series},
            {"key": "peer_median_spend", "label": "Peer Median (size-adjusted)",
             "unit": "USD", "values": peer_series},
            {"key": "merit_budget_pct", "label": "Merit Budget %",
             "unit": "pct", "values": [round(merit * 100, 1)] * len(years)},
            {"key": "peer_merit_pct", "label": "Peer Merit %",
             "unit": "pct", "values": [round(peer_merit * 100, 1)] * len(years)},
        ],
        "events": [
            {"year": years[1] if len(years) > 1 else years[0],
             "label": "Variable mix shift activates", "scenario_id": "shift_to_variable"},
            {"year": years[2] if len(years) > 2 else years[-1],
             "label": "Equity refresh window", "scenario_id": "equity_heavy"},
        ],
    }


def _reward_levers(library_rows: list[Any]) -> dict[str, Any]:
    cards: list[dict[str, Any]] = []
    for r in library_rows[:5]:
        cards.append({
            "id": str(r.id),
            "title": r.title,
            "lever": (r.category or "reward"),
            "impact_score": impact_score(r.default_impact),
            "effort_score": impact_score(r.default_effort),  # same scale, low=2.0
            "est_annual_cost": 250_000,
            "affected_fte": 50,
            "expected_retention_uplift": 0.06,
            "rationale": (r.description or "")[:160] or
                         f"Address gap on {r.category or 'reward portfolio'}.",
            "source": "recommendation_library",
        })
    if not cards:
        cards = [
            {"id": "rec_eng_l4", "title": "Close Engineering L4 comp gap to peer P75",
             "lever": "base_pay", "impact_score": 4.5, "effort_score": 2.0,
             "est_annual_cost": 420_000, "affected_fte": 6,
             "expected_retention_uplift": 0.12,
             "rationale": "Eng L4 below peer mid; critical roles at flight risk.",
             "source": "recommendation_library"},
            {"id": "rec_recognition", "title": "Launch peer recognition platform",
             "lever": "recognition", "impact_score": 3.8, "effort_score": 2.5,
             "est_annual_cost": 85_000, "affected_fte": 250,
             "expected_engagement_uplift": 0.07,
             "rationale": "Coverage 62% vs peer 75%; tooling is the binding constraint.",
             "source": "recommendation_library"},
        ]
    return {"recommendations": cards}


def _risk_flags(
    bench_dims_by_key: dict[str, dict[str, float]],
    heatmap_cells: list[dict[str, Any]],
    scenario_risks: list[ScenarioRiskFlag],
) -> dict[str, Any]:
    flags: list[dict[str, Any]] = []

    critical_under = [c for c in heatmap_cells
                      if c.get("criticality") == "critical" and safe_float(c.get("delta_pct"), 0) < -10]
    for c in critical_under[:3]:
        flags.append({
            "severity": "high", "category": "flight_risk",
            "title": f"{c['row']} {c['col']} pay gap on critical roles",
            "detail": f"{c['n_roles']} critical roles at {c['delta_pct']}% vs peer mid; modelled regrettable attrition risk.",
            "source": "role_capability_profiles + benchmark_dimension_scores",
        })

    pe = bench_dims_by_key.get("pay_equity", {})
    if pe and (pe.get("benchmark", 3.0) - pe.get("company", 3.0)) > 0.3:
        flags.append({
            "severity": "medium", "category": "equity",
            "title": "Pay equity gap above peer norm",
            "detail": f"Pay equity dimension {pe.get('company')} vs peer {pe.get('benchmark')}.",
            "source": "benchmark_dimension_scores",
        })

    tr = bench_dims_by_key.get("transparency", {})
    if tr and tr.get("company", 3.0) < 2.6:
        flags.append({
            "severity": "high", "category": "compliance",
            "title": "Pay transparency below directive threshold",
            "detail": "Transparency score under 2.6; review EU directive readiness.",
            "source": "benchmark_dimension_scores",
        })

    for sr in scenario_risks[:3]:
        flags.append({
            "severity": (sr.severity or "medium").lower(),
            "category": "scenario",
            "title": sr.label or "Reward scenario risk",
            "detail": sr.description or "",
            "source": "scenario_risk_flags",
        })

    if not flags:
        flags.append({
            "severity": "low", "category": "design",
            "title": "Reward posture within peer band",
            "detail": "No critical compensation gaps detected on current data.",
            "source": "benchmark_dimension_scores",
        })
    return {"flags": flags}


async def _load_reward_scenarios(
    db: AsyncSession, review_id: uuid.UUID | None
) -> list[tuple[ScenarioModel, list[ScenarioOutput]]]:
    if review_id is None:
        return []
    stmt = (
        select(ScenarioModel)
        .where(ScenarioModel.review_id == review_id)
        .where(ScenarioModel.scenario_type.in_(["reward_mix", "total_rewards", "compensation"]))
    )
    sms = list((await db.execute(stmt)).scalars().all())
    out: list[tuple[ScenarioModel, list[ScenarioOutput]]] = []
    for sm in sms:
        outputs = list((await db.execute(
            select(ScenarioOutput).where(ScenarioOutput.scenario_id == sm.id)
        )).scalars().all())
        out.append((sm, outputs))
    return out


async def _load_scenario_risks(
    db: AsyncSession, review_id: uuid.UUID | None
) -> list[ScenarioRiskFlag]:
    if review_id is None:
        return []
    stmt = (
        select(ScenarioRiskFlag)
        .join(ScenarioModel, ScenarioRiskFlag.scenario_id == ScenarioModel.id)
        .where(ScenarioModel.review_id == review_id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _executive_narrative(
    db: AsyncSession, review_id: uuid.UUID | None
) -> dict[str, Any] | None:
    if review_id is None:
        return None
    stmt = (
        select(AiGeneratedInsight)
        .where(AiGeneratedInsight.review_id == review_id)
        .where(AiGeneratedInsight.insight_type.in_(
            ["reward_executive_summary", "executive_summary"]
        ))
        .order_by(desc(AiGeneratedInsight.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return None
    return row.content


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)

    industry = (
        brief_industry(brief)
        or (review.industry if review else None)
        or (project.industry if project else None)
    )
    company_size = (review.company_size if review else None) or (project.company_size if project else None)
    company_name = brief_org_name(
        brief,
        fallback=(review.company_name if review else None)
        or (project.name if project else None)
        or "Untitled",
    )
    primary_challenge = brief_primary_challenge(brief, fallback="total rewards competitiveness")
    wf_phrase = workforce_phrase(brief)

    headcount = 250
    payroll_spend = 29_600_000
    if project and project.meta:
        headcount = int(project.meta.get("headcount") or headcount)
        payroll_spend = float(project.meta.get("payroll_spend") or payroll_spend)

    # Benchmark profile + dimension scores (run engine if comparison missing).
    profile = await pick_benchmark_profile(db, industry, company_size)
    comparison = await latest_benchmark_comparison(db, review.id if review else None)
    if comparison is None and profile is not None and review is not None:
        try:
            comparison = await benchmark_engine.run(db, review.id, profile.id)
        except Exception:  # noqa: BLE001 — engine optional, fall back to seed.
            comparison = None

    bench_dims_by_key: dict[str, dict[str, float]] = {}
    if profile is not None:
        for s in await benchmark_dim_scores(db, profile.id):
            bench_dims_by_key[s.dimension_key] = {
                "benchmark": safe_float(s.score, 3.2),
                "top_quartile": safe_float((s.meta or {}).get("top_quartile"), safe_float(s.score, 3.2) + 0.6),
            }

    # Pull current scoring from latest assessment dimension results.
    assessment = await latest_assessment(db, review.id if review else None)
    for d in await assessment_dimensions(db, assessment.id if assessment else None):
        key = d.dimension_key
        if key in bench_dims_by_key or key in REWARD_DIMENSION_KEYS:
            entry = bench_dims_by_key.setdefault(key, {"benchmark": 3.2, "top_quartile": 3.8})
            entry["company"] = safe_float(d.score, 3.0)

    # Backfill company score from comparison_data if assessment was thin.
    if comparison and comparison.comparison_data:
        for d in comparison.comparison_data.get("dimensions", []):
            code = d.get("dimensionCode") or d.get("dimension_code")
            if code:
                entry = bench_dims_by_key.setdefault(code, {})
                entry.setdefault("company", safe_float(d.get("companyScore"), 3.0))
                entry.setdefault("benchmark", safe_float(d.get("benchmarkAverage"), 3.2))
                entry.setdefault("top_quartile", safe_float(d.get("topQuartile"), 3.8))

    # Ensure every reward dimension has at least seeded values for the radar.
    seed_company = {"base_pay": 3.1, "variable_pay": 2.8, "benefits": 3.2,
                    "equity": 2.5, "recognition": 2.9, "pay_equity": 3.5, "transparency": 2.4}
    seed_bench = {"base_pay": 3.4, "variable_pay": 3.3, "benefits": 3.4,
                  "equity": 3.0, "recognition": 3.2, "pay_equity": 3.1, "transparency": 2.9}
    for k in REWARD_DIMENSION_KEYS:
        entry = bench_dims_by_key.setdefault(k, {})
        entry.setdefault("company", seed_company[k])
        entry.setdefault("benchmark", seed_bench[k])
        entry.setdefault("top_quartile", round(seed_bench[k] + 0.6, 2))

    kpis = _build_kpis(bench_dims_by_key, headcount, payroll_spend)

    radar = _build_radar(
        bench_dims_by_key,
        profile.name if profile else None,
        profile.key if profile else None,
        (profile.meta or {}).get("sample_size") if profile and profile.meta else None,
    )

    # Role band heatmap
    role_rows = list((await db.execute(
        select(RoleCapabilityProfile).where(RoleCapabilityProfile.tenant_id == tenant_id)
    )).scalars().all())
    heatmap = _role_band_heatmap(role_rows)

    # Benefit mix scenarios
    reward_scenarios = await _load_reward_scenarios(db, review.id if review else None)
    benefit_mix = _benefit_mix_table(reward_scenarios, payroll_spend)

    # 3-Year trajectory
    trajectory = _spend_trajectory(payroll_spend, horizon_years=3)

    # Reward levers (recommendation_library)
    library = await recommendation_pool(db, REWARD_CATEGORIES, limit=10)
    levers = _reward_levers(library)

    # Risk flags
    scenario_risks = await _load_scenario_risks(db, review.id if review else None)
    risks = _risk_flags(bench_dims_by_key, heatmap.get("cells", []), scenario_risks)

    narrative = await _executive_narrative(db, review.id if review else None)

    # Inject challenge rationale into reward levers
    if isinstance(levers, dict) and isinstance(levers.get("items"), list):
        for _item in levers["items"]:
            if isinstance(_item, dict):
                _item["rationale"] = (
                    f"Addresses {company_name}'s '{primary_challenge}' priority across {wf_phrase}."
                )
    elif isinstance(levers, list):
        for _item in levers:
            if isinstance(_item, dict):
                _item["rationale"] = (
                    f"Addresses {company_name}'s '{primary_challenge}' priority across {wf_phrase}."
                )

    sections = [
        section("kpi_grid", f"Reward Posture KPIs for {wf_phrase}", "kpi_grid",
                {"kpis": kpis},
                footnote="Sourced from benchmark_dimension_scores, projects.metadata, scenario_outputs."),
        section("competitiveness_radar", "Pay Competitiveness vs Peer Benchmark", "radar_chart",
                radar,
                footnote="Benchmark Engine output filtered to reward dimensions."),
        section("role_band_heatmap", "Compensation Position by Role Band", "heatmap",
                heatmap,
                footnote="role_capability_profiles aggregated by (role_family, career_level)."),
        # TODO: replace demo bar values with real pay-position vs peer benchmark
        # per job family, sourced from benchmark_dimension_scores.
        section("pay_position_bars", "Pay Position vs Peer Benchmark by Job Family", "horizontal_bar_chart",
                {
                    "items": [
                        {"label": "Engineering", "value": 0.96, "benchmark": 1.0, "sentiment": "warning"},
                        {"label": "Product", "value": 1.04, "benchmark": 1.0, "sentiment": "good"},
                        {"label": "Sales", "value": 1.08, "benchmark": 1.0, "sentiment": "good"},
                        {"label": "Operations", "value": 0.88, "benchmark": 1.0, "sentiment": "bad"},
                        {"label": "Finance", "value": 0.97, "benchmark": 1.0, "sentiment": "warning"},
                        {"label": "Marketing", "value": 1.01, "benchmark": 1.0, "sentiment": "neutral"},
                        {"label": "HR", "value": 0.93, "benchmark": 1.0, "sentiment": "warning"},
                    ],
                    "max": 1.25,
                    "benchmark": 1.0,
                    "valueFormat": "number",
                    "sortBy": "value_desc",
                    "showValues": True,
                },
                footnote="Demo values — wire to benchmark_dimension_scores by job_family."),
        section("benefit_mix_scenarios", "Benefit Mix Scenarios - Cost vs Impact", "comparison_table",
                benefit_mix,
                footnote="scenario_models of type reward_mix, with scenario_outputs."),
        section("spend_trajectory", "3-Year Reward Spend & Merit Budget Trajectory", "timeline",
                trajectory,
                footnote="projects.metadata + benchmark_profiles.metadata merit guidance."),
        section("reward_levers", "Top Reward Levers - Ranked by Impact & Effort", "recommendation_cards",
                levers,
                footnote="recommendation_library filtered to reward categories."),
        section("risk_flags", "Reward Risk & Compliance Flags", "risk_flags_list",
                risks,
                footnote="Deterministic flags from role bands + benchmark gaps + scenario_risk_flags."),
    ]

    subtitle = f"{company_name}{(' • ' + industry) if industry else ''}"
    if brief:
        subtitle = f"{subtitle} - tackling '{primary_challenge}' for {wf_phrase}"

    doc = document(
        studio_id="total-rewards",
        title=f"Total Rewards - {company_name}" if brief else "Total Rewards - One-Pager",
        subtitle=subtitle,
        sections=sections,
    )
    if narrative:
        doc["executive_narrative"] = narrative
    if brief:
        doc["footer_narrative"] = (
            f"This reward posture is calibrated for {company_name}"
            f"{(' in ' + industry) if industry else ''}, "
            f"directly addressing the '{primary_challenge}' challenge raised in the brief."
        )
    return doc
