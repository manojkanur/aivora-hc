"""HC platform studios API — run a studio builder and return its output document."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentTenant, CurrentUser, DBDep
from app.models.hc_platform.document_engine import GeneratedDocument
from app.services.audit import log_event
from app.services.hc_platform.studio_builders import run_studio

router = APIRouter()


class StudioRunRequest(BaseModel):
    brief: dict[str, Any] | None = None
    workspace_id: str | None = None
    params: dict[str, Any] | None = None


async def _audit(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    payload: dict[str, Any],
) -> None:
    try:
        await log_event(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            payload=payload,
        )
    except Exception:
        # Audit failures must never break the request flow.
        pass


@router.post("/{studio_id}/run")
async def run_studio_endpoint(
    studio_id: str,
    body: StudioRunRequest,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, Any]:
    """Run the builder registered for ``studio_id`` and return its StudioOutputDocument."""
    # Spec-backed studios generate from their client-authored master
    # instruction; the coded builder remains as fallback so runs never 500.
    from app.services.hc_platform.spec_studio import generate_spec_report, load_spec

    if load_spec(studio_id):
        try:
            import json as _json

            brief_block = (
                "CLIENT BRIEF:\n" + _json.dumps(body.brief, ensure_ascii=True)[:8000]
                if body.brief else ""
            )
            from app.services.model_settings import get_global_model

            output = await generate_spec_report(
                studio_id, context_blocks=[brief_block], model=await get_global_model(db)
            )
            await _audit(
                current_tenant.id,
                current_user.id,
                "hc_platform.studio.run",
                {"studio_id": studio_id, "engine": "spec"},
            )
            return {"studio_id": studio_id, "document": output, "engine": "spec"}
        except Exception:  # noqa: BLE001 - fall back to the coded builder
            pass

    try:
        output = await run_studio(
            studio_id,
            db,
            current_tenant.id,
            body.brief,
            body.params,
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown studio_id: {studio_id}",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as 500 after audit
        await _audit(
            current_tenant.id,
            current_user.id,
            "hc_platform.studio.run",
            {
                "studio_id": studio_id,
                "status": "error",
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Studio run failed: {exc}",
        ) from exc

    # Persist a GeneratedDocument snapshot so exports can reference it by id.
    generated_document_id: uuid.UUID | None = None
    try:
        title = (
            (output.get("title") if isinstance(output, dict) else None)
            or studio_id
        )
        doc = GeneratedDocument(
            tenant_id=current_tenant.id,
            name=str(title)[:255],
            status="draft",
            ir_snapshot=output if isinstance(output, dict) else {"output": output},
            ai_provider="studio",
            ai_provenance={"studio_id": studio_id},
            created_by=current_user.id,
            meta={"studio_id": studio_id},
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)
        generated_document_id = doc.id
    except Exception:
        # Persistence is best-effort — never break the studio run flow.
        generated_document_id = None

    await _audit(
        current_tenant.id,
        current_user.id,
        "hc_platform.studio.run",
        {
            "studio_id": studio_id,
            "status": "ok",
            "has_brief": body.brief is not None,
            "has_params": body.params is not None,
            "generated_document_id": (
                str(generated_document_id) if generated_document_id else None
            ),
        },
    )
    return {
        "document": output,
        "generated_document_id": (
            str(generated_document_id) if generated_document_id else None
        ),
    }


@router.get("/{studio_id}/run/cached")
async def get_cached_studio_run(
    studio_id: str,
    current_user: CurrentUser,
    current_tenant: CurrentTenant,
    db: DBDep,
) -> dict[str, Any]:
    """Return the most recent persisted output for this tenant + studio.

    Stub: persistence not yet wired — always returns 404 for now.
    """
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No cached output for studio_id={studio_id}",
    )
