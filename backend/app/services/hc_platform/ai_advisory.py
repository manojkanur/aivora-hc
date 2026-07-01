"""AI advisory layer — generate insights for an HC review.

Ports the Replit `ai-advisory-openai.ts` provider call shape (model from the
prompt template, response_format=json_object, no streaming, no tool use). The
prompt assembly itself lives in `ai_prompt_templates`; this service wires the
template + the review context together and persists the result.

Idempotency: each insight write is keyed on
`(review_id, insight_type, prompt_fingerprint)` where
`prompt_fingerprint = sha256(template.key + version + canonical_json(context))`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.ai_insights import (
    AiGeneratedInsight,
    HcAnalysisVersion,
)
from app.models.hc_platform.benchmarks import BenchmarkComparison
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.services import ai_orchestrator
from app.services.hc_platform.hashing import canonical_json, compute_hash
from app.services.hc_platform.prompt_registry import PromptRegistry

log = logging.getLogger(__name__)


async def _build_context(
    db: AsyncSession,
    review_id: uuid.UUID,
) -> tuple[HcReview, dict[str, Any]]:
    """Assemble the context dict that prompts are rendered against.

    Sources (all DB-resident, deterministic for the same review state):
      * hc_reviews row (intake, diagnostic_results, target_state, roadmap)
      * latest maturity assessment + per-dimension results
      * latest benchmark comparison if one exists
    """
    review = await db.get(HcReview, review_id)
    if review is None:
        raise LookupError(f"HcReview not found: {review_id}")

    # Latest maturity assessment by computed_at desc (then id for tie-break).
    ma_stmt = (
        select(MaturityAssessment)
        .where(MaturityAssessment.review_id == review_id)
        .order_by(desc(MaturityAssessment.computed_at), desc(MaturityAssessment.id))
        .limit(1)
    )
    maturity = (await db.execute(ma_stmt)).scalar_one_or_none()

    dimensions: list[dict[str, Any]] = []
    if maturity is not None:
        dim_stmt = select(MaturityDimensionResult).where(
            MaturityDimensionResult.assessment_id == maturity.id
        )
        for row in (await db.execute(dim_stmt)).scalars().all():
            dimensions.append(
                {
                    "dimension_key": row.dimension_key,
                    "score": float(row.score) if row.score is not None else None,
                    "band_name": row.band_name,
                    "criticality": row.criticality,
                    "readiness": row.readiness,
                    "narrative": row.narrative,
                }
            )

    bench_stmt = (
        select(BenchmarkComparison)
        .where(BenchmarkComparison.review_id == review_id)
        .order_by(desc(BenchmarkComparison.computed_at), desc(BenchmarkComparison.id))
        .limit(1)
    )
    benchmark = (await db.execute(bench_stmt)).scalar_one_or_none()

    context: dict[str, Any] = {
        "review": {
            "id": str(review.id),
            "company_name": review.company_name,
            "review_type": review.review_type,
            "industry": review.industry,
            "region": review.region,
            "company_size": review.company_size,
        },
        "intake": review.intake_data or {},
        "diagnostic_results": review.diagnostic_results or {},
        "target_state": review.target_state or {},
        "roadmap": review.roadmap or {},
        "maturity": (
            {
                "overall_score": (
                    float(maturity.overall_score)
                    if maturity is not None and maturity.overall_score is not None
                    else None
                ),
                "overall_band": (
                    maturity.overall_band if maturity is not None else None
                ),
                "dimensions": dimensions,
            }
        ),
        "benchmark": (
            {
                "overall_positioning": benchmark.overall_positioning,
                "comparison_data": benchmark.comparison_data,
                "gap_data": benchmark.gap_data,
            }
            if benchmark is not None
            else None
        ),
    }
    # A flat `context` slot lets prompt authors embed the whole packet with
    # `{{context}}` without having to enumerate sub-keys.
    context["context"] = canonical_json(
        {k: v for k, v in context.items() if k != "context"}
    )
    return review, context


async def _next_analysis_version(db: AsyncSession, review_id: uuid.UUID) -> int:
    stmt = (
        select(HcAnalysisVersion.version)
        .where(HcAnalysisVersion.review_id == review_id)
        .order_by(desc(HcAnalysisVersion.version))
        .limit(1)
    )
    latest = (await db.execute(stmt)).scalar_one_or_none()
    return (latest or 0) + 1


# Map insight_type → canonical template key (templates are versioned).
INSIGHT_TYPE_TO_TEMPLATE_KEY: dict[str, str] = {
    "executive_summary": "executive_summary_v1",
    "key_findings": "key_findings_v1",
    "risk_assessment": "risk_assessment_v1",
    "recommendations": "recommendations_v1",
    "industry_context": "industry_context_v1",
}


async def generate_insight(
    db: AsyncSession,
    *,
    review_id: uuid.UUID,
    insight_type: str,
    force: bool = False,
) -> AiGeneratedInsight:
    """Generate (or return cached) AI insight for `(review_id, insight_type)`.

    Steps:
      1. Resolve template for insight_type (latest active version).
      2. Build context from the review aggregate.
      3. Compute prompt fingerprint.
      4. If `not force` and a matching insight row exists, return it.
      5. Call OpenAI via `ai_orchestrator._get_client()` (response_format=json_object).
      6. Persist `AiGeneratedInsight` + `HcAnalysisVersion`.
    """
    template_key = INSIGHT_TYPE_TO_TEMPLATE_KEY.get(insight_type)
    if template_key is None:
        raise ValueError(
            f"Unknown insight_type {insight_type!r}; expected one of "
            f"{sorted(INSIGHT_TYPE_TO_TEMPLATE_KEY)}"
        )

    review, context = await _build_context(db, review_id)
    template = await PromptRegistry.get(db, template_key)

    fingerprint_payload = {
        "template_key": template.key,
        "template_version": template.version,
        "context": context,
    }
    prompt_fingerprint = compute_hash(fingerprint_payload)

    if not force:
        cached_stmt = (
            select(AiGeneratedInsight)
            .where(AiGeneratedInsight.review_id == review_id)
            .where(AiGeneratedInsight.insight_type == insight_type)
            .where(AiGeneratedInsight.prompt_fingerprint == prompt_fingerprint)
            .order_by(desc(AiGeneratedInsight.created_at))
            .limit(1)
        )
        cached = (await db.execute(cached_stmt)).scalar_one_or_none()
        if cached is not None:
            return cached

    messages = PromptRegistry.render(template, context)
    model_name = template.model_name or "gpt-4o-mini"
    temperature = (
        float(template.temperature) if template.temperature is not None else 0.2
    )
    max_tokens = template.max_tokens or 1500
    response_format = (
        {"type": template.response_format}
        if template.response_format
        else {"type": "json_object"}
    )

    parsed: dict[str, Any]
    tokens_used: int | None = None
    error_message: str | None = None
    try:
        client = ai_orchestrator._get_client()
        completion = await client.chat.completions.create(
            model=model_name,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
        )
        raw = completion.choices[0].message.content or "{}"
        usage = getattr(completion, "usage", None)
        if usage is not None:
            tokens_used = (
                int(getattr(usage, "total_tokens", 0))
                or (
                    int(getattr(usage, "prompt_tokens", 0))
                    + int(getattr(usage, "completion_tokens", 0))
                )
                or None
            )
        try:
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                parsed = {"value": parsed}
        except json.JSONDecodeError:
            parsed = {"raw_text": raw, "error": "invalid_json"}
    except Exception as exc:  # noqa: BLE001 — provider errors must not bubble.
        log.exception("AI advisory call failed for insight_type=%s", insight_type)
        error_message = str(exc)
        parsed = {"error": error_message, "insight_type": insight_type}

    now = datetime.now(timezone.utc)
    insight = AiGeneratedInsight(
        tenant_id=review.tenant_id,
        review_id=review_id,
        insight_type=insight_type,
        generator_type="ai",
        content=parsed,
        prompt_fingerprint=prompt_fingerprint,
        model_name=model_name,
        tokens_used=tokens_used,
        meta={
            "template_key": template.key,
            "template_version": template.version,
            "generated_at": now.isoformat(),
            **({"error": error_message} if error_message else {}),
        },
    )
    db.add(insight)
    await db.flush()

    version = await _next_analysis_version(db, review_id)
    analysis_version = HcAnalysisVersion(
        review_id=review_id,
        version=version,
        generator_type="ai",
        confidence_level="low" if error_message else "medium",
        content=parsed,
        prompt_fingerprint=prompt_fingerprint,
        meta={
            "insight_type": insight_type,
            "template_key": template.key,
            "template_version": template.version,
            "model_name": model_name,
            **({"error": error_message} if error_message else {}),
        },
    )
    db.add(analysis_version)
    await db.flush()

    return insight


# ---------------------------------------------------------------------------
# Structured deliverable builder (DB-grounded, multi-section studio output).
# ---------------------------------------------------------------------------

from app.models.hc_platform.recommendations import RecommendationLibrary

# Topic → recommendation_library category prefix
TOPIC_TO_CATEGORY: dict[str, str] = {
    "hipo_program": "talent_development",
    "succession_framework": "succession",
    "leadership_development": "leadership",
    "performance_management": "performance",
    "culture_program": "culture",
    "talent_review": "talent_review",
    "engagement_program": "engagement",
    "diversity_program": "diversity",
    "comp_framework": "compensation",
    "learning_strategy": "learning",
    # New topics
    "org_design": "organization",
    "evp_strategy": "engagement",
    "total_rewards": "compensation",
    "change_management": "transformation",
    "dei_strategy": "diversity",
    "workforce_planning": "workforce",
}

TOPIC_LABELS: dict[str, str] = {
    "hipo_program": "HIPO Program",
    "succession_framework": "Succession Framework",
    "leadership_development": "Leadership Development",
    "performance_management": "Performance Management",
    "culture_program": "Culture Program",
    "talent_review": "Talent Review",
    "engagement_program": "Engagement Program",
    "diversity_program": "Diversity Program",
    "comp_framework": "Compensation Framework",
    "learning_strategy": "Learning Strategy",
    # New topics
    "org_design": "Org Design",
    "evp_strategy": "EVP Strategy",
    "total_rewards": "Total Rewards",
    "change_management": "Change Management",
    "dei_strategy": "DEI Strategy",
    "workforce_planning": "Workforce Planning",
}

GENERIC_RISKS: dict[str, list[dict[str, str]]] = {
    "default": [
        {"risk": "Low executive sponsorship", "mitigation": "Secure exec champion + quarterly steering review", "severity": "high"},
        {"risk": "Manager capability gap", "mitigation": "Embed enablement + toolkits in launch", "severity": "medium"},
        {"risk": "Data quality blind spots", "mitigation": "Baseline audit + tagged data hygiene sprint", "severity": "medium"},
        {"risk": "Change fatigue", "mitigation": "Phase rollout; cluster pilots before scale", "severity": "low"},
    ],
}


def _impact_score(rec: RecommendationLibrary) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get((rec.default_impact or "").lower(), 2)


def _effort_score(rec: RecommendationLibrary) -> int:
    return {"low": 1, "medium": 2, "high": 3}.get((rec.default_effort or "").lower(), 2)


async def _fetch_recs_for_topic(
    db: AsyncSession, topic: str
) -> tuple[list[RecommendationLibrary], bool]:
    """Return recommendations for a topic + whether a fallback was used."""
    category_prefix = TOPIC_TO_CATEGORY.get(topic)
    fallback = False
    recs: list[RecommendationLibrary] = []
    if category_prefix:
        stmt = select(RecommendationLibrary).where(
            RecommendationLibrary.category.ilike(f"{category_prefix}%")
        )
        recs = list((await db.execute(stmt)).scalars().all())
    if len(recs) < 3:
        fallback = True
        stmt = select(RecommendationLibrary).limit(12)
        recs = list((await db.execute(stmt)).scalars().all())
    return recs, fallback


def _kpis_from_recs(recs: list[RecommendationLibrary]) -> list[dict[str, Any]]:
    """Derive 4–8 KPI cards from rec.meta.metrics if available, else synthesize."""
    kpis: list[dict[str, Any]] = []
    for rec in recs:
        metrics = None
        if isinstance(rec.meta, dict):
            metrics = rec.meta.get("metrics") or rec.meta.get("kpis")
        if isinstance(metrics, list):
            for m in metrics:
                if not isinstance(m, dict):
                    continue
                kpis.append(
                    {
                        "label": m.get("label") or m.get("name") or "Metric",
                        "value": m.get("target") or m.get("value") or " - ",
                        "unit": m.get("unit", ""),
                        "delta": m.get("delta"),
                        "source": f"recommendation_library:{rec.key}",
                    }
                )
        if len(kpis) >= 8:
            break
    # If we still don't have enough, synthesize from rec titles.
    if len(kpis) < 4:
        synth_pool = recs[:8]
        for rec in synth_pool:
            kpis.append(
                {
                    "label": rec.title[:60],
                    "value": (rec.default_impact or "track").title(),
                    "unit": "",
                    "delta": rec.default_effort,
                    "source": f"recommendation_library:{rec.key} (synthesized)",
                }
            )
            if len(kpis) >= 6:
                break
    return kpis[:8]


def _selection_criteria_table(recs: list[RecommendationLibrary]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for rec in recs[:10]:
        evidence = " - "
        if isinstance(rec.evidence_sources, dict):
            ev_list = rec.evidence_sources.get("sources") or []
            if isinstance(ev_list, list) and ev_list:
                evidence = str(ev_list[0])[:80]
            else:
                evidence = ", ".join(list(rec.evidence_sources.keys())[:2])[:80] or " - "
        elif isinstance(rec.evidence_sources, list) and rec.evidence_sources:
            evidence = str(rec.evidence_sources[0])[:80]
        rows.append(
            {
                "criterion": rec.title[:80],
                "threshold": (rec.tier or rec.default_impact or " - ").title(),
                "weight": _impact_score(rec),
                "evidence_source": evidence,
            }
        )
    return {
        "columns": [
            {"key": "criterion", "label": "Criterion"},
            {"key": "threshold", "label": "Threshold"},
            {"key": "weight", "label": "Weight"},
            {"key": "evidence_source", "label": "Evidence Source"},
        ],
        "rows": rows,
        "source": "recommendation_library",
    }


def _program_components(recs: list[RecommendationLibrary]) -> dict[str, Any]:
    items = []
    sorted_recs = sorted(recs, key=lambda r: (-_impact_score(r), _effort_score(r)))
    for rec in sorted_recs[:8]:
        items.append(
            {
                "rank": len(items) + 1,
                "title": rec.title,
                "description": (rec.description or "")[:240],
                "impact": (rec.default_impact or "medium").lower(),
                "effort": (rec.default_effort or "medium").lower(),
                "horizon": rec.time_horizon or "0-90d",
                "source": f"recommendation_library:{rec.key}",
            }
        )
    return {"items": items, "source": "recommendation_library"}


def _timeline_30_60_90(components: list[dict[str, Any]]) -> dict[str, Any]:
    horizons = [
        {"label": "30 days", "key": "30d", "actions": []},
        {"label": "60 days", "key": "60d", "actions": []},
        {"label": "90 days", "key": "90d", "actions": []},
    ]
    # Round-robin balance components into horizons
    for idx, comp in enumerate(components[:12]):
        bucket = idx % 3
        horizons[bucket]["actions"].append(
            {
                "title": comp["title"],
                "owner": "HC Lead",
                "source": comp.get("source", "recommendation_library"),
            }
        )
    # Ensure each horizon has at least 2 entries when components are available
    for h in horizons:
        if len(h["actions"]) > 4:
            h["actions"] = h["actions"][:4]
    return {"horizons": horizons, "source": "derived:program_components"}


def _recommendation_cards(recs: list[RecommendationLibrary]) -> dict[str, Any]:
    sorted_recs = sorted(recs, key=lambda r: -_impact_score(r))
    cards = []
    for rec in sorted_recs[:6]:
        cards.append(
            {
                "id": rec.key,
                "type": (rec.category or "recommendation").split("_")[0],
                "title": rec.title,
                "description": (rec.description or "")[:200],
                "priority": (rec.default_impact or "medium").lower(),
                "horizon": rec.time_horizon or "0-90d",
                "source": f"recommendation_library:{rec.key}",
            }
        )
    return {"cards": cards, "source": "recommendation_library"}


# ---------------------------------------------------------------------------
# Brief parsing helpers — tolerant of multiple shapes.
# ---------------------------------------------------------------------------


def _brief_org_name(brief: dict[str, Any] | None) -> str | None:
    if not isinstance(brief, dict):
        return None
    org = brief.get("organization")
    if isinstance(org, dict):
        val = org.get("name") or org.get("organizationName")
        if isinstance(val, str) and val.strip():
            return val.strip()
    val = brief.get("organizationName")
    if isinstance(val, str) and val.strip():
        return val.strip()
    return None


def _brief_situation_summary(brief: dict[str, Any] | None) -> str | None:
    if not isinstance(brief, dict):
        return None
    bs = brief.get("businessSituation")
    if isinstance(bs, dict):
        for k in ("summary", "situationSummary"):
            v = bs.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _brief_selected_areas(brief: dict[str, Any] | None) -> list[str]:
    if not isinstance(brief, dict):
        return []
    hc = brief.get("hcChallenges")
    if isinstance(hc, dict):
        raw = hc.get("selectedAreas") or []
        out: list[str] = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, str):
                    out.append(item)
                elif isinstance(item, dict):
                    a = item.get("area") or item.get("key")
                    if isinstance(a, str):
                        out.append(a)
        return out
    raw = brief.get("hcAreas")
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, str)]
    return []


def _brief_summary_text(brief: dict[str, Any] | None) -> str:
    """Compact one-paragraph summary of the brief for LLM prompts."""
    if not isinstance(brief, dict):
        return ""
    parts: list[str] = []
    org = _brief_org_name(brief)
    if org:
        parts.append(f"Organization: {org}.")
    situation = _brief_situation_summary(brief)
    if situation:
        parts.append(f"Situation: {situation[:400]}.")
    areas = _brief_selected_areas(brief)
    if areas:
        parts.append(f"Priority HC areas: {', '.join(areas[:6])}.")
    return " ".join(parts)


def _bias_recs_by_brief(
    recs: list[RecommendationLibrary],
    brief: dict[str, Any] | None,
    hint: str | None = None,
) -> list[RecommendationLibrary]:
    """Stably reorder recs so those whose category/key/title match a selected area or hint come first."""
    areas = [a.lower() for a in _brief_selected_areas(brief)]
    hint_lc = (hint or "").strip().lower()
    if not areas and not hint_lc:
        return recs

    def score(r: RecommendationLibrary) -> int:
        haystack = " ".join(
            str(x or "").lower() for x in (r.category, r.key, r.title, r.description)
        )
        s = 0
        for a in areas:
            if a and a in haystack:
                s += 2
        if hint_lc:
            for token in hint_lc.split():
                if len(token) >= 4 and token in haystack:
                    s += 1
        return -s

    return sorted(recs, key=score)


# ---------------------------------------------------------------------------
# LLM narration — short, focused, parallelised, non-blocking on failure.
# ---------------------------------------------------------------------------


_NARRATION_MODEL = "gpt-4o-mini"
_NARRATION_MAX_TOKENS = 200
_NARRATION_TEMPERATURE = 0.3


def _section_synopsis(section_id: str, data: dict[str, Any]) -> str:
    """Tiny synopsis of a section's payload to keep the LLM prompt short."""
    try:
        if section_id == "framework-kpis":
            kpis = data.get("kpis") or []
            return "; ".join(
                f"{k.get('label')}={k.get('value')}" for k in kpis[:5] if isinstance(k, dict)
            )
        if section_id == "selection-criteria":
            rows = data.get("rows") or []
            return "; ".join(
                str(r.get("criterion", ""))[:60] for r in rows[:5] if isinstance(r, dict)
            )
        if section_id == "program-components":
            items = data.get("items") or []
            return "; ".join(
                str(i.get("title", ""))[:60] for i in items[:5] if isinstance(i, dict)
            )
        if section_id == "timeline-30-60-90":
            horizons = data.get("horizons") or []
            bits = []
            for h in horizons:
                if not isinstance(h, dict):
                    continue
                actions = h.get("actions") or []
                titles = [
                    str(a.get("title", ""))[:40] for a in actions[:2] if isinstance(a, dict)
                ]
                bits.append(f"{h.get('label', '')}: {', '.join(titles)}")
            return " | ".join(bits)
        if section_id == "tailored-recommendations":
            cards = data.get("cards") or []
            return "; ".join(
                str(c.get("title", ""))[:60] for c in cards[:5] if isinstance(c, dict)
            )
        if section_id == "risks-mitigations":
            risks = data.get("risks") or []
            return "; ".join(
                str(r.get("risk", ""))[:60] for r in risks[:4] if isinstance(r, dict)
            )
        if section_id == "why-matters":
            return str(data.get("quote", ""))[:240]
    except Exception:  # noqa: BLE001
        return ""
    return ""


async def _narrate_section(
    section_id: str,
    topic: str,
    brief: dict[str, Any] | None,
    section_data: dict[str, Any],
    hint: str | None = None,
) -> str:
    """Call OpenAI for a 2-3 sentence narration. Returns '' on failure."""
    label = TOPIC_LABELS.get(topic, topic)
    brief_text = _brief_summary_text(brief)
    section_snippet = _section_synopsis(section_id, section_data or {})

    system = (
        "You are a senior HC (human capital) advisory consultant. Write a short, "
        "concrete 2-3 sentence narration that contextualises the given section for "
        "the client. Plain prose, no markdown, no bullet lists, no preface."
    )
    user_parts = [f"Topic: {label}.", f"Section: {section_id}."]
    if brief_text:
        user_parts.append(f"Client brief: {brief_text}")
    if section_snippet:
        user_parts.append(f"Section content: {section_snippet}")
    if hint:
        user_parts.append(f"User hint: {hint}")
    user_parts.append(
        "Write 2-3 sentences of context grounded in the brief and section content."
    )
    user = "\n".join(user_parts)

    try:
        client = ai_orchestrator._get_client()
        completion = await client.chat.completions.create(
            model=_NARRATION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=_NARRATION_TEMPERATURE,
            max_tokens=_NARRATION_MAX_TOKENS,
        )
        return (completion.choices[0].message.content or "").strip()
    except Exception as exc:  # noqa: BLE001 — narration is best-effort.
        log.warning("Section narration failed (%s): %s", section_id, exc)
        return ""


async def _attach_narrations(
    sections: list[dict[str, Any]],
    *,
    topic: str,
    brief: dict[str, Any] | None,
    hint: str | None = None,
) -> None:
    """Mutate `sections` in-place, adding `data.narration` to each. Parallel + tolerant."""
    tasks = [
        _narrate_section(s["id"], topic, brief, s.get("data") or {}, hint=hint)
        for s in sections
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for section, result in zip(sections, results):
        narration = result if isinstance(result, str) else ""
        if not isinstance(section.get("data"), dict):
            section["data"] = {"value": section.get("data")}
        section["data"]["narration"] = narration


def _why_quote(
    weak_dims: list[dict[str, Any]], topic: str, org_name: str | None = None
) -> str:
    label = TOPIC_LABELS.get(topic, topic)
    org_phrase = f"For {org_name}, " if org_name else ""
    if weak_dims:
        names = ", ".join(
            d.get("dimension_key", "") for d in weak_dims[:2] if d.get("dimension_key")
        )
        if org_phrase:
            return (
                f"{org_phrase}{label.lower()} directly addresses your weakest maturity dimensions ({names}). "
                f"Closing these gaps is the highest-leverage move for the next two quarters."
            )
        return (
            f"{label} directly addresses your weakest maturity dimensions ({names}). "
            f"Closing these gaps is the highest-leverage move for the next two quarters."
        )
    if org_phrase:
        return (
            f"{org_phrase}a clear {label.lower()} accelerates execution, signals investment to talent, "
            f"and embeds repeatable practices that compound across teams."
        )
    return (
        f"A clear {label} accelerates execution, signals investment to talent, "
        f"and embeds repeatable practices that compound across teams."
    )


def _risks_from_weak_dims(
    weak_dims: list[dict[str, Any]], topic: str
) -> list[dict[str, str]]:
    if not weak_dims:
        return GENERIC_RISKS["default"]
    risks: list[dict[str, str]] = []
    for d in weak_dims[:4]:
        name = d.get("dimension_key", "dimension")
        risks.append(
            {
                "risk": f"Weak baseline in {name} undermines adoption",
                "mitigation": f"Pair {TOPIC_LABELS.get(topic, topic)} rollout with a {name} uplift sprint",
                "severity": d.get("criticality") or "medium",
            }
        )
    risks.append(GENERIC_RISKS["default"][0])
    return risks[:5]


async def _resolve_deliverable_context(
    db: AsyncSession,
    *,
    topic: str,
    review_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None,
    hint: str | None = None,
) -> dict[str, Any]:
    """Shared resolution of recs + maturity for a (topic, review, brief, hint) tuple."""
    if topic not in TOPIC_TO_CATEGORY:
        raise ValueError(
            f"Unknown topic {topic!r}; expected one of {sorted(TOPIC_TO_CATEGORY)}"
        )

    assumptions: list[str] = []
    weak_dims: list[dict[str, Any]] = []
    maturity_overall: float | None = None

    if review_id is not None:
        try:
            review, ctx = await _build_context(db, review_id)
            if review.tenant_id != tenant_id:
                raise LookupError("Review does not belong to current tenant")
            mat = ctx.get("maturity") or {}
            maturity_overall = mat.get("overall_score")
            dims = mat.get("dimensions") or []
            scored = [
                d for d in dims if isinstance(d, dict) and d.get("score") is not None
            ]
            scored.sort(key=lambda d: d.get("score") or 0)
            weak_dims = scored[:4]
        except LookupError:
            assumptions.append("review_not_found_used_generic_context")

    recs, fallback = await _fetch_recs_for_topic(db, topic)
    if fallback:
        assumptions.append("fallback_recs_used")
    if not recs:
        assumptions.append("no_recommendation_library_rows")

    # Bias recs by brief priority areas + hint tokens (stable, additive).
    recs = _bias_recs_by_brief(recs, brief, hint=hint)
    if brief:
        assumptions.append("brief_used_for_context")
    if hint:
        assumptions.append("hint_used_for_bias")

    return {
        "assumptions": assumptions,
        "weak_dims": weak_dims,
        "maturity_overall": maturity_overall,
        "recs": recs,
    }


def _build_section_payload(
    section_id: str,
    *,
    topic: str,
    weak_dims: list[dict[str, Any]],
    recs: list[RecommendationLibrary],
    org_name: str | None,
) -> dict[str, Any]:
    """Build a single section dict (sans narration) by id."""
    if section_id == "why-matters":
        return {
            "id": "why-matters",
            "title": "Why this matters",
            "layout": "callout_quote",
            "data": {
                "quote": _why_quote(weak_dims, topic, org_name=org_name),
                "attribution": "Aivora HC advisory engine",
                "source": (
                    "maturity_dimension_results"
                    if weak_dims
                    else "generic_topic_rationale"
                ),
            },
        }
    if section_id == "framework-kpis":
        return {
            "id": "framework-kpis",
            "title": "Framework KPIs",
            "layout": "kpi_grid",
            "data": {
                "kpis": _kpis_from_recs(recs),
                "source": "recommendation_library.meta.metrics",
            },
        }
    if section_id == "selection-criteria":
        return {
            "id": "selection-criteria",
            "title": "Selection Criteria",
            "layout": "comparison_table",
            "data": _selection_criteria_table(recs),
        }
    if section_id == "program-components":
        return {
            "id": "program-components",
            "title": "Program Components",
            "layout": "ranked_list",
            "data": _program_components(recs),
        }
    if section_id == "timeline-30-60-90":
        components = _program_components(recs)
        return {
            "id": "timeline-30-60-90",
            "title": "30 / 60 / 90 Day Plan",
            "layout": "timeline",
            "data": _timeline_30_60_90(components["items"]),
        }
    if section_id == "tailored-recommendations":
        return {
            "id": "tailored-recommendations",
            "title": "Tailored Recommendations",
            "layout": "recommendation_cards",
            "data": _recommendation_cards(recs),
        }
    if section_id == "risks-mitigations":
        return {
            "id": "risks-mitigations",
            "title": "Risks & Mitigations",
            "layout": "risk_flags_list",
            "data": {
                "risks": _risks_from_weak_dims(weak_dims, topic),
                "source": (
                    "maturity_dimension_results"
                    if weak_dims
                    else "generic_topic_risks"
                ),
            },
        }
    raise ValueError(f"Unknown section_id {section_id!r}")


SECTION_IDS: list[str] = [
    "why-matters",
    "framework-kpis",
    "selection-criteria",
    "program-components",
    "timeline-30-60-90",
    "tailored-recommendations",
    "risks-mitigations",
]


async def build_deliverable(
    db: AsyncSession,
    *,
    topic: str,
    review_id: uuid.UUID | None,
    context_brief: str | None,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble a multi-section StudioOutputDocument for the given topic."""
    resolved = await _resolve_deliverable_context(
        db,
        topic=topic,
        review_id=review_id,
        tenant_id=tenant_id,
        brief=brief,
    )
    assumptions: list[str] = resolved["assumptions"]
    weak_dims: list[dict[str, Any]] = resolved["weak_dims"]
    maturity_overall = resolved["maturity_overall"]
    recs: list[RecommendationLibrary] = resolved["recs"]

    org_name = _brief_org_name(brief)
    topic_label = TOPIC_LABELS.get(topic, topic)
    title = (
        f"{topic_label} for {org_name} - Framework Deliverable"
        if org_name
        else f"{topic_label} - Framework Deliverable"
    )

    subtitle_bits = [topic_label]
    if org_name:
        subtitle_bits.append(org_name)
    if maturity_overall is not None:
        subtitle_bits.append(f"Maturity baseline {maturity_overall:.1f}/100")
    situation = _brief_situation_summary(brief)
    if situation:
        subtitle_bits.append(situation[:120])
    elif context_brief:
        subtitle_bits.append(context_brief[:120])

    sections = [
        _build_section_payload(
            sid, topic=topic, weak_dims=weak_dims, recs=recs, org_name=org_name
        )
        for sid in SECTION_IDS
    ]

    # Attach LLM narrations in parallel (best-effort).
    await _attach_narrations(sections, topic=topic, brief=brief)

    document = {
        "studio_id": f"ai_advisory:{topic}",
        "title": title,
        "subtitle": " · ".join(subtitle_bits),
        "sources": {
            "tables": [
                "recommendation_library",
                "maturity_dimension_results",
                "hc_reviews",
            ],
            "assumptions": assumptions,
        },
        "sections": sections,
    }
    return document


async def regenerate_section(
    db: AsyncSession,
    *,
    topic: str,
    section_id: str,
    review_id: uuid.UUID | None,
    context_brief: str | None,
    tenant_id: uuid.UUID,
    brief: dict[str, Any] | None = None,
    hint: str | None = None,
) -> dict[str, Any]:
    """Re-run just one section (with its LLM narration), biased by an optional hint."""
    if section_id not in SECTION_IDS:
        raise ValueError(
            f"Unknown section_id {section_id!r}; expected one of {SECTION_IDS}"
        )

    resolved = await _resolve_deliverable_context(
        db,
        topic=topic,
        review_id=review_id,
        tenant_id=tenant_id,
        brief=brief,
        hint=hint,
    )
    weak_dims: list[dict[str, Any]] = resolved["weak_dims"]
    recs: list[RecommendationLibrary] = resolved["recs"]
    org_name = _brief_org_name(brief)

    section = _build_section_payload(
        section_id, topic=topic, weak_dims=weak_dims, recs=recs, org_name=org_name
    )

    narration = await _narrate_section(
        section_id, topic, brief, section.get("data") or {}, hint=hint
    )
    if not isinstance(section.get("data"), dict):
        section["data"] = {"value": section.get("data")}
    section["data"]["narration"] = narration

    return section
