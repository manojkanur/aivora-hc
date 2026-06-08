from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory, create_all_tables
from app.models.billing import Plan
from app.models.connector import ConnectorRegistry
from app.models.gamification import Badge, Quest
from app.models.skill import SkillRegistry, SkillStatus, SkillTier
from app.rate_limit import limiter

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SKILL_SEED: list[dict[str, Any]] = [
    # Starter tier
    {"slug": "hc-framework",           "name": "HC Framework",             "category": "Foundation",       "tier": SkillTier.starter,       "credit_cost": 0,  "sort_order": 1,  "description": "Build a comprehensive Human Capital framework for your organisation."},
    {"slug": "document-workspace",      "name": "Document Workspace",       "category": "Foundation",       "tier": SkillTier.starter,       "credit_cost": 0,  "sort_order": 2,  "description": "Collaborative document workspace for HC deliverables."},
    {"slug": "brand-workspace",         "name": "Brand Workspace",          "category": "Foundation",       "tier": SkillTier.starter,       "credit_cost": 0,  "sort_order": 3,  "description": "Manage brand kits and design assets for HC outputs."},
    # Professional tier
    {"slug": "strategy",                "name": "Strategy Studio",          "category": "Strategy",         "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 4,  "description": "Create a multi-year HC strategy aligned to business goals."},
    {"slug": "maturity",                "name": "Maturity Assessment",      "category": "Assessment",       "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 5,  "description": "Assess HC maturity across key dimensions with a heat-map view."},
    {"slug": "benchmarking",            "name": "Benchmarking",             "category": "Analytics",        "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 6,  "description": "Benchmark HC metrics against industry peers."},
    {"slug": "business-plan",           "name": "HC Business Plan",         "category": "Strategy",         "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 7,  "description": "Build a board-ready HC business plan with ROI modelling."},
    {"slug": "talent-acquisition",      "name": "Talent Acquisition",       "category": "Talent",           "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 8,  "description": "Design end-to-end talent acquisition strategy and employer brand."},
    {"slug": "performance-management",  "name": "Performance Management",   "category": "Performance",      "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 9,  "description": "Build performance frameworks, OKRs, and review cadences."},
    {"slug": "workforce-planning",      "name": "Workforce Planning",       "category": "Analytics",        "tier": SkillTier.professional,  "credit_cost": 5,  "sort_order": 10, "description": "Model headcount requirements and workforce demand."},
    # Enterprise tier
    {"slug": "organization-development","name": "Organisation Development", "category": "OD",               "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 11, "description": "Design org structures, change initiatives, and culture programmes."},
    {"slug": "process-excellence",      "name": "Process Excellence",       "category": "Operations",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 12, "description": "Map and optimise HC processes using lean and six sigma principles."},
    {"slug": "employee-experience",     "name": "Employee Experience",      "category": "Culture",          "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 13, "description": "Design employee journeys and engagement strategies."},
    {"slug": "total-rewards",           "name": "Total Rewards",            "category": "Rewards",          "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 14, "description": "Build total rewards frameworks covering pay, benefits, and recognition."},
    {"slug": "skills-development",      "name": "Skills Development",       "category": "Learning",         "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 15, "description": "Identify skill gaps and build development roadmaps."},
    {"slug": "capability-assessment",   "name": "Capability Assessment",    "category": "Assessment",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 16, "description": "Assess organisational capability and build improvement plans."},
    {"slug": "learning-training",       "name": "Learning & Training",      "category": "Learning",         "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 17, "description": "Design learning programmes, curricula, and training calendars."},
    {"slug": "early-career",            "name": "Early Career",             "category": "Talent",           "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 18, "description": "Build graduate and early-career talent pipelines."},
    {"slug": "hipo-development",        "name": "HiPo Development",         "category": "Leadership",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 19, "description": "Identify and accelerate high-potential talent."},
    {"slug": "succession",              "name": "Succession Planning",      "category": "Leadership",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 20, "description": "Build succession maps and bench strength for critical roles."},
    {"slug": "leadership-development",  "name": "Leadership Development",   "category": "Leadership",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 21, "description": "Design leadership development programmes and competency frameworks."},
    {"slug": "coaching-mentoring",      "name": "Coaching & Mentoring",     "category": "Leadership",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 22, "description": "Build coaching and mentoring programmes with matching frameworks."},
    {"slug": "mobility",                "name": "Mobility",                 "category": "Talent",           "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 23, "description": "Design internal mobility frameworks and career lattice models."},
    {"slug": "growth-automation",       "name": "Growth Automation",        "category": "Operations",       "tier": SkillTier.enterprise,    "credit_cost": 10, "sort_order": 24, "description": "Automate HC workflows and reporting with AI-powered tools."},
    # Advisory tier
    {"slug": "deck-generator",          "name": "Deck Generator",           "category": "Advisory",         "tier": SkillTier.advisory,      "credit_cost": 15, "sort_order": 25, "description": "Generate board-ready presentation decks from HC data."},
    {"slug": "playbook-studio",         "name": "Playbook Studio",          "category": "Advisory",         "tier": SkillTier.advisory,      "credit_cost": 15, "sort_order": 26, "description": "Build operational HC playbooks for managers and HR teams."},
    {"slug": "infographic-studio",      "name": "Infographic Studio",       "category": "Advisory",         "tier": SkillTier.advisory,      "credit_cost": 15, "sort_order": 27, "description": "Create visual HC infographics and data storytelling assets."},
]

PLAN_SEED: list[dict[str, Any]] = [
    {
        "name": "Starter",
        "slug": "starter",
        "price_monthly": 0,
        "price_annual": 0,
        "credit_limit": 50,
        "features": {
            "skills": ["hc-framework", "document-workspace", "brand-workspace"],
            "ai_jobs_monthly": 10,
            "workspaces": 2,
            "exports": True,
            "linkedin": False,
        },
    },
    {
        "name": "Professional",
        "slug": "professional",
        "price_monthly": 9900,   # $99 USD in cents
        "price_annual": 95000,
        "credit_limit": 300,
        "features": {
            "skills": "professional+",
            "ai_jobs_monthly": 100,
            "workspaces": 10,
            "exports": True,
            "linkedin": True,
        },
    },
    {
        "name": "Enterprise",
        "slug": "enterprise",
        "price_monthly": 29900,
        "price_annual": 287000,
        "credit_limit": 1000,
        "features": {
            "skills": "enterprise+",
            "ai_jobs_monthly": -1,
            "workspaces": -1,
            "exports": True,
            "linkedin": True,
            "multi_skill": True,
        },
    },
    {
        "name": "Advisory",
        "slug": "advisory",
        "price_monthly": 59900,
        "price_annual": 575000,
        "credit_limit": 5000,
        "features": {
            "skills": "all",
            "ai_jobs_monthly": -1,
            "workspaces": -1,
            "exports": True,
            "linkedin": True,
            "multi_skill": True,
            "white_label": True,
        },
    },
]

CONNECTOR_SEED: list[dict[str, Any]] = [
    {"slug": "excel-csv",      "name": "Excel / CSV",       "category": "File",  "auth_type": "file_upload", "description": "Import data from Excel spreadsheets or CSV files."},
    {"slug": "google-sheets",  "name": "Google Sheets",     "category": "Cloud", "auth_type": "oauth2",      "description": "Sync data from Google Sheets in real time."},
    {"slug": "workday",        "name": "Workday HRIS",       "category": "HRIS",  "auth_type": "api_key",     "description": "Connect to Workday for workforce analytics."},
    {"slug": "successfactors", "name": "SAP SuccessFactors", "category": "HRIS",  "auth_type": "api_key",     "description": "Sync people data from SAP SuccessFactors."},
    {"slug": "bamboohr",       "name": "BambooHR",           "category": "HRIS",  "auth_type": "api_key",     "description": "Import employee data from BambooHR."},
]


async def _seed_skills(db) -> None:
    for item in SKILL_SEED:
        existing = await db.execute(
            select(SkillRegistry).where(SkillRegistry.slug == item["slug"])
        )
        if existing.scalar_one_or_none() is None:
            skill = SkillRegistry(
                slug=item["slug"],
                name=item["name"],
                category=item["category"],
                description=item.get("description"),
                tier=item["tier"],
                credit_cost=item["credit_cost"],
                sort_order=item["sort_order"],
                status=SkillStatus.active,
            )
            db.add(skill)


async def _seed_plans(db) -> None:
    for item in PLAN_SEED:
        existing = await db.execute(select(Plan).where(Plan.slug == item["slug"]))
        if existing.scalar_one_or_none() is None:
            plan = Plan(
                name=item["name"],
                slug=item["slug"],
                price_monthly=item["price_monthly"],
                price_annual=item["price_annual"],
                credit_limit=item["credit_limit"],
                features=item["features"],
            )
            db.add(plan)


async def _seed_quests_badges(db) -> None:
    from app.services.gamification import SEED_BADGES, SEED_QUESTS

    for badge_data in SEED_BADGES:
        existing = await db.execute(select(Badge).where(Badge.slug == badge_data["slug"]))
        if existing.scalar_one_or_none() is None:
            badge = Badge(
                slug=badge_data["slug"],
                name=badge_data["name"],
                description=badge_data["description"],
                icon_url=badge_data.get("icon_url"),
                rarity=badge_data["rarity"],
            )
            db.add(badge)

    for quest_data in SEED_QUESTS:
        existing = await db.execute(select(Quest).where(Quest.slug == quest_data["slug"]))
        if existing.scalar_one_or_none() is None:
            quest = Quest(
                slug=quest_data["slug"],
                title=quest_data["title"],
                description=quest_data["description"],
                xp_reward=quest_data["xp_reward"],
                trigger_event=quest_data["trigger_event"],
                conditions=quest_data["conditions"],
                badge_slug=quest_data.get("badge_slug"),
                is_active=quest_data.get("is_active", True),
            )
            db.add(quest)


async def _seed_connectors(db) -> None:
    for item in CONNECTOR_SEED:
        existing = await db.execute(
            select(ConnectorRegistry).where(ConnectorRegistry.slug == item["slug"])
        )
        if existing.scalar_one_or_none() is None:
            conn = ConnectorRegistry(
                slug=item["slug"],
                name=item["name"],
                category=item["category"],
                description=item.get("description"),
                auth_type=item["auth_type"],
                status="active",
            )
            db.add(conn)


async def _test_redis() -> bool:
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
        return True
    except Exception as exc:
        logger.warning(f"Redis connection test failed: {exc}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    logger.info(f"Starting Aivora HC API [{settings.ENVIRONMENT}]")

    # Boot-time secret check for production
    if settings.ENVIRONMENT == "production":
        for field_name in ("JWT_SECRET_KEY", "FERNET_KEY"):
            value = getattr(settings, field_name)
            if "change-me" in value.lower() or len(value) < 32:
                raise RuntimeError(
                    f"FATAL: {field_name} is insecure. Cannot start in production mode."
                )

    # Create tables
    await create_all_tables()
    logger.info("Database tables ready")

    # Seed data
    async with async_session_factory() as db:
        await _seed_skills(db)
        await _seed_plans(db)
        await _seed_quests_badges(db)
        await _seed_connectors(db)
        await db.commit()
    logger.info("Seed data applied (27 skills, plans, quests, badges, connectors)")

    # Redis check
    redis_ok = await _test_redis()
    logger.info(f"Redis: {'OK' if redis_ok else 'UNREACHABLE (non-fatal in dev)'}")

    # Sentry
    if settings.SENTRY_DSN:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.2,
        )
        logger.info("Sentry initialised")

    logger.info("Aivora HC API ready")

    yield

    # ---- Shutdown ----
    logger.info("Shutting down Aivora HC API")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(
        title="Aivora HC API",
        description="Multi-tenant Human Capital advisory SaaS platform",
        version="1.0.0",
        docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan,
    )

    # Rate limiter state
    app.state.limiter = limiter

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # SlowAPI middleware
    app.add_middleware(SlowAPIMiddleware)

    # Rate limit error handler
    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": "Rate limit exceeded", "detail": str(exc.detail)},
        )

    # Global exception handler
    @app.exception_handler(Exception)
    async def _global_exception_handler(request: Request, exc: Exception):
        logger.exception(f"Unhandled exception: {exc}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal server error"},
        )

    # ---------------------------------------------------------------------------
    # Routers
    # ---------------------------------------------------------------------------
    from app.api.admin import router as admin_router
    from app.api.ai_engine import router as ai_router
    from app.api.auth import router as auth_router
    from app.api.billing import router as billing_router
    from app.api.challenge import router as challenge_router
    from app.api.connectors import router as connectors_router
    from app.api.exports import router as exports_router
    from app.api.gamification import router as gamification_router
    from app.api.me import router as me_router
    from app.api.publish import router as publish_router
    from app.api.skills import router as skills_router
    from app.api.tenants import router as tenants_router
    from app.api.workspaces import router as workspaces_router

    prefix = "/api/v1"
    app.include_router(auth_router, prefix=prefix)
    app.include_router(tenants_router, prefix=prefix)
    app.include_router(workspaces_router, prefix=prefix)
    app.include_router(skills_router, prefix=prefix)
    app.include_router(ai_router, prefix=prefix)
    app.include_router(exports_router, prefix=prefix)
    app.include_router(billing_router, prefix=prefix)
    app.include_router(gamification_router, prefix=prefix)
    app.include_router(publish_router, prefix=prefix)
    app.include_router(connectors_router, prefix=prefix)
    app.include_router(challenge_router, prefix=prefix)
    app.include_router(admin_router, prefix=prefix)
    app.include_router(me_router, prefix=prefix)

    # Health check (no auth required)
    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app


app = create_app()
