"""HC platform API routes (Phase 6 wiring)."""

from fastapi import APIRouter

from .ai_advisory import router as ai_advisory_router
from .benchmarks import router as benchmarks_router
from .brief_chat import router as brief_chat_router
from .brief_diagnostic import router as brief_diagnostic_router
from .capability import router as capability_router
from .documents import router as documents_router
from .exports import router as exports_router
from .frameworks import router as frameworks_router
from .hc_reviews import router as hc_reviews_router
from .maturity import router as maturity_router
from .mobility import router as mobility_router
from .modules import router as modules_router
from .projects import router as projects_router
from .roadmaps import router as roadmaps_router
from .scenarios import router as scenarios_router
from .studios import router as studios_router
from .linkedin import router as linkedin_router

api_router = APIRouter()
api_router.include_router(projects_router, prefix="/projects", tags=["hc-platform:projects"])
api_router.include_router(frameworks_router, tags=["hc-platform:frameworks"])
api_router.include_router(capability_router, prefix="/capability", tags=["hc-platform:capability"])
api_router.include_router(hc_reviews_router, prefix="/hc-reviews", tags=["hc-platform:reviews"])
api_router.include_router(maturity_router, prefix="/maturity", tags=["hc-platform:maturity"])
api_router.include_router(benchmarks_router, prefix="/benchmarks", tags=["hc-platform:benchmarks"])
api_router.include_router(roadmaps_router, tags=["hc-platform:roadmaps"])
api_router.include_router(scenarios_router, prefix="/scenarios", tags=["hc-platform:scenarios"])
api_router.include_router(mobility_router, prefix="/mobility", tags=["hc-platform:mobility"])
api_router.include_router(documents_router, prefix="/documents", tags=["hc-platform:documents"])
api_router.include_router(exports_router, prefix="/exports", tags=["hc-platform:exports"])
api_router.include_router(ai_advisory_router, prefix="/ai-advisory", tags=["hc-platform:ai-advisory"])
api_router.include_router(brief_chat_router, prefix="/brief-chat", tags=["hc-platform:brief-chat"])
api_router.include_router(modules_router, prefix="/modules", tags=["hc-platform:modules"])
api_router.include_router(brief_diagnostic_router, tags=["hc-platform:brief-diagnostic"])
api_router.include_router(studios_router, prefix="/studios", tags=["hc-platform:studios"])
api_router.include_router(linkedin_router, prefix="/linkedin", tags=["hc-platform:linkedin"])
