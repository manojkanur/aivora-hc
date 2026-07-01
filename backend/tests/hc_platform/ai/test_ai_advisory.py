"""generate_insight tests with stubbed DB + OpenAI client.

Each test uses an in-memory SQLite (async) database constrained to just the
tables `generate_insight` touches. We mock `ai_orchestrator._get_client` so no
network call is made.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.hc_platform.ai_insights import (
    AiGeneratedInsight,
    AiPromptTemplate,
    HcAnalysisVersion,
)
from app.models.hc_platform.benchmarks import BenchmarkComparison
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.services.hc_platform import ai_advisory


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# In-memory DB scaffolding
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        # Only the tables we need — SQLAlchemy will create them across our metadata.
        await conn.run_sync(
            lambda c: Base.metadata.create_all(
                c,
                tables=[
                    AiPromptTemplate.__table__,
                    AiGeneratedInsight.__table__,
                    HcAnalysisVersion.__table__,
                    HcReview.__table__,
                    MaturityAssessment.__table__,
                    MaturityDimensionResult.__table__,
                    BenchmarkComparison.__table__,
                ],
            )
        )
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with Session() as session:
        yield session
    await engine.dispose()


async def _seed_review(db: AsyncSession) -> HcReview:
    review = HcReview(
        tenant_id=uuid.uuid4(),
        company_name="Acme Corp",
        review_type="hc_strategy",
        status="intake_completed",
        industry="Manufacturing",
        region="UK",
        intake_data={"company_profile": {"company_name": "Acme Corp"}},
    )
    db.add(review)
    await db.flush()
    return review


async def _seed_template(db: AsyncSession, **overrides: Any) -> AiPromptTemplate:
    tpl = AiPromptTemplate(
        key="executive_summary_v1",
        version=1,
        insight_type="executive_summary",
        system_prompt="You are an HC advisor.",
        user_prompt_template="Review: {{review.company_name}}",
        model_name="gpt-4o-mini",
        temperature=0.2,
        max_tokens=200,
        response_format="json_object",
        is_active=True,
    )
    for k, v in overrides.items():
        setattr(tpl, k, v)
    db.add(tpl)
    await db.flush()
    return tpl


def _stub_openai_client(json_content: dict) -> MagicMock:
    mock_client = MagicMock()
    mock_choice = SimpleNamespace(
        message=SimpleNamespace(content=json.dumps(json_content))
    )
    completion = SimpleNamespace(
        choices=[mock_choice],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30),
    )
    mock_client.chat.completions.create = AsyncMock(return_value=completion)
    return mock_client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_generate_insight_writes_insight_and_version(db: AsyncSession) -> None:
    review = await _seed_review(db)
    await _seed_template(db)

    mock_client = _stub_openai_client({"headline": "All good", "summary": "Body"})
    with patch.object(ai_advisory.ai_orchestrator, "_get_client", return_value=mock_client):
        insight = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary"
        )

    assert insight.review_id == review.id
    assert insight.insight_type == "executive_summary"
    assert insight.content == {"headline": "All good", "summary": "Body"}
    assert insight.prompt_fingerprint is not None
    assert insight.model_name == "gpt-4o-mini"
    assert insight.tokens_used == 30
    # Analysis version was also written.
    from sqlalchemy import select

    versions = (
        await db.execute(select(HcAnalysisVersion).where(HcAnalysisVersion.review_id == review.id))
    ).scalars().all()
    assert len(versions) == 1
    assert versions[0].generator_type == "ai"
    assert versions[0].version == 1
    assert versions[0].prompt_fingerprint == insight.prompt_fingerprint


async def test_generate_insight_is_idempotent_on_fingerprint(db: AsyncSession) -> None:
    review = await _seed_review(db)
    await _seed_template(db)

    mock_client = _stub_openai_client({"summary": "x"})
    with patch.object(ai_advisory.ai_orchestrator, "_get_client", return_value=mock_client):
        first = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary"
        )
        second = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary"
        )
    assert first.id == second.id
    # OpenAI should only be called once because the second call hits the cache.
    assert mock_client.chat.completions.create.await_count == 1


async def test_generate_insight_force_bypasses_cache(db: AsyncSession) -> None:
    review = await _seed_review(db)
    await _seed_template(db)

    mock_client = _stub_openai_client({"summary": "x"})
    with patch.object(ai_advisory.ai_orchestrator, "_get_client", return_value=mock_client):
        first = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary"
        )
        second = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary", force=True
        )
    assert first.id != second.id
    assert mock_client.chat.completions.create.await_count == 2


async def test_generate_insight_records_error_when_openai_fails(db: AsyncSession) -> None:
    review = await _seed_review(db)
    await _seed_template(db)

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=RuntimeError("boom"))
    with patch.object(ai_advisory.ai_orchestrator, "_get_client", return_value=mock_client):
        insight = await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="executive_summary"
        )

    assert insight.content == {"error": "boom", "insight_type": "executive_summary"}
    assert (insight.meta or {}).get("error") == "boom"
    # Analysis version still written, marked low confidence.
    from sqlalchemy import select

    version = (
        await db.execute(select(HcAnalysisVersion).where(HcAnalysisVersion.review_id == review.id))
    ).scalar_one()
    assert version.confidence_level == "low"


async def test_generate_insight_unknown_type_rejected(db: AsyncSession) -> None:
    review = await _seed_review(db)
    with pytest.raises(ValueError):
        await ai_advisory.generate_insight(
            db, review_id=review.id, insight_type="not_a_real_type"
        )


async def test_generate_insight_404_when_review_missing(db: AsyncSession) -> None:
    with pytest.raises(LookupError):
        await ai_advisory.generate_insight(
            db, review_id=uuid.uuid4(), insight_type="executive_summary"
        )
