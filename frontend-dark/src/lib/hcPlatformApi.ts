/**
 * HC Platform API client — Phase 7.
 *
 * Wraps the Phase-6 backend endpoints mounted at `/api/v1/hc-platform/*`.
 * Reuses the existing axios instance from `./api` so JWT, 401 redirects, and
 * 402 credit handling all come along for free.
 *
 * 13 sub-APIs covering all 98 endpoints:
 *   hcProjectsAPI, hcFrameworksAPI, hcCapabilityAPI, hcReviewsAPI,
 *   hcMaturityAPI, hcBenchmarksAPI, hcRoadmapsAPI, hcScenariosAPI,
 *   hcMobilityAPI, hcDocumentsAPI, hcExportsAPI, hcAiAdvisoryAPI,
 *   hcModulesAPI
 */

import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { api } from './api'

// ---------------------------------------------------------------------------
// Base + helpers
// ---------------------------------------------------------------------------

// `api` is created with `baseURL: '/api/v1'`, so we only need the
// hc-platform-relative prefix here.
const HC_BASE = '/hc-platform'

function qs(params?: object): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  Object.entries(params as Record<string, unknown>).forEach(([k, v]) => {
    if (v !== undefined && v !== null) sp.set(k, String(v))
  })
  const s = sp.toString()
  return s ? `?${s}` : ''
}

function get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return api.get<T>(url, config)
}
function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return api.post<T>(url, body, config)
}
function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return api.patch<T>(url, body, config)
}
function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return api.put<T>(url, body, config)
}
function del<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return api.delete<T>(url, config)
}

// ---------------------------------------------------------------------------
// Shared scalar / list-param types
// ---------------------------------------------------------------------------

export type UUID = string
export type ISODateTime = string
export type ISODate = string
export type JsonRecord = Record<string, unknown>

export interface ListParams {
  skip?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  id: UUID
  tenant_id: UUID
  name: string
  description: string | null
  status: string
  industry: string | null
  company_size: string | null
  region: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface ProjectCreate {
  name: string
  description?: string | null
  industry?: string | null
  company_size?: string | null
  region?: string | null
}
export interface ProjectUpdate extends Partial<ProjectCreate> {
  status?: string | null
}
export interface ProjectListParams extends ListParams {
  status?: string
}

export const hcProjectsAPI = {
  list: (params?: ProjectListParams) =>
    get<Project[]>(`${HC_BASE}/projects${qs(params)}`),
  get: (id: UUID) => get<Project>(`${HC_BASE}/projects/${id}`),
  create: (body: ProjectCreate) => post<Project>(`${HC_BASE}/projects`, body),
  update: (id: UUID, body: ProjectUpdate) =>
    patch<Project>(`${HC_BASE}/projects/${id}`, body),
  archive: (id: UUID) =>
    del<{ status: string; project_id: string }>(`${HC_BASE}/projects/${id}`),
}

// ---------------------------------------------------------------------------
// Frameworks (+ components + framework reviews)
// ---------------------------------------------------------------------------

export interface Framework {
  id: UUID
  tenant_id: UUID
  name: string
  description: string | null
  framework_type: string | null
  status: string
  is_template: boolean
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface FrameworkCreate {
  name: string
  description?: string | null
  framework_type?: string | null
  is_template?: boolean
  meta?: JsonRecord | null
}
export interface FrameworkUpdate extends Partial<FrameworkCreate> {
  status?: string | null
}

export interface FrameworkComponent {
  id: number
  framework_id: UUID
  code: string
  name: string
  description: string | null
  parent_id: number | null
  level: number | null
  maturity_level: string
  criteria: JsonRecord | null
  sort_order: number
}
export interface FrameworkComponentCreate {
  code: string
  name: string
  description?: string | null
  parent_id?: number | null
  level?: number | null
  maturity_level?: string
  criteria?: JsonRecord | null
  sort_order?: number
}
export type FrameworkComponentUpdate = Partial<FrameworkComponentCreate>

export interface FrameworkReview {
  id: UUID
  tenant_id: UUID
  project_id: UUID
  framework_id: UUID
  name: string
  status: string
  review_type: string
  scope: JsonRecord | null
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface FrameworkReviewCreate {
  project_id: UUID
  framework_id: UUID
  name: string
  review_type?: string
  scope?: JsonRecord | null
  meta?: JsonRecord | null
}
export interface FrameworkReviewUpdate {
  name?: string
  status?: string
  review_type?: string
  scope?: JsonRecord | null
  meta?: JsonRecord | null
}

export const hcFrameworksAPI = {
  // Frameworks
  listFrameworks: (params?: ListParams & { is_template?: boolean }) =>
    get<Framework[]>(`${HC_BASE}/frameworks${qs(params)}`),
  getFramework: (id: UUID) => get<Framework>(`${HC_BASE}/frameworks/${id}`),
  createFramework: (body: FrameworkCreate) =>
    post<Framework>(`${HC_BASE}/frameworks`, body),
  updateFramework: (id: UUID, body: FrameworkUpdate) =>
    patch<Framework>(`${HC_BASE}/frameworks/${id}`, body),
  deleteFramework: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/frameworks/${id}`),

  // Components
  listComponents: (frameworkId: UUID) =>
    get<FrameworkComponent[]>(`${HC_BASE}/frameworks/${frameworkId}/components`),
  createComponent: (frameworkId: UUID, body: FrameworkComponentCreate) =>
    post<FrameworkComponent>(
      `${HC_BASE}/frameworks/${frameworkId}/components`,
      body,
    ),
  updateComponent: (componentId: number, body: FrameworkComponentUpdate) =>
    patch<FrameworkComponent>(
      `${HC_BASE}/framework-components/${componentId}`,
      body,
    ),
  deleteComponent: (componentId: number) =>
    del<{ status: string }>(`${HC_BASE}/framework-components/${componentId}`),

  // Framework reviews
  listReviews: (params?: ListParams & { project_id?: UUID; status?: string }) =>
    get<FrameworkReview[]>(`${HC_BASE}/framework-reviews${qs(params)}`),
  getReview: (id: UUID) =>
    get<FrameworkReview>(`${HC_BASE}/framework-reviews/${id}`),
  createReview: (body: FrameworkReviewCreate) =>
    post<FrameworkReview>(`${HC_BASE}/framework-reviews`, body),
  updateReview: (id: UUID, body: FrameworkReviewUpdate) =>
    patch<FrameworkReview>(`${HC_BASE}/framework-reviews/${id}`, body),
  deleteReview: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/framework-reviews/${id}`),
}

// ---------------------------------------------------------------------------
// Capability (frameworks, items, assessments, ratings)
// ---------------------------------------------------------------------------

export interface CapabilityFramework {
  id: UUID
  tenant_id: UUID
  name: string
  description: string | null
  framework_type: string | null
  proficiency_scale: JsonRecord[] | null
  is_template: boolean
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface CapabilityFrameworkCreate {
  name: string
  description?: string | null
  framework_type?: string | null
  proficiency_scale?: JsonRecord[] | null
  is_template?: boolean
  meta?: JsonRecord | null
}
export interface CapabilityFrameworkFromTemplate {
  template_framework_id: UUID
  name?: string | null
}

export interface CapabilityFrameworkItem {
  id: UUID
  framework_id: UUID
  code: string
  name: string
  description: string | null
  category: string | null
  parent_id: UUID | null
  level: number | null
  sort_order: number
}
export interface CapabilityFrameworkItemCreate {
  code: string
  name: string
  description?: string | null
  category?: string | null
  parent_id?: UUID | null
  level?: number | null
  sort_order?: number
}

export interface CapabilityAssessment {
  id: UUID
  tenant_id: UUID
  framework_id: UUID
  subject_type: string
  subject_ref: string | null
  role_profile_id: UUID | null
  status: string
  rating_source: string
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface CapabilityAssessmentCreate {
  framework_id: UUID
  subject_type: string
  subject_ref?: string | null
  role_profile_id?: UUID | null
  rating_source?: string
  meta?: JsonRecord | null
}

export interface CapabilityRating {
  id: UUID
  assessment_id: UUID
  framework_item_id: UUID
  current_level: number | null
  target_level: number | null
  evidence: string | null
  priority: string | null
  confidence: string | null
  notes: string | null
}
export interface CapabilityRatingItem {
  framework_item_id: UUID
  current_level?: number | null
  target_level?: number | null
  evidence?: string | null
  priority?: string | null
  confidence?: string | null
  notes?: string | null
}
export interface CapabilityRatingBulkUpsert {
  ratings: CapabilityRatingItem[]
}

export const hcCapabilityAPI = {
  // Frameworks
  listFrameworks: (params?: ListParams & { is_template?: boolean }) =>
    get<CapabilityFramework[]>(`${HC_BASE}/capability/frameworks${qs(params)}`),
  getFramework: (id: UUID) =>
    get<CapabilityFramework>(`${HC_BASE}/capability/frameworks/${id}`),
  createFramework: (body: CapabilityFrameworkCreate) =>
    post<CapabilityFramework>(`${HC_BASE}/capability/frameworks`, body),
  cloneFromTemplate: (body: CapabilityFrameworkFromTemplate) =>
    post<CapabilityFramework>(
      `${HC_BASE}/capability/frameworks/from-template`,
      body,
    ),
  deleteFramework: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/capability/frameworks/${id}`),

  // Items
  listItems: (frameworkId: UUID) =>
    get<CapabilityFrameworkItem[]>(
      `${HC_BASE}/capability/frameworks/${frameworkId}/items`,
    ),
  createItem: (frameworkId: UUID, body: CapabilityFrameworkItemCreate) =>
    post<CapabilityFrameworkItem>(
      `${HC_BASE}/capability/frameworks/${frameworkId}/items`,
      body,
    ),

  // Assessments
  listAssessments: (params?: ListParams & { framework_id?: UUID; status?: string }) =>
    get<CapabilityAssessment[]>(`${HC_BASE}/capability/assessments${qs(params)}`),
  getAssessment: (id: UUID) =>
    get<CapabilityAssessment>(`${HC_BASE}/capability/assessments/${id}`),
  createAssessment: (body: CapabilityAssessmentCreate) =>
    post<CapabilityAssessment>(`${HC_BASE}/capability/assessments`, body),

  // Ratings
  listRatings: (assessmentId: UUID) =>
    get<CapabilityRating[]>(
      `${HC_BASE}/capability/assessments/${assessmentId}/ratings`,
    ),
  bulkUpsertRatings: (assessmentId: UUID, body: CapabilityRatingBulkUpsert) =>
    post<CapabilityRating[]>(
      `${HC_BASE}/capability/assessments/${assessmentId}/ratings`,
      body,
    ),
}

// ---------------------------------------------------------------------------
// HC reviews + intake + analyze + analysis-versions + insights
// ---------------------------------------------------------------------------

/* Structured intake — Pydantic uses camelCase aliases so we mirror that on the
 * wire. See backend/app/schemas/hc_platform/intake.py. */
export interface CompanyProfile {
  companyName: string
  industry?: string | null
  countryRegion?: string | null
  employeeCount?: string | null
  businessMaturity?: string | null
  ownershipType?: string | null
}

export interface ReviewObjective {
  whatIsBeingReviewed: string
  whyNow?: string | null
  targetAudience?: string | null
  scopeType?: string | null
  desiredOutputs?: string[] | null
}

export interface PainPointFlags {
  leadershipCapability?: boolean
  successionPipeline?: boolean
  workforcePlanning?: boolean
  talentAcquisition?: boolean
  performanceManagement?: boolean
  learningDevelopment?: boolean
  employeeEngagement?: boolean
  organisationDesign?: boolean
  governanceCompliance?: boolean
  hcAnalytics?: boolean
  additionalNotes?: string | null
}

export interface DeliverableFlags {
  diagnosticReport?: boolean
  targetStateDesign?: boolean
  implementationRoadmap?: boolean
  executiveBriefing?: boolean
  capabilityMatrix?: boolean
  processRedesign?: boolean
  governanceRecommendations?: boolean
  additionalNotes?: string | null
}

export interface StructuredIntakeData {
  companyProfile: CompanyProfile
  reviewObjective: ReviewObjective
  painPoints: PainPointFlags
  desiredDeliverables: DeliverableFlags
}

export interface HcReview {
  id: UUID
  tenant_id: UUID
  project_id: UUID | null
  company_name: string | null
  status: string
  review_type: string
  company_size: string | null
  region: string | null
  industry: string | null
  intake_data: JsonRecord | null
  diagnostic_results: JsonRecord | null
  target_state: JsonRecord | null
  roadmap: JsonRecord | null
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface HcReviewCreate {
  project_id?: UUID | null
  company_name?: string | null
  review_type?: string
  company_size?: string | null
  region?: string | null
  industry?: string | null
  meta?: JsonRecord | null
}
export interface HcReviewUpdate {
  project_id?: UUID | null
  company_name?: string | null
  status?: string | null
  review_type?: string | null
  company_size?: string | null
  region?: string | null
  industry?: string | null
  diagnostic_results?: JsonRecord | null
  target_state?: JsonRecord | null
  roadmap?: JsonRecord | null
  meta?: JsonRecord | null
}

export interface HcAnalysisVersion {
  id: UUID
  review_id: UUID
  version: number
  generator_type: string
  confidence_level: string | null
  content: JsonRecord | null
  created_at: ISODateTime
}

export interface AiGeneratedInsight {
  id: UUID
  tenant_id: UUID
  review_id: UUID
  insight_type: string
  generator_type: string
  content: JsonRecord | null
  model_name: string | null
  tokens_used: number | null
  created_at: ISODateTime
}

export interface AnalyzeRequest {
  maturity_model_id?: UUID | null
}

export const hcReviewsAPI = {
  list: (params?: ListParams & { project_id?: UUID; status?: string }) =>
    get<HcReview[]>(`${HC_BASE}/hc-reviews${qs(params)}`),
  get: (id: UUID) => get<HcReview>(`${HC_BASE}/hc-reviews/${id}`),
  create: (body: HcReviewCreate) =>
    post<HcReview>(`${HC_BASE}/hc-reviews`, body),
  update: (id: UUID, body: HcReviewUpdate) =>
    patch<HcReview>(`${HC_BASE}/hc-reviews/${id}`, body),
  delete: (id: UUID) => del<{ status: string }>(`${HC_BASE}/hc-reviews/${id}`),

  // Intake
  saveIntake: (id: UUID, intake: StructuredIntakeData) =>
    post<HcReview>(`${HC_BASE}/hc-reviews/${id}/intake`, intake),
  getIntake: (id: UUID) =>
    get<StructuredIntakeData | null>(`${HC_BASE}/hc-reviews/${id}/intake`),

  // Analyze
  analyze: (id: UUID, body?: AnalyzeRequest) =>
    post<JsonRecord>(`${HC_BASE}/hc-reviews/${id}/analyze`, body ?? {}),

  // Analysis versions
  listAnalysisVersions: (id: UUID) =>
    get<HcAnalysisVersion[]>(`${HC_BASE}/hc-reviews/${id}/analysis-versions`),

  // Insights
  listInsights: (id: UUID, params?: { insight_type?: string }) =>
    get<AiGeneratedInsight[]>(
      `${HC_BASE}/hc-reviews/${id}/insights${qs(params)}`,
    ),
}

// ---------------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------------

export interface MaturityModel {
  id: UUID
  key: string
  name: string
  description: string | null
  dimensions: JsonRecord[] | null
  is_global: boolean
  version: number
}

export interface MaturityDimensionResult {
  id: UUID
  assessment_id: UUID
  dimension_key: string
  score: number | null
  band_name: string | null
  criticality: string | null
  readiness: string | null
  narrative: string | null
}

export interface MaturityAssessment {
  id: UUID
  tenant_id: UUID
  review_id: UUID
  maturity_model_id: UUID
  overall_score: number | null
  overall_band: string | null
  computed_at: ISODateTime | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface MaturityAssessmentDetail extends MaturityAssessment {
  dimensions: MaturityDimensionResult[]
}

export interface MaturityAssessmentCreate {
  review_id: UUID
  maturity_model_id: UUID
}

// MaturityBand isn't a separate response model on the backend — it's part of
// MaturityModel.dimensions[]. Kept here as a structural hint for callers.
export interface MaturityBand {
  key?: string
  name?: string
  min_score?: number
  max_score?: number
  description?: string
}

export const hcMaturityAPI = {
  listModels: () => get<MaturityModel[]>(`${HC_BASE}/maturity/models`),
  getModel: (id: UUID) => get<MaturityModel>(`${HC_BASE}/maturity/models/${id}`),

  listAssessments: (params?: ListParams & { review_id?: UUID }) =>
    get<MaturityAssessment[]>(`${HC_BASE}/maturity/assessments${qs(params)}`),
  getAssessment: (id: UUID) =>
    get<MaturityAssessmentDetail>(`${HC_BASE}/maturity/assessments/${id}`),
  createAssessment: (body: MaturityAssessmentCreate) =>
    post<MaturityAssessment>(`${HC_BASE}/maturity/assessments`, body),
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export interface BenchmarkProfile {
  id: UUID
  key: string
  name: string
  description: string | null
  benchmark_type: string
  industry: string | null
  region: string | null
  company_size: string | null
  source: string | null
}

export interface BenchmarkComparison {
  id: UUID
  tenant_id: UUID
  review_id: UUID
  benchmark_profile_id: UUID
  comparison_data: JsonRecord | null
  overall_positioning: string | null
  gap_data: JsonRecord | null
  computed_at: ISODateTime | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface BenchmarkComparisonCreate {
  review_id: UUID
  benchmark_profile_id: UUID
}

export const hcBenchmarksAPI = {
  listProfiles: (params?: { industry?: string; region?: string; company_size?: string }) =>
    get<BenchmarkProfile[]>(`${HC_BASE}/benchmarks/profiles${qs(params)}`),
  getProfile: (id: UUID) =>
    get<BenchmarkProfile>(`${HC_BASE}/benchmarks/profiles/${id}`),

  listComparisons: (params?: ListParams & { review_id?: UUID }) =>
    get<BenchmarkComparison[]>(`${HC_BASE}/benchmarks/comparisons${qs(params)}`),
  getComparison: (id: UUID) =>
    get<BenchmarkComparison>(`${HC_BASE}/benchmarks/comparisons/${id}`),
  createComparison: (body: BenchmarkComparisonCreate) =>
    post<BenchmarkComparison>(`${HC_BASE}/benchmarks/comparisons`, body),
}

// ---------------------------------------------------------------------------
// Roadmaps (+ phases + recommendations + library)
// ---------------------------------------------------------------------------

export interface Roadmap {
  id: UUID
  tenant_id: UUID
  project_id: UUID | null
  name: string
  description: string | null
  status: string
  target_state_design_id: UUID | null
  created_at: ISODateTime
  updated_at: ISODateTime
}
export interface RoadmapCreate {
  name: string
  description?: string | null
  project_id?: UUID | null
  target_state_design_id?: UUID | null
  meta?: JsonRecord | null
}
export interface RoadmapUpdate {
  name?: string
  description?: string | null
  status?: string | null
  meta?: JsonRecord | null
}

export interface RoadmapPhase {
  id: UUID
  tenant_id: UUID
  review_id: UUID
  name: string
  sort_order: number
  start_horizon: string | null
  end_horizon: string | null
  narrative: string | null
}
export interface RoadmapPhaseCreate {
  review_id: UUID
  name: string
  sort_order?: number
  start_horizon?: string | null
  end_horizon?: string | null
  narrative?: string | null
  meta?: JsonRecord | null
}

export interface RoadmapRecommendation {
  id: UUID
  tenant_id: UUID
  review_id: UUID
  recommendation_id: UUID | null
  phase_id: UUID | null
  tier: string | null
  category: string | null
  title: string
  description: string | null
  impact: string | null
  effort: string | null
  time_horizon: string | null
  sort_order: number
}
export interface RoadmapRecommendationCreate {
  review_id: UUID
  recommendation_id?: UUID | null
  phase_id?: UUID | null
  tier?: string | null
  category?: string | null
  title: string
  description?: string | null
  impact?: string | null
  effort?: string | null
  time_horizon?: string | null
  sort_order?: number
  meta?: JsonRecord | null
}

export interface RoadmapDetail extends Roadmap {
  phases: RoadmapPhase[]
  recommendations: RoadmapRecommendation[]
}

export interface RecommendationLibraryEntry {
  id: UUID
  key: string
  title: string
  description: string | null
  category: string | null
  time_horizon: string | null
  tier: string | null
  default_impact: string | null
  default_effort: string | null
}

export interface RecommendationLibraryParams extends ListParams {
  category?: string
  time_horizon?: string
  tier?: string
}

export const hcRoadmapsAPI = {
  list: (params?: ListParams & { project_id?: UUID; status?: string }) =>
    get<Roadmap[]>(`${HC_BASE}/roadmaps${qs(params)}`),
  get: (id: UUID) => get<RoadmapDetail>(`${HC_BASE}/roadmaps/${id}`),
  create: (body: RoadmapCreate) =>
    post<Roadmap>(`${HC_BASE}/roadmaps`, body),
  update: (id: UUID, body: RoadmapUpdate) =>
    patch<Roadmap>(`${HC_BASE}/roadmaps/${id}`, body),
  delete: (id: UUID) => del<{ status: string }>(`${HC_BASE}/roadmaps/${id}`),

  addPhase: (roadmapId: UUID, body: RoadmapPhaseCreate) =>
    post<RoadmapPhase>(`${HC_BASE}/roadmaps/${roadmapId}/phases`, body),

  addRecommendation: (roadmapId: UUID, body: RoadmapRecommendationCreate) =>
    post<RoadmapRecommendation>(
      `${HC_BASE}/roadmaps/${roadmapId}/recommendations`,
      body,
    ),

  library: (params?: RecommendationLibraryParams) =>
    get<RecommendationLibraryEntry[]>(
      `${HC_BASE}/recommendations/library${qs(params)}`,
    ),
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export interface ScenarioTemplate {
  id: UUID
  scenario_type: string
  name: string
  description: string | null
  default_assumptions: JsonRecord | null
  formula_ref: string | null
}

export interface ScenarioAssumption {
  id: UUID
  scenario_id: UUID
  key: string
  label: string | null
  value: JsonRecord | null
  unit: string | null
  source: string | null
  sort_order: number
}
export interface ScenarioAssumptionPayload {
  key: string
  label?: string | null
  value?: JsonRecord | null
  unit?: string | null
  source?: string | null
  sort_order?: number
}

export interface ScenarioOutput {
  id: UUID
  scenario_id: UUID
  period_label: string | null
  output_data: JsonRecord | null
  sort_order: number
}

export interface ScenarioRiskFlag {
  id: UUID
  scenario_id: UUID
  severity: string | null
  label: string | null
  description: string | null
  mitigation: string | null
}

export interface ScenarioModel {
  id: UUID
  tenant_id: UUID
  review_id: UUID | null
  scenario_type: string | null
  name: string
  status: string
  assumptions_summary: JsonRecord | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface ScenarioDetail extends ScenarioModel {
  assumptions: ScenarioAssumption[]
  outputs: ScenarioOutput[]
  risk_flags: ScenarioRiskFlag[]
}

export interface ScenarioCreate {
  name: string
  scenario_type?: string | null
  review_id?: UUID | null
  assumptions_summary?: JsonRecord | null
  assumptions?: ScenarioAssumptionPayload[]
  meta?: JsonRecord | null
}

export const hcScenariosAPI = {
  listTemplates: () =>
    get<ScenarioTemplate[]>(`${HC_BASE}/scenarios/templates`),

  list: (params?: ListParams & { review_id?: UUID; scenario_type?: string }) =>
    get<ScenarioModel[]>(`${HC_BASE}/scenarios${qs(params)}`),
  get: (id: UUID) => get<ScenarioDetail>(`${HC_BASE}/scenarios/${id}`),
  create: (body: ScenarioCreate) =>
    post<ScenarioModel>(`${HC_BASE}/scenarios`, body),
  run: (id: UUID) => post<ScenarioModel>(`${HC_BASE}/scenarios/${id}/run`),
}

// ---------------------------------------------------------------------------
// Mobility
// ---------------------------------------------------------------------------

export interface MobilityFramework {
  id: UUID
  tenant_id: UUID
  name: string
  mode: string
  fit_weights: JsonRecord | null
  eligibility_rules: JsonRecord | null
  created_at: ISODateTime
}
export interface MobilityFrameworkCreate {
  name: string
  mode?: string
  fit_weights?: JsonRecord | null
  eligibility_rules?: JsonRecord | null
  meta?: JsonRecord | null
}

export interface EmployeeMobilityProfile {
  id: UUID
  tenant_id: UUID
  employee_ref: string
  current_role_profile_id: UUID | null
  performance_tier: string
  readiness: string
  source: string
  tenure_months: number | null
  created_at: ISODateTime
}
export interface EmployeeMobilityProfileCreate {
  employee_ref: string
  current_role_profile_id?: UUID | null
  performance_tier?: string
  readiness?: string
  source?: string
  tenure_months?: number | null
  meta?: JsonRecord | null
}

export interface MobilityOpportunity {
  id: UUID
  tenant_id: UUID
  target_role_profile_id: UUID | null
  name: string
  type: string | null
  status: string
  start_date: ISODate | null
  end_date: ISODate | null
  location: string | null
  created_at: ISODateTime
}
export interface MobilityOpportunityCreate {
  name: string
  target_role_profile_id?: UUID | null
  type?: string | null
  start_date?: ISODate | null
  end_date?: ISODate | null
  location?: string | null
  meta?: JsonRecord | null
}

export interface MobilityMatchRequest {
  mode: 'profile' | 'opportunity'
  profile_id?: UUID | null
  opportunity_id?: UUID | null
}

export interface MobilityMatchResult {
  id: UUID
  tenant_id: UUID
  profile_id: UUID
  opportunity_id: UUID
  engine: string
  score: number | null
  verdict: string | null
  breakdown: JsonRecord | null
  computed_at: ISODateTime | null
}

export interface MobilityMoveType {
  code: string
  label: string | null
  description: string | null
}

export interface MobilityKpiEntry {
  key: string
  label: string | null
  description: string | null
  unit: string | null
  formula: string | null
}

export interface RoleCapabilityProfile {
  id: UUID
  tenant_id: UUID
  framework_id: UUID | null
  role_code: string
  role_name: string
  role_family: string | null
  career_level: string | null
  job_level: string | null
  function: string | null
  leadership_tier: string | null
  criticality: string
  source: string
  created_at: ISODateTime
}
export interface RoleCapabilityProfileCreate {
  role_code: string
  role_name: string
  framework_id?: UUID | null
  role_family?: string | null
  career_level?: string | null
  job_level?: string | null
  function?: string | null
  leadership_tier?: string | null
  criticality?: string
  source?: string
  meta?: JsonRecord | null
}

export const hcMobilityAPI = {
  // Frameworks
  listFrameworks: () =>
    get<MobilityFramework[]>(`${HC_BASE}/mobility/frameworks`),
  createFramework: (body: MobilityFrameworkCreate) =>
    post<MobilityFramework>(`${HC_BASE}/mobility/frameworks`, body),
  deleteFramework: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/mobility/frameworks/${id}`),

  // Profiles
  listProfiles: (params?: ListParams) =>
    get<EmployeeMobilityProfile[]>(`${HC_BASE}/mobility/profiles${qs(params)}`),
  createProfile: (body: EmployeeMobilityProfileCreate) =>
    post<EmployeeMobilityProfile>(`${HC_BASE}/mobility/profiles`, body),
  deleteProfile: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/mobility/profiles/${id}`),

  // Opportunities
  listOpportunities: (params?: ListParams & { status?: string }) =>
    get<MobilityOpportunity[]>(`${HC_BASE}/mobility/opportunities${qs(params)}`),
  createOpportunity: (body: MobilityOpportunityCreate) =>
    post<MobilityOpportunity>(`${HC_BASE}/mobility/opportunities`, body),
  deleteOpportunity: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/mobility/opportunities/${id}`),

  // Match
  match: (body: MobilityMatchRequest) =>
    post<MobilityMatchResult[]>(`${HC_BASE}/mobility/match`, body),
  listResults: (params?: ListParams & { profile_id?: UUID; opportunity_id?: UUID }) =>
    get<MobilityMatchResult[]>(`${HC_BASE}/mobility/match-results${qs(params)}`),

  // Reference tables
  listMoveTypes: () =>
    get<MobilityMoveType[]>(`${HC_BASE}/mobility/move-types`),
  listKpiDictionary: () =>
    get<MobilityKpiEntry[]>(`${HC_BASE}/mobility/kpi-dictionary`),

  // Role profiles
  listRoleProfiles: (params?: ListParams) =>
    get<RoleCapabilityProfile[]>(`${HC_BASE}/mobility/role-profiles${qs(params)}`),
  createRoleProfile: (body: RoleCapabilityProfileCreate) =>
    post<RoleCapabilityProfile>(`${HC_BASE}/mobility/role-profiles`, body),
  deleteRoleProfile: (id: UUID) =>
    del<{ status: string }>(`${HC_BASE}/mobility/role-profiles/${id}`),
}

// ---------------------------------------------------------------------------
// Documents (templates + generation + section overrides)
// ---------------------------------------------------------------------------

export interface DocumentTemplate {
  id: string
  document_type_key: string | null
  name: string
  description: string | null
  status: string
}

export interface DocumentTemplateVersion {
  id: UUID
  template_id: string
  version: number
  sections: JsonRecord | null
}

export interface DocumentTemplateDetail extends DocumentTemplate {
  latest_version: DocumentTemplateVersion | null
}

export interface GeneratedDocument {
  id: UUID
  tenant_id: UUID
  template_id: string | null
  document_type_key: string | null
  name: string
  status: string
  ir_snapshot: JsonRecord | null
  version: number
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface GeneratedDocumentSectionOverride {
  id: UUID
  document_id: UUID
  section_id: string
  content: JsonRecord | null
}

export interface DocumentGenerateRequest {
  template_id: string
  context_payload?: JsonRecord
  hc_review_id?: UUID | null
  name?: string | null
}

export const hcDocumentsAPI = {
  listTemplates: (params?: { module_key?: string }) =>
    get<DocumentTemplate[]>(`${HC_BASE}/documents/templates${qs(params)}`),
  getTemplate: (id: string) =>
    get<DocumentTemplateDetail>(`${HC_BASE}/documents/templates/${id}`),

  generate: (body: DocumentGenerateRequest) =>
    post<GeneratedDocument>(`${HC_BASE}/documents/generate`, body),

  list: (params?: ListParams & { template_id?: string; hc_review_id?: UUID }) =>
    get<GeneratedDocument[]>(`${HC_BASE}/documents${qs(params)}`),
  get: (id: UUID) => get<GeneratedDocument>(`${HC_BASE}/documents/${id}`),

  putSection: (
    documentId: UUID,
    sectionId: string,
    body: { content: JsonRecord },
  ) =>
    put<GeneratedDocumentSectionOverride>(
      `${HC_BASE}/documents/${documentId}/sections/${sectionId}`,
      body,
    ),
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export interface HcExport {
  id: UUID
  tenant_id: UUID
  project_id: UUID | null
  generated_document_id: UUID | null
  export_type: string | null
  format: string
  status: string
  storage_path: string | null
  error_message: string | null
  created_at: ISODateTime
  started_at: ISODateTime | null
  completed_at: ISODateTime | null
}
export interface HcExportCreate {
  format: string
  source_type: string
  source_id: UUID
  project_id?: UUID | null
}

export const hcExportsAPI = {
  enqueue: (body: HcExportCreate) =>
    post<HcExport>(`${HC_BASE}/exports`, body),
  list: (params?: ListParams & { status?: string }) =>
    get<HcExport[]>(`${HC_BASE}/exports${qs(params)}`),
  get: (id: UUID) => get<HcExport>(`${HC_BASE}/exports/${id}`),
  download: (id: UUID) =>
    get<Blob>(`${HC_BASE}/exports/${id}/download`, { responseType: 'blob' }),
  // Admin: actually run an export job synchronously.
  run: (id: UUID) => post<HcExport>(`${HC_BASE}/exports/${id}/run`),
}

// ---------------------------------------------------------------------------
// AI advisory
// ---------------------------------------------------------------------------

export interface AiAdvisoryGenerateRequest {
  review_id: UUID
  insight_type: string
  force?: boolean
}

export interface AiPromptTemplate {
  id: number
  key: string
  version: number
  insight_type: string | null
  system_prompt: string | null
  user_prompt_template: string | null
  model_name: string | null
  is_active: boolean
}

export interface AiAdvisoryDeliverableRequest {
  topic: string
  review_id?: UUID | null
  context_brief?: string | null
  brief?: Record<string, unknown> | null
}

export interface AiAdvisoryDeliverableResponse {
  document: {
    studio_id: string
    title: string
    subtitle: string
    sections: Array<{
      id: string
      title: string
      layout: string
      data: Record<string, unknown>
      footnote?: string
    }>
    sources?: { tables: string[]; assumptions: string[] }
  }
}

export interface AiAdvisoryRegenerateSectionRequest {
  topic: string
  section_id: string
  review_id?: UUID | null
  context_brief?: string | null
  brief?: Record<string, unknown> | null
  hint?: string | null
}

export interface AiAdvisoryRegenerateSectionResponse {
  section: {
    id: string
    title: string
    layout: string
    data: Record<string, unknown>
    footnote?: string
  }
}

export interface AdvisoryProfile {
  persona?: string
  organization_name?: string
  industry?: string
  region?: string
  company_size?: string
  objective?: string
}

export interface EvidenceUploadResponse {
  evidence_id: string
  filename: string
  chars: number
  preview: string
}

export interface ChatPlanStep {
  title: string
  status: 'pending' | 'in_progress' | 'done'
  note?: string | null
}

export interface ChatPlan {
  title: string
  steps: ChatPlanStep[]
}

export interface SummaryReport {
  title: string
  subtitle?: string
  overview: string
  kpis?: Array<{ label: string; value: string; unit?: string; meaning?: string }>
  charts?: Array<{ type: 'bar' | 'donut' | 'pie' | 'gantt'; title: string; explanation?: string; items: Array<{ label: string; value?: number; start?: number; duration?: number }> }>
  takeaways?: Array<{ title: string; explanation?: string }>
  data_notes?: Array<{ point: string; why?: string; basis?: string }>
  next_steps?: string[]
}

export const hcAiAdvisoryAPI = {
  generate: (body: AiAdvisoryGenerateRequest) =>
    post<AiGeneratedInsight>(`${HC_BASE}/ai-advisory/generate`, body),
  deliverable: (body: AiAdvisoryDeliverableRequest) =>
    post<AiAdvisoryDeliverableResponse>(`${HC_BASE}/ai-advisory/deliverable`, body),
  regenerateSection: (body: AiAdvisoryRegenerateSectionRequest) =>
    post<AiAdvisoryRegenerateSectionResponse>(`${HC_BASE}/ai-advisory/regenerate-section`, body),
  listInsights: (params?: ListParams & { review_id?: UUID; insight_type?: string }) =>
    get<AiGeneratedInsight[]>(`${HC_BASE}/ai-advisory/insights${qs(params)}`),
  listPromptTemplates: (params?: { insight_type?: string; is_active?: boolean }) =>
    get<AiPromptTemplate[]>(`${HC_BASE}/ai-advisory/prompt-templates${qs(params)}`),
  chat: (body: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    brief?: Record<string, unknown> | null
    context?: {
      path?: string
      workspace_name?: string
      workspace_id?: string
      studio_id?: string
      studio_name?: string
    } | null
    profile?: AdvisoryProfile | null
    evidence_ids?: string[]
    client_profile?: Record<string, unknown> | null
    plan_state?: ChatPlan | null
    report_state?: Record<string, unknown> | null
    preferences?: { length?: string; style?: string; instructions?: string } | null
    studio_recommendations?: Array<{ id: string; name: string; category: string; reason: string }>
  }) => post<{ reply: string; followup_questions?: string[]; plan?: ChatPlan | null; finalize?: 'summary' | 'detailed' | null; studio?: string | null }>(`${HC_BASE}/ai-advisory/chat`, body),
  /**
   * Streaming chat: streams the reply text token-by-token, then resolves with
   * the structured {plan, finalize, studio} meta. Calls onToken for each chunk.
   */
  chatStream: async (
    body: Record<string, unknown>,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<{ plan: ChatPlan | null; finalize: 'summary' | 'detailed' | null; studio: string | null }> => {
    let token: string | null = localStorage.getItem('auth_token_dark')
    if (!token) {
      try { token = JSON.parse(localStorage.getItem('aivora-auth-dark') || '{}')?.state?.token ?? null } catch { token = null }
    }
    const res = await fetch(`/api/v1${HC_BASE}/ai-advisory/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let meta = { plan: null as ChatPlan | null, finalize: null as 'summary' | 'detailed' | null, studio: null as string | null }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const m = line.match(/^data: (.*)$/s)
        if (!m) continue
        const payload = m[1]
        if (payload === '[DONE]') continue
        try {
          const evt = JSON.parse(payload)
          if (evt.token) onToken(evt.token as string)
          else if (evt.meta) meta = evt.meta
          else if (evt.error) throw new Error(evt.error as string)
        } catch { /* ignore malformed frame */ }
      }
    }
    return meta
  },
  uploadEvidence: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<EvidenceUploadResponse>(`${HC_BASE}/ai-advisory/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  finalizeReport: (body: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    report_type: 'detailed' | 'summary'
    studio?: string | null
    extra_studios?: string[]  // additional studios woven into one unified report (client #4)
    report_state?: Record<string, unknown> | null
    plan_state?: ChatPlan | null
    brief?: Record<string, unknown> | null
    client_profile?: Record<string, unknown> | null
    profile?: AdvisoryProfile | null
    evidence_ids?: string[]
    context?: { workspace_id?: string; workspace_name?: string } | null
  }) => post<{ report_type: string; document?: Record<string, unknown> | null; summary?: SummaryReport | null }>(
    `${HC_BASE}/ai-advisory/finalize-report`, body, { timeout: 240000 },
  ),

  // --- Threads: many advisory chats per workspace ---------------------------
  listThreads: (workspaceId: string) =>
    get<AdvisoryThreadSummary[]>(`${HC_BASE}/ai-advisory/session/${workspaceId}/threads`),
  createThread: (workspaceId: string, body?: { title?: string | null; selected_skill?: string | null }) =>
    post<AdvisorySessionState>(`${HC_BASE}/ai-advisory/session/${workspaceId}/threads`, body ?? {}),
  getThread: (sessionId: string) =>
    get<AdvisorySessionState>(`${HC_BASE}/ai-advisory/thread/${sessionId}`),
  saveThread: (sessionId: string, body: {
    messages?: Array<{ role: string; content: string; id?: string; plan?: ChatPlan | null }>
    plan?: ChatPlan | null
    selected_skill?: string | null
    saved_draft_id?: string | null
    title?: string | null
  }) => put<{ ok: boolean }>(`${HC_BASE}/ai-advisory/thread/${sessionId}`, body),
  saveThreadReport: (sessionId: string, body: {
    report_document: Record<string, unknown>
    report_kind?: 'detailed' | 'summary'
    note?: string | null
  }) => put<{ ok: boolean; version: number }>(`${HC_BASE}/ai-advisory/thread/${sessionId}/report`, body),
  // --- Public share (client #5): mint / revoke a live artifact link ---------
  shareThread: (sessionId: string) =>
    post<{ token: string; revoked: boolean }>(`${HC_BASE}/ai-advisory/thread/${sessionId}/share`, {}),
  revokeThreadShare: (sessionId: string) =>
    post<{ ok: boolean; revoked: boolean }>(`${HC_BASE}/ai-advisory/thread/${sessionId}/revoke-share`, {}),
  listThreadRevisions: (sessionId: string) =>
    get<AdvisoryRevisionRow[]>(`${HC_BASE}/ai-advisory/thread/${sessionId}/revisions`),
  deleteThread: (sessionId: string) =>
    del<void>(`${HC_BASE}/ai-advisory/thread/${sessionId}`),

  // --- Back-compat session (latest thread) -----------------------------------
  getSession: (workspaceId: string) =>
    get<AdvisorySessionState>(`${HC_BASE}/ai-advisory/session/${workspaceId}`),
  saveSession: (workspaceId: string, body: {
    messages?: Array<{ role: string; content: string; id?: string; plan?: ChatPlan | null }>
    plan?: ChatPlan | null
    selected_skill?: string | null
    saved_draft_id?: string | null
  }) => put<{ ok: boolean }>(`${HC_BASE}/ai-advisory/session/${workspaceId}`, body),
  saveReport: (workspaceId: string, body: {
    report_document: Record<string, unknown>
    report_kind?: 'detailed' | 'summary'
    note?: string | null
  }) => put<{ ok: boolean; version: number }>(`${HC_BASE}/ai-advisory/session/${workspaceId}/report`, body),
  listRevisions: (workspaceId: string) =>
    get<AdvisoryRevisionRow[]>(`${HC_BASE}/ai-advisory/session/${workspaceId}/revisions`),
  clearSession: (workspaceId: string) =>
    post<{ ok: boolean }>(`${HC_BASE}/ai-advisory/session/${workspaceId}/clear`, {}),
}

export interface AdvisorySessionState {
  id: string | null
  workspace_id: string
  title: string | null
  messages: Array<{ role: 'user' | 'assistant'; content: string; id?: string; plan?: ChatPlan | null }>
  report_document: Record<string, unknown> | null
  report_kind: 'detailed' | 'summary' | null
  plan: ChatPlan | null
  selected_skill: string | null
  saved_draft_id: string | null
  share_token?: string | null
  updated_at?: string | null
}

export interface AdvisoryThreadSummary {
  id: string
  title: string
  selected_skill: string | null
  has_report: boolean
  report_kind: 'detailed' | 'summary' | null
  message_count: number
  updated_at: string | null
  created_at: string | null
}

export interface AdvisoryRevisionRow {
  version: number
  report_kind: 'detailed' | 'summary' | null
  note: string | null
  created_at: string | null
  report_document: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Conversational Challenge Brief intake
// ---------------------------------------------------------------------------

export type BriefSectionKey = 'organization' | 'situation' | 'challenges' | 'outputs'
export type BriefSectionStatus = 'pending' | 'partial' | 'complete'

export interface BriefChatResponse {
  reply: string
  suggestions: string[]
  brief_patch: Record<string, unknown>
  sections: Record<BriefSectionKey, BriefSectionStatus>
  done: boolean
}

export const hcStudioRunAPI = {
  run: (slug: string, body: { brief?: Record<string, unknown> | null; workspace_id?: string | null; params?: Record<string, unknown> }) =>
    post<Record<string, unknown>>(`${HC_BASE}/studios/${slug}/run`, body),
}

export interface AdvisorySkill {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  report_spec?: string | null
}

export const hcSkillsAPI = {
  list: () => get<AdvisorySkill[]>(`/skills`),
}

export const hcBriefChatAPI = {
  summarize: (body: { brief: Record<string, unknown>; workspace_name?: string | null }) =>
    post<{ summary: string }>(`${HC_BASE}/brief-chat/summarize`, body),
  chat: (body: {
    messages: { role: 'user' | 'assistant'; content: string }[]
    brief_state?: Record<string, unknown> | null
    onboarding_profile?: Record<string, unknown> | null
    workspace_name?: string | null
  }) => post<BriefChatResponse>(`${HC_BASE}/brief-chat/chat`, body),
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export interface Module {
  id: number
  key: string
  label: string
  description: string | null
  route_path: string | null
  icon: string | null
  category: string
  status: string
  sort_order: number
  plan_tier: string | null
  tenant_status: string | null
}

export type ModuleStatus = 'active' | 'disabled' | null

export const hcModulesAPI = {
  list: () => get<Module[]>(`${HC_BASE}/modules`),
  get: (key: string) => get<Module>(`${HC_BASE}/modules/${key}`),
  enable: (key: string) => post<Module>(`${HC_BASE}/modules/${key}/enable`),
  disable: (key: string) => post<Module>(`${HC_BASE}/modules/${key}/disable`),
}

// ---------------------------------------------------------------------------
// Convenience: bundle all 13 sub-APIs under one namespace.
// ---------------------------------------------------------------------------

export const hcPlatformAPI = {
  projects: hcProjectsAPI,
  frameworks: hcFrameworksAPI,
  capability: hcCapabilityAPI,
  reviews: hcReviewsAPI,
  maturity: hcMaturityAPI,
  benchmarks: hcBenchmarksAPI,
  roadmaps: hcRoadmapsAPI,
  scenarios: hcScenariosAPI,
  mobility: hcMobilityAPI,
  documents: hcDocumentsAPI,
  exports: hcExportsAPI,
  aiAdvisory: hcAiAdvisoryAPI,
  modules: hcModulesAPI,
}
