"""document_generator.generate tests with a stub template + payload."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
)
from app.services.hc_platform import document_generator
from app.services.hc_platform.section_override import save_override

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: Base.metadata.create_all(
                c,
                tables=[
                    DocumentTemplate.__table__,
                    DocumentTemplateVersion.__table__,
                    GeneratedDocument.__table__,
                    GeneratedDocumentSectionOverride.__table__,
                ],
            )
        )
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with Session() as session:
        yield session
    await engine.dispose()


async def _seed_template(db: AsyncSession) -> DocumentTemplate:
    template = DocumentTemplate(
        id="executive_brief",
        document_type_key="executive_brief",
        name="Executive Strategy Brief",
        status="active",
    )
    db.add(template)
    version = DocumentTemplateVersion(
        template_id="executive_brief",
        version=1,
        sections={
            "sections": [
                {
                    "id": "headline",
                    "title": "Headline",
                    "type": "callout",
                    "blocks": [{"text": {"from": "ai.executive_summary.headline"}}],
                },
                {
                    "id": "summary",
                    "title": "Summary",
                    "type": "prose",
                    "blocks": [{"body": {"from": "ai.executive_summary.summary"}}],
                },
                {
                    "id": "next_steps",
                    "title": "Next steps",
                    "type": "list",
                    "blocks": [{"items": {"from": "context.next_steps", "default": []}}],
                },
            ]
        },
    )
    db.add(version)
    await db.flush()
    return template


async def test_generate_produces_ir_with_resolved_blocks(db: AsyncSession) -> None:
    await _seed_template(db)
    tenant_id = uuid.uuid4()
    doc = await document_generator.generate(
        db,
        template_id="executive_brief",
        tenant_id=tenant_id,
        context_payload={
            "ai": {
                "executive_summary": {
                    "headline": "Strong momentum",
                    "summary": "We are doing well.",
                }
            },
            "context": {"next_steps": ["Approve", "Communicate"]},
        },
    )
    assert doc.template_id == "executive_brief"
    assert doc.tenant_id == tenant_id
    assert doc.status == "draft"
    assert doc.version == 1
    assert doc.ai_provider == "noop"

    ir = doc.ir_snapshot
    assert ir is not None
    assert ir["template_id"] == "executive_brief"
    assert ir["template_version"] == 1
    sections = {s["id"]: s for s in ir["sections"]}
    assert sections["headline"]["blocks"][0]["text"] == "Strong momentum"
    assert sections["summary"]["blocks"][0]["body"] == "We are doing well."
    assert sections["next_steps"]["blocks"][0]["items"] == ["Approve", "Communicate"]


async def test_generate_uses_block_default_when_path_missing(db: AsyncSession) -> None:
    await _seed_template(db)
    doc = await document_generator.generate(
        db,
        template_id="executive_brief",
        tenant_id=uuid.uuid4(),
        context_payload={},
    )
    sections = {s["id"]: s for s in (doc.ir_snapshot or {}).get("sections", [])}
    # Default = [] in the template spec
    assert sections["next_steps"]["blocks"][0]["items"] == []
    # No data means None propagates for resolved-but-missing keys.
    assert sections["headline"]["blocks"][0]["text"] is None


async def test_generate_increments_version_per_tenant(db: AsyncSession) -> None:
    await _seed_template(db)
    tenant_id = uuid.uuid4()
    d1 = await document_generator.generate(
        db, template_id="executive_brief", tenant_id=tenant_id, context_payload={}
    )
    d2 = await document_generator.generate(
        db, template_id="executive_brief", tenant_id=tenant_id, context_payload={}
    )
    assert d1.version == 1
    assert d2.version == 2


async def test_generate_reapplies_section_overrides_on_regen(db: AsyncSession) -> None:
    await _seed_template(db)
    tenant_id = uuid.uuid4()
    d1 = await document_generator.generate(
        db,
        template_id="executive_brief",
        tenant_id=tenant_id,
        context_payload={
            "ai": {"executive_summary": {"summary": "auto-text"}}
        },
    )
    await save_override(
        db,
        document_id=d1.id,
        section_id="summary",
        content={"blocks": [{"body": "consultant-edited"}]},
    )
    d2 = await document_generator.generate(
        db,
        template_id="executive_brief",
        tenant_id=tenant_id,
        context_payload={
            "ai": {"executive_summary": {"summary": "different auto-text"}}
        },
    )
    sections = {s["id"]: s for s in (d2.ir_snapshot or {}).get("sections", [])}
    assert sections["summary"]["blocks"] == [{"body": "consultant-edited"}]
    assert sections["summary"].get("overridden") is True


async def test_generate_raises_when_template_missing(db: AsyncSession) -> None:
    with pytest.raises(LookupError):
        await document_generator.generate(
            db,
            template_id="not_a_template",
            tenant_id=uuid.uuid4(),
            context_payload={},
        )
