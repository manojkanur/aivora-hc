"""Deterministic scenario engine.

Ports artifacts/api-server/src/lib/engines/scenario-engine.ts.

Reads scenario_models + scenario_assumptions, dispatches on scenario_type,
writes scenario_outputs (1 row containing the full output_data JSON) and N
scenario_risk_flags rows. Marks scenario_models.status='completed'.

Some user-facing scenario_type aliases (workforce_planning, restructure,
growth, attrition, m_and_a) are mapped to the canonical Replit types
(business_growth, restructuring, workforce_reduction, etc.) below.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.scenarios import (
    ScenarioAssumption,
    ScenarioModel,
    ScenarioOutput,
    ScenarioRiskFlag,
)

# -----------------------------------------------------------------------------
# Pure helpers — IMPACT_RULES (verbatim port of scenario-engine.ts).
# -----------------------------------------------------------------------------


def _impacts_business_growth(a: dict[str, Any]) -> list[dict[str, Any]]:
    rate = float(a.get("growthRate", a.get("growth_rate", 10)))
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Baseline",
            "projectedState": f"+{rate}% headcount",
            "changePercentage": rate,
            "severity": "critical" if rate > 20 else ("high" if rate > 10 else "medium"),
        },
        {
            "area": "Skills Gaps",
            "currentState": "Manageable",
            "projectedState": f"{math.ceil(rate / 5)} new skill areas needed",
            "changePercentage": rate * 0.8,
            "severity": "high" if rate > 15 else "medium",
        },
        {
            "area": "Leadership Bench",
            "currentState": "Adequate",
            "projectedState": f"{math.ceil(rate / 10)} additional leaders needed",
            "changePercentage": rate * 0.5,
            "severity": "high" if rate > 20 else "low",
        },
    ]


def _impacts_restructuring(a: dict[str, Any]) -> list[dict[str, Any]]:
    target = float(a.get("reductionTarget", a.get("reduction_target", 15)))
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Current level",
            "projectedState": f"-{target}% reduction",
            "changePercentage": -target,
            "severity": "critical" if target > 20 else "high",
        },
        {
            "area": "Critical Roles",
            "currentState": "Identified",
            "projectedState": f"{math.ceil(target / 5)} roles at risk",
            "changePercentage": target * 0.6,
            "severity": "high",
        },
        {
            "area": "Succession Coverage",
            "currentState": "Partial",
            "projectedState": "Gaps expected",
            "changePercentage": -target * 0.4,
            "severity": "high" if target > 15 else "medium",
        },
        {
            "area": "Learning Priorities",
            "currentState": "Standard programs",
            "projectedState": "Reskilling required",
            "changePercentage": target * 0.7,
            "severity": "medium",
        },
    ]


def _impacts_automation(a: dict[str, Any]) -> list[dict[str, Any]]:
    level = float(a.get("automationLevel", a.get("automation_level", 30)))
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Baseline",
            "projectedState": f"-{round(level * 0.6)}% affected roles",
            "changePercentage": -level * 0.6,
            "severity": "critical" if level > 40 else "high",
        },
        {
            "area": "Skills Gaps",
            "currentState": "Technical baseline",
            "projectedState": f"{math.ceil(level / 10)} new tech skill areas",
            "changePercentage": level,
            "severity": "high",
        },
        {
            "area": "Learning Priorities",
            "currentState": "Existing curriculum",
            "projectedState": "Digital upskilling required",
            "changePercentage": level * 0.8,
            "severity": "high",
        },
        {
            "area": "Mobility Needs",
            "currentState": "Normal rotation",
            "projectedState": "Accelerated redeployment needed",
            "changePercentage": level * 0.5,
            "severity": "medium",
        },
    ]


def _impacts_ai_adoption(a: dict[str, Any]) -> list[dict[str, Any]]:
    level = float(a.get("aiAdoptionLevel", a.get("ai_adoption_level", 25)))
    return [
        {
            "area": "Skills Gaps",
            "currentState": "Traditional skill set",
            "projectedState": f"AI literacy + {math.ceil(level / 8)} specialist roles",
            "changePercentage": level * 1.2,
            "severity": "critical" if level > 30 else "high",
        },
        {
            "area": "Critical Roles",
            "currentState": "Current definition",
            "projectedState": "New AI-augmented roles required",
            "changePercentage": level * 0.7,
            "severity": "high",
        },
        {
            "area": "Leadership Bench",
            "currentState": "Traditional competencies",
            "projectedState": "AI-savvy leaders needed",
            "changePercentage": level * 0.5,
            "severity": "medium",
        },
        {
            "area": "Learning Priorities",
            "currentState": "Standard programs",
            "projectedState": "AI training programs needed",
            "changePercentage": level * 0.9,
            "severity": "high",
        },
    ]


def _impacts_workforce_reduction(a: dict[str, Any]) -> list[dict[str, Any]]:
    target = float(a.get("reductionTarget", a.get("reduction_target", 10)))
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Current headcount",
            "projectedState": f"-{target}%",
            "changePercentage": -target,
            "severity": "critical" if target > 15 else "high",
        },
        {
            "area": "Succession Coverage",
            "currentState": "Current coverage",
            "projectedState": "Critical gaps likely",
            "changePercentage": -target * 0.8,
            "severity": "critical",
        },
        {
            "area": "Critical Roles",
            "currentState": "Identified",
            "projectedState": f"{math.ceil(target / 3)} at risk",
            "changePercentage": target,
            "severity": "high",
        },
    ]


def _impacts_geographic_expansion(a: dict[str, Any]) -> list[dict[str, Any]]:
    locs_raw = a.get("expansionLocations") or a.get("expansion_locations") or []
    locations = len(locs_raw) if isinstance(locs_raw, list) else int(locs_raw or 2)
    if locations == 0:
        locations = 2
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Single geography",
            "projectedState": f"+{locations} new locations",
            "changePercentage": locations * 15,
            "severity": "high" if locations > 3 else "medium",
        },
        {
            "area": "Localization Readiness",
            "currentState": "Centralized",
            "projectedState": "Multi-location adaptation needed",
            "changePercentage": locations * 20,
            "severity": "high",
        },
        {
            "area": "Mobility Needs",
            "currentState": "Limited",
            "projectedState": "Cross-border mobility required",
            "changePercentage": locations * 25,
            "severity": "high",
        },
        {
            "area": "Skills Gaps",
            "currentState": "Domestic skill set",
            "projectedState": "Local market expertise needed",
            "changePercentage": locations * 10,
            "severity": "medium",
        },
    ]


def _impacts_leadership_pipeline(a: dict[str, Any]) -> list[dict[str, Any]]:
    depth = float(a.get("successionDepth", a.get("succession_depth", 1)))
    return [
        {
            "area": "Leadership Bench",
            "currentState": f"Depth: {depth}",
            "projectedState": "Critical shortage" if depth < 2 else "Below target",
            "changePercentage": -(100 - depth * 33),
            "severity": "critical" if depth < 2 else "high",
        },
        {
            "area": "Succession Coverage",
            "currentState": "Partial",
            "projectedState": f"{max(0, 3 - int(depth))} critical gaps",
            "changePercentage": -(60 if depth < 2 else 30),
            "severity": "critical" if depth < 2 else "medium",
        },
    ]


def _impacts_critical_skill_shortage(a: dict[str, Any]) -> list[dict[str, Any]]:
    visibility = float(a.get("skillsVisibility", a.get("skills_visibility", 30)))
    return [
        {
            "area": "Skills Gaps",
            "currentState": f"{visibility}% visibility",
            "projectedState": "Significant hidden gaps expected",
            "changePercentage": 100 - visibility,
            "severity": "critical" if visibility < 40 else "high",
        },
        {
            "area": "Learning Priorities",
            "currentState": "Ad-hoc",
            "projectedState": "Targeted reskilling programs needed",
            "changePercentage": 100 - visibility,
            "severity": "high",
        },
        {
            "area": "Critical Roles",
            "currentState": "Partially identified",
            "projectedState": "Full mapping needed",
            "changePercentage": (100 - visibility) * 0.6,
            "severity": "high",
        },
    ]


def _impacts_localization_pressure(a: dict[str, Any]) -> list[dict[str, Any]]:
    target = float(a.get("localizationTarget", a.get("localization_target", 70)))
    current = float(a.get("localPipelineStrength", a.get("local_pipeline_strength", 40)))
    expat = float(a.get("expatDependencyLevel", a.get("expat_dependency_level", 30)))
    return [
        {
            "area": "Localization Readiness",
            "currentState": f"{current}% local",
            "projectedState": f"Target {target}% local",
            "changePercentage": target - current,
            "severity": "critical" if (target - current) > 30 else "high",
        },
        {
            "area": "Learning Priorities",
            "currentState": "Standard",
            "projectedState": "Accelerated local talent development",
            "changePercentage": (target - current) * 0.8,
            "severity": "high",
        },
        {
            "area": "Mobility Needs",
            "currentState": "Expat-dependent",
            "projectedState": "Reduced expat reliance",
            "changePercentage": -expat,
            "severity": "medium",
        },
    ]


def _impacts_mobility_acceleration(a: dict[str, Any]) -> list[dict[str, Any]]:
    readiness = float(a.get("mobilityReadiness", a.get("mobility_readiness", 30)))
    return [
        {
            "area": "Mobility Needs",
            "currentState": f"{readiness}% ready",
            "projectedState": "Comprehensive mobility program",
            "changePercentage": 100 - readiness,
            "severity": "critical" if readiness < 30 else "high",
        },
        {
            "area": "Skills Gaps",
            "currentState": "Role-specific",
            "projectedState": "Cross-functional competencies needed",
            "changePercentage": (100 - readiness) * 0.5,
            "severity": "medium",
        },
        {
            "area": "Leadership Bench",
            "currentState": "Limited mobility experience",
            "projectedState": "Mobile leader pipeline",
            "changePercentage": (100 - readiness) * 0.4,
            "severity": "medium",
        },
    ]


IMPACT_RULES: dict[str, Callable[[dict[str, Any]], list[dict[str, Any]]]] = {
    "business_growth": _impacts_business_growth,
    "restructuring": _impacts_restructuring,
    "automation_impact": _impacts_automation,
    "ai_adoption": _impacts_ai_adoption,
    "workforce_reduction": _impacts_workforce_reduction,
    "geographic_expansion": _impacts_geographic_expansion,
    "leadership_pipeline_risk": _impacts_leadership_pipeline,
    "critical_skill_shortage": _impacts_critical_skill_shortage,
    "localization_pressure": _impacts_localization_pressure,
    "mobility_acceleration": _impacts_mobility_acceleration,
}

# Aliases so the user-facing scenario types (per Phase 3 spec) still dispatch.
SCENARIO_TYPE_ALIASES: dict[str, str] = {
    "growth": "business_growth",
    "workforce_planning": "business_growth",
    "restructure": "restructuring",
    "attrition": "workforce_reduction",
    "m_and_a": "workforce_reduction",
}


def _default_impacts() -> list[dict[str, Any]]:
    return [
        {
            "area": "Workforce Demand",
            "currentState": "Baseline",
            "projectedState": "Change expected",
            "changePercentage": 10,
            "severity": "medium",
        },
        {
            "area": "Skills Gaps",
            "currentState": "Current state",
            "projectedState": "Assessment needed",
            "changePercentage": 15,
            "severity": "medium",
        },
    ]


def _generate_responses(impacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    responses: list[dict[str, Any]] = []
    for impact in impacts:
        if impact["severity"] not in ("critical", "high"):
            continue
        area = impact["area"]
        change = impact["changePercentage"]
        sev = impact["severity"]
        if area == "Workforce Demand" and change > 0:
            responses.append(
                {
                    "responseType": "buy",
                    "area": area,
                    "description": f"External hiring to meet +{abs(change)}% demand increase.",
                    "priority": sev,
                    "timeframe": "0-6 months",
                    "estimatedCost": "High",
                }
            )
            responses.append(
                {
                    "responseType": "borrow",
                    "area": area,
                    "description": "Contract/contingent workforce to bridge immediate gaps.",
                    "priority": "medium",
                    "timeframe": "0-3 months",
                    "estimatedCost": "Medium",
                }
            )
        if area == "Workforce Demand" and change < 0:
            responses.append(
                {
                    "responseType": "rotate",
                    "area": area,
                    "description": "Redeploy affected employees to growth areas.",
                    "priority": "high",
                    "timeframe": "0-6 months",
                    "estimatedCost": "Low",
                }
            )
            responses.append(
                {
                    "responseType": "automate",
                    "area": area,
                    "description": "Automate transactional roles to optimize headcount.",
                    "priority": "medium",
                    "timeframe": "3-9 months",
                    "estimatedCost": "Medium",
                }
            )
        if area == "Skills Gaps":
            responses.append(
                {
                    "responseType": "build",
                    "area": area,
                    "description": "Launch targeted upskilling programs for critical skill areas.",
                    "priority": sev,
                    "timeframe": "0-9 months",
                    "estimatedCost": "Medium",
                }
            )
        if area in ("Leadership Bench", "Succession Coverage"):
            responses.append(
                {
                    "responseType": "build",
                    "area": area,
                    "description": "Accelerate leadership development and succession programs.",
                    "priority": sev,
                    "timeframe": "3-12 months",
                    "estimatedCost": "High",
                }
            )
        if area == "Learning Priorities":
            responses.append(
                {
                    "responseType": "build",
                    "area": area,
                    "description": "Design and deploy targeted learning interventions.",
                    "priority": "high",
                    "timeframe": "0-6 months",
                    "estimatedCost": "Medium",
                }
            )
        if area == "Mobility Needs":
            responses.append(
                {
                    "responseType": "rotate",
                    "area": area,
                    "description": "Establish cross-border mobility and talent exchange programs.",
                    "priority": "medium",
                    "timeframe": "3-9 months",
                    "estimatedCost": "Medium",
                }
            )
        if area == "Localization Readiness":
            responses.append(
                {
                    "responseType": "build",
                    "area": area,
                    "description": "Invest in local talent pipeline development.",
                    "priority": sev,
                    "timeframe": "6-18 months",
                    "estimatedCost": "High",
                }
            )
            responses.append(
                {
                    "responseType": "outsource",
                    "area": area,
                    "description": "Partner with local recruitment and development providers.",
                    "priority": "medium",
                    "timeframe": "0-6 months",
                    "estimatedCost": "Medium",
                }
            )
        if area == "Critical Roles":
            responses.append(
                {
                    "responseType": "buy",
                    "area": area,
                    "description": "Targeted external recruitment for critical role gaps.",
                    "priority": "high",
                    "timeframe": "0-6 months",
                    "estimatedCost": "High",
                }
            )
    # Dedup by (responseType, area), keeping first.
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in responses:
        key = f"{r['responseType']}-{r['area']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def run_simulation(
    scenario_type: str, assumptions: dict[str, Any]
) -> dict[str, Any]:
    """Pure simulation — returns the full output_data dict."""
    canonical = SCENARIO_TYPE_ALIASES.get(scenario_type, scenario_type)
    fn = IMPACT_RULES.get(canonical)
    impacts = fn(assumptions) if fn else _default_impacts()
    responses = _generate_responses(impacts)

    critical = sum(1 for i in impacts if i["severity"] == "critical")
    high = sum(1 for i in impacts if i["severity"] == "high")
    pretty_type = canonical.replace("_", " ")
    summary = (
        f'Scenario "{pretty_type}" analysis identifies {len(impacts)} impact areas '
        f"({critical} critical, {high} high severity) with {len(responses)} recommended "
        f"responses across build, buy, borrow, automate, rotate, and outsource strategies."
    )

    key_insights: list[str] = []
    if critical > 0:
        key_insights.append(
            f"{critical} critical impact area(s) require immediate action planning."
        )
    if any(r["responseType"] == "build" for r in responses):
        key_insights.append("Internal capability building is a primary response lever.")
    if any(r["responseType"] == "buy" for r in responses):
        key_insights.append("External talent acquisition will be needed to address gaps.")
    if any(i["area"] == "Leadership Bench" for i in impacts):
        key_insights.append(
            "Leadership pipeline will be affected - succession review recommended."
        )
    if any(i["area"] == "Skills Gaps" and i["severity"] != "low" for i in impacts):
        key_insights.append("Skills gap analysis should be conducted across affected roles.")

    return {
        "impacts": impacts,
        "responses": responses,
        "summary": summary,
        "keyInsights": key_insights,
    }


def generate_risk_flags(output: dict[str, Any]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    for impact in output["impacts"]:
        if impact["severity"] == "critical":
            flags.append(
                {
                    "riskType": "critical_impact",
                    "severity": "critical",
                    "description": f"Critical impact on {impact['area']}: {impact['projectedState']}",
                    "affectedArea": impact["area"],
                    "suggestedAction": (
                        f"Prioritize immediate response planning for {impact['area']}."
                    ),
                }
            )
    build_crit = [
        r for r in output["responses"]
        if r["responseType"] == "build" and r["priority"] == "critical"
    ]
    if len(build_crit) > 2:
        flags.append(
            {
                "riskType": "capability_overload",
                "severity": "high",
                "description": (
                    "Multiple critical capability-building initiatives may overwhelm change capacity."
                ),
                "affectedArea": "Organization",
                "suggestedAction": (
                    "Sequence capability investments and prioritize highest-impact areas first."
                ),
            }
        )
    return flags


# -----------------------------------------------------------------------------
# Async DB orchestration.
# -----------------------------------------------------------------------------


async def run(db: AsyncSession, scenario_id: uuid.UUID) -> ScenarioModel:
    scenario = (
        await db.execute(select(ScenarioModel).where(ScenarioModel.id == scenario_id))
    ).scalar_one_or_none()
    if scenario is None:
        raise ValueError(f"ScenarioModel {scenario_id} not found")

    assumption_rows = (
        await db.execute(
            select(ScenarioAssumption).where(ScenarioAssumption.scenario_id == scenario_id)
        )
    ).scalars().all()

    # Flatten assumptions into a single dict the impact rules consume.
    # Each row stores its key + value (JSON). When value is a scalar dict like
    # {"value": 12}, unwrap it; otherwise use the dict as-is.
    assumptions: dict[str, Any] = {}
    for row in assumption_rows:
        val = row.value
        if isinstance(val, dict) and "value" in val and len(val) == 1:
            val = val["value"]
        assumptions[row.key] = val

    output_data = run_simulation(scenario.scenario_type or "", assumptions)
    risk_flags = generate_risk_flags(output_data)

    # Replace any prior output rows for idempotency.
    prior_outputs = (
        await db.execute(
            select(ScenarioOutput).where(ScenarioOutput.scenario_id == scenario_id)
        )
    ).scalars().all()
    for o in prior_outputs:
        await db.delete(o)
    prior_flags = (
        await db.execute(
            select(ScenarioRiskFlag).where(ScenarioRiskFlag.scenario_id == scenario_id)
        )
    ).scalars().all()
    for f in prior_flags:
        await db.delete(f)
    await db.flush()

    now = datetime.now(timezone.utc)
    db.add(
        ScenarioOutput(
            scenario_id=scenario_id,
            period_label="summary",
            output_data=output_data,
            computed_at=now,
            sort_order=0,
        )
    )
    for f in risk_flags:
        db.add(
            ScenarioRiskFlag(
                scenario_id=scenario_id,
                severity=f["severity"],
                label=f["riskType"],
                description=f["description"],
                mitigation=f["suggestedAction"],
                meta={"affectedArea": f["affectedArea"]},
            )
        )

    scenario.status = "completed"
    scenario.assumptions_summary = {
        "input_keys": sorted(assumptions.keys()),
        "summary": output_data["summary"],
        "key_insights": output_data["keyInsights"],
        "impact_count": len(output_data["impacts"]),
        "response_count": len(output_data["responses"]),
        "risk_flag_count": len(risk_flags),
    }
    await db.flush()
    return scenario
