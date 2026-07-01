"""Tests for the pure helpers in maturity_engine.calculate_maturity."""

from __future__ import annotations

from app.services.hc_platform.maturity_engine import (
    _calc_priority_score,
    _get_band,
    _get_criticality,
    _get_dependency,
    _get_readiness,
    calculate_maturity,
    map_dimension_to_code,
)


BANDS = [
    {"band_name": "Initial", "min_score": 0.0, "max_score": 1.49, "sort_order": 1},
    {"band_name": "Developing", "min_score": 1.5, "max_score": 2.49, "sort_order": 2},
    {"band_name": "Defined", "min_score": 2.5, "max_score": 3.49, "sort_order": 3},
    {"band_name": "Managed", "min_score": 3.5, "max_score": 4.49, "sort_order": 4},
    {"band_name": "Optimizing", "min_score": 4.5, "max_score": 5.0, "sort_order": 5},
]


def test_map_dimension_to_code_uses_table() -> None:
    assert map_dimension_to_code("Governance Structure") == "governance"
    assert map_dimension_to_code("Skills Taxonomy") == "skills_architecture"


def test_map_dimension_to_code_falls_back_to_snake() -> None:
    assert map_dimension_to_code("Unknown Thing") == "unknown_thing"


def test_get_band_inside_range() -> None:
    assert _get_band(0.5, BANDS) == "Initial"
    assert _get_band(2.0, BANDS) == "Developing"
    assert _get_band(3.0, BANDS) == "Defined"
    assert _get_band(5.0, BANDS) == "Optimizing"


def test_get_criticality_governance_low_is_critical() -> None:
    assert _get_criticality("governance", 1.0) == "critical"
    assert _get_criticality("governance", 2.5) == "high"
    assert _get_criticality("governance", 3.5) == "low"


def test_get_criticality_non_critical_dim() -> None:
    assert _get_criticality("organization_design", 1.5) == "high"
    assert _get_criticality("organization_design", 2.5) == "medium"
    assert _get_criticality("organization_design", 3.5) == "low"


def test_get_dependency() -> None:
    assert _get_dependency("governance") == "blocking"
    assert _get_dependency("succession_planning") == "enabling"
    assert _get_dependency("organization_design") == "independent"


def test_get_readiness() -> None:
    assert _get_readiness(3.0) == "ready"
    assert _get_readiness(2.5) == "partially_ready"
    assert _get_readiness(1.0) == "not_ready"


def test_priority_score_critical_blocking_ready() -> None:
    # gap=2 -> 4; criticality critical -> +4; dependency blocking -> +3; readiness ready -> +1 = 12
    assert _calc_priority_score(2.0, "critical", "blocking", "ready") == 12.0


def test_priority_score_low_independent_not_ready() -> None:
    # gap=0 -> 0; criticality low -> 0; dependency independent -> 0; readiness not_ready -> -0.5
    assert _calc_priority_score(0.0, "low", "independent", "not_ready") == -0.5


def test_calculate_maturity_basic_output_shape() -> None:
    dims = [
        {"name": "Governance Structure", "score": 1.5},
        {"name": "Talent Acquisition", "score": 3.0},
        {"name": "Skills Taxonomy", "score": 2.0},
    ]
    out = calculate_maturity(dims, BANDS)
    assert out["overallScore"] == round((1.5 + 3.0 + 2.0) / 3 * 100) / 100
    # Overall band == Developing for ~2.17
    assert out["overallBand"] == "Developing"
    # Should detect both weak_governance (score<2.5) and weak_skills_visibility (score<2.5).
    types = {f["riskType"] for f in out["riskFlags"]}
    assert "weak_governance" in types
    assert "weak_skills_visibility" in types
    # Prioritization signals sorted DESC.
    scores = [s["priorityScore"] for s in out["prioritizationSignals"]]
    assert scores == sorted(scores, reverse=True)


def test_calculate_maturity_is_deterministic() -> None:
    dims = [
        {"name": "Governance Structure", "score": 2.0},
        {"name": "HR Value Proposition", "score": 3.5},
    ]
    a = calculate_maturity(dims, BANDS)
    b = calculate_maturity(dims, BANDS)
    assert a == b


def test_calculate_maturity_fragmented_talent_flag() -> None:
    dims = [
        {"name": "Talent Acquisition", "score": 2.0},
        {"name": "Talent Development", "score": 2.0},  # -> learning_capability_development
        {"name": "Assessment Methods", "score": 2.0},  # -> performance_management
    ]
    out = calculate_maturity(dims, BANDS)
    types = {f["riskType"] for f in out["riskFlags"]}
    assert "fragmented_talent_processes" in types
