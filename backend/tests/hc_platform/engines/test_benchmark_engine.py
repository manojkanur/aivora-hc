"""Tests for benchmark_engine.compare_dimensions + gap detection."""

from __future__ import annotations

from app.services.hc_platform.benchmark_engine import (
    _gap_data,
    _positioning,
    _summary_narrative,
    compare_dimensions,
)


def test_positioning_thresholds() -> None:
    # >= topQ -> leading
    assert _positioning(4.5, 3.0, 4.0) == "leading"
    # >= avg < topQ -> competitive
    assert _positioning(3.5, 3.0, 4.0) == "competitive"
    # >= avg*0.75 < avg -> emerging
    assert _positioning(2.5, 3.0, 4.0) == "emerging"
    # < avg*0.75 -> lagging
    assert _positioning(1.0, 3.0, 4.0) == "lagging"


def test_compare_dimensions_uses_defaults_when_missing() -> None:
    dims = [{"name": "Governance Structure", "score": 3.0}]
    out = compare_dimensions(dims, [], {})
    assert out["dimensions"][0]["benchmarkAverage"] == 3.0
    assert out["dimensions"][0]["topQuartile"] == 4.0
    assert out["dimensions"][0]["positioning"] == "competitive"


def test_compare_dimensions_matches_by_canonical_code() -> None:
    dims = [{"name": "Governance Structure", "score": 4.5}]
    benches = [
        {"dimension_code": "governance", "average_score": 3.0, "top_quartile_score": 4.0}
    ]
    out = compare_dimensions(dims, benches, {})
    row = out["dimensions"][0]
    assert row["dimensionCode"] == "governance"
    assert row["companyScore"] == 4.5
    assert row["gap"] == 1.5
    assert row["positioning"] == "leading"


def test_compare_dimensions_aggregates() -> None:
    dims = [
        {"name": "Governance Structure", "score": 4.0},
        {"name": "Talent Acquisition", "score": 2.0},
    ]
    benches = [
        {"dimension_code": "governance", "average_score": 3.0, "top_quartile_score": 4.0},
        {
            "dimension_code": "talent_acquisition",
            "average_score": 3.0,
            "top_quartile_score": 4.0,
        },
    ]
    out = compare_dimensions(dims, benches, {})
    assert out["overallCompanyScore"] == 3.0
    assert out["overallBenchmarkAverage"] == 3.0
    assert out["overallGap"] == 0.0


def test_gap_data_only_includes_negative_gaps() -> None:
    comparison = {
        "dimensions": [
            {
                "dimensionCode": "a",
                "dimensionName": "A",
                "gap": -1.2,
                "positioning": "lagging",
            },
            {
                "dimensionCode": "b",
                "dimensionName": "B",
                "gap": 0.5,
                "positioning": "competitive",
            },
            {
                "dimensionCode": "c",
                "dimensionName": "C",
                "gap": -0.6,
                "positioning": "emerging",
            },
        ]
    }
    gap = _gap_data(comparison)
    codes = {g["dimensionCode"] for g in gap["gaps"]}
    assert codes == {"a", "c"}
    # Severity bucketing.
    a = next(g for g in gap["gaps"] if g["dimensionCode"] == "a")
    c = next(g for g in gap["gaps"] if g["dimensionCode"] == "c")
    assert a["severity"] == "high"
    assert c["severity"] == "medium"


def test_summary_narrative_includes_overall_positioning() -> None:
    comparison = {
        "overallPositioning": "competitive",
        "overallCompanyScore": 3.2,
        "overallBenchmarkAverage": 3.0,
        "overallGap": 0.2,
        "dimensions": [
            {
                "dimensionCode": "a",
                "dimensionName": "A",
                "gap": 0.5,
                "positioning": "competitive",
            },
            {
                "dimensionCode": "b",
                "dimensionName": "B",
                "gap": -1.0,
                "positioning": "lagging",
            },
        ],
    }
    text = _summary_narrative(comparison)
    assert "competitive" in text
    assert "Above benchmark in 1 of 2 dimensions" in text
    assert "Key gaps" in text and "B" in text
