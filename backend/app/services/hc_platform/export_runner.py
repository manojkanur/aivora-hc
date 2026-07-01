"""HC platform export queue + runner.

Enqueues a row in `hc_platform_exports` (status=pending), and exposes a
`run_export()` that materialises the file via `app.services.export_service_v2`.

Pipeline:
  enqueue_export(format, source_type, source_id) -> HcExport(status=pending)
  run_export(export_id) -> reads source -> renders bytes -> writes to disk
    -> updates row (status=completed | failed).
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.exports import HcExport
from app.models.hc_platform.document_engine import GeneratedDocument
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.frameworks import FrameworkReview
from app.models.hc_platform.roadmaps import Roadmap  # type: ignore[attr-defined]
from app.services import export_service_v2

DEFAULT_EXPORT_DIR = Path(
    os.environ.get("AIVORA_HC_EXPORT_DIR", "/var/lib/aivora/exports")
)

VALID_FORMATS = {"pdf", "docx", "pptx", "html", "xlsx"}
VALID_SOURCE_TYPES = {
    "framework_review",
    "hc_review",
    "roadmap",
    "generated_document",
}


async def enqueue_export(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    format: str,
    source_type: str,
    source_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
) -> HcExport:
    if format not in VALID_FORMATS:
        raise ValueError(f"Unsupported format {format!r}; expected {sorted(VALID_FORMATS)}")
    if source_type not in VALID_SOURCE_TYPES:
        raise ValueError(
            f"Unsupported source_type {source_type!r}; expected {sorted(VALID_SOURCE_TYPES)}"
        )

    export = HcExport(
        tenant_id=tenant_id,
        project_id=project_id,
        generated_document_id=(
            source_id if source_type == "generated_document" else None
        ),
        export_type=source_type,
        format=format,
        status="pending",
        meta={"source_type": source_type, "source_id": str(source_id)},
    )
    db.add(export)
    await db.flush()
    return export


async def _build_payload(
    db: AsyncSession,
    source_type: str,
    source_id: uuid.UUID,
) -> dict[str, Any]:
    """Return the dict that export_service_v2.generate_* functions consume."""
    if source_type == "generated_document":
        doc = await db.get(GeneratedDocument, source_id)
        if doc is None:
            raise LookupError(f"GeneratedDocument not found: {source_id}")
        return {
            "skill_slug": doc.template_id or "hc-document",
            "name": doc.name,
            "ir_snapshot": doc.ir_snapshot,
            **(doc.ir_snapshot or {}),
        }
    if source_type == "hc_review":
        review = await db.get(HcReview, source_id)
        if review is None:
            raise LookupError(f"HcReview not found: {source_id}")
        return {
            "skill_slug": "hc-review",
            "org_name": review.company_name,
            "executive_summary": (review.diagnostic_results or {}).get("summary"),
            "diagnostic_results": review.diagnostic_results,
            "target_state": review.target_state,
            "roadmap": review.roadmap,
        }
    if source_type == "framework_review":
        fr = await db.get(FrameworkReview, source_id)
        if fr is None:
            raise LookupError(f"FrameworkReview not found: {source_id}")
        return {
            "skill_slug": "framework-review",
            "name": fr.name,
            "scope": fr.scope,
        }
    if source_type == "roadmap":
        roadmap = await db.get(Roadmap, source_id)
        if roadmap is None:
            raise LookupError(f"Roadmap not found: {source_id}")
        return {
            "skill_slug": "roadmap",
            "name": getattr(roadmap, "name", None),
            "phases": getattr(roadmap, "phases", None) or getattr(roadmap, "meta", None),
        }
    raise ValueError(f"Unsupported source_type {source_type!r}")


def _render(format: str, payload: dict[str, Any]) -> bytes:
    brand: dict[str, Any] = {"primary_color": "#3b82f6"}
    if format == "pdf":
        return export_service_v2.generate_pdf(payload, brand)
    if format == "docx":
        return export_service_v2.generate_docx(payload, brand)
    if format == "pptx":
        return export_service_v2.generate_pptx(payload, brand)
    if format == "html":
        return export_service_v2.generate_html(payload, brand)
    if format == "xlsx":
        return export_service_v2.generate_xlsx(payload, brand)
    raise ValueError(f"Unsupported format {format!r}")


async def run_export(db: AsyncSession, export_id: uuid.UUID) -> HcExport:
    """Render the bytes for an export row, write them to disk, update status."""
    export = await db.get(HcExport, export_id)
    if export is None:
        raise LookupError(f"HcExport not found: {export_id}")

    export.status = "running"
    export.started_at = datetime.now(timezone.utc)
    await db.flush()

    try:
        source_type = (export.meta or {}).get("source_type") or export.export_type
        source_id_raw = (export.meta or {}).get("source_id") or (
            str(export.generated_document_id) if export.generated_document_id else None
        )
        if not source_type or not source_id_raw:
            raise ValueError(
                f"HcExport {export_id} missing source_type / source_id metadata"
            )
        payload = await _build_payload(db, source_type, uuid.UUID(source_id_raw))
        data = _render(export.format, payload)

        DEFAULT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        path = DEFAULT_EXPORT_DIR / f"{export_id}.{export.format}"
        path.write_bytes(data)

        export.storage_path = str(path)
        export.status = "completed"
        export.completed_at = datetime.now(timezone.utc)
        export.error_message = None
    except Exception as exc:  # noqa: BLE001 — propagate via row state.
        export.status = "failed"
        export.error_message = str(exc)
        export.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return export
