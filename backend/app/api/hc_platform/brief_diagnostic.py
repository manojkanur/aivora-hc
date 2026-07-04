"""Brief -> Diagnostic demo endpoint.

POST /api/v1/hc-platform/diagnose-from-brief

Takes a Challenge Brief (frontend shape), maps it into:
  * an HcReview row (created or reused per-tenant)
  * a diagnostic_results.dimensions[] derived from selectedAreas + severities
  * runs maturity_engine + benchmark_engine
  * fetches a tailored slice of the recommendation library

Returns one bundled JSON so the frontend can render results from a single call.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.benchmarks import BenchmarkComparison, BenchmarkProfile
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
    MaturityModel,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.services.audit import log_event
from app.services.hc_platform import benchmark_engine, maturity_engine

router = APIRouter()


# ---------------------------------------------------------------------------
# Dimension + recommendation mapping
# ---------------------------------------------------------------------------

# 7 dimensions used by the seeded maturity_model + benchmark profiles.
DIMENSIONS: list[tuple[str, str]] = [
    ("strategy", "Strategy"),
    ("processes", "Processes"),
    ("people", "People"),
    ("data_technology", "Data & Technology"),
    ("governance", "Governance"),
    ("culture", "Culture"),
    ("capability", "Capability"),
]

# Brief challenge area -> dimension keys it affects.
AREA_TO_DIMS: dict[str, list[str]] = {
    "strategy-business-alignment": ["strategy"],
    "workforce-planning": ["strategy", "people"],
    "capability-skills": ["capability", "people"],
    "learning-training": ["capability"],
    "leadership": ["people", "culture"],
    "succession": ["people", "capability"],
    "mobility": ["people", "processes"],
    "talent-acquisition": ["people", "processes"],
    "performance": ["people", "processes"],
    "employee-experience": ["culture", "people"],
    "rewards": ["processes", "people"],
    "organization-design": ["processes", "governance"],
    "process-excellence": ["processes"],
    "governance-operating-model": ["governance"],
    "ai-digital-transformation": ["data_technology", "capability"],
    "culture-change-readiness": ["culture"],
    "analytics-productivity": ["data_technology"],
}

# Severity -> score (lower = bigger gap).
SEVERITY_SCORE: dict[str, float] = {
    "critical": 1.6,
    "high": 2.4,
    "moderate": 3.0,
    "watch": 3.6,
}
BASELINE_SCORE = 3.5

# Recommendation library category buckets per dimension (for filtering recs).
DIM_TO_REC_CATEGORIES: dict[str, list[str]] = {
    "strategy": ["workforce_planning", "leadership"],
    "processes": ["performance", "organisation"],
    "people": ["talent", "leadership", "comp_and_benefits"],
    "data_technology": ["learning"],
    "governance": ["organisation"],
    "culture": ["culture"],
    "capability": ["learning"],
}


def derive_dimensions(brief: dict[str, Any]) -> list[dict[str, Any]]:
    """Turn brief.hcChallenges.selectedAreas into a 7-dimension scored list."""
    selected = (
        brief.get("hcChallenges", {}).get("selectedAreas") or []
    )
    # gather all severities affecting each dimension; lowest score wins
    per_dim: dict[str, list[float]] = {key: [] for key, _ in DIMENSIONS}
    for sel in selected:
        area = sel.get("area")
        sev = sel.get("severity", "moderate")
        score = SEVERITY_SCORE.get(sev, BASELINE_SCORE)
        for dim_key in AREA_TO_DIMS.get(area, []):
            per_dim[dim_key].append(score)

    out: list[dict[str, Any]] = []
    for key, name in DIMENSIONS:
        scores = per_dim[key]
        score = min(scores) if scores else BASELINE_SCORE
        out.append({"key": key, "name": name, "score": round(score, 2)})
    return out


TARGET_MATURITY = 4.0


def _area_label(area: str | None) -> str:
    return (area or "unknown area").replace("-", " ").title()


def _business_meaning(score: float, band: str) -> str:
    gap = round(TARGET_MATURITY - score, 2)
    if gap >= 2.0:
        return (
            f"At {score:.2f}/5 this dimension sits {gap:.2f} points below the 4.0 target. "
            "In practice that means it is likely constraining day-to-day execution and should be a first-wave investment."
        )
    if gap >= 1.0:
        return (
            f"This dimension is {gap:.2f} points below the 4.0 target. "
            "The gap is meaningful but closable with a structured 12-18 month improvement plan."
        )
    if gap > 0.0:
        return (
            f"This dimension is {gap:.2f} points below the 4.0 target - a moderate gap. "
            "Targeted improvements in specific practices should close it without a major programme."
        )
    return (
        f"This dimension is at or above the 4.0 target maturity ({band}). "
        "The priority is to sustain current practices rather than invest in new ones."
    )


def build_scoring_explanations(
    brief: dict[str, Any], dim_results: list["DimensionResult"]
) -> None:
    """Attach an honest per-dimension scoring_explanation derived from the brief.

    The brief-to-diagnosis pipeline is fully deterministic: selected challenge
    areas map to dimensions, severity maps to a score, lowest score wins, and
    untouched dimensions sit at a neutral 3.5 baseline. No LLM inference and no
    uploaded evidence are involved, and the explanation says so.
    """
    selected = (brief.get("hcChallenges") or {}).get("selectedAreas") or []
    per_dim: dict[str, list[tuple[str, str, float]]] = {}
    for sel in selected:
        if not isinstance(sel, dict):
            continue
        area = sel.get("area")
        sev = str(sel.get("severity", "moderate"))
        score = SEVERITY_SCORE.get(sev, BASELINE_SCORE)
        for dim_key in AREA_TO_DIMS.get(area, []):
            per_dim.setdefault(dim_key, []).append((_area_label(area), sev, score))

    for d in dim_results:
        contributions = per_dim.get(d.code, [])
        band = d.band or "this"
        missing: list[str] = [
            "Supporting documents or HR data - no evidence files were used in this assessment"
        ]
        if contributions:
            driver = min(contributions, key=lambda c: c[2])
            inputs_used = [
                f"Challenge area '{label}' rated {sev} severity in your brief"
                for label, sev, _ in contributions
            ]
            basis = "user_answers"
            methodology = (
                "Each challenge area selected in your brief maps to one or more dimensions, and its severity "
                "sets a score (critical 1.6, high 2.4, moderate 3.0, watch 3.6 out of 5). The lowest score among "
                "contributing areas becomes the dimension score - no AI inference is used."
            )
            rating_rationale = (
                f"Rated {band} because '{driver[0]}' was flagged at {driver[1]} severity, mapping to "
                f"{driver[2]}/5 - the most severe of {len(contributions)} contributing challenge area(s)."
            )
            confidence = "high" if len(contributions) >= 3 else "medium"
            missing.append(
                "Independent validation - severity ratings are self-reported in the brief"
            )
        else:
            inputs_used = [
                "Neutral baseline assumption of 3.5/5 (no brief inputs touch this dimension)"
            ]
            basis = "benchmark_assumption"
            methodology = (
                "None of the challenge areas selected in your brief map to this dimension, so it was held at a "
                "neutral baseline of 3.5/5 rather than assessed from your answers."
            )
            rating_rationale = (
                f"Rated {band} by default: this dimension was not covered by your selected challenge areas, "
                "so the score reflects a neutral assumption rather than an assessment."
            )
            confidence = "low"
            missing.append(
                "Your input on this dimension - add a related challenge area to the brief to score it from your answers"
            )
        d.scoring_explanation = ScoringExplanation(
            inputs_used=inputs_used,
            basis=basis,
            methodology=methodology,
            evidence_used=[],
            missing_information=missing,
            confidence=confidence,
            rating_rationale=rating_rationale,
            business_meaning=_business_meaning(d.score, band),
        )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DiagnoseFromBriefRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    brief: dict[str, Any]
    workspace_id: str | None = None


class ScoringExplanation(BaseModel):
    inputs_used: list[str] = []
    basis: str  # user_answers | evidence | benchmark_assumption | ai_inference | mixed
    methodology: str
    evidence_used: list[str] = []
    missing_information: list[str] = []
    confidence: str  # high | medium | low
    rating_rationale: str
    business_meaning: str


class DimensionResult(BaseModel):
    code: str
    name: str
    score: float
    band: str | None = None
    criticality: str | None = None
    gap_size: float | None = None
    interpretation: str | None = None
    scoring_explanation: ScoringExplanation | None = None


class RiskFlag(BaseModel):
    risk_type: str
    severity: str
    description: str
    suggested_action: str
    affected_dimensions: list[str] = []


class BenchmarkDim(BaseModel):
    code: str
    name: str | None = None
    company_score: float
    benchmark_average: float
    top_quartile: float
    gap: float
    positioning: str


class RecommendationOut(BaseModel):
    key: str
    title: str
    description: str | None = None
    category: str | None = None
    time_horizon: str | None = None
    tier: str | None = None
    default_impact: str | None = None
    default_effort: str | None = None
    matched_dimension: str | None = None


class DiagnoseFromBriefResponse(BaseModel):
    review_id: uuid.UUID
    company_name: str
    industry: str | None = None
    region: str | None = None
    company_size: str | None = None
    overall_score: float
    overall_band: str
    overall_interpretation: str
    dimensions: list[DimensionResult]
    risk_flags: list[RiskFlag]
    benchmark_profile_name: str | None = None
    benchmark_positioning_summary: str | None = None
    benchmark_overall: dict[str, Any] | None = None
    benchmark_dimensions: list[BenchmarkDim] = []
    recommendations: list[RecommendationOut] = []


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------


async def _get_or_create_review(
    db, tenant_id: uuid.UUID, user_id: uuid.UUID, brief: dict[str, Any]
) -> HcReview:
    """Reuse the most-recent review created by the brief flow, otherwise create."""
    org = brief.get("organization") or {}
    company_name = org.get("organizationName") or "Untitled engagement"

    # Try to find an existing brief-driven review for this tenant + same company name.
    stmt = (
        select(HcReview)
        .where(HcReview.tenant_id == tenant_id, HcReview.company_name == company_name)
        .order_by(HcReview.created_at.desc())
        .limit(1)
    )
    r = (await db.execute(stmt)).scalar_one_or_none()
    if r is not None:
        return r
    r = HcReview(
        tenant_id=tenant_id,
        company_name=company_name,
        review_type="full_hc_review",
        industry=org.get("industry"),
        region=org.get("region"),
        company_size=org.get("organizationSize"),
        created_by=user_id,
    )
    db.add(r)
    await db.flush()
    await db.refresh(r)
    return r


async def _pick_benchmark_profile(
    db, industry: str | None, company_size: str | None
) -> BenchmarkProfile | None:
    stmt = select(BenchmarkProfile)
    # exact industry preferred
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return None
    # naive ranking: industry contains match → size match → first
    def score(p: BenchmarkProfile) -> int:
        s = 0
        if industry and p.industry and industry.lower() in p.industry.lower():
            s += 10
        if company_size and p.company_size == company_size:
            s += 3
        return s

    rows = sorted(rows, key=score, reverse=True)
    return rows[0]


async def _pick_recommendations(
    db, dim_results: list[DimensionResult], limit: int = 8
) -> list[RecommendationOut]:
    """Pick recs from the library by mapping low-scoring dims -> rec categories."""
    # rank dimensions by gap (lower score = bigger gap)
    sorted_dims = sorted(dim_results, key=lambda d: d.score)
    seen: set[str] = set()
    out: list[RecommendationOut] = []

    for d in sorted_dims:
        cats = DIM_TO_REC_CATEGORIES.get(d.code, [])
        for cat in cats:
            if len(out) >= limit:
                break
            stmt = (
                select(RecommendationLibrary)
                .where(RecommendationLibrary.category == cat)
                .order_by(RecommendationLibrary.title)
            )
            recs = (await db.execute(stmt)).scalars().all()
            for r in recs:
                if r.key in seen or len(out) >= limit:
                    continue
                seen.add(r.key)
                out.append(
                    RecommendationOut(
                        key=r.key,
                        title=r.title,
                        description=r.description,
                        category=r.category,
                        time_horizon=r.time_horizon,
                        tier=r.tier,
                        default_impact=r.default_impact,
                        default_effort=r.default_effort,
                        matched_dimension=d.name,
                    )
                )
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/diagnose-from-brief", response_model=DiagnoseFromBriefResponse)
async def diagnose_from_brief(
    payload: DiagnoseFromBriefRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> DiagnoseFromBriefResponse:
    brief = payload.brief or {}

    # 1. Map brief -> dimensions
    dims = derive_dimensions(brief)

    # 2. Get/create review and stamp inputs
    review = await _get_or_create_review(db, current_tenant.id, current_user.id, brief)
    review.diagnostic_results = {"dimensions": dims, "source": "challenge_brief"}
    review.intake_data = {
        "brief_snapshot": {
            "organization": brief.get("organization"),
            "businessSituation": brief.get("businessSituation"),
            "hcChallenges": brief.get("hcChallenges"),
            "desiredOutputs": brief.get("desiredOutputs"),
        }
    }
    org = brief.get("organization") or {}
    if org.get("industry"):
        review.industry = org["industry"]
    if org.get("region"):
        review.region = org["region"]
    if org.get("organizationSize"):
        review.company_size = org["organizationSize"]
    review.status = "diagnosed"
    await db.flush()

    # 3. Pick a maturity model (first available)
    model = (
        await db.execute(
            select(MaturityModel).order_by(MaturityModel.created_at.asc()).limit(1)
        )
    ).scalar_one_or_none()
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No maturity model seeded. Run the seed script first.",
        )

    # 4. Run maturity engine
    try:
        assessment = await maturity_engine.run(db, review.id, model.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Pull dimension rows for response
    dim_rows = (
        await db.execute(
            select(MaturityDimensionResult).where(
                MaturityDimensionResult.assessment_id == assessment.id
            )
        )
    ).scalars().all()

    dim_results = [
        DimensionResult(
            code=d.dimension_key,
            name=(d.meta or {}).get("dimension_name") if d.meta else d.dimension_key,
            score=float(d.score) if d.score is not None else 0.0,
            band=d.band_name,
            criticality=d.criticality,
            gap_size=(d.meta or {}).get("gap_size") if d.meta else None,
            interpretation=d.narrative,
        )
        for d in dim_rows
    ]
    build_scoring_explanations(brief, dim_results)

    risk_flags_raw = (assessment.meta or {}).get("risk_flags") or []
    risk_flags = [
        RiskFlag(
            risk_type=r.get("riskType", ""),
            severity=r.get("severity", ""),
            description=r.get("description", ""),
            suggested_action=r.get("suggestedAction", ""),
            affected_dimensions=r.get("affectedDimensions", []),
        )
        for r in risk_flags_raw
    ]

    # 5. Run benchmark engine
    profile = await _pick_benchmark_profile(db, review.industry, review.company_size)
    bench_profile_name = None
    bench_summary = None
    bench_overall: dict[str, Any] | None = None
    bench_dims: list[BenchmarkDim] = []
    if profile is not None:
        try:
            comparison = await benchmark_engine.run(db, review.id, profile.id)
            bench_profile_name = profile.name
            bench_summary = comparison.overall_positioning
            data = comparison.comparison_data or {}
            bench_overall = {
                "company_score": data.get("overallCompanyScore"),
                "benchmark_average": data.get("overallBenchmarkAverage"),
                "gap": data.get("overallGap"),
                "positioning": data.get("overallPositioning"),
            }
            for d in data.get("dimensions", []):
                bench_dims.append(
                    BenchmarkDim(
                        code=d.get("dimensionCode", ""),
                        name=d.get("dimensionName"),
                        company_score=d.get("companyScore", 0.0),
                        benchmark_average=d.get("benchmarkAverage", 0.0),
                        top_quartile=d.get("topQuartile", 0.0),
                        gap=d.get("gap", 0.0),
                        positioning=d.get("positioning", "unknown"),
                    )
                )
        except ValueError:
            pass

    # 6. Pick recommendations
    recommendations = await _pick_recommendations(db, dim_results, limit=8)

    # 7. Audit
    try:
        await log_event(
            tenant_id=current_tenant.id,
            user_id=current_user.id,
            action="hc_platform.diagnose_from_brief",
            payload={"review_id": str(review.id), "workspace_id": payload.workspace_id},
        )
    except Exception:
        pass

    return DiagnoseFromBriefResponse(
        review_id=review.id,
        company_name=review.company_name or "Untitled engagement",
        industry=review.industry,
        region=review.region,
        company_size=review.company_size,
        overall_score=float(assessment.overall_score or 0.0),
        overall_band=assessment.overall_band or "Unknown",
        overall_interpretation=(assessment.meta or {}).get("interpretation", ""),
        dimensions=dim_results,
        risk_flags=risk_flags,
        benchmark_profile_name=bench_profile_name,
        benchmark_positioning_summary=bench_summary,
        benchmark_overall=bench_overall,
        benchmark_dimensions=bench_dims,
        recommendations=recommendations,
    )


# ---------------------------------------------------------------------------
# Re-fetch a previously computed diagnosis (for the results page reload)
# ---------------------------------------------------------------------------


@router.get("/diagnose-from-brief/{review_id}", response_model=DiagnoseFromBriefResponse)
async def get_diagnosis(
    review_id: uuid.UUID,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> DiagnoseFromBriefResponse:
    stmt = select(HcReview).where(
        HcReview.id == review_id, HcReview.tenant_id == current_tenant.id
    )
    review = (await db.execute(stmt)).scalar_one_or_none()
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    # Latest assessment
    assessment = (
        await db.execute(
            select(MaturityAssessment)
            .where(MaturityAssessment.review_id == review_id)
            .order_by(MaturityAssessment.computed_at.desc().nullslast())
            .limit(1)
        )
    ).scalar_one_or_none()
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No assessment computed yet - POST /diagnose-from-brief first.",
        )

    dim_rows = (
        await db.execute(
            select(MaturityDimensionResult).where(
                MaturityDimensionResult.assessment_id == assessment.id
            )
        )
    ).scalars().all()
    dim_results = [
        DimensionResult(
            code=d.dimension_key,
            name=(d.meta or {}).get("dimension_name") if d.meta else d.dimension_key,
            score=float(d.score) if d.score is not None else 0.0,
            band=d.band_name,
            criticality=d.criticality,
            gap_size=(d.meta or {}).get("gap_size") if d.meta else None,
            interpretation=d.narrative,
        )
        for d in dim_rows
    ]
    # Rebuild explanations from the stored brief snapshot; skip for reviews that
    # were not driven by a challenge brief (old payloads keep the field absent).
    intake = review.intake_data or {}
    brief_snapshot = intake.get("brief_snapshot") if isinstance(intake, dict) else None
    diag = review.diagnostic_results or {}
    if isinstance(brief_snapshot, dict) and isinstance(diag, dict) and diag.get("source") == "challenge_brief":
        build_scoring_explanations(brief_snapshot, dim_results)

    risk_flags_raw = (assessment.meta or {}).get("risk_flags") or []
    risk_flags = [
        RiskFlag(
            risk_type=r.get("riskType", ""),
            severity=r.get("severity", ""),
            description=r.get("description", ""),
            suggested_action=r.get("suggestedAction", ""),
            affected_dimensions=r.get("affectedDimensions", []),
        )
        for r in risk_flags_raw
    ]

    # Latest benchmark comparison (if any)
    comparison = (
        await db.execute(
            select(BenchmarkComparison)
            .where(BenchmarkComparison.review_id == review_id)
            .order_by(BenchmarkComparison.computed_at.desc().nullslast())
            .limit(1)
        )
    ).scalar_one_or_none()
    bench_profile_name = None
    bench_summary = None
    bench_overall: dict[str, Any] | None = None
    bench_dims: list[BenchmarkDim] = []
    if comparison is not None:
        profile = await db.get(BenchmarkProfile, comparison.benchmark_profile_id)
        if profile is not None:
            bench_profile_name = profile.name
        bench_summary = comparison.overall_positioning
        data = comparison.comparison_data or {}
        bench_overall = {
            "company_score": data.get("overallCompanyScore"),
            "benchmark_average": data.get("overallBenchmarkAverage"),
            "gap": data.get("overallGap"),
            "positioning": data.get("overallPositioning"),
        }
        for d in data.get("dimensions", []):
            bench_dims.append(
                BenchmarkDim(
                    code=d.get("dimensionCode", ""),
                    name=d.get("dimensionName"),
                    company_score=d.get("companyScore", 0.0),
                    benchmark_average=d.get("benchmarkAverage", 0.0),
                    top_quartile=d.get("topQuartile", 0.0),
                    gap=d.get("gap", 0.0),
                    positioning=d.get("positioning", "unknown"),
                )
            )

    recommendations = await _pick_recommendations(db, dim_results, limit=8)

    return DiagnoseFromBriefResponse(
        review_id=review.id,
        company_name=review.company_name or "Untitled engagement",
        industry=review.industry,
        region=review.region,
        company_size=review.company_size,
        overall_score=float(assessment.overall_score or 0.0),
        overall_band=assessment.overall_band or "Unknown",
        overall_interpretation=(assessment.meta or {}).get("interpretation", ""),
        dimensions=dim_results,
        risk_flags=risk_flags,
        benchmark_profile_name=bench_profile_name,
        benchmark_positioning_summary=bench_summary,
        benchmark_overall=bench_overall,
        benchmark_dimensions=bench_dims,
        recommendations=recommendations,
    )
