"""Seed reference data + a minimal sample tenant for the HC platform.

Run:
    python -m app.scripts.seed_hc_platform

Behaviour:
- Idempotent. Re-running produces the same state, not duplicates.
- Reference data is upserted via ``ON CONFLICT DO NOTHING`` keyed on the
  natural unique constraint of each table (``key`` / ``code`` /
  ``scenario_type`` etc).
- Sample tenant is created ONLY when ``SEED_SAMPLE_TENANT`` is not falsy
  (default 'true') AND no tenant with the sample domain exists.
- After creating the sample tenant, the maturity / benchmark / mobility /
  scenario engines are run so the demo has live computed outputs.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.hc_platform.benchmarks import (
    BenchmarkDimensionScore,
    BenchmarkProfile,
)
from app.models.hc_platform.capability import (
    CapabilityFramework,
    CapabilityFrameworkItem,
)
from app.models.hc_platform.entitlements import Entitlement
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.maturity import (
    MaturityBand,
    MaturityModel,
)
from app.models.hc_platform.mobility import (
    EmployeeMobilityProfile,
    MobilityKpiDictionary,
    MobilityMoveType,
    MobilityOpportunity,
)
from app.models.hc_platform.modules import Module
from app.models.hc_platform.projects import Project
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.role_profiles import RoleCapabilityProfile
from app.models.hc_platform.scenarios import (
    ScenarioAssumption,
    ScenarioModel,
    ScenarioTemplate,
)
from app.models.hc_platform.subscription_plans import SubscriptionPlan
from app.models.hc_platform.tenant_modules import TenantModule
from app.models.hc_platform.ai_insights import AiPromptTemplate
from app.models.hc_platform.document_engine import (
    DocumentTemplate,
    DocumentTemplateVersion,
)
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.services.hc_platform import (
    benchmark_engine,
    maturity_engine,
    mobility_matcher,
    scenario_engine,
)
from app.utils.security import hash_password

SEED_DIR = Path(__file__).parent / "seed_data"
SAMPLE_DOMAIN = "replit-sample.example"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load(name: str) -> Any:
    path = SEED_DIR / f"{name}.json"
    with open(path) as f:
        return json.load(f)


async def _upsert_rows(
    db: AsyncSession,
    model: type,
    rows: list[dict[str, Any]],
    conflict_cols: list[str],
) -> int:
    """Insert rows with ON CONFLICT DO NOTHING. Returns count inserted."""
    if not rows:
        return 0
    stmt = pg_insert(model).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=conflict_cols)
    result = await db.execute(stmt)
    # rowcount is reliable for PG INSERTs
    return result.rowcount or 0


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------


async def seed_modules(db: AsyncSession) -> int:
    raw = _load("modules")
    rows = []
    for r in raw:
        rows.append(
            {
                "key": r["key"],
                "label": r["label"],
                "description": r.get("description"),
                "route_path": r.get("route_path"),
                "icon": r.get("icon"),
                "category": r["category"],
                "status": r.get("status", "prototype"),
                "sort_order": r.get("sort_order", 0),
                "plan_tier": r.get("plan_tier"),
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, Module, rows, ["key"])


async def seed_subscription_plans(db: AsyncSession) -> int:
    raw = _load("subscription_plans")
    rows = []
    for r in raw:
        rows.append(
            {
                "key": r["key"],
                "name": r["name"],
                "description": r.get("description"),
                "monthly_price_cents": r.get("monthly_price_cents"),
                "is_default": r.get("is_default", False),
                "is_active": r.get("is_active", True),
                "sort_order": r.get("sort_order", 0),
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, SubscriptionPlan, rows, ["key"])


async def seed_entitlements(db: AsyncSession) -> int:
    raw = _load("entitlements")
    # Resolve plan_key -> plan_id.
    plans = (await db.execute(select(SubscriptionPlan))).scalars().all()
    plan_by_key = {p.key: p.id for p in plans}

    rows = []
    for r in raw:
        plan_id = plan_by_key.get(r["plan_key"])
        if plan_id is None:
            continue
        rows.append(
            {
                "plan_id": plan_id,
                "module_key": r["module_key"],
                "max_seats": r.get("max_seats"),
            }
        )
    return await _upsert_rows(db, Entitlement, rows, ["plan_id", "module_key"])


async def seed_maturity_models(db: AsyncSession) -> tuple[int, int]:
    raw = _load("maturity_models")
    model_inserts = 0
    band_inserts = 0
    for spec in raw:
        existing = (
            await db.execute(select(MaturityModel).where(MaturityModel.key == spec["key"]))
        ).scalar_one_or_none()
        if existing is None:
            model = MaturityModel(
                key=spec["key"],
                name=spec["name"],
                description=spec.get("description"),
                dimensions=spec.get("dimensions"),
                is_global=spec.get("is_global", True),
                version=spec.get("version", 1),
                meta=spec.get("metadata") or {},
            )
            db.add(model)
            await db.flush()
            model_inserts += 1
        else:
            model = existing
        for band in spec.get("bands", []):
            stmt = pg_insert(MaturityBand).values(
                maturity_model_id=model.id,
                band_name=band["band_name"],
                min_score=band.get("min_score"),
                max_score=band.get("max_score"),
                narrative=band.get("narrative"),
                sort_order=band.get("sort_order", 0),
            )
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["maturity_model_id", "band_name"]
            )
            res = await db.execute(stmt)
            band_inserts += res.rowcount or 0
    return model_inserts, band_inserts


async def seed_benchmark_profiles(db: AsyncSession) -> tuple[int, int]:
    raw = _load("benchmark_profiles")
    profile_inserts = 0
    score_inserts = 0
    for spec in raw:
        existing = (
            await db.execute(
                select(BenchmarkProfile).where(BenchmarkProfile.key == spec["key"])
            )
        ).scalar_one_or_none()
        if existing is None:
            profile = BenchmarkProfile(
                key=spec["key"],
                name=spec["name"],
                description=spec.get("description"),
                benchmark_type=spec.get("benchmark_type", "industry"),
                industry=spec.get("industry"),
                region=spec.get("region"),
                company_size=spec.get("company_size"),
                source=spec.get("source"),
                meta=spec.get("metadata") or {},
            )
            db.add(profile)
            await db.flush()
            profile_inserts += 1
        else:
            profile = existing
        for s in spec.get("dimension_scores", []):
            stmt = pg_insert(BenchmarkDimensionScore).values(
                benchmark_profile_id=profile.id,
                dimension_key=s["dimension_key"],
                score=s.get("score"),
                percentile=s.get("percentile"),
                sample_size=s.get("sample_size"),
            )
            stmt = stmt.on_conflict_do_nothing(
                index_elements=["benchmark_profile_id", "dimension_key"]
            )
            res = await db.execute(stmt)
            score_inserts += res.rowcount or 0
    return profile_inserts, score_inserts


async def seed_recommendation_library(db: AsyncSession) -> int:
    raw = _load("recommendation_library")
    rows = []
    for r in raw:
        rows.append(
            {
                "key": r["key"],
                "title": r["title"],
                "description": r.get("description"),
                "category": r.get("category"),
                "time_horizon": r.get("time_horizon"),
                "tier": r.get("tier"),
                "default_impact": r.get("default_impact"),
                "default_effort": r.get("default_effort"),
                "tags": r.get("tags"),
                "evidence_sources": r.get("evidence_sources"),
                "is_global": True,
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, RecommendationLibrary, rows, ["key"])


async def seed_scenario_templates(db: AsyncSession) -> int:
    raw = _load("scenario_templates")
    rows = []
    for r in raw:
        rows.append(
            {
                "scenario_type": r["scenario_type"],
                "name": r["name"],
                "description": r.get("description"),
                "default_assumptions": r.get("default_assumptions"),
                "formula_ref": r.get("formula_ref"),
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, ScenarioTemplate, rows, ["scenario_type"])


async def seed_mobility_move_types(db: AsyncSession) -> int:
    raw = _load("mobility_move_types")
    rows = []
    for r in raw:
        rows.append(
            {
                "code": r["code"],
                "label": r.get("label"),
                "description": r.get("description"),
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, MobilityMoveType, rows, ["code"])


async def seed_mobility_kpis(db: AsyncSession) -> int:
    raw = _load("mobility_kpi_dictionary")
    rows = []
    for r in raw:
        rows.append(
            {
                "key": r["key"],
                "label": r.get("label"),
                "description": r.get("description"),
                "unit": r.get("unit"),
                "formula": r.get("formula"),
                "meta": r.get("metadata") or {},
            }
        )
    return await _upsert_rows(db, MobilityKpiDictionary, rows, ["key"])


async def seed_ai_prompt_templates(db: AsyncSession) -> int:
    raw = _load("ai_prompt_templates")
    rows = []
    for r in raw:
        rows.append(
            {
                "key": r["key"],
                "version": r.get("version", 1),
                "insight_type": r.get("insight_type"),
                "system_prompt": r.get("system_prompt"),
                "user_prompt_template": r.get("user_prompt_template"),
                "model_name": r.get("model_name"),
                "temperature": r.get("temperature"),
                "max_tokens": r.get("max_tokens"),
                "response_format": r.get("response_format"),
                "allowed_modules": r.get("allowed_modules"),
                "is_active": r.get("is_active", True),
                "meta": r.get("meta") or {},
            }
        )
    return await _upsert_rows(db, AiPromptTemplate, rows, ["key"])


async def seed_document_templates(db: AsyncSession) -> tuple[int, int, int]:
    # document_types must exist before document_templates (FK)
    from app.models.hc_platform.document_engine import DocumentType
    raw_types = _load("document_types") or []
    rows_types = [
        {
            "key": r["key"],
            "label": r["label"],
            "description": r.get("description"),
            "default_governance_tier": r.get("default_governance_tier", "operational"),
            "meta": r.get("meta") or {},
        }
        for r in raw_types
    ]
    type_inserts = await _upsert_rows(db, DocumentType, rows_types, ["key"]) if rows_types else 0

    raw_t = _load("document_templates")
    rows_t = []
    for r in raw_t:
        rows_t.append(
            {
                "id": r["id"],
                "document_type_key": r.get("document_type_key"),
                "name": r["name"],
                "description": r.get("description"),
                "status": r.get("status", "active"),
                "code_ref": r.get("code_ref"),
                "meta": r.get("meta") or {},
            }
        )
    t_inserts = await _upsert_rows(db, DocumentTemplate, rows_t, ["id"])

    raw_v = _load("document_template_versions")
    v_inserts = 0
    for r in raw_v:
        # composite uniqueness in this table is (template_id, version) — we
        # check first to keep idempotency simple.
        existing = (
            await db.execute(
                select(DocumentTemplateVersion).where(
                    DocumentTemplateVersion.template_id == r["template_id"],
                    DocumentTemplateVersion.version == r.get("version", 1),
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue
        db.add(
            DocumentTemplateVersion(
                template_id=r["template_id"],
                version=r.get("version", 1),
                code_ref=r.get("code_ref"),
                sections=r.get("sections"),
                meta=r.get("meta") or {},
            )
        )
        v_inserts += 1
    return type_inserts, t_inserts, v_inserts


# ---------------------------------------------------------------------------
# Sample tenant
# ---------------------------------------------------------------------------


async def seed_sample_tenant(db: AsyncSession) -> dict[str, Any]:
    """Create the demo tenant + child rows. Returns a counts dict.

    No-op if the tenant already exists (idempotency).
    """
    spec = _load("sample_tenant")
    existing = (
        await db.execute(select(Tenant).where(Tenant.domain == SAMPLE_DOMAIN))
    ).scalar_one_or_none()
    if existing is not None:
        return {"status": "already-present", "tenant_id": str(existing.id)}

    t_spec = spec["tenant"]
    tenant = Tenant(
        name=t_spec["name"],
        domain=t_spec["domain"],
        plan=t_spec.get("plan", "starter"),
        industry=t_spec.get("industry"),
        region=t_spec.get("region"),
        company_size=t_spec.get("company_size"),
        challenge_brief=t_spec.get("challenge_brief"),
        strategic_priorities=t_spec.get("strategic_priorities"),
        success_measures=t_spec.get("success_measures"),
        primary_hc_priorities=t_spec.get("primary_hc_priorities"),
    )
    db.add(tenant)
    await db.flush()

    # Activate modules for the tenant.
    for mk in spec.get("tenant_modules", []):
        db.add(TenantModule(tenant_id=tenant.id, module_key=mk, status="active"))

    # User.
    u_spec = spec["user"]
    user = User(
        tenant_id=tenant.id,
        email=u_spec["email"],
        name=u_spec.get("name"),
        password_hash=hash_password(u_spec.get("password", "ChangeMe123!")),
        role=UserRole(u_spec.get("role", "owner")),
    )
    db.add(user)
    await db.flush()

    # Project.
    p_spec = spec["project"]
    project = Project(
        tenant_id=tenant.id,
        name=p_spec["name"],
        description=p_spec.get("description"),
        industry=p_spec.get("industry"),
        created_by=user.id,
    )
    db.add(project)
    await db.flush()

    # Capability framework + items.
    cf_spec = spec["capability_framework"]
    framework = CapabilityFramework(
        tenant_id=tenant.id,
        name=cf_spec["name"],
        framework_type=cf_spec.get("framework_type"),
    )
    db.add(framework)
    await db.flush()
    item_by_code: dict[str, uuid.UUID] = {}
    for item in cf_spec.get("items", []):
        row = CapabilityFrameworkItem(
            framework_id=framework.id,
            code=item["code"],
            name=item["name"],
            category=item.get("category"),
            level=item.get("level"),
        )
        db.add(row)
        await db.flush()
        item_by_code[item["code"]] = row.id

    # Role profiles.
    role_by_code: dict[str, uuid.UUID] = {}
    for rp in spec.get("role_profiles", []):
        row = RoleCapabilityProfile(
            tenant_id=tenant.id,
            framework_id=framework.id,
            role_code=rp["role_code"],
            role_name=rp["role_name"],
            career_level=rp.get("career_level"),
            function=rp.get("function"),
            criticality=rp.get("criticality", "standard"),
        )
        db.add(row)
        await db.flush()
        role_by_code[rp["role_code"]] = row.id

    # Employee mobility profiles.
    employee_profiles: list[uuid.UUID] = []
    for emp in spec.get("employees", []):
        row = EmployeeMobilityProfile(
            tenant_id=tenant.id,
            employee_ref=emp["employee_ref"],
            current_role_profile_id=role_by_code.get(emp.get("current_role_code")),
            performance_tier=emp.get("performance_tier", "meets"),
            readiness=emp.get("readiness", "ready_24_months"),
            tenure_months=emp.get("tenure_months"),
        )
        db.add(row)
        await db.flush()
        employee_profiles.append(row.id)

    # Mobility opportunities.
    opportunities: list[uuid.UUID] = []
    for op in spec.get("opportunities", []):
        row = MobilityOpportunity(
            tenant_id=tenant.id,
            target_role_profile_id=role_by_code.get(op.get("target_role_code")),
            name=op["name"],
            type=op.get("type"),
            location=op.get("location"),
            status="open",
        )
        db.add(row)
        await db.flush()
        opportunities.append(row.id)

    # HC Review.
    rv_spec = spec["hc_review"]
    review = HcReview(
        tenant_id=tenant.id,
        project_id=project.id,
        company_name=rv_spec.get("company_name"),
        review_type=rv_spec.get("review_type", "full_hc_review"),
        industry=t_spec.get("industry"),
        region=t_spec.get("region"),
        company_size=t_spec.get("company_size"),
        intake_data=rv_spec.get("intake_data"),
        diagnostic_results=rv_spec.get("diagnostic_results"),
        created_by=user.id,
    )
    db.add(review)
    await db.flush()

    # Scenario.
    sc_spec = spec["scenario"]
    scenario = ScenarioModel(
        tenant_id=tenant.id,
        review_id=review.id,
        scenario_type=sc_spec["scenario_type"],
        name=sc_spec["name"],
        status="draft",
    )
    db.add(scenario)
    await db.flush()
    for a in sc_spec.get("assumptions", []):
        db.add(
            ScenarioAssumption(
                scenario_id=scenario.id,
                key=a["key"],
                label=a.get("label"),
                value={"value": a["value"]},
                unit=a.get("unit"),
            )
        )
    await db.flush()

    # Commit baseline data before running engines.
    await db.commit()

    # Run engines.
    maturity_model = (
        await db.execute(select(MaturityModel).where(MaturityModel.key == "hc_maturity_v1"))
    ).scalar_one_or_none()
    counts = {
        "status": "created",
        "tenant_id": str(tenant.id),
        "users": 1,
        "projects": 1,
        "role_profiles": len(role_by_code),
        "employees": len(employee_profiles),
        "opportunities": len(opportunities),
        "hc_review": 1,
        "maturity_assessments": 0,
        "benchmark_comparisons": 0,
        "mobility_matches": 0,
        "scenarios": 1,
    }

    if maturity_model is not None:
        try:
            await maturity_engine.run(db, review.id, maturity_model.id)
            await db.commit()
            counts["maturity_assessments"] = 1
        except Exception as exc:
            print(f"[seed] maturity_engine.run failed: {exc}")
            await db.rollback()

    # Benchmark against the first profile matching the tenant industry.
    bench_profile = (
        await db.execute(
            select(BenchmarkProfile).where(BenchmarkProfile.industry == t_spec.get("industry"))
        )
    ).scalars().first()
    if bench_profile is not None:
        try:
            await benchmark_engine.run(db, review.id, bench_profile.id)
            await db.commit()
            counts["benchmark_comparisons"] = 1
        except Exception as exc:
            print(f"[seed] benchmark_engine.run failed: {exc}")
            await db.rollback()

    # Mobility matches per employee.
    match_count = 0
    for pid in employee_profiles:
        try:
            results = await mobility_matcher.run_for_profile(db, tenant.id, pid)
            await db.commit()
            match_count += len(results)
        except Exception as exc:
            print(f"[seed] mobility_matcher.run_for_profile failed for {pid}: {exc}")
            await db.rollback()
    counts["mobility_matches"] = match_count

    # Scenario run.
    try:
        await scenario_engine.run(db, scenario.id)
        await db.commit()
    except Exception as exc:
        print(f"[seed] scenario_engine.run failed: {exc}")
        await db.rollback()

    return counts


# ---------------------------------------------------------------------------
# Counters (post-seed totals)
# ---------------------------------------------------------------------------


async def _count(db: AsyncSession, model: type) -> int:
    res = await db.execute(select(func.count()).select_from(model))
    return int(res.scalar() or 0)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main() -> None:
    seed_sample = os.getenv("SEED_SAMPLE_TENANT", "true").lower() not in {"false", "0", "no"}

    async with async_session_factory() as db:
        # Reference data.
        modules_ins = await seed_modules(db)
        plans_ins = await seed_subscription_plans(db)
        await db.commit()  # plans must be committed before entitlements resolve
        entitlements_ins = await seed_entitlements(db)
        maturity_ins, band_ins = await seed_maturity_models(db)
        bench_ins, bench_score_ins = await seed_benchmark_profiles(db)
        recs_ins = await seed_recommendation_library(db)
        scen_ins = await seed_scenario_templates(db)
        move_ins = await seed_mobility_move_types(db)
        kpi_ins = await seed_mobility_kpis(db)
        prompt_ins = await seed_ai_prompt_templates(db)
        doc_type_ins, doc_t_ins, doc_v_ins = await seed_document_templates(db)
        await db.commit()

        # Totals (so we report the final state, not just deltas).
        totals = {
            "modules": await _count(db, Module),
            "plans": await _count(db, SubscriptionPlan),
            "entitlements": await _count(db, Entitlement),
            "maturity_models": await _count(db, MaturityModel),
            "benchmark_profiles": await _count(db, BenchmarkProfile),
            "recommendation_library": await _count(db, RecommendationLibrary),
            "scenario_templates": await _count(db, ScenarioTemplate),
            "mobility_move_types": await _count(db, MobilityMoveType),
            "mobility_kpis": await _count(db, MobilityKpiDictionary),
            "ai_prompt_templates": await _count(db, AiPromptTemplate),
            "document_templates": await _count(db, DocumentTemplate),
        }

        sample_counts: dict[str, Any] = {"status": "skipped"}
        if seed_sample:
            sample_counts = await seed_sample_tenant(db)

    # ---- Report ----
    print()
    print("== HC Platform Seed Complete ==")
    print(f"Modules:                 {totals['modules']}")
    print(f"Plans:                   {totals['plans']}")
    print(f"Entitlements:            {totals['entitlements']}")
    print(f"Maturity models:         {totals['maturity_models']}")
    print(f"Benchmark profiles:      {totals['benchmark_profiles']}")
    print(f"Recommendation library:  {totals['recommendation_library']}")
    print(f"Scenario templates:      {totals['scenario_templates']}")
    print(f"Mobility move types:     {totals['mobility_move_types']}")
    print(f"Mobility KPIs:           {totals['mobility_kpis']}")
    print(f"AI prompt templates:     {totals['ai_prompt_templates']}")
    print(f"Document templates:      {totals['document_templates']}")
    print(f"Sample tenant:           [{sample_counts.get('status')}]")
    if sample_counts.get("status") == "created":
        for k in (
            "users",
            "projects",
            "role_profiles",
            "employees",
            "opportunities",
            "hc_review",
            "maturity_assessments",
            "benchmark_comparisons",
            "mobility_matches",
            "scenarios",
        ):
            print(f"  - {k}: {sample_counts.get(k)}")


if __name__ == "__main__":
    asyncio.run(main())
