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

interface ClientProfileState {
  profile: ClientProfile
  isCompleted: boolean
  setProfile: (p: ClientProfile) => void
  save: (p?: ClientProfile) => void
  reset: () => void
  markCompleted: () => void
}

export const useClientProfileStore = create<ClientProfileState>()(
  persist(
    (set, get) => ({
      profile: defaultProfile(),
      isCompleted: false,

      setProfile: (profile) => set({ profile }),

      save: (p) => {
        const profile = p ?? get().profile
        set({ profile: { ...profile, lastUpdatedAt: new Date().toISOString() } })
      },

      reset: () => set({ profile: defaultProfile(), isCompleted: false }),

      markCompleted: () => {
        const profile = get().profile
        set({
          profile: { ...profile, completedAt: new Date().toISOString() },
          isCompleted: true,
        })
      },
    }),
    {
      name: 'aivora-client-profile',
    }
  )
)
