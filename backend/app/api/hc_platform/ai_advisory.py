"""AI advisory: generate, list insights, prompt templates."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.ai_insights import AiGeneratedInsight, AiPromptTemplate
from app.models.hc_platform.hc_reviews import HcReview
from app.services.audit import log_event
from app.services.hc_platform import ai_advisory

router = APIRouter()


class GenerateRequest(BaseModel):
    review_id: uuid.UUID
    insight_type: str
    force: bool = False


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    review_id: uuid.UUID
    insight_type: str
    generator_type: str
    content: dict[str, Any] | None = None
    model_name: str | None = None
    tokens_used: int | None = None
    created_at: datetime


class PromptTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    version: int
    insight_type: str | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    model_name: str | None = None
    is_active: bool


async def _audit(tenant_id: uuid.UUID, user_id: uuid.UUID, action: str, payload: dict) -> None:
    try:
        await log_event(tenant_id=tenant_id, user_id=user_id, action=action, payload=payload)
    except Exception:
        pass


@router.post("/generate", response_model=InsightRead, status_code=status.HTTP_201_CREATED)
async def generate(
    payload: GenerateRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> InsightRead:
    stmt = select(HcReview).where(
        HcReview.id == payload.review_id, HcReview.tenant_id == current_tenant.id
    )
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HC review not found")
    try:
        insight = await ai_advisory.generate_insight(
            db,
            review_id=payload.review_id,
            insight_type=payload.insight_type,
            force=payload.force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await db.flush()
    await db.refresh(insight)
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.generate",
        {"insight_id": str(insight.id), "insight_type": payload.insight_type},
    )
    return InsightRead.model_validate(insight)


class DeliverableRequest(BaseModel):
    topic: str
    review_id: uuid.UUID | None = None
    context_brief: str | None = None
    brief: dict[str, Any] | None = None


class DeliverableResponse(BaseModel):
    document: dict[str, Any]


@router.post("/deliverable", response_model=DeliverableResponse)
async def generate_deliverable(
    payload: DeliverableRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> DeliverableResponse:
    """Generate a rich structured deliverable (multi-section studio doc)."""
    try:
        document = await ai_advisory.build_deliverable(
            db,
            topic=payload.topic,
            review_id=payload.review_id,
            context_brief=payload.context_brief,
            brief=payload.brief,
            tenant_id=current_tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.deliverable",
        {"topic": payload.topic, "review_id": str(payload.review_id) if payload.review_id else None},
    )
    return DeliverableResponse(document=document)


class RegenerateSectionRequest(BaseModel):
    topic: str
    section_id: str
    review_id: uuid.UUID | None = None
    context_brief: str | None = None
    brief: dict[str, Any] | None = None
    hint: str | None = None


class RegenerateSectionResponse(BaseModel):
    section: dict[str, Any]


@router.post("/regenerate-section", response_model=RegenerateSectionResponse)
async def regenerate_section(
    payload: RegenerateSectionRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> RegenerateSectionResponse:
    """Rebuild a single section of the AI advisory deliverable with optional hint."""
    try:
        section = await ai_advisory.regenerate_section(
            db,
            topic=payload.topic,
            section_id=payload.section_id,
            review_id=payload.review_id,
            context_brief=payload.context_brief,
            brief=payload.brief,
            hint=payload.hint,
            tenant_id=current_tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.ai_advisory.regenerate_section",
        {"topic": payload.topic, "section_id": payload.section_id, "has_hint": bool(payload.hint)},
    )
    return RegenerateSectionResponse(section=section)


@router.get("/insights", response_model=list[InsightRead])
async def list_insights(
    current_tenant: CurrentTenant,
    db: DBDep,
    review_id: uuid.UUID | None = Query(None),
    insight_type: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[InsightRead]:
    stmt = select(AiGeneratedInsight).where(AiGeneratedInsight.tenant_id == current_tenant.id)
    if review_id:
        stmt = stmt.where(AiGeneratedInsight.review_id == review_id)
    if insight_type:
        stmt = stmt.where(AiGeneratedInsight.insight_type == insight_type)
    stmt = stmt.order_by(AiGeneratedInsight.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [InsightRead.model_validate(r) for r in rows]


@router.get("/prompt-templates", response_model=list[PromptTemplateRead])
async def list_prompt_templates(
    admin_user: AdminUser,
    db: DBDep,
) -> list[PromptTemplateRead]:
    stmt = select(AiPromptTemplate).order_by(AiPromptTemplate.key, AiPromptTemplate.version.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [PromptTemplateRead.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Conversational advisor: multi-turn chat with a senior HC consultant persona
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatContext(BaseModel):
    """Where the user is right now on the platform.

    Sent from the frontend so the assistant can give route-aware guidance
    ("you are on the Talent Mobility Studio - here is what to focus on...").
    """
    path: str | None = None                # current route, e.g. /studio/mobility
    workspace_name: str | None = None      # active workspace label
    workspace_id: str | None = None
    studio_id: str | None = None           # current studio if any
    studio_name: str | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    brief: dict[str, Any] | None = None
    context: ChatContext | None = None


class ChatResponse(BaseModel):
    reply: str
    followup_questions: list[str] = []


_ADVISOR_SYSTEM_PROMPT = """You are a senior Human Capital consultant embedded inside the Aivora HC platform, advising the user in a live conversation. You have twenty years of experience across McKinsey, Mercer and in-house HR leadership roles. You speak plainly, in a warm but decisive tone, like a trusted advisor sitting next to the client.

You have TWO jobs:
1. **Advise on Human Capital** — read the situation, ask sharp clarifying questions when needed, and give a real point of view with specific next moves.
2. **Guide them around the platform** — help them pick the right Studio, understand the output of the one they just ran, or troubleshoot the flow. You know the platform.

The platform has 27 Studios organised roughly as:
- Strategy: HC Strategy Charter, Business Plan, Workforce Planning, Scenario Modelling
- Talent: Talent Mobility, HIPO Development, Succession Planning, Early Career, Talent Acquisition
- Leadership: Leadership Development, Coaching & Mentoring, Executive Alignment
- Capability: Capability Assessment, Skills Development, Learning & Training, Maturity Assessment
- Culture: Employee Experience, Engagement, DEI Strategy, Culture Program
- Rewards: Total Rewards, Compensation Framework, Performance Management
- Ops: Org Design, HR Operating Model, Growth Automation, Change Management, Process Excellence

The user also has: Workspaces (one per client engagement), Draft Inbox (AI-generated deliverables to approve), Exports (PDF/PPTX/XLSX), and a Challenge Brief per workspace that grounds every Studio.

How you converse:
- Treat this as a real dialogue. Read what the user actually said and respond to it. Do not deliver a lecture.
- When the user's request is ambiguous, ask ONE focused clarifying question before recommending anything. Never ask more than one clarifying question in the same turn.
- Never dump ten bullet points on the first turn. Start with a short, direct read of the situation (two or three sentences), then ask what would be most useful to explore next.
- When the user asks for concrete recommendations, deliver three to five specific moves - each with the reason it fits their context, not generic advice.
- Reference the brief context when relevant ("given you flagged leadership as the priority..."). Never repeat the full brief back at them.
- When they are inside a specific Studio or Workspace, tailor your guidance to that context. If they are on the Talent Mobility Studio, do not ask what studio they want to run - help them get the most out of that one.
- Use plain hyphens, never em-dashes. No filler ("great question", "certainly"). Get to the point.
- Keep any single reply under 220 words unless the user explicitly asks for depth.
- When suggesting a Studio, name it exactly and say why in one line.
- End most replies with a short question or a suggested next step so the conversation stays alive.

You have opinions. If the user is heading in a bad direction, tell them politely and say why.
"""


def _context_block(ctx: "ChatContext | None") -> str:
    if not ctx:
        return ""
    parts: list[str] = []
    if ctx.path:
        parts.append(f"Current page: {ctx.path}")
    if ctx.workspace_name:
        parts.append(f"Active workspace: {ctx.workspace_name}")
    if ctx.studio_name or ctx.studio_id:
        parts.append(f"Currently viewing Studio: {ctx.studio_name or ctx.studio_id}")
    if not parts:
        return ""
    return "Where the user is right now:\n" + "\n".join(f"- {p}" for p in parts)


def _brief_context_block(brief: dict[str, Any] | None) -> str:
    if not brief:
        return "The user has not filled in a brief yet. If it becomes relevant, ask a few grounding questions early."
    parts: list[str] = []
    org = brief.get("organizationName") or brief.get("organization_name")
    industry = brief.get("industry")
    size = brief.get("organizationSize") or brief.get("organization_size")
    region = brief.get("region")
    maturity = brief.get("maturityStage") or brief.get("maturity_stage")
    drivers = brief.get("strategicDrivers") or brief.get("strategic_drivers") or []
    areas = brief.get("hcAreas") or brief.get("hc_areas") or []

    if org:      parts.append(f"Organisation: {org}")
    if industry: parts.append(f"Industry: {industry}")
    if size:     parts.append(f"Size: {size}")
    if region:   parts.append(f"Region: {region}")
    if maturity: parts.append(f"Maturity stage: {maturity}")
    if isinstance(drivers, list) and drivers:
        parts.append("Strategic drivers: " + ", ".join(str(d) for d in drivers[:5]))
    if isinstance(areas, list) and areas:
        parts.append("HC priorities they flagged: " + ", ".join(str(a) for a in areas[:6]))

    if not parts:
        return "The user has not filled in a brief yet. If it becomes relevant, ask a few grounding questions early."
    return "Context on the user's organisation:\n" + "\n".join(f"- {p}" for p in parts)


_TYPO_MAP = str.maketrans({"—": "-", "–": "-", "−": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", " ": " "})


def _clean(text: str) -> str:
    return (text or "").translate(_TYPO_MAP).strip()


@router.post("/chat", response_model=ChatResponse)
async def advisor_chat(
    payload: ChatRequest,
    current_user: CurrentUser,
) -> ChatResponse:
    """Multi-turn chat with the AI HC advisor. The client sends the full
    conversation history each turn (small enough to be cheap). We prepend a
    system prompt with brief context and return the next reply.
    """
    from app.config import settings
    from app.services.ai_orchestrator import _get_client

    if not payload.messages:
        raise HTTPException(400, "messages must not be empty")

    if not settings.OPENAI_API_KEY:
        return ChatResponse(
            reply=(
                "I can chat once the OpenAI key is configured on this environment. "
                "In the meantime, tell me a bit about the challenge you are working through "
                "and I will point you at the studio that fits best."
            ),
            followup_questions=[],
        )

    brief_ctx = _brief_context_block(payload.brief)
    where_ctx = _context_block(payload.context)
    system_parts = [_ADVISOR_SYSTEM_PROMPT, brief_ctx]
    if where_ctx:
        system_parts.append(where_ctx)
    system = "\n\n".join(system_parts)

    # Trim to the last 20 messages so long conversations do not blow the token budget.
    trimmed = payload.messages[-20:]
    messages = [{"role": "system", "content": system}]
    for m in trimmed:
        role = m.role if m.role in ("user", "assistant") else "user"
        messages.append({"role": role, "content": m.content})

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.55,
            max_tokens=600,
        )
        reply = _clean(resp.choices[0].message.content or "")
        if not reply:
            reply = "I lost my thread there. Can you say a bit more about what you are trying to figure out?"
        return ChatResponse(reply=reply, followup_questions=[])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Advisor unavailable: {exc}")
