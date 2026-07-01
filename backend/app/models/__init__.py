from app.database import Base  # noqa: F401
from app.models.base import UUIDBase  # noqa: F401
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.workspace import Workspace, WorkspaceStatus  # noqa: F401
from app.models.skill import SkillRegistry, SkillTier, SkillStatus, WorkspaceSkill  # noqa: F401
from app.models.billing import (  # noqa: F401
    Plan,
    TenantSubscription,
    SubscriptionStatus,
    CreditLedger,
    SkillPurchase,
)
from app.models.export import BrandKit, Export, ExportFormat, ExportStatus  # noqa: F401
from app.models.ai import (  # noqa: F401
    AiJob,
    AiJobStatus,
    AiDraft,
    DraftApprovalStatus,
    AiAuditLog,
)
from app.models.publish import PublishQueue, PublishLog, PublishPlatform, PublishStatus  # noqa: F401
from app.models.gamification import (  # noqa: F401
    Quest,
    UserQuest,
    QuestStatus,
    Badge,
    UserBadge,
    BadgeRarity,
    XpEvent,
    Streak,
)
from app.models.connector import (  # noqa: F401
    ConnectorRegistry,
    WorkspaceConnector,
    ConnectorAuthType,
    ConnectorStatus,
    SyncStatus,
)
from app.models.challenge import ChallengeBrief, BriefOutput, BriefStatus  # noqa: F401
from app.models.knowledge import KnowledgeArticle  # noqa: F401

# --- HC platform port (Phase 1 foundations) ---------------------------------
from app.models.hc_platform.modules import Module  # noqa: F401
from app.models.hc_platform.subscription_plans import SubscriptionPlan  # noqa: F401
from app.models.hc_platform.entitlements import Entitlement  # noqa: F401
from app.models.hc_platform.tenant_modules import TenantModule  # noqa: F401
from app.models.hc_platform.projects import Project  # noqa: F401
from app.models.hc_platform.activity_log import ActivityLog  # noqa: F401
from app.models.hc_platform.frameworks import (  # noqa: F401
    Framework,
    FrameworkComponent,
    FrameworkReview,
    ReviewRun,
    ExtractedFramework,
)
from app.models.hc_platform.capability import (  # noqa: F401
    CapabilityFramework,
    CapabilityFrameworkItem,
    CapabilityAssessment,
    CapabilityRating,
    SkillTag,
    FrameworkItemTag,
)
from app.models.hc_platform.diagnostics import DiagnosticResult  # noqa: F401
from app.models.hc_platform.target_state import TargetStateDesign  # noqa: F401

# --- HC platform port (Phase 2: Domains 4–9) --------------------------------
from app.models.hc_platform.hc_reviews import HcReview  # noqa: F401
from app.models.hc_platform.ai_insights import (  # noqa: F401
    HcAnalysisVersion,
    AiGeneratedInsight,
    AiPromptTemplate,
)
from app.models.hc_platform.review_documents import ReviewDocument  # noqa: F401
from app.models.hc_platform.maturity import (  # noqa: F401
    MaturityModel,
    MaturityBand,
    MaturityAssessment,
    MaturityDimensionResult,
)
from app.models.hc_platform.benchmarks import (  # noqa: F401
    BenchmarkProfile,
    BenchmarkDimensionScore,
    BenchmarkComparison,
    BenchmarkGroup,
)
from app.models.hc_platform.recommendations import RecommendationLibrary  # noqa: F401
from app.models.hc_platform.roadmaps import (  # noqa: F401
    Roadmap,
    RoadmapOutput,
    RoadmapPhase,
    RoadmapRecommendation,
)
from app.models.hc_platform.scenarios import (  # noqa: F401
    ScenarioModel,
    ScenarioAssumption,
    ScenarioOutput,
    ScenarioRiskFlag,
    ScenarioTemplate,
)
from app.models.hc_platform.role_profiles import (  # noqa: F401
    RoleCapabilityProfile,
    RoleCapabilityRequirement,
    RoleAdjacency,
    RoleMobilityFacet,
)
from app.models.hc_platform.career_paths import CareerPath, CareerPathStop  # noqa: F401
from app.models.hc_platform.mobility import (  # noqa: F401
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
from app.models.hc_platform.document_engine import (  # noqa: F401
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
from app.models.hc_platform.exports import HcExport  # noqa: F401
from app.models.hc_platform.linkedin import LinkedInConnection  # noqa: F401
