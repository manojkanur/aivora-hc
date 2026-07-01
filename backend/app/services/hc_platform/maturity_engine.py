"""Deterministic maturity engine.

Ports artifacts/api-server/src/lib/engines/maturity-engine.ts to Python.

Reads `hc_reviews.diagnostic_results.dimensions` (preferred) or
`hc_reviews.intake_data.maturity_ratings` as a fallback, computes per-dimension
maturity using a MaturityModel's bands, and writes:
  * maturity_assessments (1 row per review+model — idempotent by inputs_hash)
  * maturity_dimension_results (N rows, one per dimension)

Pure / no LLM. Same inputs => same outputs.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityBand,
    MaturityDimensionResult,
    MaturityModel,
)
from app.services.hc_platform.hashing import compute_hash

# -----------------------------------------------------------------------------
# Algorithm constants (ported verbatim from maturity-engine.ts).
# -----------------------------------------------------------------------------

CRITICALITY_DIMENSIONS: set[str] = {
    "governance",
    "succession_planning",
    "leadership_development",
    "workforce_planning",
    "talent_acquisition",
}

BLOCKING_DIMENSIONS: set[str] = {
    "governance",
    "hc_analytics",
    "skills_architecture",
}

DIMENSION_CODE_MAP: dict[str, str] = {
    "Strategic Alignment": "workforce_planning",
    "Workforce Vision": "workforce_planning",
    "HR Value Proposition": "organization_design",
    "Stakeholder Engagement": "governance",
    "Data & Analytics Maturity": "hc_analytics",
    "Change Readiness": "organization_design",
    "Service Delivery Model": "organization_design",
    "HR Technology Stack": "hc_analytics",
    "Process Efficiency": "organization_design",
    "Governance Structure": "governance",
    "Capability & Capacity": "learning_capability_development",
    "Cost Effectiveness": "organization_design",
    "Talent Acquisition": "talent_acquisition",
    "Talent Development": "learning_capability_development",
    "Talent Retention": "talent_acquisition",
    "Succession Pipeline": "succession_planning",
    "Employer Brand": "talent_acquisition",
    "Diversity & Inclusion": "talent_acquisition",
    "Competency Architecture": "skills_architecture",
    "Skills Taxonomy": "skills_architecture",
    "Assessment Methods": "performance_management",
    "Development Pathways": "learning_capability_development",
    "Certification & Standards": "skills_architecture",
    "Role Alignment": "organization_design",
    "Learning Strategy": "learning_capability_development",
    "Content Design": "learning_capability_development",
    "Delivery Channels": "learning_capability_development",
    "Learning Technology": "hc_analytics",
    "Measurement & ROI": "hc_analytics",
    "Knowledge Management": "learning_capability_development",
    "Leadership Model": "leadership_development",
    "Assessment & Selection": "talent_acquisition",
    "Development Programs": "leadership_development",
    "Coaching Infrastructure": "leadership_development",
    "Performance Integration": "performance_management",
    "Succession Readiness": "succession_planning",
    "Pipeline Identification": "succession_planning",
    "Readiness Assessment": "succession_planning",
    "Development Planning": "learning_capability_development",
    "Emergency Succession": "succession_planning",
    "Board Reporting": "governance",
    "Diversity in Pipeline": "succession_planning",
    "Goal Setting": "performance_management",
    "Feedback Culture": "performance_management",
    "Rating Calibration": "performance_management",
    "Reward Linkage": "performance_management",
    "Manager Capability": "leadership_development",
    "Technology Enablement": "hc_analytics",
    "Demand Forecasting": "workforce_planning",
    "Supply Analysis": "workforce_planning",
    "Gap Identification": "workforce_planning",
    "Scenario Planning": "workforce_planning",
    "Cost Modeling": "workforce_planning",
    "Implementation Tracking": "governance",
    "Policy Framework": "governance",
    "Compliance Management": "governance",
    "Risk Assessment": "governance",
    "Ethics & Conduct": "governance",
    "Reporting Structure": "governance",
    "Audit & Review": "governance",
}


def map_dimension_to_code(name: str) -> str:
    """Map a UI dimension name -> canonical code."""
    if name in DIMENSION_CODE_MAP:
        return DIMENSION_CODE_MAP[name]
    return name.lower().strip().replace(" ", "_")


# -----------------------------------------------------------------------------
# Pure helpers (testable without DB).
# -----------------------------------------------------------------------------


def _get_band(score: float, bands: list[dict[str, Any]]) -> str:
    """Return the band_name whose [min_score, max_score] contains score.

    `bands` are dicts with keys: band_name, min_score, max_score, sort_order.
    Sorted ascending by sort_order; falls back to the first band's name if no
    range contains the score (matches TS getBand()).
    """
    if not bands:
        return "Unknown"
    sorted_bands = sorted(bands, key=lambda b: b.get("sort_order") or 0)
    for band in sorted_bands:
        mn = band.get("min_score")
        mx = band.get("max_score")
        if mn is None or mx is None:
            continue
        if float(mn) <= score <= float(mx):
            return str(band["band_name"])
    return str(sorted_bands[0]["band_name"])


def _get_criticality(code: str, score: float) -> str:
    if code in CRITICALITY_DIMENSIONS and score < 2.0:
        return "critical"
    if code in CRITICALITY_DIMENSIONS and score < 3.0:
        return "high"
    if score < 2.0:
        return "high"
    if score < 3.0:
        return "medium"
    return "low"


def _get_dependency(code: str) -> str:
    if code in BLOCKING_DIMENSIONS:
        return "blocking"
    if code in CRITICALITY_DIMENSIONS:
        return "enabling"
    return "independent"


def _get_readiness(score: float) -> str:
    if score >= 3.0:
        return "ready"
    if score >= 2.0:
        return "partially_ready"
    return "not_ready"


def _calc_priority_score(
    gap_size: float, criticality: str, dependency: str, readiness: str
) -> float:
    score = gap_size * 2
    if criticality == "critical":
        score += 4
    elif criticality == "high":
        score += 3
    elif criticality == "medium":
        score += 1
    if dependency == "blocking":
        score += 3
    elif dependency == "enabling":
        score += 1
    if readiness == "ready":
        score += 1
    elif readiness == "not_ready":
        score -= 0.5
    return round(score * 100) / 100


def _risk_flags(dims: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Evaluate the 5 fixed risk rules over computed dimensions."""
    flags: list[dict[str, Any]] = []

    if any(d["dimensionCode"] == "governance" and d["score"] < 2.5 for d in dims):
        flags.append(
            {
                "riskType": "weak_governance",
                "severity": "critical",
                "description": (
                    "Governance maturity is below threshold, which can block all "
                    "other HC improvements."
                ),
                "suggestedAction": (
                    "Establish a formal HC governance committee and define clear "
                    "accountability structures."
                ),
                "affectedDimensions": ["governance"],
            }
        )

    talent_codes = {
        "talent_acquisition",
        "learning_capability_development",
        "performance_management",
    }
    talent_dims = [d for d in dims if d["dimensionCode"] in talent_codes]
    if talent_dims:
        avg = sum(d["score"] for d in talent_dims) / len(talent_dims)
        if avg < 2.5 and len(talent_dims) > 1:
            flags.append(
                {
                    "riskType": "fragmented_talent_processes",
                    "severity": "high",
                    "description": (
                        "Core talent processes are fragmented with low maturity "
                        "across acquisition, development, and performance management."
                    ),
                    "suggestedAction": (
                        "Design an integrated talent operating model connecting "
                        "acquisition, development, and performance."
                    ),
                    "affectedDimensions": sorted(talent_codes),
                }
            )

    if any(d["dimensionCode"] == "succession_planning" and d["score"] < 2.0 for d in dims):
        flags.append(
            {
                "riskType": "poor_succession_depth",
                "severity": "high",
                "description": (
                    "Succession planning maturity is critically low, creating "
                    "leadership continuity risk."
                ),
                "suggestedAction": (
                    "Launch emergency succession identification for top 20 critical roles."
                ),
                "affectedDimensions": ["succession_planning"],
            }
        )

    if any(d["dimensionCode"] == "hc_analytics" and d["score"] < 2.0 for d in dims):
        flags.append(
            {
                "riskType": "low_analytics_maturity",
                "severity": "medium",
                "description": (
                    "HC analytics maturity is too low to support evidence-based "
                    "decision making."
                ),
                "suggestedAction": (
                    "Build foundational people analytics dashboards and data "
                    "governance practices."
                ),
                "affectedDimensions": ["hc_analytics"],
            }
        )

    if any(d["dimensionCode"] == "skills_architecture" and d["score"] < 2.5 for d in dims):
        flags.append(
            {
                "riskType": "weak_skills_visibility",
                "severity": "medium",
                "description": (
                    "Skills architecture is underdeveloped, limiting workforce "
                    "planning and talent mobility."
                ),
                "suggestedAction": (
                    "Implement a skills taxonomy and skills assessment framework."
                ),
                "affectedDimensions": ["skills_architecture"],
            }
        )

    return flags


def calculate_maturity(
    review_dimensions: list[dict[str, Any]],
    bands: list[dict[str, Any]],
) -> dict[str, Any]:
    """Pure function — compute maturity from dimensions + bands.

    `review_dimensions` items: {"name": str, "score": float} (extra keys ignored).
    `bands` items: {"band_name", "min_score", "max_score", "sort_order"}.
    """
    target = 4.0
    dims: list[dict[str, Any]] = []
    for raw in review_dimensions:
        name = str(raw.get("name") or raw.get("dimensionName") or raw.get("key") or "")
        score = float(raw.get("score") or 0)
        code = map_dimension_to_code(name) if name else str(raw.get("key") or "")
        gap = max(0.0, target - score)
        band = _get_band(score, bands)
        criticality = _get_criticality(code, score)
        readiness = _get_readiness(score)
        dependency = _get_dependency(code)
        if gap > 1.5:
            tail = "Significant improvement needed."
        elif gap > 0.5:
            tail = "Moderate improvement opportunity."
        else:
            tail = "Near target maturity."
        dims.append(
            {
                "dimensionCode": code,
                "dimensionName": name,
                "score": score,
                "bandName": band,
                "gapSize": round(gap * 100) / 100,
                "criticality": criticality,
                "readiness": readiness,
                "dependency": dependency,
                "interpretation": f"{name} is at {band} level ({score}/5). {tail}",
            }
        )

    if dims:
        overall_score = round((sum(d["score"] for d in dims) / len(dims)) * 100) / 100
    else:
        overall_score = 0.0
    overall_band = _get_band(overall_score, bands)

    prioritization = sorted(
        [
            {
                "dimensionCode": d["dimensionCode"],
                "dimensionName": d["dimensionName"],
                "gapSize": d["gapSize"],
                "criticality": d["criticality"],
                "dependency": d["dependency"],
                "readiness": d["readiness"],
                "priorityScore": _calc_priority_score(
                    d["gapSize"], d["criticality"], d["dependency"], d["readiness"]
                ),
            }
            for d in dims
        ],
        key=lambda x: x["priorityScore"],
        reverse=True,
    )

    risks = _risk_flags(dims)
    if risks:
        risk_tail = f"{len(risks)} risk flag(s) identified requiring attention."
    else:
        risk_tail = "No critical risk flags detected."

    return {
        "overallScore": overall_score,
        "overallBand": overall_band,
        "overallInterpretation": (
            f"Overall HC maturity is at {overall_band} level ({overall_score}/5). {risk_tail}"
        ),
        "dimensions": dims,
        "prioritizationSignals": prioritization,
        "riskFlags": risks,
    }


# -----------------------------------------------------------------------------
# Input shaping — pull review dimensions from intake or diagnostic results.
# -----------------------------------------------------------------------------


def _extract_review_dimensions(review: HcReview) -> list[dict[str, Any]]:
    """Resolve the list of {name, score} dimensions for the engine.

    Order of preference:
      1. diagnostic_results.dimensions (Replit-native shape)
      2. intake_data.maturity_ratings (dict[dimension_key -> int])
      3. intake_data.dimensions
    """
    dr = review.diagnostic_results or {}
    dims = dr.get("dimensions") if isinstance(dr, dict) else None
    if isinstance(dims, list) and dims:
        return [{"name": d.get("name") or d.get("key") or "", "score": float(d.get("score") or 0)} for d in dims]

    intake = review.intake_data or {}
    if isinstance(intake, dict):
        ratings = intake.get("maturity_ratings")
        if isinstance(ratings, dict) and ratings:
            return [{"name": k, "score": float(v or 0)} for k, v in ratings.items()]
        idims = intake.get("dimensions")
        if isinstance(idims, list) and idims:
            return [
                {"name": d.get("name") or d.get("key") or "", "score": float(d.get("score") or 0)}
                for d in idims
            ]
    return []


# -----------------------------------------------------------------------------
# Async DB orchestration.
# -----------------------------------------------------------------------------


async def run(
    db: AsyncSession,
    review_id: uuid.UUID,
    maturity_model_id: uuid.UUID,
) -> MaturityAssessment:
    """Compute maturity for a review and persist results.

    Idempotent — re-running with the same review dimensions / bands produces
    the same inputs_hash; rows are replaced (delete + insert pattern keeps the
    code portable across PG/SQLite for tests).
    """
    review = (
        await db.execute(select(HcReview).where(HcReview.id == review_id))
    ).scalar_one_or_none()
    if review is None:
        raise ValueError(f"HcReview {review_id} not found")

    model = (
        await db.execute(select(MaturityModel).where(MaturityModel.id == maturity_model_id))
    ).scalar_one_or_none()
    if model is None:
        raise ValueError(f"MaturityModel {maturity_model_id} not found")

    band_rows = (
        await db.execute(
            select(MaturityBand).where(MaturityBand.maturity_model_id == maturity_model_id)
        )
    ).scalars().all()
    bands = [
        {
            "band_name": b.band_name,
            "min_score": float(b.min_score) if b.min_score is not None else None,
            "max_score": float(b.max_score) if b.max_score is not None else None,
            "sort_order": b.sort_order or 0,
        }
        for b in band_rows
    ]

    review_dims = _extract_review_dimensions(review)
    result = calculate_maturity(review_dims, bands)

    inputs_hash = compute_hash(
        {
            "model_id": str(maturity_model_id),
            "dimensions": review_dims,
            "bands": bands,
        }
    )

    # Find or create the assessment row (idempotent by review+model).
    existing = (
        await db.execute(
            select(MaturityAssessment).where(
                MaturityAssessment.review_id == review_id,
                MaturityAssessment.maturity_model_id == maturity_model_id,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    meta = {
        "prioritization_signals": result["prioritizationSignals"],
        "risk_flags": result["riskFlags"],
        "interpretation": result["overallInterpretation"],
    }

    if existing is not None and existing.inputs_hash == inputs_hash:
        return existing

    if existing is None:
        assessment = MaturityAssessment(
            tenant_id=review.tenant_id,
            review_id=review_id,
            maturity_model_id=maturity_model_id,
            overall_score=result["overallScore"],
            overall_band=result["overallBand"],
            computed_at=now,
            inputs_hash=inputs_hash,
            meta=meta,
        )
        db.add(assessment)
        await db.flush()
    else:
        assessment = existing
        assessment.overall_score = result["overallScore"]
        assessment.overall_band = result["overallBand"]
        assessment.computed_at = now
        assessment.inputs_hash = inputs_hash
        assessment.meta = meta
        await db.flush()

    # Replace dimension rows for this assessment (deterministic rebuild).
    await db.execute(
        delete(MaturityDimensionResult).where(
            MaturityDimensionResult.assessment_id == assessment.id
        )
    )
    for d in result["dimensions"]:
        db.add(
            MaturityDimensionResult(
                assessment_id=assessment.id,
                dimension_key=d["dimensionCode"] or d["dimensionName"],
                score=d["score"],
                band_name=d["bandName"],
                criticality=d["criticality"],
                readiness=d["readiness"],
                narrative=d["interpretation"],
                meta={
                    "dimension_name": d["dimensionName"],
                    "gap_size": d["gapSize"],
                    "dependency": d["dependency"],
                },
            )
        )

    await db.flush()
    return assessment
