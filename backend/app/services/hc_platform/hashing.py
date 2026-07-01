"""Canonical JSON hashing utilities for engine idempotency."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _normalize(obj: Any) -> Any:
    """Recursively normalize for canonical JSON.

    - Floats are rounded to 6 decimals and 'sanitized' for NaN/Inf.
    - Tuples become lists.
    - Sets become sorted lists.
    - Dict keys are coerced to strings.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(obj, 6)
    if isinstance(obj, dict):
        return {str(k): _normalize(obj[k]) for k in obj}
    if isinstance(obj, (list, tuple)):
        return [_normalize(v) for v in obj]
    if isinstance(obj, set):
        return sorted([_normalize(v) for v in obj], key=lambda x: json.dumps(x, sort_keys=True))
    # Bytes -> hex string
    if isinstance(obj, bytes):
        return obj.hex()
    return obj


def canonical_json(obj: Any) -> str:
    """Return a deterministic JSON string representation.

    - Sorted keys.
    - No whitespace separators.
    - Floats rounded to 6 decimals.
    - UUIDs / datetimes are stringified via default=str.
    """
    normalized = _normalize(obj)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )


def compute_hash(obj: Any) -> str:
    """Return the SHA-256 hex digest of canonical_json(obj)."""
    return hashlib.sha256(canonical_json(obj).encode("utf-8")).hexdigest()
