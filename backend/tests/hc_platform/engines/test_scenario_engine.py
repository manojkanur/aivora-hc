"""Tests for the pure scenario engine helpers (one per scenario type)."""

from __future__ import annotations

from app.services.hc_platform.scenario_engine import (
    SCENARIO_TYPE_ALIASES,
    generate_risk_flags,
    run_simulation,
)


def test_business_growth_high_rate_emits_critical_workforce_demand() -> None:
    out = run_simulation("business_growth", {"growthRate": 25})
    wd = next(i for i in out["impacts"] if i["area"] == "Workforce Demand")
    assert wd["severity"] == "critical"
    assert wd["changePercentage"] == 25


def test_restructuring_emits_succession_coverage_impact() -> None:
    out = run_simulation("restructuring", {"reductionTarget": 18})
    succession = next(i for i in out["impacts"] if i["area"] == "Succession Coverage")
    assert succession["severity"] == "high"
    assert succession["changePercentage"] == -18 * 0.4


def test_automation_impact_critical_when_level_high() -> None:
    out = run_simulation("automation_impact", {"automationLevel": 45})
    wd = next(i for i in out["impacts"] if i["area"] == "Workforce Demand")
    assert wd["severity"] == "critical"


def test_ai_adoption_critical_skills_gaps() -> None:
    out = run_simulation("ai_adoption", {"aiAdoptionLevel": 40})
    skills = next(i for i in out["impacts"] if i["area"] == "Skills Gaps")
    assert skills["severity"] == "critical"


def test_workforce_reduction_always_critical_succession() -> None:
    out = run_simulation("workforce_reduction", {"reductionTarget": 10})
    coverage = next(i for i in out["impacts"] if i["area"] == "Succession Coverage")
    assert coverage["severity"] == "critical"


def test_geographic_expansion_locations_drive_change() -> None:
    out = run_simulation(
        "geographic_expansion",
        {"expansionLocations": ["A", "B", "C", "D"]},
    )
    wd = next(i for i in out["impacts"] if i["area"] == "Workforce Demand")
    # 4 locations -> change = 60, severity high (>3 locations).
    assert wd["changePercentage"] == 60
    assert wd["severity"] == "high"


def test_leadership_pipeline_low_depth_critical() -> None:
    out = run_simulation("leadership_pipeline_risk", {"successionDepth": 1})
    bench = next(i for i in out["impacts"] if i["area"] == "Leadership Bench")
    assert bench["severity"] == "critical"
    # change = -(100 - 1*33) = -67
    assert bench["changePercentage"] == -67


def test_critical_skill_shortage_low_visibility_critical() -> None:
    out = run_simulation("critical_skill_shortage", {"skillsVisibility": 20})
    gap = next(i for i in out["impacts"] if i["area"] == "Skills Gaps")
    assert gap["severity"] == "critical"
    assert gap["changePercentage"] == 80


def test_localization_pressure_large_delta_critical() -> None:
    out = run_simulation(
        "localization_pressure",
        {"localizationTarget": 80, "localPipelineStrength": 30},
    )
    local = next(i for i in out["impacts"] if i["area"] == "Localization Readiness")
    assert local["severity"] == "critical"
    assert local["changePercentage"] == 50


def test_mobility_acceleration_low_readiness_critical() -> None:
    out = run_simulation("mobility_acceleration", {"mobilityReadiness": 20})
    mob = next(i for i in out["impacts"] if i["area"] == "Mobility Needs")
    assert mob["severity"] == "critical"


def test_unknown_scenario_type_falls_back_to_defaults() -> None:
    out = run_simulation("not_a_real_scenario", {})
    assert len(out["impacts"]) == 2
    assert {i["area"] for i in out["impacts"]} == {"Workforce Demand", "Skills Gaps"}


def test_aliases_dispatch_correctly() -> None:
    # 'restructure' alias should dispatch to 'restructuring' impacts (4 areas).
    out = run_simulation("restructure", {"reductionTarget": 25})
    assert {"Workforce Demand", "Critical Roles", "Succession Coverage", "Learning Priorities"} <= {
        i["area"] for i in out["impacts"]
    }
    assert SCENARIO_TYPE_ALIASES["restructure"] == "restructuring"


def test_responses_dedup_by_type_and_area() -> None:
    out = run_simulation("business_growth", {"growthRate": 25})
    keys = [f"{r['responseType']}-{r['area']}" for r in out["responses"]]
    assert len(keys) == len(set(keys))


def test_risk_flags_emitted_for_critical_impacts() -> None:
    out = run_simulation("workforce_reduction", {"reductionTarget": 20})
    flags = generate_risk_flags(out)
    # Succession coverage is always critical for workforce_reduction.
    assert any(f["riskType"] == "critical_impact" for f in flags)


def test_summary_contains_canonical_type_name() -> None:
    out = run_simulation("business_growth", {"growthRate": 15})
    assert "business growth" in out["summary"]


def test_run_simulation_is_deterministic() -> None:
    a1 = run_simulation("ai_adoption", {"aiAdoptionLevel": 30})
    a2 = run_simulation("ai_adoption", {"aiAdoptionLevel": 30})
    assert a1 == a2


def test_capability_overload_flag_when_many_critical_build() -> None:
    # Synthesize an output with > 2 build/critical responses.
    output = {
        "impacts": [],
        "responses": [
            {"responseType": "build", "priority": "critical", "area": "A"},
            {"responseType": "build", "priority": "critical", "area": "B"},
            {"responseType": "build", "priority": "critical", "area": "C"},
        ],
    }
    flags = generate_risk_flags(output)
    assert any(f["riskType"] == "capability_overload" for f in flags)
