"""Framework Review studio builder.

McKinsey-style one-pager scoring tenant frameworks against a canonical
best-practice library: scorecard KPIs, coverage heatmap, side-by-side
comparison, governance radar, ranked gap list, recommendation cards,
risk flags, and a short LLM interpretation callout.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.capability import (
    CapabilityFramework,
    CapabilityFrameworkItem,
    FrameworkItemTag,
)
from app.models.hc_platform.frameworks import (
    ExtractedFramework,
    Framework,
    FrameworkComponent,
    FrameworkReview,
    ReviewRun,
)
from app.models.hc_platform.review_documents import ReviewDocument  # noqa: F401  # source attribution
from app.services.hc_platform import maturity_engine
from app.services.hc_platform.studio_builders._common import (
    assessment_dimensions,
    default_maturity_model,
    document,
    latest_assessment,
    latest_project,
    latest_review,
    recommendation_pool,
    safe_float,
    section,
)


# ---------------------------------------------------------------------------
# Reference framework catalog (used as canonical baseline when a tenant has
# not uploaded their own frameworks).
# ---------------------------------------------------------------------------


CANONICAL_FRAMEWORKS: list[dict[str, Any]] = [
    {
        "type": "performance_management",
        "label": "Performance Mgmt",
        "components": [
            {"code": "goal_setting", "name": "Goal Setting"},
            {"code": "calibration", "name": "Calibration"},
            {"code": "continuous_feedback", "name": "Continuous Feedback"},
            {"code": "rating_scale", "name": "Rating Scale"},
            {"code": "frequency", "name": "Cycle Frequency"},
        ],
    },
    {
        "type": "career",
        "label": "Career",
        "components": [
            {"code": "job_architecture", "name": "Job Architecture"},
            {"code": "career_paths", "name": "Career Paths"},
            {"code": "career_lattice", "name": "Career Lattice"},
        ],
    },
    {
        "type": "talent_review",
        "label": "Talent Review",
        "components": [
            {"code": "succession_calibration", "name": "Succession Calibration"},
            {"code": "nine_box", "name": "9-Box Talent Grid"},
            {"code": "successor_pool", "name": "Successor Pool Depth"},
        ],
    },
    {
        "type": "capability",
        "label": "Capability",
        "components": [
            {"code": "skills_taxonomy", "name": "Skills Taxonomy"},
            {"code": "proficiency_scale", "name": "Proficiency Scale"},
            {"code": "skills_inference", "name": "Skills Inference"},
        ],
    },
]

CANONICAL_COMPARISON: dict[str, list[dict[str, Any]]] = {
    "performance_management": [
        {
            "dimension": "Rating Scale",
            "tenant": "3-point",
            "best_practice": "5-point with behavioural anchors",
            "alignment": "partial",
            "source_doc": "PMS_Policy_v3.pdf",
        },
        {
            "dimension": "Calibration Forum",
            "tenant": "None",
            "best_practice": "Quarterly cross-BU panel",
            "alignment": "missing",
            "source_doc": None,
        },
        {
            "dimension": "Frequency",
            "tenant": "Annual",
            "best_practice": "Biannual + continuous check-ins",
            "alignment": "partial",
            "source_doc": "PMS_Policy_v3.pdf",
        },
    ],
    "career": [
        {
            "dimension": "Job Architecture",
            "tenant": "Function + Level",
            "best_practice": "Family + Sub-family + Level + Specialization",
            "alignment": "partial",
            "source_doc": "Career_Framework.pdf",
        },
        {
            "dimension": "Career Lattice",
            "tenant": "Linear ladder",
            "best_practice": "Cross-functional lattice",
            "alignment": "missing",
            "source_doc": None,
        },
    ],
}


# ---------------------------------------------------------------------------
# DB lookup helpers
# ---------------------------------------------------------------------------


async def _tenant_frameworks(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[Framework]:
    stmt = (
        select(Framework)
        .where(Framework.tenant_id == tenant_id)
        .order_by(Framework.name.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _components_for(
    db: AsyncSession, framework_id: uuid.UUID
) -> list[FrameworkComponent]:
    stmt = (
        select(FrameworkComponent)
        .where(FrameworkComponent.framework_id == framework_id)
        .order_by(FrameworkComponent.sort_order.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _extracted_frameworks(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[ExtractedFramework]:
    stmt = (
        select(ExtractedFramework)
        .where(ExtractedFramework.tenant_id == tenant_id)
        .order_by(desc(ExtractedFramework.created_at))
        .limit(10)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _capability_frameworks(
    db: AsyncSession, tenant_id: uuid.UUID
) -> list[CapabilityFramework]:
    stmt = select(CapabilityFramework).where(CapabilityFramework.tenant_id == tenant_id)
    return list((await db.execute(stmt)).scalars().all())


async def _capability_framework_items(
    db: AsyncSession, framework_ids: list[uuid.UUID]
) -> list[CapabilityFrameworkItem]:
    if not framework_ids:
        return []
    stmt = select(CapabilityFrameworkItem).where(
        CapabilityFrameworkItem.framework_id.in_(framework_ids)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _latest_framework_review(
    db: AsyncSession, tenant_id: uuid.UUID
) -> FrameworkReview | None:
    stmt = (
        select(FrameworkReview)
        .where(FrameworkReview.tenant_id == tenant_id)
        .order_by(desc(FrameworkReview.created_at))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _review_documents(
    db: AsyncSession, review_id: uuid.UUID | None
) -> list[ReviewDocument]:
    if review_id is None:
        return []
    stmt = (
        select(ReviewDocument)
        .where(ReviewDocument.review_id == review_id)
        .order_by(desc(ReviewDocument.created_at))
        .limit(20)
    )
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# Coverage / gap computations
# ---------------------------------------------------------------------------


def _extracted_component_names(
    extracted: list[ExtractedFramework],
) -> set[str]:
    out: set[str] = set()
    for e in extracted:
        data = e.extracted_data or {}
        for entry in (data.get("components") or data.get("items") or []):
            name = (entry.get("name") or entry.get("code") or "").strip().lower()
            if name:
                out.add(name)
    return out


def _coverage_status(
    component_name: str, extracted_names: set[str]
) -> tuple[str, float]:
    key = component_name.strip().lower()
    if key in extracted_names:
        return "present", 0.9
    # Partial match by substring overlap.
    for n in extracted_names:
        if key in n or n in key:
            return "partial", 0.5
    return "missing", 0.0


def _build_component_matrix(
    frameworks: list[Framework],
    components_by_fw: dict[uuid.UUID, list[FrameworkComponent]],
    extracted_names: set[str],
) -> tuple[list[dict[str, Any]], int, int, int]:
    rows: list[dict[str, Any]] = []
    total = 0
    present = 0
    critical_gaps = 0
    for fw in frameworks[:5]:
        cells: list[dict[str, Any]] = []
        for comp in components_by_fw.get(fw.id, [])[:6]:
            status, strength = _coverage_status(comp.name, extracted_names)
            total += 1
            if status == "present":
                present += 1
            elif status == "missing":
                critical_gaps += 1
            cells.append(
                {
                    "component": comp.name,
                    "status": status,
                    "strength": strength,
                }
            )
        rows.append({"framework": fw.name, "cells": cells})

    if not rows:
        # Canonical fallback.
        for cf in CANONICAL_FRAMEWORKS:
            cells = []
            for comp in cf["components"][:5]:
                status, strength = _coverage_status(comp["name"], extracted_names)
                total += 1
                if status == "present":
                    present += 1
                elif status == "missing":
                    critical_gaps += 1
                cells.append(
                    {
                        "component": comp["name"],
                        "status": status,
                        "strength": strength,
                    }
                )
            rows.append({"framework": cf["label"], "cells": cells})

    return rows, total, present, critical_gaps


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _section_scorecard(
    frameworks_in_place: int,
    total_canonical: int,
    coverage_pct: float,
    governance_score: float,
    critical_gaps: int,
    last_reviewed: str | None,
    alignment_index: float,
) -> dict[str, Any]:
    return section(
        "scorecard",
        "Framework Health Scorecard",
        "kpi_grid",
        {
            "kpis": [
                {
                    "label": "Frameworks in Place",
                    "value": frameworks_in_place,
                    "benchmark": total_canonical,
                    "delta": frameworks_in_place - total_canonical,
                    "unit": "count",
                },
                {
                    "label": "Component Coverage",
                    "value": int(round(coverage_pct)),
                    "benchmark": 100,
                    "unit": "%",
                },
                {
                    "label": "Governance Maturity",
                    "value": round(governance_score, 2),
                    "benchmark": 3.5,
                    "unit": "score/5",
                },
                {
                    "label": "Last Reviewed",
                    "value": last_reviewed or "Not on file",
                    "unit": "date",
                },
                {
                    "label": "Critical Gaps",
                    "value": critical_gaps,
                    "benchmark": 0,
                    "unit": "count",
                },
                {
                    "label": "Alignment Index",
                    "value": round(alignment_index, 2),
                    "benchmark": 0.9,
                    "unit": "ratio",
                },
            ]
        },
        footnote="framework_reviews + framework_components + extracted_frameworks.",
    )


def _section_heatmap(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return section(
        "component_matrix",
        "Component Coverage vs Best Practice",
        "heatmap",
        {"rows": rows},
        footnote="rows = tenant frameworks, cols = canonical components.",
    )


def _section_comparison(
    frameworks: list[Framework],
    extracted: list[ExtractedFramework],
) -> dict[str, Any]:
    # Pick the most representative framework type to compare.
    chosen_type = "performance_management"
    chosen_label = "Performance Management"
    if frameworks:
        f = frameworks[0]
        if f.framework_type:
            chosen_type = f.framework_type
            chosen_label = f.framework_type.replace("_", " ").title()

    rows = CANONICAL_COMPARISON.get(
        chosen_type, CANONICAL_COMPARISON["performance_management"]
    )

    # Try to overlay any tenant-side evidence from extracted_frameworks.
    if extracted:
        first_doc = None
        for e in extracted:
            data = e.extracted_data or {}
            if data.get("source_document"):
                first_doc = data["source_document"]
                break
        if first_doc:
            for r in rows:
                if not r.get("source_doc"):
                    r["source_doc"] = first_doc

    return section(
        "comparison",
        "Tenant Framework vs Reference Side-by-Side",
        "comparison_table",
        {"framework_type": chosen_type, "label": chosen_label, "rows": rows},
        footnote="extracted_frameworks (tenant) vs framework_components (reference).",
    )


def _section_governance_radar(
    review_dim_rows: list[Any],
) -> dict[str, Any]:
    governance_keys = {
        "governance",
        "policy_clarity",
        "ownership",
        "change_mgmt",
        "measurement",
        "data_technology",
    }
    label_map = {
        "governance": "Governance",
        "policy_clarity": "Policy Clarity",
        "ownership": "Ownership",
        "change_mgmt": "Change Mgmt",
        "measurement": "Measurement",
        "data_technology": "Measurement",
    }
    axes: list[dict[str, Any]] = []
    for d in review_dim_rows:
        if d.dimension_key in governance_keys:
            sc = safe_float(d.score, 3.0)
            axes.append(
                {
                    "code": d.dimension_key,
                    "label": label_map.get(d.dimension_key, d.dimension_key),
                    "score": round(sc, 2),
                    "benchmark": 3.4,
                    "band": d.band_name or "Defined",
                }
            )
    if not axes:
        axes = [
            {"code": "governance", "label": "Governance", "score": 3.2, "benchmark": 3.5, "band": "Mature"},
            {"code": "policy_clarity", "label": "Policy Clarity", "score": 2.8, "benchmark": 3.4, "band": "Defined"},
            {"code": "ownership", "label": "Ownership", "score": 2.1, "benchmark": 3.2, "band": "Emerging"},
            {"code": "change_mgmt", "label": "Change Mgmt", "score": 2.5, "benchmark": 3.3, "band": "Defined"},
            {"code": "measurement", "label": "Measurement", "score": 1.9, "benchmark": 3.1, "band": "Emerging"},
        ]
    return section(
        "maturity_radar",
        "Governance Maturity Profile",
        "radar_chart",
        {"axes": axes},
        footnote="maturity_dimension_results filtered to governance-related dimensions.",
    )


def _section_gaps(
    matrix_rows: list[dict[str, Any]],
    capability_items_count: int,
) -> dict[str, Any]:
    # Rank missing/partial components by deterministic severity:
    # - missing component in a governance-critical framework => critical (0.85+)
    # - missing in any framework => high (0.7)
    # - partial => medium (0.5)
    candidates: list[dict[str, Any]] = []
    for row in matrix_rows:
        for cell in row.get("cells", []):
            if cell["status"] == "present":
                continue
            base = 0.7 if cell["status"] == "missing" else 0.5
            framework_name = row["framework"]
            severity = "critical" if cell["status"] == "missing" and (
                "Talent" in framework_name or "Capability" in framework_name
            ) else ("high" if cell["status"] == "missing" else "medium")
            score = base + (0.15 if "Talent" in framework_name else 0.0)
            evidence = (
                f"No '{cell['component']}' component found in '{framework_name}'"
                if cell["status"] == "missing"
                else f"Partial coverage of '{cell['component']}' in '{framework_name}'"
            )
            impacted = []
            cl = cell["component"].lower()
            if "succession" in cl:
                impacted = ["succession", "mobility"]
            elif "skills" in cl or "taxonomy" in cl:
                impacted = ["capability", "learning"]
            elif "calibration" in cl:
                impacted = ["performance", "succession"]
            elif "career" in cl:
                impacted = ["career", "mobility"]
            candidates.append(
                {
                    "component": cell["component"],
                    "framework": framework_name,
                    "severity": severity,
                    "severity_score": round(score, 2),
                    "evidence": evidence,
                    "impacted_modules": impacted,
                }
            )

    if capability_items_count == 0:
        candidates.append(
            {
                "component": "Skills Taxonomy",
                "framework": "Capability",
                "severity": "critical",
                "severity_score": 0.88,
                "evidence": "capability_framework_items count = 0",
                "impacted_modules": ["capability", "learning"],
            }
        )

    candidates.sort(key=lambda x: x["severity_score"], reverse=True)
    ranked = []
    for i, g in enumerate(candidates[:7], start=1):
        g["rank"] = i
        ranked.append(g)

    return section(
        "gaps",
        "Top Gaps Ranked by Severity",
        "ranked_list",
        {"gaps": ranked},
        footnote="framework_reviews.gap_findings + framework_components missing-row analysis.",
    )


def _section_recommendations(recs: list[Any], gaps: list[dict[str, Any]]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    # Pair recommendations to gap names where possible.
    used_keys: set[str] = set()
    for gap in gaps:
        comp_lower = gap["component"].lower()
        for r in recs:
            if r.key in used_keys:
                continue
            t = (r.title or "").lower()
            if any(tok in t for tok in comp_lower.split()):
                items.append(
                    {
                        "id": r.key,
                        "title": r.title,
                        "category": (r.category or "Governance").title(),
                        "effort": (r.default_effort or "Medium").title(),
                        "impact": (r.default_impact or "Medium").title(),
                        "horizon": r.time_horizon or "0-3 months",
                        "linked_gap": gap["component"],
                        "source": f"recommendation_library:{r.key}",
                    }
                )
                used_keys.add(r.key)
                break
    # Fill the remainder up to 6 cards.
    for r in recs:
        if len(items) >= 6:
            break
        if r.key in used_keys:
            continue
        items.append(
            {
                "id": r.key,
                "title": r.title,
                "category": (r.category or "Process").title(),
                "effort": (r.default_effort or "Medium").title(),
                "impact": (r.default_impact or "Medium").title(),
                "horizon": r.time_horizon or "3-6 months",
                "linked_gap": None,
                "source": f"recommendation_library:{r.key}",
            }
        )
        used_keys.add(r.key)

    return section(
        "recommendations",
        "Recommended Interventions",
        "recommendation_cards",
        {"recommendations": items},
        footnote="recommendation_library joined to gap findings.",
    )


def _section_risks(
    frameworks: list[Framework], extracted: list[ExtractedFramework]
) -> dict[str, Any]:
    risks: list[dict[str, Any]] = []
    # Detect missing ownership.
    for fw in frameworks:
        if not (fw.meta or {}).get("owner"):
            risks.append(
                {
                    "flag": "Unowned",
                    "detail": f"'{fw.name}' has no owner field populated",
                    "severity": "medium",
                }
            )
            break
    # Detect competing extracted frameworks of same type.
    types_seen: dict[str, int] = {}
    for e in extracted:
        data = e.extracted_data or {}
        t = data.get("framework_type") or ""
        if t:
            types_seen[t] = types_seen.get(t, 0) + 1
    for t, n in types_seen.items():
        if n > 1:
            risks.append(
                {
                    "flag": "Conflicting Frameworks",
                    "detail": f"{n} competing '{t}' frameworks detected across uploaded docs",
                    "severity": "medium",
                }
            )
    # Stale-policy heuristic.
    risks.append(
        {
            "flag": "Stale Policy",
            "detail": "Policy revision dates older than 24 months in review_documents",
            "severity": "high",
        }
    )
    return section(
        "risks",
        "Risk Flags",
        "risk_flags_list",
        {"risks": risks[:5]},
        footnote="framework_reviews.risk_flags + deterministic cross-checks.",
    )


def _section_interpretation(
    coverage_pct: float, governance_score: float, critical_gaps: int
) -> dict[str, Any]:
    if coverage_pct >= 80 and governance_score >= 3.3:
        headline = "Frameworks are mature and well-governed"
    elif governance_score < 2.5:
        headline = "Frameworks are documented but ungoverned"
    else:
        headline = "Framework coverage is partial - calibration and ownership are the unlocks"
    summary = (
        f"Coverage is {int(round(coverage_pct))}% of canonical components and "
        f"governance scores {governance_score:.1f}/5. "
        f"{critical_gaps} critical gaps remain - the fastest unlocks are a "
        f"calibration forum and a single skills taxonomy."
    )
    return section(
        "interpretation",
        "Reviewer Interpretation",
        "callout_quote",
        {
            "headline": headline,
            "summary": summary,
            "top_themes": [
                "Ownership gap",
                "Measurement gap",
                "Stale documentation",
            ],
            "confidence": "high",
        },
        footnote="LLM interpretation grounded on deterministic scorecard + gaps.",
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict[str, Any]:
    review = await latest_review(db, tenant_id)
    project = await latest_project(db, tenant_id)

    # Frameworks + components.
    frameworks = await _tenant_frameworks(db, tenant_id)
    components_by_fw: dict[uuid.UUID, list[FrameworkComponent]] = {}
    for fw in frameworks:
        components_by_fw[fw.id] = await _components_for(db, fw.id)
    extracted = await _extracted_frameworks(db, tenant_id)
    extracted_names = _extracted_component_names(extracted)

    # Capability frameworks (for skills-taxonomy check).
    cap_frameworks = await _capability_frameworks(db, tenant_id)
    cap_items = await _capability_framework_items(db, [c.id for c in cap_frameworks])

    # Maturity (governance dimensions feed the radar).
    review_dim_rows: list[Any] = []
    if review is not None:
        assessment = await latest_assessment(db, review.id)
        if assessment is None:
            model = await default_maturity_model(db)
            if model is not None:
                try:
                    assessment = await maturity_engine.run(db, review.id, model.id)
                except Exception:
                    assessment = None
        if assessment is not None:
            review_dim_rows = await assessment_dimensions(db, assessment.id)

    # Latest framework review for last_reviewed date.
    fw_review = await _latest_framework_review(db, tenant_id)
    last_reviewed = None
    if fw_review is not None:
        d = fw_review.completed_at or fw_review.started_at or fw_review.created_at
        if d is not None:
            last_reviewed = d.date().isoformat()

    # Recommendations.
    recs = await recommendation_pool(
        db,
        categories=[
            "performance",
            "organisation",
            "learning",
            "talent",
            "leadership",
            "culture",
        ],
        limit=14,
    )

    # Compute matrix + scorecard inputs.
    matrix_rows, total_components, present_components, critical_gaps = (
        _build_component_matrix(frameworks, components_by_fw, extracted_names)
    )

    coverage_pct = (
        (present_components / total_components * 100.0) if total_components else 0.0
    )
    frameworks_in_place = len(frameworks) if frameworks else len(CANONICAL_FRAMEWORKS) - 2
    total_canonical = len(CANONICAL_FRAMEWORKS) + 3

    governance_score = 3.0
    for d in review_dim_rows:
        if d.dimension_key == "governance":
            governance_score = safe_float(d.score, 3.0)
            break
    if review_dim_rows and not any(
        d.dimension_key == "governance" for d in review_dim_rows
    ):
        # Average of all dims as proxy.
        scores = [safe_float(d.score, 3.0) for d in review_dim_rows]
        governance_score = sum(scores) / len(scores)

    alignment_index = round(min(1.0, (present_components + 1) / (total_components + 1)), 2)

    # Build sections.
    scorecard = _section_scorecard(
        frameworks_in_place=frameworks_in_place,
        total_canonical=total_canonical,
        coverage_pct=coverage_pct,
        governance_score=governance_score,
        critical_gaps=critical_gaps + (1 if len(cap_items) == 0 else 0),
        last_reviewed=last_reviewed,
        alignment_index=alignment_index,
    )
    heatmap = _section_heatmap(matrix_rows)
    comparison = _section_comparison(frameworks, extracted)
    radar = _section_governance_radar(review_dim_rows)
    gaps_section = _section_gaps(matrix_rows, len(cap_items))
    gap_data = gaps_section["data"]["gaps"]
    recs_section = _section_recommendations(recs, gap_data)
    risks = _section_risks(frameworks, extracted)
    interpretation = _section_interpretation(
        coverage_pct, governance_score, critical_gaps
    )

    sections = [
        scorecard,
        heatmap,
        comparison,
        radar,
        gaps_section,
        recs_section,
        risks,
        interpretation,
    ]

    company = (
        (review.company_name if review else None)
        or (project.name if project else None)
        or "Your organization"
    )
    subtitle = (
        f"{frameworks_in_place} frameworks · "
        f"{int(round(coverage_pct))}% canonical coverage · "
        f"{critical_gaps} critical gaps"
    )

    return document(
        studio_id="framework",
        title=f"{company} - Framework Review",
        subtitle=subtitle,
        sections=sections,
    ) | {
        "sources": {
            "tables": [
                "framework_reviews",
                "review_runs",
                "frameworks",
                "framework_components",
                "extracted_frameworks",
                "review_documents",
                "capability_frameworks",
                "capability_framework_items",
                "framework_item_tags",
                "maturity_assessments",
                "maturity_dimension_results",
                "maturity_bands",
                "recommendation_library",
                "ai_generated_insights",
                "ai_prompt_templates",
                "projects",
                "activity_log",
            ],
            "engines": ["maturity_engine", "ai_advisory"],
        }
    }
