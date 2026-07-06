"""Conversational Challenge Brief intake.

A senior-consultant chat that fills the Challenge Brief structure from a
natural conversation. Each turn the LLM returns the next question, clickable
answer suggestions, and a patch of brief fields it has learned so far. The
frontend merges patches into its local brief state and shows section progress
in a co-work style side panel.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentTenant, CurrentUser
from app.api.hc_platform.ai_advisory import ChatMessage, _clean

router = APIRouter()


def _clean_payload(value: Any) -> Any:
    """Recursively normalise typography in every string of a JSON-like value."""
    if isinstance(value, str):
        return _clean(value)
    if isinstance(value, list):
        return [_clean_payload(v) for v in value]
    if isinstance(value, dict):
        return {k: _clean_payload(v) for k, v in value.items()}
    return value


class BriefChatRequest(BaseModel):
    messages: list[ChatMessage] = []
    brief_state: dict[str, Any] | None = None
    onboarding_profile: dict[str, Any] | None = None
    workspace_name: str | None = None


class BriefChatResponse(BaseModel):
    reply: str
    suggestions: list[str] = []
    brief_patch: dict[str, Any] = {}
    sections: dict[str, str] = {}
    done: bool = False


_SECTION_KEYS = ("organization", "situation", "challenges", "outputs")

_BRIEF_CHAT_SYSTEM = """You are a senior Human Capital consultant at AIVORA HC conducting a Challenge Brief intake interview. Your job is to fill a structured brief through a natural, warm, efficient conversation - the way a real consultant runs a first client meeting.

CONVERSATION RULES
- Ask about ONE topic at a time, at most two related questions per turn.
- Keep each reply short: 1-3 sentences, then the question. No long lectures.
- When the client gives information, acknowledge it briefly and show you understood ("Got it - a scaling fintech in the GCC facing attrition in critical roles.").
- Confirm what you already know from onboarding instead of re-asking it.
- Offer 2-4 SUGGESTIONS with every question: short, clickable, realistic answers the client can tap instead of typing. Make them specific to the context, not generic.
- If the client asks a question, answer it like a consultant, then steer back to the intake.
- FORMAT replies in markdown: **bold** the key facts you are confirming, use short bullet lists when presenting options or recapping what you have captured, and keep paragraphs to 1-2 sentences. When you summarise the brief at the end, use a bulleted list with bold labels (e.g. "- **Organization:** ...").
- Never use em-dashes or smart quotes.

WHAT TO COLLECT (in roughly this order, but follow the conversation naturally)
1. organization: organizationName, industry, region, organizationSize, maturityStage, operatingModel
2. situation: situationSummary (1-3 sentence narrative), strategicDrivers (list), timeHorizon
3. challenges: selectedAreas (each with area + severity + a short notes string), topPriorityArea
4. outputs: outputTypes (list), primaryAudience, outputDepth

ALLOWED VALUES (use these exact slugs in brief_patch)
industry: banking-finance | insurance | energy-utilities | oil-gas | telecom | healthcare-pharma | retail-consumer | manufacturing | transportation-logistics | construction-real-estate | technology-software | professional-services | public-sector | education | hospitality | other
region: gcc | mena | europe | north-america | south-america | asia-pacific | africa | global | other
organizationSize: small | mid | large | enterprise
maturityStage: startup | growth | scaling | mature | transformation | turnaround
operatingModel: single-entity | multi-entity | holding-group | matrix | federated | joint-venture
strategicDrivers: growth | cost-optimization | transformation | merger-acquisition | regulatory-change | digital-disruption | market-entry | competitive-pressure | talent-shortage | leadership-change | restructuring | ipo-preparation | sustainability-esg | nationalization | other
timeHorizon: immediate | short-term | medium-term | long-term | unspecified
challenge area: strategy-business-alignment | workforce-planning | capability-skills | learning-training | leadership | succession | mobility | talent-acquisition | performance | employee-experience | rewards | organization-design | process-excellence | governance-operating-model | ai-digital-transformation | culture-change-readiness | analytics-productivity
severity: watch | moderate | high | critical
outputTypes: executive-deck | consulting-report | playbook | infographic | strategy-recommendation | framework | maturity-assessment | implementation-plan | scenario-comparison | other
primaryAudience: executive-committee | board | ceo | chro | hr-leadership | business-leaders | line-managers | all-employees | external-stakeholders | other
outputDepth: executive-summary | standard | deep-dive | implementation-grade

OUTPUT FORMAT
Respond with ONLY a JSON object, no markdown fence:
{
  "reply": "your conversational reply ending in a question (or a wrap-up when done)",
  "suggestions": ["short answer 1", "short answer 2", ...],
  "brief_patch": {
    "organization": { ...only fields learned or confirmed this turn... },
    "businessSituation": { "situationSummary": "...", "strategicDrivers": [...], "timeHorizon": "..." },
    "hcChallenges": { "selectedAreas": [{"area": "...", "severity": "...", "notes": "..."}], "topPriorityArea": "..." },
    "desiredOutputs": { "outputTypes": [...], "primaryAudience": "...", "outputDepth": "..." }
  },
  "sections": { "organization": "pending|partial|complete", "situation": "...", "challenges": "...", "outputs": "..." },
  "done": false
}

PATCH RULES
- Include ONLY sections/fields you learned or confirmed this turn; omit everything else.
- For hcChallenges.selectedAreas, always send the FULL cumulative list of areas discussed so far (the frontend replaces the array).
- Infer sensible values from natural language ("about 3000 people" -> organizationSize "large"). When you infer, confirm it in your reply.
- sections must always contain all four keys with your honest current assessment given the CURRENT BRIEF STATE plus this turn's patch.
- Set done=true only when all four sections are complete; then your reply should summarise the brief in 3-4 bullet lines and tell the client they can generate the diagnosis.

FIRST TURN
If there is no conversation yet, greet the client by organization name if known, confirm the onboarding facts you already have in one line, put those confirmed facts in brief_patch, and ask your first question about the business situation."""


@router.post("/chat", response_model=BriefChatResponse)
async def brief_chat(
    payload: BriefChatRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
) -> BriefChatResponse:
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not settings.OPENAI_API_KEY:
        return BriefChatResponse(
            reply=(
                "The AI intake needs the OpenAI key configured on this environment. "
                "You can fill the brief manually with the form instead."
            ),
            sections={k: "pending" for k in _SECTION_KEYS},
        )

    context_parts: list[str] = []
    if payload.workspace_name:
        context_parts.append(f"WORKSPACE: {payload.workspace_name}")
    if payload.onboarding_profile:
        context_parts.append(
            "ONBOARDING PROFILE (already captured, confirm rather than re-ask):\n"
            + json.dumps(payload.onboarding_profile, ensure_ascii=True)[:4000]
        )
    if payload.brief_state:
        context_parts.append(
            "CURRENT BRIEF STATE (already filled):\n"
            + json.dumps(payload.brief_state, ensure_ascii=True)[:6000]
        )

    system = _BRIEF_CHAT_SYSTEM
    if context_parts:
        system += "\n\n" + "\n\n".join(context_parts)

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for m in payload.messages[-24:]:
        role = m.role if m.role in ("user", "assistant") else "user"
        messages.append({"role": role, "content": m.content})
    if not payload.messages:
        messages.append({"role": "user", "content": "(start the intake)"})

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
            max_tokens=1100,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Intake assistant returned an unreadable answer. Try again.")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Intake assistant unavailable: {exc}")

    sections = data.get("sections") or {}
    normalized_sections = {
        k: (sections.get(k) if sections.get(k) in ("pending", "partial", "complete") else "pending")
        for k in _SECTION_KEYS
    }
    brief_patch = data.get("brief_patch") or {}
    if not isinstance(brief_patch, dict):
        brief_patch = {}

    return BriefChatResponse(
        reply=_clean(str(data.get("reply") or "Tell me a bit more about the situation.")),
        suggestions=[_clean(str(s)) for s in (data.get("suggestions") or [])[:5] if str(s).strip()],
        brief_patch=_clean_payload(brief_patch),
        sections=normalized_sections,
        done=bool(data.get("done")) and all(v == "complete" for v in normalized_sections.values()),
    )


class BriefSummarizeRequest(BaseModel):
    brief: dict[str, Any]
    workspace_name: str | None = None


class BriefSummarizeResponse(BaseModel):
    summary: str


_SUMMARIZE_SYSTEM = """You are a senior HC consultant. The client just finished filling their Challenge Brief. Evaluate what they shared and write a short, warm, professional recap in markdown:

- Open with one sentence acknowledging the engagement ("Here is what I understand about <org>...").
- Then 3-5 bullets: the organization in one line, the core situation, the key challenges with their severity, and what they want out of the engagement.
- Close with ONE sentence inviting them to proceed to the AI Advisory to start working on it together.

Rules: under 150 words, bold the key terms, no headings, no advice yet, no mention of studios or diagnosis. Plain hyphens only, never em-dashes."""


@router.post("/summarize", response_model=BriefSummarizeResponse)
async def summarize_brief(
    payload: BriefSummarizeRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
) -> BriefSummarizeResponse:
    """Consultant-style recap of a completed brief, shown on the review step."""
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not settings.OPENAI_API_KEY:
        return BriefSummarizeResponse(summary="Your brief is saved. Proceed to the AI Advisory to start working on it.")

    context = json.dumps(_clean_payload(payload.brief), ensure_ascii=True)[:8000]
    if payload.workspace_name:
        context = f"WORKSPACE: {payload.workspace_name}\n\n{context}"
    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SUMMARIZE_SYSTEM},
                {"role": "user", "content": f"COMPLETED BRIEF:\n{context}"},
            ],
            temperature=0.4,
            max_tokens=400,
        )
        summary = _clean(resp.choices[0].message.content or "")
    except Exception:  # noqa: BLE001 - the recap is nice-to-have, never blocking
        summary = ""
    if not summary:
        summary = "Your brief is saved. Proceed to the AI Advisory to start working on it together."
    return BriefSummarizeResponse(summary=summary)
