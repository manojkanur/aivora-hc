"""enqueue_export + run_export tests with mocked export_service_v2."""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
)
from app.models.hc_platform.exports import HcExport
from app.models.hc_platform.hc_reviews import HcReview
from app.services.hc_platform import export_runner

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def db(tmp_path: Path, monkeypatch) -> AsyncSession:
    # Redirect exports to a tmp dir so the test does not write to /var/lib.
    monkeypatch.setattr(export_runner, "DEFAULT_EXPORT_DIR", tmp_path / "exports")

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: Base.metadata.create_all(
                c,
                tables=[
                    HcExport.__table__,
                    GeneratedDocument.__table__,
                    GeneratedDocumentSectionOverride.__table__,
                    DocumentTemplate.__table__,
                    HcReview.__table__,
                ],
            )
        )
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with Session() as session:
        yield session
    await engine.dispose()


async def test_enqueue_export_creates_pending_row(db: AsyncSession) -> None:
    tenant_id = uuid.uuid4()
    source_id = uuid.uuid4()
    export = await export_runner.enqueue_export(
        db,
        tenant_id=tenant_id,
        format="pdf",
        source_type="generated_document",
        source_id=source_id,
    )
    assert export.status == "pending"
    assert export.format == "pdf"
    assert export.export_type == "generated_document"
    assert export.generated_document_id == source_id
    assert export.meta == {
        "source_type": "generated_document",
        "source_id": str(source_id),
    }


async def test_enqueue_export_rejects_bad_format(db: AsyncSession) -> None:
    with pytest.raises(ValueError):
        await export_runner.enqueue_export(
            db,
            tenant_id=uuid.uuid4(),
            format="xlsx",
            source_type="hc_review",
            source_id=uuid.uuid4(),
        )


async def test_enqueue_export_rejects_bad_source_type(db: AsyncSession) -> None:
    with pytest.raises(ValueError):
        await export_runner.enqueue_export(
            db,
            tenant_id=uuid.uuid4(),
            format="pdf",
            source_type="something_else",
            source_id=uuid.uuid4(),
        )


async def _seed_doc(db: AsyncSession, tenant_id: uuid.UUID) -> GeneratedDocument:
    template = DocumentTemplate(id="executive_brief", name="Brief", status="active")
    db.add(template)
    doc = GeneratedDocument(
        tenant_id=tenant_id,
        template_id="executive_brief",
        name="Doc",
        status="draft",
        ir_snapshot={
            "template_id": "executive_brief",
            "sections": [
                {
                    "id": "summary",
                    "title": "Summary",
                    "type": "prose",
                    "blocks": [{"body": "hi"}],
                }
            ],
        },
    )
    db.add(doc)
    await db.flush()
    return doc


async def test_run_export_writes_file_and_completes(db: AsyncSession) -> None:
    tenant_id = uuid.uuid4()
    doc = await _seed_doc(db, tenant_id)
    export = await export_runner.enqueue_export(
        db,
        tenant_id=tenant_id,
        format="pdf",
        source_type="generated_document",
        source_id=doc.id,
    )
    with patch.object(
        export_runner.export_service_v2, "generate_pdf", return_value=b"%PDF-FAKE"
    ) as gen:
        result = await export_runner.run_export(db, export.id)
    assert result.status == "completed"
    assert result.storage_path is not None
    assert result.error_message is None
    path = Path(result.storage_path)
    assert path.exists()
    assert path.read_bytes() == b"%PDF-FAKE"
    gen.assert_called_once()


async def test_run_export_marks_failed_on_error(db: AsyncSession) -> None:
    tenant_id = uuid.uuid4()
    doc = await _seed_doc(db, tenant_id)
    export = await export_runner.enqueue_export(
        db,
        tenant_id=tenant_id,
        format="pdf",
        source_type="generated_document",
        source_id=doc.id,
    )
    with patch.object(
        export_runner.export_service_v2,
        "generate_pdf",
        side_effect=RuntimeError("renderer crashed"),
    ):
        result = await export_runner.run_export(db, export.id)
    assert result.status == "failed"
    assert result.error_message == "renderer crashed"
    assert result.storage_path is None


async def test_run_export_hc_review_source(db: AsyncSession) -> None:
    tenant_id = uuid.uuid4()
    review = HcReview(
        tenant_id=tenant_id,
        company_name="Acme",
        diagnostic_results={"summary": "great"},
    )
    db.add(review)
    await db.flush()

    export = await export_runner.enqueue_export(
        db,
        tenant_id=tenant_id,
        format="docx",
        source_type="hc_review",
        source_id=review.id,
    )
    captured: dict = {}

    def _fake_docx(content, brand):
        captured["content"] = content
        return b"DOCX-FAKE"

    with patch.object(export_runner.export_service_v2, "generate_docx", side_effect=_fake_docx):
        result = await export_runner.run_export(db, export.id)
    assert result.status == "completed"
    assert captured["content"]["org_name"] == "Acme"
    assert captured["content"]["executive_summary"] == "great"
