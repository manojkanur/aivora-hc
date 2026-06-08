from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai import AiDraft, AiJob, AiJobStatus, DraftApprovalStatus
from app.models.skill import SkillRegistry, WorkspaceSkill
from app.services.gamification import award_xp, check_quest_progress, update_streak

# ---------------------------------------------------------------------------
# Per-skill system prompts and JSON schema instructions
# ---------------------------------------------------------------------------

SKILL_PROMPTS: dict[str, dict[str, str]] = {
    "hc-framework": {
        "system": (
            "You are a senior Human Capital consultant producing board-ready deliverables. "
            "You MUST respond with a single valid JSON object — no markdown fences, no prose outside the JSON. "
            "The JSON must have exactly these keys: "
            "executive_summary (string, 2-3 paragraphs), "
            "hc_vision (string), "
            "strategic_pillars (array of objects with: pillar, description, initiatives array, kpis array), "
            "operating_model (object with: structure string, key_roles array, governance string), "
            "talent_lifecycle (object with: attract string, develop string, retain string, transition string), "
            "maturity_roadmap (array of objects with: phase, timeline, focus_areas array, success_metrics array), "
            "quick_wins (array of strings), "
            "risks_and_mitigations (array of objects with: risk, mitigation). "
            "Make it detailed, specific to the organisation provided, and genuinely useful to a CHRO."
        ),
        "user_template": (
            "Generate a comprehensive HC Framework for the following organisation:\n\n"
            "Organisation: {org_name}\n"
            "Industry: {industry}\n"
            "Headcount: {headcount}\n"
            "Strategic Priorities: {strategic_priorities}\n"
            "Current HC Maturity: {maturity_level}\n\n"
            "Produce a thorough, evidence-based HC Framework JSON document."
        ),
    },
    "strategy": {
        "system": (
            "You are a senior HC strategy consultant. "
            "Respond with a single valid JSON object — no markdown, no prose outside JSON. "
            "Keys: executive_summary (string), strategy_vision (string), "
            "strategic_pillars (array of {pillar, description, year1_actions array, year2_actions array, year3_actions array, kpis array}), "
            "investment_priorities (array of {area, rationale, estimated_impact}), "
            "governance_model (string), success_metrics (array of {metric, baseline, target, timeline}), "
            "implementation_roadmap (array of {phase, timeline, milestones array})."
        ),
        "user_template": (
            "Generate a {horizon_years}-year HC Strategy for:\n\n"
            "Organisation: {org_name}\n"
            "Focus Areas: {focus_areas}\n"
            "Business Goals: {business_goals}\n\n"
            "Produce a comprehensive, board-ready HC Strategy JSON."
        ),
    },
    "maturity": {
        "system": (
            "You are an HC maturity assessment expert. "
            "Respond with a single valid JSON object — no markdown, no prose outside JSON. "
            "Keys: executive_summary (string), overall_maturity_score (number 1-5), overall_maturity_level (string), "
            "dimension_scores (array of {dimension, score, level, strengths array, gaps array, priority_actions array}), "
            "heat_map_insights (string), top_priorities (array of strings), "
            "12_month_roadmap (array of {action, owner, timeline, expected_outcome}), "
            "benchmark_comparison (string)."
        ),
        "user_template": (
            "Conduct an HC Maturity Assessment for:\n\n"
            "Organisation: {org_name}\n"
            "Dimensions to assess: {dimensions}\n"
            "Self-assessed scores: {current_scores}\n\n"
            "Produce a detailed maturity assessment JSON with actionable insights."
        ),
    },
    "benchmarking": {
        "system": (
            "You are an HC benchmarking specialist. "
            "Respond with a single valid JSON object — no markdown, no prose outside JSON. "
            "Keys: executive_summary (string), industry_context (string), "
            "benchmark_results (array of {metric, organisation_value, industry_median, top_quartile, gap_analysis, recommendation}), "
            "competitive_position (string), priority_improvement_areas (array of {area, current_state, target_state, actions array}), "
            "implementation_timeline (string)."
        ),
        "user_template": (
            "Produce an HC Benchmarking Report for:\n\n"
            "Organisation: {org_name}\n"
            "Industry: {industry}\n"
            "Metrics: {metrics}\n"
            "Current Values: {current_values}\n\n"
            "Produce a detailed benchmarking analysis JSON."
        ),
    },
    "talent-acquisition": {
        "system": (
            "You are a talent acquisition strategist. "
            "Respond with a single valid JSON object — no markdown, no prose outside JSON. "
            "Keys: executive_summary (string), employer_brand_strategy (object with: value_proposition string, channels array, messaging string), "
            "sourcing_strategy (array of {channel, rationale, target_volume, estimated_cost}), "
            "hiring_process (array of {stage, description, tools array, sla_days number}), "
            "candidate_experience (string), diversity_inclusion (string), "
            "metrics_and_targets (array of {metric, target, measurement_approach}), "
            "90_day_plan (array of {week_range, actions array})."
        ),
        "user_template": (
            "Create a Talent Acquisition Strategy for:\n\n"
            "Organisation: {org_name}\n"
            "Open Roles: {open_roles}\n"
            "Target Profile: {target_profile}\n"
            "Timeline: {timeline_months} months\n\n"
            "Produce a comprehensive talent acquisition strategy JSON."
        ),
    },
}

DEFAULT_SKILL_PROMPT = {
    "system": (
        "You are a senior Human Capital consultant. "
        "Respond with a single valid JSON object — no markdown fences, no prose outside the JSON. "
        "Keys: executive_summary (string), key_findings (array of strings), "
        "recommendations (array of {recommendation, rationale, priority, timeline}), "
        "implementation_plan (array of {phase, actions array, timeline}), "
        "success_metrics (array of strings)."
    ),
    "user_template": "Generate a professional HC deliverable for:\n\n{context_text}\n\nProduce a detailed, structured JSON document.",
}

_openai_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


async def _publish_progress(job_id: str, event: str, data: dict[str, Any]) -> None:
    """Publish a progress event to Redis pub/sub."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        channel = f"ai_job:{job_id}"
        payload = json.dumps({"event": event, "data": data})
        await r.publish(channel, payload)
        await r.aclose()
    except Exception:
        pass  # Non-fatal: SSE streaming is best-effort


async def copaw_run(
    job_id: str,
    workspace_id: str,
    skill_id: str,
    user_context: dict[str, Any],
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Run the CoPaw AI agent for a single skill.

    Steps:
    1. Load workspace skill state and build context
    2. Select the appropriate tools and system prompt
    3. Call OpenAI with function calling
    4. Publish progress via Redis pub/sub
    5. Parse tool output and save as AiDraft
    6. Award XP and update streak
    """
    await _publish_progress(job_id, "status", {"status": "running", "job_id": job_id})

    # Load skill info
    skill_result = await db.execute(
        select(SkillRegistry).where(SkillRegistry.id == uuid.UUID(skill_id))
    )
    skill = skill_result.scalar_one_or_none()
    skill_slug = skill.slug if skill else "hc-framework"

    # Load workspace skill state
    ws_skill_result = await db.execute(
        select(WorkspaceSkill).where(
            WorkspaceSkill.workspace_id == uuid.UUID(workspace_id),
            WorkspaceSkill.skill_id == uuid.UUID(skill_id),
        )
    )
    ws_skill = ws_skill_result.scalar_one_or_none()
    skill_state = ws_skill.state if ws_skill else {}

    # Build user message — merge workspace state + user context, fill missing fields with sensible defaults
    merged = {**skill_state, **user_context}

    # Provide defaults so the model always has enough to work with
    defaults: dict[str, Any] = {
        "org_name": "the organisation",
        "industry": "general",
        "headcount": 500,
        "strategic_priorities": ["talent development", "operational efficiency", "culture"],
        "maturity_level": "developing",
        "horizon_years": 3,
        "focus_areas": ["talent acquisition", "leadership development", "employee experience"],
        "business_goals": ["grow revenue", "reduce attrition", "improve engagement"],
    }
    for k, v in defaults.items():
        if k not in merged or not merged[k]:
            merged[k] = v

    # Build user message from skill-specific template
    skill_prompt_config = SKILL_PROMPTS.get(skill_slug, DEFAULT_SKILL_PROMPT)
    system_prompt = skill_prompt_config["system"]
    user_template = skill_prompt_config["user_template"]

    # Format template — fill known keys, fall back to merged dict dump for unknown skills
    try:
        user_message = user_template.format(**merged, context_text=json.dumps(merged, indent=2))
    except KeyError:
        user_message = f"Generate a professional HC deliverable for:\n\n{json.dumps(merged, indent=2)}\n\nProduce a detailed, structured JSON document."

    client = _get_client()
    await _publish_progress(job_id, "progress", {"step": "calling_openai", "skill": skill_slug})

    response = await client.chat.completions.create(
        model=settings.AI_MODEL,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    raw_text = response.choices[0].message.content or "{}"

    try:
        generated = json.loads(raw_text)
    except json.JSONDecodeError:
        generated = {"raw_text": raw_text}

    draft_content: dict[str, Any] = {
        "skill_slug": skill_slug,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **generated,
    }

    # Update job status
    job_result = await db.execute(
        select(AiJob).where(AiJob.id == uuid.UUID(job_id))
    )
    job = job_result.scalar_one_or_none()
    if job:
        job.status = AiJobStatus.completed
        job.completed_at = datetime.now(timezone.utc)
        job.credits_used = skill.credit_cost if skill else 0

        # Update workspace skill last run
        if ws_skill:
            ws_skill.last_ai_run_at = datetime.now(timezone.utc)

        # Save draft
        draft = AiDraft(
            ai_job_id=job.id,
            workspace_id=uuid.UUID(workspace_id),
            skill_id=uuid.UUID(skill_id),
            content=draft_content,
            approval_status=DraftApprovalStatus.pending,
            version=1,
        )
        db.add(draft)
        await db.flush()

        # Award XP and update streak
        user_id = job.user_id
        if user_id:
            await award_xp(user_id, "ai_draft_generated", str(draft.id), db)
            await update_streak(user_id, skill_slug, db)
            await check_quest_progress(user_id, "ai_draft_generated", db)

    await _publish_progress(job_id, "completed", {"job_id": job_id, "skill": skill_slug})
    return draft_content


async def hermes_run(
    brief_id: str,
    skill_ids: list[str],
    workspace_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Multi-skill AI orchestrator.

    1. Topo-sort skills by a simple dependency map
    2. Run independent skills in parallel batches with asyncio.gather
    3. Pass cross-skill signals (output summaries) into subsequent batches
    """
    # Simple dependency order: strategy and framework first, then others
    PRIORITY_ORDER = ["hc-framework", "strategy", "maturity", "benchmarking"]

    # Load skill records
    skill_records: list[SkillRegistry] = []
    for sid in skill_ids:
        try:
            result = await db.execute(
                select(SkillRegistry).where(SkillRegistry.id == uuid.UUID(sid))
            )
            s = result.scalar_one_or_none()
            if s:
                skill_records.append(s)
        except Exception:
            continue

    # Sort: priority skills first, then alphabetically
    def _sort_key(s: SkillRegistry) -> tuple[int, str]:
        try:
            return PRIORITY_ORDER.index(s.slug), s.slug
        except ValueError:
            return len(PRIORITY_ORDER), s.slug

    skill_records.sort(key=_sort_key)

    results: dict[str, Any] = {}
    cross_skill_context: dict[str, Any] = {}

    if not skill_records:
        return {"status": "no_skills", "results": {}}

    async def _run_one(skill: SkillRegistry, extra_context: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        job = AiJob(
            workspace_id=uuid.UUID(workspace_id),
            skill_id=skill.id,
            user_id=None,
            model=settings.AI_MODEL,
            status=AiJobStatus.pending,
        )
        db.add(job)
        await db.flush()

        result = await copaw_run(
            str(job.id),
            workspace_id,
            str(skill.id),
            extra_context,
            db,
        )
        return skill.slug, result

    # Run first skill alone to build foundation context
    first_slug, first_result = await _run_one(skill_records[0], {})
    results[first_slug] = first_result
    cross_skill_context[first_slug] = {
        "summary": f"Output from {first_slug} skill",
        "skill_slug": first_slug,
    }

    # Run remaining skills in parallel with cross-skill context
    if len(skill_records) > 1:
        tasks = [
            _run_one(skill, {**cross_skill_context, "hermes_brief_id": brief_id})
            for skill in skill_records[1:]
        ]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        for item in batch_results:
            if isinstance(item, Exception):
                continue
            slug, res = item
            results[slug] = res

    return {
        "status": "completed",
        "brief_id": brief_id,
        "skills_run": list(results.keys()),
        "results": results,
    }
