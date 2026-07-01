"""Deterministic mobility matcher (v1).

Computes a weighted "fit" score between an EmployeeMobilityProfile and a
MobilityOpportunity using:
  * capability_match — coverage of opportunity capability requirements by the
    employee's current role's typical levels
  * readiness — employee.readiness mapped to {ready: 1.0, ready_24_months: 0.6,
    development_needed: 0.3, not_ready: 0.0}
  * performance — employee.performance_tier mapped to {exceeds: 1.0, meets: 0.7,
    partially_meets: 0.4, below: 0.1, default 0.5}
  * preferences — fraction of mobility_preferences that "match" the opportunity
    (best-effort heuristic; defaults to 0.5 if no preferences recorded)
  * tenure — clamped (tenure_months / 36) capped at 1.0 (12+ months -> >=0.33)

UPSERTs `mobility_match_results` keyed on
(profile_id, opportunity_id, engine, weights_hash, inputs_hash).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.mobility import (
    EmployeeMobilityProfile,
    MobilityFramework,
    MobilityMatchResult,
    MobilityOpportunity,
    MobilityOpportunityRequirement,
    MobilityPreference,
)
from app.models.hc_platform.role_profiles import RoleCapabilityRequirement
from app.services.hc_platform.hashing import compute_hash

ENGINE_NAME = "deterministic_v1"

DEFAULT_WEIGHTS: dict[str, float] = {
    "capability_match": 0.5,
    "readiness": 0.2,
    "performance": 0.2,
    "preferences": 0.1,
    "tenure": 0.0,
}

READINESS_SCORES: dict[str, float] = {
    "ready": 1.0,
    "ready_now": 1.0,
    "ready_24_months": 0.6,
    "development_needed": 0.3,
    "not_ready": 0.0,
}

PERFORMANCE_SCORES: dict[str, float] = {
    "exceeds": 1.0,
    "meets": 0.7,
    "partially_meets": 0.4,
    "below": 0.1,
}


# -----------------------------------------------------------------------------
# Pure scoring helpers.
# -----------------------------------------------------------------------------


def _verdict_for_score(score: float) -> str:
    if score >= 0.8:
        return "strong_match"
    if score >= 0.6:
        return "good_match"
    if score >= 0.4:
        return "marginal"
    return "poor_match"


def _normalize_weights(raw: dict[str, Any] | None) -> dict[str, float]:
    """Return a weights dict that includes every key from DEFAULT_WEIGHTS."""
    if not raw or not isinstance(raw, dict):
        return dict(DEFAULT_WEIGHTS)
    out = dict(DEFAULT_WEIGHTS)
    for k, v in raw.items():
        try:
            out[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _capability_match_score(
    requirements: list[dict[str, Any]],
    role_levels: dict[str, float],
) -> float:
    """Weighted average of min(role_level / required_level, 1.0) over requirements.

    requirements: [{framework_item_id, required_level, weight}]
    role_levels: {framework_item_id (str) -> level}
    """
    if not requirements:
        return 0.5  # neutral when nothing required
    weighted_sum = 0.0
    weight_total = 0.0
    for req in requirements:
        req_level = float(req.get("required_level") or 0)
        if req_level <= 0:
            continue
        w = float(req.get("weight") or 1.0)
        actual = float(role_levels.get(str(req["framework_item_id"]), 0))
        fit = min(actual / req_level, 1.0) if req_level > 0 else 1.0
        weighted_sum += fit * w
        weight_total += w
    if weight_total <= 0:
        return 0.0
    return weighted_sum / weight_total


def _tenure_score(months: int | None) -> float:
    if not months or months <= 0:
        return 0.0
    return min(months / 36.0, 1.0)


def _preferences_score(prefs: list[dict[str, Any]], opportunity_meta: dict[str, Any]) -> float:
    """Best-effort heuristic — fraction of preference rows that "match" the opportunity.

    Without rich semantic matching, returns 0.5 when prefs exist but no signal is
    derivable; 0.5 when no prefs exist (neutral).
    """
    if not prefs:
        return 0.5
    hits = 0
    for p in prefs:
        value = p.get("value") or {}
        if not isinstance(value, dict):
            continue
        # Crude string-overlap match against opportunity meta values.
        opp_values = {str(v).lower() for v in opportunity_meta.values() if isinstance(v, (str, int, float))}
        pref_values = {str(v).lower() for v in value.values() if isinstance(v, (str, int, float))}
        if opp_values & pref_values:
            hits += 1
    return hits / len(prefs) if prefs else 0.5


def compute_match(
    *,
    weights: dict[str, float],
    capability_match: float,
    readiness: float,
    performance: float,
    preferences: float,
    tenure: float,
) -> tuple[float, dict[str, Any]]:
    components = {
        "capability_match": capability_match,
        "readiness": readiness,
        "performance": performance,
        "preferences": preferences,
        "tenure": tenure,
    }
    weighted = 0.0
    weight_total = 0.0
    for k, v in components.items():
        w = float(weights.get(k, 0.0))
        weighted += v * w
        weight_total += w
    score = weighted / weight_total if weight_total > 0 else 0.0
    score = round(max(0.0, min(1.0, score)) * 10000) / 10000
    breakdown = {
        "weights": weights,
        "components": {k: round(v, 4) for k, v in components.items()},
        "verdict": _verdict_for_score(score),
        "score": score,
    }
    return score, breakdown


# -----------------------------------------------------------------------------
# DB orchestration.
# -----------------------------------------------------------------------------


async def _load_framework_weights(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, float]:
    fw = (
        await db.execute(
            select(MobilityFramework).where(MobilityFramework.tenant_id == tenant_id)
        )
    ).scalars().first()
    if fw is None:
        return dict(DEFAULT_WEIGHTS)
    return _normalize_weights(fw.fit_weights)


async def _load_opportunity_requirements(
    db: AsyncSession, opportunity: MobilityOpportunity
) -> list[dict[str, Any]]:
    # Prefer requirements attached directly to the opportunity.
    opp_reqs = (
        await db.execute(
            select(MobilityOpportunityRequirement).where(
                MobilityOpportunityRequirement.opportunity_id == opportunity.id
            )
        )
    ).scalars().all()
    if opp_reqs:
        return [
            {
                "framework_item_id": str(r.framework_item_id),
                "required_level": int(r.required_level) if r.required_level is not None else 0,
                "weight": float(r.weight) if r.weight is not None else 1.0,
            }
            for r in opp_reqs
        ]
    if opportunity.target_role_profile_id is None:
        return []
    role_reqs = (
        await db.execute(
            select(RoleCapabilityRequirement).where(
                RoleCapabilityRequirement.role_profile_id
                == opportunity.target_role_profile_id
            )
        )
    ).scalars().all()
    return [
        {
            "framework_item_id": str(r.framework_item_id),
            "required_level": int(r.required_level) if r.required_level is not None else 0,
            "weight": float(r.weight) if r.weight is not None else 1.0,
        }
        for r in role_reqs
    ]


async def _load_profile_levels(
    db: AsyncSession, profile: EmployeeMobilityProfile
) -> dict[str, float]:
    """Return {framework_item_id -> level} for the employee's current role's requirements."""
    if profile.current_role_profile_id is None:
        return {}
    rows = (
        await db.execute(
            select(RoleCapabilityRequirement).where(
                RoleCapabilityRequirement.role_profile_id == profile.current_role_profile_id
            )
        )
    ).scalars().all()
    return {
        str(r.framework_item_id): float(r.required_level)
        for r in rows
        if r.required_level is not None
    }


async def _load_preferences(
    db: AsyncSession, profile_id: uuid.UUID
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(MobilityPreference).where(MobilityPreference.profile_id == profile_id)
        )
    ).scalars().all()
    return [{"kind": p.kind, "value": p.value or {}} for p in rows]


async def _match_pair(
    db: AsyncSession,
    profile: EmployeeMobilityProfile,
    opportunity: MobilityOpportunity,
    weights: dict[str, float],
) -> MobilityMatchResult | None:
    requirements = await _load_opportunity_requirements(db, opportunity)
    role_levels = await _load_profile_levels(db, profile)
    prefs = await _load_preferences(db, profile.id)

    capability = _capability_match_score(requirements, role_levels)
    readiness = READINESS_SCORES.get(profile.readiness, 0.5)
    performance = PERFORMANCE_SCORES.get(profile.performance_tier, 0.5)
    tenure = _tenure_score(profile.tenure_months)
    opp_meta = opportunity.meta or {}
    if not isinstance(opp_meta, dict):
        opp_meta = {}
    preferences = _preferences_score(prefs, opp_meta)

    score, breakdown = compute_match(
        weights=weights,
        capability_match=capability,
        readiness=readiness,
        performance=performance,
        preferences=preferences,
        tenure=tenure,
    )

    weights_hash = compute_hash(weights)
    inputs_hash = compute_hash(
        {
            "requirements": sorted(requirements, key=lambda r: r["framework_item_id"]),
            "role_levels": role_levels,
            "performance_tier": profile.performance_tier,
            "readiness": profile.readiness,
            "tenure_months": profile.tenure_months,
            "preferences": prefs,
        }
    )

    # Idempotency — if a row already exists for this unique key, return it.
    existing = (
        await db.execute(
            select(MobilityMatchResult).where(
                MobilityMatchResult.profile_id == profile.id,
                MobilityMatchResult.opportunity_id == opportunity.id,
                MobilityMatchResult.engine == ENGINE_NAME,
                MobilityMatchResult.weights_hash == weights_hash,
                MobilityMatchResult.inputs_hash == inputs_hash,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    row = MobilityMatchResult(
        tenant_id=profile.tenant_id,
        profile_id=profile.id,
        opportunity_id=opportunity.id,
        engine=ENGINE_NAME,
        weights_hash=weights_hash,
        inputs_hash=inputs_hash,
        score=score,
        verdict=breakdown["verdict"],
        breakdown=breakdown,
        computed_at=datetime.now(timezone.utc),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # A concurrent writer beat us — fall back to the existing row.
        await db.rollback()
        existing = (
            await db.execute(
                select(MobilityMatchResult).where(
                    MobilityMatchResult.profile_id == profile.id,
                    MobilityMatchResult.opportunity_id == opportunity.id,
                    MobilityMatchResult.engine == ENGINE_NAME,
                    MobilityMatchResult.weights_hash == weights_hash,
                    MobilityMatchResult.inputs_hash == inputs_hash,
                )
            )
        ).scalar_one_or_none()
        return existing
    return row


async def run_for_profile(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> list[MobilityMatchResult]:
    """Match a single profile against every open opportunity in the tenant."""
    profile = (
        await db.execute(
            select(EmployeeMobilityProfile).where(
                EmployeeMobilityProfile.id == profile_id,
                EmployeeMobilityProfile.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if profile is None:
        raise ValueError(f"EmployeeMobilityProfile {profile_id} not found in tenant")
    opportunities = (
        await db.execute(
            select(MobilityOpportunity).where(MobilityOpportunity.tenant_id == tenant_id)
        )
    ).scalars().all()

    weights = await _load_framework_weights(db, tenant_id)
    results: list[MobilityMatchResult] = []
    for opp in opportunities:
        r = await _match_pair(db, profile, opp, weights)
        if r is not None:
            results.append(r)
    return results


async def run_for_opportunity(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    opportunity_id: uuid.UUID,
) -> list[MobilityMatchResult]:
    """Match every employee profile in a tenant against a single opportunity."""
    opportunity = (
        await db.execute(
            select(MobilityOpportunity).where(
                MobilityOpportunity.id == opportunity_id,
                MobilityOpportunity.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if opportunity is None:
        raise ValueError(f"MobilityOpportunity {opportunity_id} not found in tenant")

    profiles = (
        await db.execute(
            select(EmployeeMobilityProfile).where(
                EmployeeMobilityProfile.tenant_id == tenant_id
            )
        )
    ).scalars().all()

    weights = await _load_framework_weights(db, tenant_id)
    results: list[MobilityMatchResult] = []
    for prof in profiles:
        r = await _match_pair(db, prof, opportunity, weights)
        if r is not None:
            results.append(r)
    return results
