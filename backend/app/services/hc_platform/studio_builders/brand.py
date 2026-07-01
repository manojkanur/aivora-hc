"""Brand Workspace output builder.

Renders a brand governance one-pager that turns the Canva embed into a
measurable, audited asset system. All values are deterministic SQL aggregates
across document_export_profiles, document_templates, document_template_versions,
module_document_bindings, generation_profiles, generated_documents,
hc_platform_exports, activity_log, modules, tenant_modules.

Sections:
  1. Brand System Health        — kpi_grid
  2. Export Profile Usage Mix   — horizontal_bar_chart
  3. Brand Guideline Timeline   — timeline
  4. Brand Adoption Heatmap     — heatmap
  5. Brand Asset Audit          — ranked_list
  6. Voice / Reading-Level      — comparison_table
  7. Brand Gaps & Actions       — recommendation_cards
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hc_platform.activity_log import ActivityLog
from app.models.hc_platform.document_engine import (
    DocumentExportProfile,
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    GenerationProfile,
    ModuleDocumentBinding,
)
from app.models.hc_platform.exports import HcExport
from app.models.hc_platform.modules import Module
from app.models.hc_platform.tenant_modules import TenantModule


BRAND_TRACKED_ENTITY_TYPES = {
    "document_export_profile",
    "document_template",
    "document_template_version",
    "generation_profile",
}


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


async def _build_summary(
    db: AsyncSession, tenant_id: uuid.UUID, window_days: int
) -> dict[str, Any]:
    profile_count = (
        await db.execute(select(func.count()).select_from(DocumentExportProfile))
    ).scalar_one() or 0

    branded_templates = (
        await db.execute(
            select(func.count())
            .select_from(DocumentTemplate)
            .where(DocumentTemplate.status == "active")
        )
    ).scalar_one() or 0

    # Most recent version row across all templates as a proxy for "current guideline"
    latest_version_row = (
        await db.execute(
            select(DocumentTemplateVersion, DocumentTemplate.name)
            .join(DocumentTemplate, DocumentTemplate.id == DocumentTemplateVersion.template_id)
            .order_by(desc(DocumentTemplateVersion.created_at))
            .limit(1)
        )
    ).first()
    if latest_version_row is not None:
        latest_v, latest_template_name = latest_version_row
        current_version_label = f"v{latest_v.version}"
        published_at = latest_v.created_at
    else:
        current_version_label = "n/a"
        published_at = None
        latest_template_name = None

    # Generation profile coverage: tenants with default_export_profile_id NOT NULL
    total_profiles = (
        await db.execute(select(func.count()).select_from(GenerationProfile))
    ).scalar_one() or 0
    profiles_with_default = (
        await db.execute(
            select(func.count())
            .select_from(GenerationProfile)
            .where(GenerationProfile.default_export_profile_id.is_not(None))
        )
    ).scalar_one() or 0
    coverage_pct = (
        round((profiles_with_default / total_profiles) * 100, 1) if total_profiles else 0.0
    )

    kpis = [
        {
            "label": "Export Profiles",
            "value": profile_count,
            "delta": "configured",
            "source": "document_export_profiles",
        },
        {
            "label": "Branded Templates",
            "value": branded_templates,
            "delta": "status=active",
            "source": "document_templates",
        },
        {
            "label": "Current Guideline Version",
            "value": current_version_label,
            "delta": (
                f"latest from {latest_template_name}"
                if latest_template_name
                else "no versions yet"
            ),
            "source": "document_template_versions",
            "published_at": published_at.isoformat() if published_at else None,
        },
        {
            "label": "Generation Profile Coverage",
            "value": f"{coverage_pct}%",
            "delta": f"{profiles_with_default} of {total_profiles} tenants",
            "source": "generation_profiles",
        },
    ]
    return {"kpis": kpis}


async def _build_export_mix(
    db: AsyncSession, tenant_id: uuid.UUID, window_days: int
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    # Read tenant exports in window.
    rows = (
        await db.execute(
            select(HcExport)
            .where(HcExport.tenant_id == tenant_id)
            .where(HcExport.created_at >= since)
        )
    ).scalars().all()

    profile_id_to_key: dict[uuid.UUID, tuple[str, str, str]] = {}
    profiles = (await db.execute(select(DocumentExportProfile))).scalars().all()
    for p in profiles:
        profile_id_to_key[p.id] = (p.key, p.name, (p.format or "pdf"))

    counter: Counter = Counter()
    fmt_counter: Counter = Counter()
    for r in rows:
        # We don't have a profile_id FK on hc_platform_exports — derive from meta.
        meta = r.meta or {}
        profile_key = meta.get("profile_key") or meta.get("export_profile_key")
        if profile_key:
            counter[profile_key] += 1
        fmt_counter[(r.format or "pdf").lower()] += 1

    # Build bars — prefer profile-key buckets when we have them
    bars: list[dict[str, Any]] = []
    total = sum(counter.values()) or sum(fmt_counter.values())

    if counter:
        profile_by_key = {p.key: p for p in profiles}
        for key, count in counter.most_common():
            p = profile_by_key.get(key)
            bars.append(
                {
                    "profile_key": key,
                    "name": p.name if p else key,
                    "format": (p.format if p and p.format else "pdf"),
                    "count": count,
                    "pct": round((count / total) * 100, 1) if total else 0.0,
                }
            )
    else:
        # Fall back to format-only mix so the chart always renders.
        for fmt, count in fmt_counter.most_common():
            bars.append(
                {
                    "profile_key": fmt,
                    "name": fmt.upper(),
                    "format": fmt,
                    "count": count,
                    "pct": round((count / total) * 100, 1) if total else 0.0,
                }
            )

    if not bars:
        # Final fallback — show the configured profiles with zero counts so the
        # brand owner still sees the inventory.
        for p in profiles[:5]:
            bars.append(
                {
                    "profile_key": p.key,
                    "name": p.name,
                    "format": p.format or "pdf",
                    "count": 0,
                    "pct": 0.0,
                }
            )

    return {"bars": bars, "total": total, "window_days": window_days}


async def _build_guideline_timeline(db: AsyncSession) -> dict[str, Any]:
    # Pick the template with the most version rows — that's the brand guideline.
    template_row = (
        await db.execute(
            select(
                DocumentTemplateVersion.template_id,
                func.count(DocumentTemplateVersion.id).label("ct"),
                func.max(DocumentTemplateVersion.created_at).label("latest"),
            )
            .group_by(DocumentTemplateVersion.template_id)
            .order_by(desc("ct"))
            .limit(1)
        )
    ).first()

    if template_row is None:
        return {
            "template_id": None,
            "template_name": None,
            "events": [],
        }

    template_id = template_row[0]
    template = await db.get(DocumentTemplate, template_id)
    versions = (
        await db.execute(
            select(DocumentTemplateVersion)
            .where(DocumentTemplateVersion.template_id == template_id)
            .order_by(DocumentTemplateVersion.version)
        )
    ).scalars().all()

    events: list[dict[str, Any]] = []
    latest_version_number = max((v.version for v in versions), default=0)
    for v in versions:
        meta = v.meta or {}
        sections = v.sections or {}
        sections_count = 0
        if isinstance(sections, list):
            sections_count = len(sections)
        elif isinstance(sections, dict):
            seclist = sections.get("sections")
            if isinstance(seclist, list):
                sections_count = len(seclist)
            else:
                sections_count = len(sections.keys())
        events.append(
            {
                "version": v.version,
                "date": v.created_at.isoformat() if v.created_at else None,
                "changelog": meta.get("changelog") or meta.get("notes") or f"Template v{v.version}",
                "sections_count": sections_count,
                "is_current": v.version == latest_version_number,
            }
        )

    return {
        "template_id": template_id,
        "template_name": template.name if template else None,
        "events": events,
    }


async def _build_module_coverage(
    db: AsyncSession, tenant_id: uuid.UUID, window_days: int
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    # Active modules — prefer tenant_modules; fall back to global modules.
    tm_rows = (
        await db.execute(
            select(TenantModule).where(
                TenantModule.tenant_id == tenant_id,
                TenantModule.status == "active",
            )
        )
    ).scalars().all()
    module_keys: list[str] = [tm.module_key for tm in tm_rows]
    if not module_keys:
        module_keys = [
            m.key
            for m in (
                await db.execute(select(Module).order_by(Module.sort_order).limit(6))
            ).scalars().all()
        ]
    module_keys = module_keys[:8]

    bindings = (
        await db.execute(
            select(ModuleDocumentBinding).where(
                ModuleDocumentBinding.module_key.in_(module_keys)
            )
        )
    ).scalars().all()
    bound_pairs: set[tuple[str, str]] = {(b.module_key, b.template_id) for b in bindings}

    # Templates in scope = those referenced by bindings + a small fallback set.
    template_ids: list[str] = sorted({b.template_id for b in bindings})
    if not template_ids:
        template_ids = [
            t.id
            for t in (
                await db.execute(select(DocumentTemplate).limit(4))
            ).scalars().all()
        ]
    templates = (
        await db.execute(
            select(DocumentTemplate).where(DocumentTemplate.id.in_(template_ids))
        )
    ).scalars().all()
    template_name_by_id = {t.id: t.name for t in templates}

    # Count generated_documents per (module_key inferred via template_id, template_id).
    doc_rows = (
        await db.execute(
            select(GeneratedDocument)
            .where(GeneratedDocument.tenant_id == tenant_id)
            .where(GeneratedDocument.created_at >= since)
        )
    ).scalars().all()
    counts: dict[tuple[str, str], int] = defaultdict(int)
    # For each doc, the module_key isn't directly stored — read meta.module_key if present.
    for d in doc_rows:
        mkey = None
        if d.meta and isinstance(d.meta, dict):
            mkey = d.meta.get("module_key") or d.meta.get("module")
        if not mkey:
            # Try context_payload too
            ctx = d.context_payload or {}
            mkey = ctx.get("module_key") or ctx.get("module")
        if not mkey or mkey not in module_keys:
            continue
        if d.template_id and d.template_id in template_name_by_id:
            counts[(mkey, d.template_id)] += 1

    cells: list[dict[str, Any]] = []
    max_val = 0
    for mkey in module_keys:
        for tid in template_ids:
            value = counts.get((mkey, tid), 0)
            bound = (mkey, tid) in bound_pairs
            max_val = max(max_val, value)
            cells.append(
                {
                    "row": mkey,
                    "col": template_name_by_id.get(tid, tid),
                    "value": value,
                    "bound": bound,
                    "gap": (not bound) and value == 0,
                }
            )

    return {
        "rows": module_keys,
        "cols": [template_name_by_id.get(tid, tid) for tid in template_ids],
        "cells": cells,
        "max": max_val,
    }


async def _build_audit(
    db: AsyncSession, tenant_id: uuid.UUID, limit: int = 15
) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(ActivityLog)
            .where(ActivityLog.tenant_id == tenant_id)
            .where(ActivityLog.entity_type.in_(list(BRAND_TRACKED_ENTITY_TYPES)))
            .order_by(desc(ActivityLog.created_at))
            .limit(limit)
        )
    ).scalars().all()

    events: list[dict[str, Any]] = []
    for r in rows:
        events.append(
            {
                "when": r.created_at.isoformat() if r.created_at else None,
                "actor": (
                    (r.meta or {}).get("actor_email")
                    or (str(r.actor_user_id) if r.actor_user_id else "system")
                ),
                "action": r.action,
                "entity_type": r.entity_type,
                "entity_name": (r.meta or {}).get("entity_name") or r.entity_id,
                "diff": (r.meta or {}).get("diff"),
                "summary": r.summary,
            }
        )

    total = (
        await db.execute(
            select(func.count())
            .select_from(ActivityLog)
            .where(ActivityLog.tenant_id == tenant_id)
            .where(ActivityLog.entity_type.in_(list(BRAND_TRACKED_ENTITY_TYPES)))
        )
    ).scalar_one() or 0

    return {"events": events, "total": total}


async def _build_voice_compliance(
    db: AsyncSession, tenant_id: uuid.UUID, window_days: int
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    profile = (
        await db.execute(
            select(GenerationProfile).where(GenerationProfile.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    target_voice = profile.brand_voice if profile else "formal_consultative"
    target_reading = profile.reading_level if profile else "manager"

    default_profile_key: str | None = None
    if profile and profile.default_export_profile_id:
        dp = await db.get(DocumentExportProfile, profile.default_export_profile_id)
        default_profile_key = dp.key if dp else None

    # Aggregate brand_voice + reading_level from generated documents' meta.
    docs = (
        await db.execute(
            select(GeneratedDocument)
            .where(GeneratedDocument.tenant_id == tenant_id)
            .where(GeneratedDocument.created_at >= since)
        )
    ).scalars().all()

    voice_counter: Counter = Counter()
    reading_counter: Counter = Counter()
    profile_counter: Counter = Counter()
    for d in docs:
        meta = d.meta or {}
        ctx = d.context_payload or {}
        v = meta.get("brand_voice") or ctx.get("brand_voice")
        r = meta.get("reading_level") or ctx.get("reading_level")
        p = meta.get("export_profile_key") or ctx.get("export_profile_key")
        if v:
            voice_counter[v] += 1
        if r:
            reading_counter[r] += 1
        if p:
            profile_counter[p] += 1

    def _row(label: str, target: str | None, ctr: Counter) -> dict[str, Any]:
        total = sum(ctr.values())
        if not total or target is None:
            return {
                "dimension": label,
                "target": target,
                "actual_top": None,
                "actual_pct": 0.0,
                "drift": "unknown",
            }
        top_key, top_count = ctr.most_common(1)[0]
        match_pct = (
            round((ctr.get(target, 0) / total) * 100, 1) if target in ctr else 0.0
        )
        drift = "low" if match_pct >= 75 else ("medium" if match_pct >= 50 else "high")
        return {
            "dimension": label,
            "target": target,
            "actual_top": top_key,
            "actual_pct": round((top_count / total) * 100, 1),
            "target_match_pct": match_pct,
            "drift": drift,
        }

    return {
        "tenant_default": {
            "brand_voice": target_voice,
            "reading_level": target_reading,
            "export_profile_key": default_profile_key,
        },
        "rows": [
            _row("Brand Voice", target_voice, voice_counter),
            _row("Reading Level", target_reading, reading_counter),
            _row("Export Profile", default_profile_key, profile_counter),
        ],
    }


async def _build_gaps(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    window_days: int,
    module_coverage: dict[str, Any],
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    cards: list[dict[str, Any]] = []

    # 1. Modules with no template binding at all.
    no_bind_modules: set[str] = set()
    for cell in module_coverage.get("cells", []):
        if cell.get("gap"):
            no_bind_modules.add(cell["row"])
    for mkey in list(no_bind_modules)[:3]:
        cards.append(
            {
                "severity": "high",
                "title": f"Module '{mkey}' has no branded template binding",
                "evidence": f"module_document_bindings has no row for module_key='{mkey}' tying to a tenant template",
                "action": f"Bind an active document template to module '{mkey}'",
                "cta_route": "/admin/document-bindings",
                "source_table": "module_document_bindings",
            }
        )

    # 2. Export profiles unused in window.
    profiles = (await db.execute(select(DocumentExportProfile))).scalars().all()
    used_keys: set[str] = set()
    used_rows = (
        await db.execute(
            select(HcExport)
            .where(HcExport.tenant_id == tenant_id)
            .where(HcExport.created_at >= since)
        )
    ).scalars().all()
    for r in used_rows:
        meta = r.meta or {}
        k = meta.get("profile_key") or meta.get("export_profile_key")
        if k:
            used_keys.add(k)
    for p in profiles:
        if p.key not in used_keys:
            cards.append(
                {
                    "severity": "medium",
                    "title": f"Export profile '{p.key}' unused in last {window_days} days",
                    "evidence": f"0 hc_platform_exports rows reference profile_key='{p.key}'",
                    "action": "Archive or retire profile",
                    "cta_route": f"/admin/export-profiles/{p.key}",
                    "source_table": "hc_platform_exports",
                }
            )

    # 3. Templates whose latest version is older than 180 days.
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    stale_rows = (
        await db.execute(
            select(
                DocumentTemplateVersion.template_id,
                func.max(DocumentTemplateVersion.created_at).label("latest"),
            ).group_by(DocumentTemplateVersion.template_id)
        )
    ).all()
    for template_id, latest in stale_rows:
        if latest is None or latest >= stale_cutoff:
            continue
        tpl = await db.get(DocumentTemplate, template_id)
        if tpl is None:
            continue
        days_old = (datetime.now(timezone.utc) - latest).days
        cards.append(
            {
                "severity": "low",
                "title": f"Template '{tpl.name}' last updated {days_old} days ago",
                "evidence": f"max(document_template_versions.created_at)={latest.date().isoformat()}",
                "action": "Publish a new version with refreshed guidelines",
                "cta_route": f"/studios/brand/templates/{template_id}",
                "source_table": "document_template_versions",
            }
        )

    # 4. Tenant generation_profile without default_export_profile_id.
    profile = (
        await db.execute(
            select(GenerationProfile).where(GenerationProfile.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        cards.append(
            {
                "severity": "high",
                "title": "Tenant has no generation profile configured",
                "evidence": "generation_profiles has no row for this tenant_id",
                "action": "Create a generation profile and set a default export profile",
                "cta_route": "/admin/generation-profile",
                "source_table": "generation_profiles",
            }
        )
    elif profile.default_export_profile_id is None:
        cards.append(
            {
                "severity": "medium",
                "title": "Generation profile has no default export profile",
                "evidence": "generation_profiles.default_export_profile_id IS NULL for this tenant",
                "action": "Set a default export profile so generated documents brand correctly",
                "cta_route": "/admin/generation-profile",
                "source_table": "generation_profiles",
            }
        )

    # Rank cards: severity high > medium > low; cap at 6.
    sev_rank = {"high": 3, "medium": 2, "low": 1}
    cards.sort(key=lambda c: -sev_rank.get(c["severity"], 0))
    return {"cards": cards[:6]}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def build(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    brief: dict | None,
    params: dict | None,
) -> dict:
    params = params or {}
    window_days = int(params.get("window_days") or 90)

    summary = await _build_summary(db, tenant_id, window_days)
    export_mix = await _build_export_mix(db, tenant_id, window_days)
    timeline = await _build_guideline_timeline(db)
    coverage = await _build_module_coverage(db, tenant_id, window_days)
    audit = await _build_audit(db, tenant_id, limit=15)
    voice = await _build_voice_compliance(db, tenant_id, window_days)
    gaps = await _build_gaps(db, tenant_id, window_days, coverage)

    sections = [
        {
            "id": "summary",
            "title": "Brand System Health",
            "layout": "kpi_grid",
            "data": summary,
            "footnote": "Four hard counts: profiles configured, branded templates, current guideline version, tenant coverage.",
        },
        {
            "id": "export_mix",
            "title": "Export Profile Usage Mix",
            "layout": "horizontal_bar_chart",
            "data": export_mix,
            "footnote": f"Last {window_days} days of hc_platform_exports rows for this tenant.",
        },
        {
            "id": "guideline_timeline",
            "title": "Brand Guideline Version Timeline",
            "layout": "timeline",
            "data": timeline,
            "footnote": "Each row = a document_template_versions entry; current version highlighted.",
        },
        {
            "id": "module_coverage",
            "title": "Brand Adoption Across Modules",
            "layout": "heatmap",
            "data": coverage,
            "footnote": "White (gap=true) cells = module has no template binding - push to fix.",
        },
        {
            "id": "audit",
            "title": "Brand Asset Activity Audit",
            "layout": "ranked_list",
            "data": audit,
            "footnote": "Most recent activity_log events on brand-tracked entity types.",
        },
        {
            "id": "voice_compliance",
            "title": "Voice & Reading-Level Compliance",
            "layout": "comparison_table",
            "data": voice,
            "footnote": "Compares declared generation_profiles defaults vs. observed generated_documents metadata.",
        },
        {
            "id": "gaps",
            "title": "Brand Gaps & Recommended Actions",
            "layout": "recommendation_cards",
            "data": gaps,
            "footnote": "Deterministic rules - every card cites the row or timestamp that triggered it.",
        },
    ]

    return {
        "studio_id": "brand",
        "title": "Brand Workspace",
        "subtitle": f"Governance dashboard · {window_days}-day window",
        "sections": sections,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "tenant_id": str(tenant_id),
            "window_days": window_days,
        },
    }
