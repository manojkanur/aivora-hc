"""Tests for hashing.canonical_json / compute_hash."""

from __future__ import annotations

from app.services.hc_platform.hashing import canonical_json, compute_hash


def test_canonical_json_sorts_keys_recursively() -> None:
    a = {"b": 1, "a": {"y": 2, "x": 1}}
    b = {"a": {"x": 1, "y": 2}, "b": 1}
    assert canonical_json(a) == canonical_json(b)


def test_canonical_json_rounds_floats_to_6dp() -> None:
    assert canonical_json({"x": 0.1234567890123}) == '{"x":0.123457}'


def test_canonical_json_normalizes_nan() -> None:
    out = canonical_json({"x": float("nan")})
    assert out == '{"x":null}'


def test_compute_hash_is_stable() -> None:
    payload = {"keys": [1, 2, 3], "weights": {"a": 0.5, "b": 0.5}}
    assert compute_hash(payload) == compute_hash(dict(payload))


def test_compute_hash_changes_on_value_change() -> None:
    p1 = {"k": 0.5}
    p2 = {"k": 0.5001}
    assert compute_hash(p1) != compute_hash(p2)


def test_compute_hash_float_rounding_collides_close_values() -> None:
    # Values that round identically at 6dp should hash identically.
    assert compute_hash({"k": 0.1234567}) == compute_hash({"k": 0.12345671})


def test_compute_hash_tuple_and_list_equivalent() -> None:
    assert compute_hash((1, 2, 3)) == compute_hash([1, 2, 3])
