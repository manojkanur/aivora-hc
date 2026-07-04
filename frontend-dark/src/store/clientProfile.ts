import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ──────────────────────────────────────────────────────────────────

export type ClientIndustry =
  | 'oil-gas' | 'banking-finance' | 'healthcare' | 'public-sector' | 'retail'
  | 'telco' | 'tech' | 'mining' | 'utilities' | 'transport-logistics'
  | 'hospitality' | 'professional-services' | 'manufacturing' | 'education'
  | 'real-estate' | 'other'

export type ClientRegion =
  | 'gcc' | 'mena' | 'africa' | 'europe' | 'americas' | 'asia-pacific' | 'global' | 'other'

export type ClientOrganizationSize = 'micro' | 'small' | 'mid' | 'large' | 'enterprise'
export type ClientMaturityStage = 'startup' | 'growth' | 'scale' | 'mature' | 'restructuring'
export type ClientOperatingModel = 'single-entity' | 'multi-entity' | 'gcc-shared-services' | 'holding' | 'joint-venture'

export type BusinessPriority =
  | 'growth' | 'cost-efficiency' | 'resilience' | 'esg-sustainability'
  | 'digital-transformation' | 'm-and-a' | 'customer-experience' | 'innovation'
  | 'operational-excellence' | 'risk-compliance' | 'talent-capability' | 'geographic-expansion'

export type HcPriority =
  | 'workforce-planning' | 'leadership-development' | 'succession-planning'
  | 'employee-experience' | 'rewards-strategy' | 'skills-capability'
  | 'talent-acquisition' | 'performance-management' | 'learning-development'
  | 'nationalization' | 'diversity-inclusion' | 'organization-design'
  | 'change-management' | 'hr-operating-model'

export type TransformationAgendaItem =
  | 'digital' | 'cultural' | 'operating-model' | 'm-and-a-integration' | 'post-merger'
  | 'cost-optimization' | 'growth-acceleration' | 'esg-transformation' | 'regulatory-driven' | 'none'

export type WorkforceChallenge =
  | 'high-attrition' | 'scarcity' | 'contractor-heavy' | 'aging-workforce'
  | 'skill-mismatch' | 'engagement-decline' | 'remote-hybrid-strain'
  | 'diversity-gaps' | 'productivity-decline' | 'none'

export type TalentChallenge =
  | 'hipo-gap' | 'succession-risk' | 'niche-skills-shortage' | 'leadership-bench-thin'
  | 'external-hire-dependency' | 'retention-of-critical-talent' | 'graduate-pipeline' | 'none'

export type LeadershipChallenge =
  | 'succession-risk' | 'limited-bench' | 'leadership-quality' | 'transition-failures'
  | 'executive-misalignment' | 'leadership-development-gap' | 'none'

export type ExRewardChallenge =
  | 'engagement-decline' | 'pay-equity' | 'benefits-competitiveness' | 'ex-journey-friction'
  | 'culture-misalignment' | 'wellbeing-concerns' | 'rewards-cost-pressure'
  | 'incentive-misalignment' | 'none'

export type NationalizationProgram =
  | 'emiratisation' | 'saudization' | 'qatarization' | 'omanisation'
  | 'bahrainisation' | 'kuwaitisation' | 'other'

export type RateBand = '0-10' | '10-25' | '25-50' | '50-75' | '75-100' | 'unknown'

export type PreferredOutputType =
  | 'exec-deck' | 'board-pack' | 'playbook' | 'infographic' | 'narrative-report' | 'operational-toolkit'

export type ClientAudience =
  | 'board' | 'exec-committee' | 'hr-leadership' | 'line-managers' | 'employees' | 'external'

export type ConfidentialityLevel = 'internal' | 'restricted' | 'confidential' | 'strictly-confidential'
export type UrgencyBand = 'exploratory' | 'this-quarter' | 'this-month' | 'this-week' | 'immediate'

export type AvailableDocument =
  | 'strategy-deck' | 'org-chart' | 'hc-policy' | 'engagement-survey' | 'exit-data'
  | 'comp-bands' | 'competency-framework' | 'succession-plan' | 'training-catalog'
  | 'kpi-dashboard' | 'previous-assessment' | 'other'

export interface ClientProfile {
  organization: {
    name?: string
    industry: ClientIndustry
    /** Multi-select; `industry` keeps the first selection for backwards compatibility. */
    industries?: ClientIndustry[]
    subSector?: string
    region: ClientRegion
    country?: string
    organizationSize: ClientOrganizationSize
    maturityStage: ClientMaturityStage
    operatingModel: ClientOperatingModel
  }
  agenda: {
    businessPriorities: BusinessPriority[]
    hcPriorities: HcPriority[]
    keyPainPoints: string[]
    transformationAgenda: TransformationAgendaItem[]
  }
  workforceContext: {
    workforceChallenges: WorkforceChallenge[]
    talentChallenges: TalentChallenge[]
    leadershipChallenges: LeadershipChallenge[]
    exRewardChallenges: ExRewardChallenge[]
    nationalizationContext: {
      applicable: boolean
      programName?: NationalizationProgram
      currentRateBand?: RateBand
      targetRateBand?: RateBand
    }
  }
  outputPreferences: {
    preferredOutputType: PreferredOutputType[]
    audience: ClientAudience[]
    confidentiality: ConfidentialityLevel
    urgency: UrgencyBand
  }
  evidence: {
    availableDocuments: AvailableDocument[]
    notes?: string
  }
  completedAt?: string
  lastUpdatedAt: string
}

// ── Default profile ────────────────────────────────────────────────────────

export function defaultProfile(): ClientProfile {
  return {
    organization: {
      industry: 'other',
      region: 'gcc',
      organizationSize: 'mid',
      maturityStage: 'mature',
      operatingModel: 'single-entity',
    },
    agenda: {
      businessPriorities: [],
      hcPriorities: [],
      keyPainPoints: [],
      transformationAgenda: [],
    },
    workforceContext: {
      workforceChallenges: [],
      talentChallenges: [],
      leadershipChallenges: [],
      exRewardChallenges: [],
      nationalizationContext: { applicable: false },
    },
    outputPreferences: {
      preferredOutputType: [],
      audience: [],
      confidentiality: 'internal',
      urgency: 'this-quarter',
    },
    evidence: {
      availableDocuments: [],
    },
    lastUpdatedAt: new Date().toISOString(),
  }
}

// ── Store ──────────────────────────────────────────────────────────────────
//
// Client onboarding state is scoped PER WORKSPACE. Each workspace gets its own
// {profile, isCompleted} record so opening a fresh workspace never shows the
// previous engagement's answers.
//
// The public API (profile, isCompleted, setProfile, save, reset, markCompleted)
// is preserved so existing callsites keep working — they read/write against
// the *current* workspace's record. Callers should call setActiveWorkspace(id)
// when they navigate into a workspace; if no active id is set we fall back to
// a special "_unscoped" record so unscoped flows (no workspaceId in URL) keep
// working too.

interface PerWorkspaceRecord {
  profile: ClientProfile
  isCompleted: boolean
}

const UNSCOPED_KEY = '_unscoped'

interface ClientProfileState {
  // Per-workspace records, keyed by workspace id (or UNSCOPED_KEY).
  records: Record<string, PerWorkspaceRecord>
  currentWorkspaceId: string

  // Derived getters — read from the current workspace's record.
  profile: ClientProfile
  isCompleted: boolean

  // Navigation
  setActiveWorkspace: (workspaceId: string | undefined | null) => void

  // Public API (acts on the active workspace's record)
  setProfile: (p: ClientProfile) => void
  save: (p?: ClientProfile) => void
  reset: () => void
  markCompleted: () => void

  // Workspace-scoped utilities (so callers can read across workspaces)
  getProfileFor: (workspaceId: string) => ClientProfile
  isCompletedFor: (workspaceId: string) => boolean
  resetWorkspace: (workspaceId: string) => void
}

function ensureRecord(records: Record<string, PerWorkspaceRecord>, id: string): Record<string, PerWorkspaceRecord> {
  if (records[id]) return records
  return { ...records, [id]: { profile: defaultProfile(), isCompleted: false } }
}

export const useClientProfileStore = create<ClientProfileState>()(
  persist(
    (set, get) => ({
      records: { [UNSCOPED_KEY]: { profile: defaultProfile(), isCompleted: false } },
      currentWorkspaceId: UNSCOPED_KEY,

      // Derived — kept on state so existing destructuring `{ profile, isCompleted }`
      // keeps working without forcing every call site to use a selector.
      profile: defaultProfile(),
      isCompleted: false,

      setActiveWorkspace: (workspaceId) => {
        const id = workspaceId && workspaceId.length > 0 ? workspaceId : UNSCOPED_KEY
        const records = ensureRecord(get().records, id)
        const rec = records[id]
        set({
          records,
          currentWorkspaceId: id,
          profile: rec.profile,
          isCompleted: rec.isCompleted,
        })
      },

      setProfile: (profile) => {
        const id = get().currentWorkspaceId
        const records = { ...get().records, [id]: { ...get().records[id], profile } }
        set({ records, profile })
      },

      save: (p) => {
        const id = get().currentWorkspaceId
        const profile = { ...(p ?? get().profile), lastUpdatedAt: new Date().toISOString() }
        const records = { ...get().records, [id]: { ...get().records[id], profile } }
        set({ records, profile })
      },

      reset: () => {
        const id = get().currentWorkspaceId
        const fresh: PerWorkspaceRecord = { profile: defaultProfile(), isCompleted: false }
        const records = { ...get().records, [id]: fresh }
        set({ records, profile: fresh.profile, isCompleted: fresh.isCompleted })
      },

      markCompleted: () => {
        const id = get().currentWorkspaceId
        const current = get().records[id] ?? { profile: defaultProfile(), isCompleted: false }
        const profile = { ...current.profile, completedAt: new Date().toISOString() }
        const records = { ...get().records, [id]: { profile, isCompleted: true } }
        set({ records, profile, isCompleted: true })
      },

      getProfileFor: (workspaceId) => {
        const rec = get().records[workspaceId]
        return rec?.profile ?? defaultProfile()
      },

      isCompletedFor: (workspaceId) => Boolean(get().records[workspaceId]?.isCompleted),

      resetWorkspace: (workspaceId) => {
        const records = { ...get().records, [workspaceId]: { profile: defaultProfile(), isCompleted: false } }
        const isCurrent = get().currentWorkspaceId === workspaceId
        set({
          records,
          ...(isCurrent ? { profile: defaultProfile(), isCompleted: false } : {}),
        })
      },
    }),
    {
      name: 'aivora-client-profile-v2',
      // Migrate v1: if a single global profile existed, seed it as the unscoped record.
      version: 2,
      migrate: (persisted: unknown, fromVersion: number) => {
        if (fromVersion < 2 && persisted && typeof persisted === 'object') {
          const old = persisted as { profile?: ClientProfile; isCompleted?: boolean }
          if (old.profile) {
            return {
              records: { [UNSCOPED_KEY]: { profile: old.profile, isCompleted: !!old.isCompleted } },
              currentWorkspaceId: UNSCOPED_KEY,
              profile: old.profile,
              isCompleted: !!old.isCompleted,
            } as Partial<ClientProfileState>
          }
        }
        return persisted as Partial<ClientProfileState>
      },
    }
  )
)
