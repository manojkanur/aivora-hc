"""Python Enum classes for every status/type/category value set in the HC platform.

These enums exist for application-level validation only. Database columns are
stored as plain ``String`` (matches Replit, which uses TEXT + application
constraints rather than Postgres ENUM types).
"""

from __future__ import annotations

from enum import Enum


# ---------------------------------------------------------------------------
# Domain 1 / 2 — tenancy, modules
# ---------------------------------------------------------------------------


class TenantUserRole(str, Enum):
    viewer = "viewer"
    admin = "admin"
    editor = "editor"
    consultant = "consultant"


class ModuleStatus(str, Enum):
    prototype = "prototype"
    active = "active"
    beta = "beta"
    deprecated = "deprecated"
    hidden = "hidden"


class ModuleCategory(str, Enum):
    hc_advisory = "hc_advisory"
    mobility = "mobility"
    capability = "capability"
    frameworks = "frameworks"
    documents = "documents"
    analytics = "analytics"


# ---------------------------------------------------------------------------
# Domain 3 — frameworks / capabilities
# ---------------------------------------------------------------------------


class ProjectStatus(str, Enum):
    active = "active"
    archived = "archived"
    completed = "completed"
    on_hold = "on_hold"


class FrameworkStatus(str, Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


class MaturityLevel(str, Enum):
    initial = "initial"
    developing = "developing"
    defined = "defined"
    managed = "managed"
    optimized = "optimized"


class FrameworkReviewStatus(str, Enum):
    draft = "draft"
    in_progress = "in_progress"
    completed = "completed"
    archived = "archived"


class FrameworkReviewType(str, Enum):
    full = "full"
    spot = "spot"
    targeted = "targeted"


class ReviewRunStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class ExtractionMethod(str, Enum):
    manual = "manual"
    ai = "ai"
    hybrid = "hybrid"


class ExtractedFrameworkStatus(str, Enum):
    draft = "draft"
    approved = "approved"
    rejected = "rejected"


class DiagnosticStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class DiagnosticType(str, Enum):
    maturity = "maturity"
    readiness = "readiness"
    gap = "gap"
    custom = "custom"


class TargetStateStatus(str, Enum):
    draft = "draft"
    approved = "approved"
    superseded = "superseded"


# ---------------------------------------------------------------------------
# Domain 3 — capability assessment
# ---------------------------------------------------------------------------


class CapabilitySubjectType(str, Enum):
    employee = "employee"
    role = "role"
    team = "team"
    department = "department"


class CapabilityAssessmentStatus(str, Enum):
    draft = "draft"
    in_progress = "in_progress"
    completed = "completed"
    approved = "approved"


class RatingSource(str, Enum):
    self_ = "self"
    manager = "manager"
    peer = "peer"
    three_sixty = "360"
    ai = "ai"


class RatingPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RatingConfidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class SkillTagScope(str, Enum):
    global_ = "global"
    tenant = "tenant"


class SkillTagCategory(str, Enum):
    general = "general"
    technical = "technical"
    behavioral = "behavioral"
    leadership = "leadership"
    domain = "domain"


# ---------------------------------------------------------------------------
# Domain 4 — HC reviews (deferred to later phase but enums listed for completeness)
# ---------------------------------------------------------------------------


class HcReviewStatus(str, Enum):
    draft = "draft"
    intake = "intake"
    analysis = "analysis"
    review = "review"
    completed = "completed"
    archived = "archived"


class HcReviewType(str, Enum):
    full_hc_review = "full_hc_review"
    quick_diagnostic = "quick_diagnostic"
    targeted_review = "targeted_review"
    executive_briefing = "executive_briefing"


class CompanySizeBand(str, Enum):
    small = "small"
    medium = "medium"
    large = "large"
    enterprise = "enterprise"


class ConfidenceLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class GeneratorType(str, Enum):
    mock = "mock"
    ai = "ai"
    rules_engine = "rules_engine"
    hybrid = "hybrid"


class InsightType(str, Enum):
    executive_summary = "executive_summary"
    key_findings = "key_findings"
    risk_assessment = "risk_assessment"
    recommendations = "recommendations"
    industry_context = "industry_context"


class InsightGeneratorType(str, Enum):
    mock = "mock"
    ai = "ai"
    llm = "llm"
    rules = "rules"


# ---------------------------------------------------------------------------
# Domain 5 — maturity & benchmark
# ---------------------------------------------------------------------------


class MaturityBand(str, Enum):
    initial = "initial"
    developing = "developing"
    defined = "defined"
    managed = "managed"
    optimized = "optimized"


class Criticality(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Readiness(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class BenchmarkType(str, Enum):
    industry = "industry"
    regional = "regional"
    global_ = "global"
    custom = "custom"


class BenchmarkGroupType(str, Enum):
    industry = "industry"
    region = "region"
    size = "size"
    custom = "custom"


class ReviewDocumentCategory(str, Enum):
    supporting_evidence = "supporting_evidence"
    policy = "policy"
    strategy = "strategy"
    data = "data"
    other = "other"


# ---------------------------------------------------------------------------
# Domain 6 — roadmap & recommendations
# ---------------------------------------------------------------------------


class RoadmapStatus(str, Enum):
    draft = "draft"
    approved = "approved"
    active = "active"
    archived = "archived"


class TimeHorizon(str, Enum):
    short_term = "short_term"
    medium_term = "medium_term"
    long_term = "long_term"


class RoadmapTier(str, Enum):
    foundational = "foundational"
    strategic = "strategic"
    transformational = "transformational"
    tier_1 = "tier_1"
    tier_2 = "tier_2"
    tier_3 = "tier_3"


class ExportType(str, Enum):
    framework_review = "framework_review"
    hc_review = "hc_review"
    roadmap = "roadmap"
    generated_document = "generated_document"


class ExportFormat(str, Enum):
    pdf = "pdf"
    docx = "docx"
    xlsx = "xlsx"
    pptx = "pptx"
    html = "html"
    json = "json"


class ExportStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    expired = "expired"


# ---------------------------------------------------------------------------
# Domain 7 — scenarios
# ---------------------------------------------------------------------------


class ScenarioType(str, Enum):
    workforce_planning = "workforce_planning"
    restructure = "restructure"
    growth = "growth"
    attrition = "attrition"
    m_and_a = "m_and_a"


class ScenarioStatus(str, Enum):
    draft = "draft"
    completed = "completed"
    archived = "archived"


class ScenarioRiskSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# ---------------------------------------------------------------------------
# Domain 8 — mobility
# ---------------------------------------------------------------------------


class CareerLevel(str, Enum):
    IC1 = "IC1"
    IC2 = "IC2"
    IC3 = "IC3"
    IC4 = "IC4"
    IC5 = "IC5"
    IC6 = "IC6"
    M1 = "M1"
    M2 = "M2"
    M3 = "M3"
    M4 = "M4"
    M5 = "M5"
    VP = "VP"
    CXO = "CXO"


class RolePriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class RoleAdjacencyType(str, Enum):
    lateral = "lateral"
    vertical = "vertical"
    cross_functional = "cross_functional"
    rotational = "rotational"


class LeadershipTier(str, Enum):
    individual_contributor = "individual_contributor"
    manager = "manager"
    senior_manager = "senior_manager"
    director = "director"
    vp = "vp"
    exec_ = "exec"


class RoleCriticality(str, Enum):
    standard = "standard"
    critical = "critical"
    strategic = "strategic"


class RoleSource(str, Enum):
    manual = "manual"
    imported = "imported"
    ai = "ai"


class MobilityMode(str, Enum):
    hybrid = "hybrid"
    opportunity_first = "opportunity_first"
    profile_first = "profile_first"


class MobilityBarrierScope(str, Enum):
    tenant = "tenant"
    team = "team"
    role = "role"
    employee = "employee"


class MobilityBarrierType(str, Enum):
    capability = "capability"
    eligibility = "eligibility"
    policy = "policy"
    manager = "manager"
    geographic = "geographic"


class MobilityBarrierSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class MobilityEligibilityOwnerKind(str, Enum):
    tenant = "tenant"
    framework = "framework"
    role = "role"
    opportunity = "opportunity"


class MobilityOpportunityType(str, Enum):
    permanent_move = "permanent_move"
    rotation = "rotation"
    stretch = "stretch"
    project = "project"
    secondment = "secondment"
    promotion = "promotion"


class MobilityOpportunityStatus(str, Enum):
    open = "open"
    closed = "closed"
    filled = "filled"
    draft = "draft"
    cancelled = "cancelled"


class MobilityMovementStatus(str, Enum):
    proposed = "proposed"
    in_progress = "in_progress"
    completed = "completed"
    withdrawn = "withdrawn"
    rejected = "rejected"


class MobilityMovementOutcome(str, Enum):
    successful = "successful"
    unsuccessful = "unsuccessful"
    partial = "partial"
    pending = "pending"


class MobilityMovementEventType(str, Enum):
    created = "created"
    status_changed = "status_changed"
    approved = "approved"
    rejected = "rejected"
    completed = "completed"
    note_added = "note_added"


class MobilityMatchEngine(str, Enum):
    deterministic_v1 = "deterministic_v1"


class MobilityMatchVerdict(str, Enum):
    strong_match = "strong_match"
    good_match = "good_match"
    marginal = "marginal"
    poor_match = "poor_match"


class MobilityPreferenceKind(str, Enum):
    function = "function"
    location = "location"
    role = "role"
    family = "family"
    move_type = "move_type"


class MobilityReadiness(str, Enum):
    ready_now = "ready_now"
    ready_12_months = "ready_12_months"
    ready_24_months = "ready_24_months"
    not_ready = "not_ready"


class MobilityReadinessSource(str, Enum):
    manager = "manager"
    self_ = "self"
    ai = "ai"
    calibration = "calibration"


class MobilityRollupScope(str, Enum):
    tenant = "tenant"
    function = "function"
    family = "family"
    role = "role"


class PerformanceTier(str, Enum):
    meets = "meets"
    exceeds = "exceeds"
    below = "below"
    outstanding = "outstanding"


class TalentSignalKind(str, Enum):
    flight_risk = "flight_risk"
    high_potential = "high_potential"
    succession_ready = "succession_ready"
    stagnant = "stagnant"


# ---------------------------------------------------------------------------
# Domain 9 — documents
# ---------------------------------------------------------------------------


class GovernanceTier(str, Enum):
    operational = "operational"
    tactical = "tactical"
    strategic = "strategic"
    executive = "executive"


class DocumentTemplateStatus(str, Enum):
    active = "active"
    draft = "draft"
    deprecated = "deprecated"
    archived = "archived"


class GeneratedDocumentStatus(str, Enum):
    draft = "draft"
    review = "review"
    approved = "approved"
    published = "published"
    archived = "archived"


class AiProvider(str, Enum):
    noop = "noop"
    openai = "openai"
    anthropic = "anthropic"
    google = "google"
    local = "local"


class BrandVoice(str, Enum):
    formal_consultative = "formal_consultative"
    executive = "executive"
    technical = "technical"
    friendly = "friendly"


class ReadingLevel(str, Enum):
    manager = "manager"
    executive = "executive"
    specialist = "specialist"
    board = "board"


class DocumentExportFormat(str, Enum):
    pdf = "pdf"
    docx = "docx"
    xlsx = "xlsx"
    pptx = "pptx"
    html = "html"
