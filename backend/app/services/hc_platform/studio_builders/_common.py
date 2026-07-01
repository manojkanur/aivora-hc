"""Shared helpers for studio builders.

These utilities keep individual builder modules small and consistent. All
functions are deterministic SQL aggregations against the real HC platform
tables. When tenant-specific data is missing, helpers fall back to global
seed rows (recommendation_library, maturity_models, benchmark_profiles,
scenario_templates) so the demo always renders something real.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.benchmarks import (
    BenchmarkComparison,
    BenchmarkDimensionScore,
    BenchmarkProfile,
)
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
    MaturityModel,
)
from app.models.hc_platform.projects import Project
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapPhase,
    RoadmapRecommendation,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def section(
    section_id: str,
    title: str,
    layout: str,
    data: dict[str, Any] | list[Any],
    footnote: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": section_id,
        "title": title,
        "layout": layout,
        "data": data,
    }
    if footnote:
        out["footnote"] = footnote
    return out


def document(
    studio_id: str,
    title: str,
    subtitle: str,
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "studio_id": studio_id,
        "title": title,
        "subtitle": subtitle,
        "generated_at": now_iso(),
        "sections": sections,
    }


async def latest_review(db: AsyncSession, tenant_id: uuid.UUID) -> HcReview | None:
    stmt = (
        select(HcReview)
        .where(HcReview.tenant_id == tenant_id)
        .order_by(desc(HcReview.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def latest_project(db: AsyncSession, tenant_id: uuid.UUID) -> Project | None:
    stmt = (
        select(Project)
        .where(Project.tenant_id == tenant_id)
        .order_by(desc(Project.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def latest_assessment(
    db: AsyncSession, review_id: uuid.UUID | None
) -> MaturityAssessment | None:
    if review_id is None:
        return None
    stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.review_id == review_id)
        .order_by(desc(MaturityAssessment.computed_at).nullslast(), desc(MaturityAssessment.id))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def assessment_dimensions(
    db: AsyncSession, assessment_id: uuid.UUID | None
) -> list[MaturityDimensionResult]:
    if assessment_id is None:
        return []
    stmt = select(MaturityDimensionResult).where(
        MaturityDimensionResult.assessment_id == assessment_id
    )
    return list((await db.execute(stmt)).scalars().all())


async def latest_benchmark_comparison(
    db: AsyncSession, review_id: uuid.UUID | None
) -> BenchmarkComparison | None:
    if review_id is None:
        return None
    stmt = (
        select(BenchmarkComparison)
        .where(BenchmarkComparison.review_id == review_id)
        .order_by(desc(BenchmarkComparison.computed_at).nullslast(), desc(BenchmarkComparison.id))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def pick_benchmark_profile(
    db: AsyncSession, industry: str | None, company_size: str | None
) -> BenchmarkProfile | None:
    rows = list((await db.execute(select(BenchmarkProfile))).scalars().all())
    if not rows:
        return None

    def _score(p: BenchmarkProfile) -> int:
        s = 0
        if industry and p.industry and industry.lower() in p.industry.lower():
            s += 10
        if company_size and p.company_size == company_size:
            s += 3
        return s

    return sorted(rows, key=_score, reverse=True)[0]


async def benchmark_dim_scores(
    db: AsyncSession, profile_id: uuid.UUID
) -> list[BenchmarkDimensionScore]:
    stmt = select(BenchmarkDimensionScore).where(
        BenchmarkDimensionScore.benchmark_profile_id == profile_id
    )
    return list((await db.execute(stmt)).scalars().all())


async def default_maturity_model(db: AsyncSession) -> MaturityModel | None:
    stmt = select(MaturityModel).order_by(MaturityModel.created_at.asc()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def latest_roadmap(
    db: AsyncSession, tenant_id: uuid.UUID, project_id: uuid.UUID | None
) -> Roadmap | None:
    stmt = select(Roadmap).where(Roadmap.tenant_id == tenant_id)
    if project_id is not None:
        stmt = stmt.where(Roadmap.project_id == project_id)
    stmt = stmt.order_by(desc(Roadmap.created_at)).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def roadmap_phases(db: AsyncSession, review_id: uuid.UUID) -> list[RoadmapPhase]:
    stmt = (
        select(RoadmapPhase)
        .where(RoadmapPhase.review_id == review_id)
        .order_by(RoadmapPhase.sort_order.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def roadmap_recs(
    db: AsyncSession, review_id: uuid.UUID
) -> list[RoadmapRecommendation]:
    stmt = (
        select(RoadmapRecommendation)
        .where(RoadmapRecommendation.review_id == review_id)
        .order_by(RoadmapRecommendation.sort_order.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def recommendation_pool(
    db: AsyncSession, categories: list[str], limit: int = 30
) -> list[RecommendationLibrary]:
    """Pull recommendation_library rows by category list, preserve order of categories."""
    stmt = (
        select(RecommendationLibrary)
        .where(RecommendationLibrary.category.in_(categories))
        .order_by(RecommendationLibrary.title)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    if rows:
        return rows[:limit]
    # Fallback: any global library rows.
    stmt2 = (
        select(RecommendationLibrary)
        .where(RecommendationLibrary.is_global.is_(True))
        .order_by(RecommendationLibrary.title)
        .limit(limit)
    )
    return list((await db.execute(stmt2)).scalars().all())


def brief_get(brief: dict[str, Any] | None, path: str, default: Any = None) -> Any:
    """Safe nested getter for brief payloads — `brief_get(brief, "organization.name")`."""
    if not brief or not isinstance(brief, dict):
        return default
    cur: Any = brief
    for key in path.split("."):
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return default
    if cur in (None, "", [], {}):
        return default
    return cur


def brief_org_name(brief: dict[str, Any] | None, fallback: str = "your workforce") -> str:
    name = brief_get(brief, "organization.name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return fallback


def brief_industry(brief: dict[str, Any] | None) -> str | None:
    val = brief_get(brief, "organization.industry")
    return val.strip() if isinstance(val, str) and val.strip() else None


def brief_challenge_areas(brief: dict[str, Any] | None) -> list[str]:
    areas = brief_get(brief, "hcChallenges.selectedAreas", [])
    if isinstance(areas, list):
        return [str(a).strip() for a in areas if str(a).strip()]
    return []


def brief_primary_challenge(brief: dict[str, Any] | None, fallback: str = "") -> str:
    areas = brief_challenge_areas(brief)
    return areas[0] if areas else fallback


def brief_situation(brief: dict[str, Any] | None) -> str | None:
    val = brief_get(brief, "businessSituation.summary")
    return val.strip() if isinstance(val, str) and val.strip() else None


def workforce_phrase(brief: dict[str, Any] | None) -> str:
    """`{org}'s workforce` when org is known, else `your workforce`."""
    org = brief_get(brief, "organization.name")
    if isinstance(org, str) and org.strip():
        return f"{org.strip()}'s workforce"
    return "your workforce"


def safe_float(x: Any, default: float = 0.0) -> float:
    try:
        if x is None:
            return default
        return float(x)
    except (TypeError, ValueError):
        return default


def impact_score(value: str | None) -> float:
    if not value:
        return 3.0
    v = value.lower()
    if v in {"high", "very high", "critical"}:
        return 4.5
    if v in {"medium", "moderate"}:
        return 3.0
    if v in {"low"}:
        return 2.0
    return 3.0


def effort_score(value: str | None) -> float:
    if not value:
        return 3.0
    v = value.lower()
    if v in {"low", "quick"}:
        return 2.0
    if v in {"medium", "moderate"}:
        return 3.0
    if v in {"high", "heavy"}:
        return 4.0
    return 3.0


def horizon_weeks(value: str | None) -> int:
    if not value:
        return 12
    v = value.lower()
    if "0-3" in v or "quick" in v or "short" in v:
        return 8
    if "3-6" in v or "medium" in v:
        return 16
    if "6-12" in v or "long" in v:
        return 32
    if "12" in v:
        return 48
    return 12


def severity_rank(severity: str | None) -> int:
    s = (severity or "").lower()
    return {"high": 3, "critical": 3, "medium": 2, "moderate": 2, "low": 1, "watch": 1}.get(s, 1)
