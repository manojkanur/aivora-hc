"""Tests for the mobility matcher pure scoring helpers + verdict bucketing."""

from __future__ import annotations

from app.services.hc_platform.hashing import compute_hash
from app.services.hc_platform.mobility_matcher import (
    DEFAULT_WEIGHTS,
    PERFORMANCE_SCORES,
    READINESS_SCORES,
    _capability_match_score,
    _normalize_weights,
    _tenure_score,
    _verdict_for_score,
    compute_match,
)


def test_verdict_buckets() -> None:
    assert _verdict_for_score(0.85) == "strong_match"
    assert _verdict_for_score(0.65) == "good_match"
    assert _verdict_for_score(0.45) == "marginal"
    assert _verdict_for_score(0.1) == "poor_match"


def test_normalize_weights_fills_in_defaults() -> None:
    weights = _normalize_weights({"capability_match": 0.7})
    assert weights["capability_match"] == 0.7
    for k, v in DEFAULT_WEIGHTS.items():
        if k != "capability_match":
            assert weights[k] == v


def test_capability_match_no_requirements_returns_neutral() -> None:
    assert _capability_match_score([], {}) == 0.5


def test_capability_match_perfect_fit() -> None:
    reqs = [
        {"framework_item_id": "x", "required_level": 3, "weight": 1.0},
        {"framework_item_id": "y", "required_level": 4, "weight": 1.0},
    ]
    levels = {"x": 3, "y": 4}
    assert _capability_match_score(reqs, levels) == 1.0


def test_capability_match_partial_fit_is_weighted() -> None:
    reqs = [
        {"framework_item_id": "x", "required_level": 4, "weight": 2.0},
        {"framework_item_id": "y", "required_level": 4, "weight": 1.0},
    ]
    levels = {"x": 2, "y": 4}  # 0.5 and 1.0
    # weighted average: (0.5 * 2 + 1.0 * 1) / 3 = 2/3
    assert abs(_capability_match_score(reqs, levels) - (2 / 3)) < 1e-9


def test_capability_match_caps_at_one_when_over() -> None:
    reqs = [{"framework_item_id": "x", "required_level": 2, "weight": 1.0}]
    levels = {"x": 5}
    assert _capability_match_score(reqs, levels) == 1.0


def test_tenure_score_caps_at_three_years() -> None:
    assert _tenure_score(0) == 0.0
    assert _tenure_score(None) == 0.0
    assert abs(_tenure_score(18) - 0.5) < 1e-9
    assert _tenure_score(36) == 1.0
    assert _tenure_score(60) == 1.0


def test_compute_match_strong_match_when_all_inputs_high() -> None:
    score, breakdown = compute_match(
        weights=DEFAULT_WEIGHTS,
        capability_match=1.0,
        readiness=1.0,
        performance=1.0,
        preferences=1.0,
        tenure=1.0,
    )
    assert score == 1.0
    assert breakdown["verdict"] == "strong_match"


def test_compute_match_poor_when_all_inputs_low() -> None:
    score, breakdown = compute_match(
        weights=DEFAULT_WEIGHTS,
        capability_match=0.0,
        readiness=0.0,
        performance=0.0,
        preferences=0.0,
        tenure=0.0,
    )
    assert score == 0.0
    assert breakdown["verdict"] == "poor_match"


def test_compute_match_components_recorded() -> None:
    score, breakdown = compute_match(
        weights=DEFAULT_WEIGHTS,
        capability_match=0.8,
        readiness=READINESS_SCORES["ready_24_months"],
        performance=PERFORMANCE_SCORES["meets"],
        preferences=0.5,
        tenure=0.5,
    )
    # Default weights ignore tenure (0.0). Weight total used = sum of all weights including 0.
    # Capability(0.8) * 0.5 + Readiness(0.6) * 0.2 + Performance(0.7) * 0.2 + Preferences(0.5) * 0.1 + Tenure(0.5)*0 = 0.4 + 0.12 + 0.14 + 0.05 + 0 = 0.71
    assert abs(score - 0.71) < 1e-3
    assert breakdown["components"]["capability_match"] == 0.8


def test_compute_match_is_deterministic_for_hash_idempotency() -> None:
    """Re-running with the same canonical inputs should yield the same score and
    the same weights/inputs hash — which is how the unique constraint on
    mobility_match_results dedups reruns.
    """
    weights = dict(DEFAULT_WEIGHTS)
    args = dict(
        weights=weights,
        capability_match=0.7,
        readiness=0.6,
        performance=0.7,
        preferences=0.5,
        tenure=0.3,
    )
    s1, b1 = compute_match(**args)
    s2, b2 = compute_match(**args)
    assert s1 == s2
    assert compute_hash(b1["weights"]) == compute_hash(b2["weights"])
