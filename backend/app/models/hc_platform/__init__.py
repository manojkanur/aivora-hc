"""HC platform models — Phase 1 foundations port.

Mapping decisions (Replit -> aivora-hc):
- Existing ``Tenant`` (UUID pk) is REUSED. Replit's int-pk ``tenants`` table is NOT
  re-created; instead extra nullable columns from Replit's tenants.* are added to
  our existing model.
- Replit ``tenant_users`` is DROPPED — our existing ``User`` model (already linked
  to ``Tenant`` via tenant_id) supersedes it. Membership and role live on ``User``.
- Replit ``audit_logs`` is DROPPED — our existing audit service
  (``app.services.audit``) provides the compliance trail.
- Replit ``activity_log`` IS ported as-is (lightweight in-app activity feed).
- All FK columns that target ``tenants`` or ``users`` use ``UUID`` (not ``Integer``)
  because our existing PKs are UUID. Replit's SERIAL-pk tables port to SERIAL where
  the existing identifier is internal; UUID where the table is referenced by tenant
  user-facing flows in our codebase conventions.
- Phase 1 covers Domains 1 (tenant extras), 2 (modules / entitlements / tenant_modules),
  3 (projects + frameworks + capability + diagnostics + target state), 3b (projects),
  10 (activity_log). Other domains are deferred to later phases.
"""

from app.models.hc_platform.modules import Module
from app.models.hc_platform.subscription_plans import SubscriptionPlan
from app.models.hc_platform.entitlements import Entitlement
from app.models.hc_platform.tenant_modules import TenantModule
from app.models.hc_platform.projects import Project
from app.models.hc_platform.activity_log import ActivityLog
from app.models.hc_platform.frameworks import (
    Framework,
    FrameworkComponent,
    FrameworkReview,
    ReviewRun,
    ExtractedFramework,
)
from app.models.hc_platform.capability import (
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityAssessment,
    CapabilityRating,
    SkillTag,
    FrameworkItemTag,
)
from app.models.hc_platform.diagnostics import DiagnosticResult
from app.models.hc_platform.target_state import TargetStateDesign

# --- Phase 2 (Domains 4–9) -------------------------------------------------
from app.models.hc_platform.hc_reviews import HcReview
from app.models.hc_platform.ai_insights import (
    HcAnalysisVersion,
    AiGeneratedInsight,
    AiPromptTemplate,
)
from app.models.hc_platform.review_documents import ReviewDocument
from app.models.hc_platform.maturity import (
    MaturityModel,
    MaturityBand,
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.models.hc_platform.benchmarks import (
    BenchmarkProfile,
    BenchmarkDimensionScore,
    BenchmarkComparison,
    BenchmarkGroup,
)
from app.models.hc_platform.recommendations import RecommendationLibrary
from app.models.hc_platform.roadmaps import (
    Roadmap,
    RoadmapOutput,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.models.hc_platform.scenarios import (
    ScenarioModel,
    ScenarioAssumption,
    ScenarioOutput,
    ScenarioRiskFlag,
    ScenarioTemplate,
)
from app.models.hc_platform.role_profiles import (
    RoleCapabilityProfile,
    RoleCapabilityRequirement,
    RoleAdjacency,
    RoleMobilityFacet,
)
from app.models.hc_platform.career_paths import CareerPath, CareerPathStop
from app.models.hc_platform.mobility import (
    MobilityFramework,
    EmployeeMobilityProfile,
    MobilityOpportunity,
    MobilityOpportunityRequirement,
    MobilityMatchResult,
    MobilityMovement,
    MobilityMovementEvent,
    MobilityPreference,
    MobilityReadinessAssessment,
    MobilityEligibilityRule,
    MobilityBarrier,
    MobilityRollup,
    MobilityMoveType,
    MobilityKpiDictionary,
    TalentVisibilitySignal,
)
from app.models.hc_platform.document_engine import (
    DocumentCategory,
    ProjectDocument,
    DocumentType,
    DocumentTemplate,
    DocumentTemplateVersion,
    DocumentExportProfile,
    ModuleDocumentBinding,
    GenerationProfile,
    GeneratedDocument,
    GeneratedDocumentSectionOverride,
)
from app.models.hc_platform.exports import HcExport

__all__ = [
    "Module",
    "SubscriptionPlan",
    "Entitlement",
    "TenantModule",
    "Project",
    "ActivityLog",
    "Framework",
    "FrameworkComponent",
    "FrameworkReview",
    "ReviewRun",
    "ExtractedFramework",
    "CapabilityFramework",
    "CapabilityFrameworkItem",
    "CapabilityAssessment",
    "CapabilityRating",
    "SkillTag",
    "FrameworkItemTag",
    "DiagnosticResult",
    "TargetStateDesign",
    # Phase 2
    "HcReview",
    "HcAnalysisVersion",
    "AiGeneratedInsight",
    "AiPromptTemplate",
    "ReviewDocument",
    "MaturityModel",
    "MaturityBand",
    "MaturityAssessment",
    "MaturityDimensionResult",
    "BenchmarkProfile",
    "BenchmarkDimensionScore",
    "BenchmarkComparison",
    "BenchmarkGroup",
    "RecommendationLibrary",
    "Roadmap",
    "RoadmapOutput",
    "RoadmapPhase",
    "RoadmapRecommendation",
    "ScenarioModel",
    "ScenarioAssumption",
    "ScenarioOutput",
    "ScenarioRiskFlag",
    "ScenarioTemplate",
    "RoleCapabilityProfile",
    "RoleCapabilityRequirement",
    "RoleAdjacency",
    "RoleMobilityFacet",
    "CareerPath",
    "CareerPathStop",
    "MobilityFramework",
    "EmployeeMobilityProfile",
    "MobilityOpportunity",
    "MobilityOpportunityRequirement",
    "MobilityMatchResult",
    "MobilityMovement",
    "MobilityMovementEvent",
    "MobilityPreference",
    "MobilityReadinessAssessment",
    "MobilityEligibilityRule",
    "MobilityBarrier",
    "MobilityRollup",
    "MobilityMoveType",
    "MobilityKpiDictionary",
    "TalentVisibilitySignal",
    "DocumentCategory",
    "ProjectDocument",
    "DocumentType",
    "DocumentTemplate",
    "DocumentTemplateVersion",
    "DocumentExportProfile",
    "ModuleDocumentBinding",
    "GenerationProfile",
    "GeneratedDocument",
    "GeneratedDocumentSectionOverride",
    "HcExport",
]
