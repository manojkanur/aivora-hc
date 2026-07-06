import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, BarChart2, AlertTriangle, FileSearch, HelpCircle,
  LayoutList, CheckSquare, ArrowRight, ArrowLeft, ChevronRight,
  Check, Plus, X, Trash2, Sparkles,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { cn } from '../lib/utils'
import { useBriefStore } from '../store/briefStore'
import { useClientProfileStore } from '../store/clientProfile'
import { useOnboardingCompletions } from '../store/onboardingCompletions'
import { api, challengeBriefsAPI } from '../lib/api'
import { useAutosave } from '../hooks/useAutosave'
import { SaveIndicator } from '../components/ui/SaveIndicator'
import { JourneyTimeline } from '../components/journey/JourneyTimeline'
import { recommendStudios, signalsFromBriefContent } from '../lib/briefRecommender'

// ── Types ──────────────────────────────────────────────────────────────────

type OrgIndustry =
  | 'banking-finance' | 'insurance' | 'energy-utilities' | 'oil-gas' | 'telecom'
  | 'healthcare-pharma' | 'retail-consumer' | 'manufacturing' | 'transportation-logistics'
  | 'construction-real-estate' | 'technology-software' | 'professional-services'
  | 'public-sector' | 'education' | 'hospitality' | 'other'

type OrgRegion = 'gcc' | 'mena' | 'europe' | 'north-america' | 'south-america' | 'asia-pacific' | 'africa' | 'global' | 'other'
type OrgSize = 'small' | 'mid' | 'large' | 'enterprise'
type OrgMaturityStage = 'startup' | 'growth' | 'scaling' | 'mature' | 'transformation' | 'turnaround'
type OrgOperatingModel = 'single-entity' | 'multi-entity' | 'holding-group' | 'matrix' | 'federated' | 'joint-venture'
type EmployeeCountBand = 'under-100' | '100-500' | '500-1000' | '1000-5000' | '5000-20000' | '20000-plus' | 'unknown'
type GeographicScope = 'single-country' | 'multi-country' | 'regional' | 'global' | 'unknown'

type StrategicDriver =
  | 'growth' | 'cost-optimization' | 'transformation' | 'merger-acquisition'
  | 'regulatory-change' | 'digital-disruption' | 'market-entry' | 'competitive-pressure'
  | 'talent-shortage' | 'leadership-change' | 'restructuring' | 'ipo-preparation'
  | 'sustainability-esg' | 'nationalization' | 'other'

type TimeHorizon = 'immediate' | 'short-term' | 'medium-term' | 'long-term' | 'unspecified'
type BudgetEnvelope = 'not-defined' | 'very-limited' | 'moderate' | 'substantial' | 'open'
type ExecutiveSponsor = 'none' | 'ceo' | 'chro' | 'coo' | 'cfo' | 'board' | 'other'

type HcChallengeArea =
  | 'strategy-business-alignment' | 'workforce-planning' | 'capability-skills'
  | 'learning-training' | 'leadership' | 'succession' | 'mobility' | 'talent-acquisition'
  | 'performance' | 'employee-experience' | 'rewards' | 'organization-design'
  | 'process-excellence' | 'governance-operating-model' | 'ai-digital-transformation'
  | 'culture-change-readiness' | 'analytics-productivity'

type ChallengeSeverity = 'watch' | 'moderate' | 'high' | 'critical'

type DesiredOutputType =
  | 'executive-deck' | 'consulting-report' | 'playbook' | 'infographic'
  | 'strategy-recommendation' | 'framework' | 'maturity-assessment'
  | 'implementation-plan' | 'scenario-comparison' | 'other'

type AdvisoryAudience =
  | 'executive-committee' | 'board' | 'ceo' | 'chro' | 'hr-leadership'
  | 'business-leaders' | 'line-managers' | 'all-employees' | 'external-stakeholders' | 'other'

type AdvisoryUrgency = 'exploratory' | 'near-term' | 'urgent' | 'critical'
type OutputDepth = 'executive-summary' | 'standard' | 'deep-dive' | 'implementation-grade'
type PreferredTone = 'executive' | 'advisory' | 'consultative' | 'educational' | 'directive'
type InnovationAppetite = 'conservative' | 'balanced' | 'ambitious' | 'bold'
type ImplementationOrientation = 'diagnostic' | 'advisory' | 'design' | 'execution'
type BriefConfidentiality = 'internal' | 'client-confidential' | 'board-only' | 'public'

type ConstraintType = 'budget' | 'time' | 'regulatory' | 'data-availability' | 'leadership-bandwidth' | 'change-fatigue' | 'vendor-lockin' | 'technology' | 'geographic' | 'other'

interface OrganizationContext {
  organizationName: string; industry: OrgIndustry; region: OrgRegion
  organizationSize: OrgSize; maturityStage: OrgMaturityStage
  operatingModel: OrgOperatingModel; employeeCountBand: EmployeeCountBand
  geographicScope: GeographicScope; notes: string
}
interface BusinessSituation {
  situationSummary: string; strategicDrivers: StrategicDriver[]
  timeHorizon: TimeHorizon; budgetEnvelope: BudgetEnvelope
  executiveSponsor: ExecutiveSponsor; boardVisibility: boolean; recentChangesNote: string
}
interface ChallengeAreaSelection { area: HcChallengeArea; severity: ChallengeSeverity; notes: string }
interface HcChallenges { selectedAreas: ChallengeAreaSelection[]; topPriorityArea: HcChallengeArea | 'none'; painPointsNote: string }
interface AdvisoryQuestion { id: string; questionText: string; audience: AdvisoryAudience; urgency: AdvisoryUrgency; linkedChallengeArea: HcChallengeArea | 'none'; desiredOutputType: DesiredOutputType }
interface Constraint { id: string; type: ConstraintType; description: string }
interface Assumption { id: string; description: string }
interface ConstraintsSection { constraints: Constraint[]; assumptions: Assumption[]; outOfScopeNote: string }
interface DesiredOutputs {
  outputTypes: DesiredOutputType[]; primaryAudience: AdvisoryAudience; outputDepth: OutputDepth
  preferredTone: PreferredTone; innovationAppetite: InnovationAppetite
  implementationOrientation: ImplementationOrientation; confidentialityLevel: BriefConfidentiality
  expectedDeliveryWindow: TimeHorizon
}

export interface ChallengeBriefData {
  organization: OrganizationContext
  businessSituation: BusinessSituation
  hcChallenges: HcChallenges
  advisoryQuestions: AdvisoryQuestion[]
  constraints: ConstraintsSection
  desiredOutputs: DesiredOutputs
}

// ── Labels ─────────────────────────────────────────────────────────────────

const ORG_INDUSTRY_LABELS: Record<OrgIndustry, string> = {
  'banking-finance': 'Banking & Finance', insurance: 'Insurance', 'energy-utilities': 'Energy & Utilities',
  'oil-gas': 'Oil & Gas', telecom: 'Telecom', 'healthcare-pharma': 'Healthcare & Pharma',
  'retail-consumer': 'Retail & Consumer', manufacturing: 'Manufacturing',
  'transportation-logistics': 'Transport & Logistics', 'construction-real-estate': 'Construction & Real Estate',
  'technology-software': 'Technology & Software', 'professional-services': 'Professional Services',
  'public-sector': 'Public Sector', education: 'Education', hospitality: 'Hospitality', other: 'Other',
}
const ORG_REGION_LABELS: Record<OrgRegion, string> = {
  gcc: 'GCC', mena: 'MENA', europe: 'Europe', 'north-america': 'North America',
  'south-america': 'South America', 'asia-pacific': 'Asia-Pacific', africa: 'Africa', global: 'Global', other: 'Other',
}
const ORG_SIZE_LABELS: Record<OrgSize, string> = { small: 'Small', mid: 'Mid', large: 'Large', enterprise: 'Enterprise' }
const MATURITY_LABELS: Record<OrgMaturityStage, string> = { startup: 'Startup', growth: 'Growth', scaling: 'Scaling', mature: 'Mature', transformation: 'Transformation', turnaround: 'Turnaround' }
const OPERATING_MODEL_LABELS: Record<OrgOperatingModel, string> = { 'single-entity': 'Single entity', 'multi-entity': 'Multi-entity', 'holding-group': 'Holding group', matrix: 'Matrix', federated: 'Federated', 'joint-venture': 'Joint venture' }
const EMP_COUNT_LABELS: Record<EmployeeCountBand, string> = { 'under-100': '< 100', '100-500': '100-500', '500-1000': '500-1,000', '1000-5000': '1,000-5,000', '5000-20000': '5,000-20,000', '20000-plus': '20,000+', unknown: 'Unknown' }
const GEO_SCOPE_LABELS: Record<GeographicScope, string> = { 'single-country': 'Single country', 'multi-country': 'Multi-country', regional: 'Regional', global: 'Global', unknown: 'Unknown' }
const STRATEGIC_DRIVER_LABELS: Record<StrategicDriver, string> = {
  growth: 'Growth', 'cost-optimization': 'Cost optimization', transformation: 'Transformation',
  'merger-acquisition': 'M&A', 'regulatory-change': 'Regulatory change', 'digital-disruption': 'Digital disruption',
  'market-entry': 'Market entry', 'competitive-pressure': 'Competitive pressure',
  'talent-shortage': 'Talent shortage', 'leadership-change': 'Leadership change',
  restructuring: 'Restructuring', 'ipo-preparation': 'IPO preparation',
  'sustainability-esg': 'ESG / sustainability', nationalization: 'Nationalization', other: 'Other',
}
const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = { immediate: 'Immediate (< 4 weeks)', 'short-term': 'Short-term (1-3 months)', 'medium-term': 'Medium-term (3-6 months)', 'long-term': 'Long-term (6+ months)', unspecified: 'Unspecified' }
const BUDGET_LABELS: Record<BudgetEnvelope, string> = { 'not-defined': 'Not defined', 'very-limited': 'Very limited', moderate: 'Moderate', substantial: 'Substantial', open: 'Open / TBD' }
const SPONSOR_LABELS: Record<ExecutiveSponsor, string> = { none: 'None', ceo: 'CEO', chro: 'CHRO', coo: 'COO', cfo: 'CFO', board: 'Board', other: 'Other' }
const HC_AREA_LABELS: Record<HcChallengeArea, string> = {
  'strategy-business-alignment': 'Strategy & business alignment', 'workforce-planning': 'Workforce planning',
  'capability-skills': 'Capability & skills', 'learning-training': 'Learning & training',
  leadership: 'Leadership', succession: 'Succession', mobility: 'Mobility',
  'talent-acquisition': 'Talent acquisition', performance: 'Performance',
  'employee-experience': 'Employee experience', rewards: 'Rewards',
  'organization-design': 'Organization design', 'process-excellence': 'Process excellence',
  'governance-operating-model': 'Governance & operating model', 'ai-digital-transformation': 'AI & digital transformation',
  'culture-change-readiness': 'Culture & change readiness', 'analytics-productivity': 'Analytics & productivity',
}
const SEVERITY_LABELS: Record<ChallengeSeverity, string> = { watch: 'Watch', moderate: 'Moderate', high: 'High', critical: 'Critical' }
const OUTPUT_TYPE_LABELS: Record<DesiredOutputType, string> = {
  'executive-deck': 'Executive deck', 'consulting-report': 'Consulting report', playbook: 'Playbook',
  infographic: 'Infographic', 'strategy-recommendation': 'Strategy recommendation', framework: 'Framework',
  'maturity-assessment': 'Maturity assessment', 'implementation-plan': 'Implementation plan',
  'scenario-comparison': 'Scenario comparison', other: 'Other',
}
const ADV_AUDIENCE_LABELS: Record<AdvisoryAudience, string> = {
  'executive-committee': 'Executive committee', board: 'Board', ceo: 'CEO', chro: 'CHRO',
  'hr-leadership': 'HR leadership', 'business-leaders': 'Business leaders', 'line-managers': 'Line managers',
  'all-employees': 'All employees', 'external-stakeholders': 'External stakeholders', other: 'Other',
}
const ADV_URGENCY_LABELS: Record<AdvisoryUrgency, string> = { exploratory: 'Exploratory', 'near-term': 'Near-term', urgent: 'Urgent', critical: 'Critical' }
const OUTPUT_DEPTH_LABELS: Record<OutputDepth, string> = { 'executive-summary': 'Executive summary', standard: 'Standard', 'deep-dive': 'Deep-dive', 'implementation-grade': 'Implementation grade' }
const TONE_LABELS: Record<PreferredTone, string> = { executive: 'Executive', advisory: 'Advisory', consultative: 'Consultative', educational: 'Educational', directive: 'Directive' }
const INNOVATION_LABELS: Record<InnovationAppetite, string> = { conservative: 'Conservative', balanced: 'Balanced', ambitious: 'Ambitious', bold: 'Bold' }
const IMPL_ORIENT_LABELS: Record<ImplementationOrientation, string> = { diagnostic: 'Diagnostic', advisory: 'Advisory', design: 'Design', execution: 'Execution' }
const BRIEF_CONF_LABELS: Record<BriefConfidentiality, string> = { internal: 'Internal', 'client-confidential': 'Client confidential', 'board-only': 'Board only', public: 'Public' }
const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  budget: 'Budget', time: 'Time', regulatory: 'Regulatory', 'data-availability': 'Data availability',
  'leadership-bandwidth': 'Leadership bandwidth', 'change-fatigue': 'Change fatigue',
  'vendor-lockin': 'Vendor lock-in', technology: 'Technology', geographic: 'Geographic', other: 'Other',
}

// ── Defaults ───────────────────────────────────────────────────────────────

export function defaultBrief(): ChallengeBriefData {
  return {
    organization: { organizationName: '', industry: 'other', region: 'gcc', organizationSize: 'large', maturityStage: 'mature', operatingModel: 'single-entity', employeeCountBand: 'unknown', geographicScope: 'unknown', notes: '' },
    businessSituation: { situationSummary: '', strategicDrivers: [], timeHorizon: 'medium-term', budgetEnvelope: 'not-defined', executiveSponsor: 'none', boardVisibility: false, recentChangesNote: '' },
    hcChallenges: { selectedAreas: [], topPriorityArea: 'none', painPointsNote: '' },
    advisoryQuestions: [],
    constraints: { constraints: [], assumptions: [], outOfScopeNote: '' },
    desiredOutputs: { outputTypes: [], primaryAudience: 'hr-leadership', outputDepth: 'standard', preferredTone: 'advisory', innovationAppetite: 'balanced', implementationOrientation: 'advisory', confidentialityLevel: 'internal', expectedDeliveryWindow: 'medium-term' },
  }
}

// ── Shared UI ──────────────────────────────────────────────────────────────

function ChipGroup<T extends string>({ label, description, options, labels, value, onChange }: {
  label: string; description?: string; options: T[]; labels: Record<T, string>; value: T[]; onChange: (next: T[]) => void
}) {
  const toggle = (opt: T) => onChange(value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt])
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={cn('px-3.5 py-2 rounded-xl text-sm font-medium border transition-all',
              value.includes(opt) ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]' : 'bg-[#131720] border-[#1e2433] text-slate-400 hover:border-[#2a3048] hover:text-slate-300 hover:bg-[#161b28]')}>
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectField<T extends string>({ label, options, labels, value, onChange }: { label: string; options: T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as T)}
        className="w-full rounded-xl border border-[#1e2433] bg-[#131720] text-white px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60 hover:border-[#2a3048] transition-all">
        {options.map(opt => <option key={opt} value={opt} className="bg-[#131720]">{labels[opt]}</option>)}
      </select>
    </div>
  )
}

function genId() { return `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` }

// ── Step 1: Organization context ───────────────────────────────────────────

function StepOrg({ value, onChange, prefilled }: { value: OrganizationContext; onChange: (v: OrganizationContext) => void; prefilled?: boolean }) {
  const p = <K extends keyof OrganizationContext>(k: K, v: OrganizationContext[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">Organization context</h2><p className="text-sm text-slate-400 mt-1">Basic information about the client organization anchors all recommendations.</p></div>
      {prefilled && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
          ✓ Pre-filled from your company profile · edit if needed
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input label="Organization name" placeholder="e.g. ACME Corporation" value={value.organizationName} onChange={e => p('organizationName', e.target.value)} />
        </div>
        <SelectField label="Industry" options={Object.keys(ORG_INDUSTRY_LABELS) as OrgIndustry[]} labels={ORG_INDUSTRY_LABELS} value={value.industry} onChange={v => p('industry', v)} />
        <SelectField label="Region" options={Object.keys(ORG_REGION_LABELS) as OrgRegion[]} labels={ORG_REGION_LABELS} value={value.region} onChange={v => p('region', v)} />
        <SelectField label="Organization size" options={Object.keys(ORG_SIZE_LABELS) as OrgSize[]} labels={ORG_SIZE_LABELS} value={value.organizationSize} onChange={v => p('organizationSize', v)} />
        <SelectField label="Maturity stage" options={Object.keys(MATURITY_LABELS) as OrgMaturityStage[]} labels={MATURITY_LABELS} value={value.maturityStage} onChange={v => p('maturityStage', v)} />
        <SelectField label="Operating model" options={Object.keys(OPERATING_MODEL_LABELS) as OrgOperatingModel[]} labels={OPERATING_MODEL_LABELS} value={value.operatingModel} onChange={v => p('operatingModel', v)} />
        <SelectField label="Employee count band" options={Object.keys(EMP_COUNT_LABELS) as EmployeeCountBand[]} labels={EMP_COUNT_LABELS} value={value.employeeCountBand} onChange={v => p('employeeCountBand', v)} />
        <div className="sm:col-span-2">
          <SelectField label="Geographic scope" options={Object.keys(GEO_SCOPE_LABELS) as GeographicScope[]} labels={GEO_SCOPE_LABELS} value={value.geographicScope} onChange={v => p('geographicScope', v)} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Additional context (optional)" rows={3} placeholder="Any additional context about the organization..." value={value.notes} onChange={e => p('notes', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Business situation ─────────────────────────────────────────────

function StepSituation({ value, onChange }: { value: BusinessSituation; onChange: (v: BusinessSituation) => void }) {
  const p = <K extends keyof BusinessSituation>(k: K, v: BusinessSituation[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">Business situation</h2><p className="text-sm text-slate-400 mt-1">Describe the strategic context driving this engagement.</p></div>
      <Textarea label="Situation summary" rows={4} placeholder="Describe the business situation and what is driving this engagement..." value={value.situationSummary} onChange={e => p('situationSummary', e.target.value)} />
      <ChipGroup label="Strategic drivers" description="What external and internal forces are shaping this engagement?" options={Object.keys(STRATEGIC_DRIVER_LABELS) as StrategicDriver[]} labels={STRATEGIC_DRIVER_LABELS} value={value.strategicDrivers} onChange={next => p('strategicDrivers', next)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="Time horizon" options={Object.keys(TIME_HORIZON_LABELS) as TimeHorizon[]} labels={TIME_HORIZON_LABELS} value={value.timeHorizon} onChange={v => p('timeHorizon', v)} />
        <SelectField label="Budget envelope" options={Object.keys(BUDGET_LABELS) as BudgetEnvelope[]} labels={BUDGET_LABELS} value={value.budgetEnvelope} onChange={v => p('budgetEnvelope', v)} />
        <SelectField label="Executive sponsor" options={Object.keys(SPONSOR_LABELS) as ExecutiveSponsor[]} labels={SPONSOR_LABELS} value={value.executiveSponsor} onChange={v => p('executiveSponsor', v)} />
        <div className="space-y-1.5 flex flex-col justify-end">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Board visibility</label>
          <button type="button" onClick={() => p('boardVisibility', !value.boardVisibility)}
            className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border text-sm transition-all', value.boardVisibility ? 'border-blue-500/60 bg-blue-600/20 text-blue-300' : 'border-[#1e2433] bg-[#131720] text-slate-400 hover:border-[#252d3f]')}>
            <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center', value.boardVisibility ? 'border-blue-500 bg-blue-600' : 'border-slate-600')}>
              {value.boardVisibility && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            Board is aware of this engagement
          </button>
        </div>
      </div>
      <Textarea label="Recent changes / events (optional)" rows={3} placeholder="Any recent leadership changes, M&A activity, regulatory shifts, etc." value={value.recentChangesNote} onChange={e => p('recentChangesNote', e.target.value)} />
    </div>
  )
}

// ── Step 3: HC challenges ──────────────────────────────────────────────────

function StepHcChallenges({ value, onChange }: { value: HcChallenges; onChange: (v: HcChallenges) => void }) {
  const areas = Object.keys(HC_AREA_LABELS) as HcChallengeArea[]
  const selectedAreaIds = value.selectedAreas.map(a => a.area)

  const toggleArea = (area: HcChallengeArea) => {
    if (selectedAreaIds.includes(area)) {
      onChange({ ...value, selectedAreas: value.selectedAreas.filter(a => a.area !== area), topPriorityArea: value.topPriorityArea === area ? 'none' : value.topPriorityArea })
    } else {
      onChange({ ...value, selectedAreas: [...value.selectedAreas, { area, severity: 'moderate', notes: '' }] })
    }
  }

  const updateSeverity = (area: HcChallengeArea, severity: ChallengeSeverity) =>
    onChange({ ...value, selectedAreas: value.selectedAreas.map(a => a.area === area ? { ...a, severity } : a) })

  const updateAreaNotes = (area: HcChallengeArea, notes: string) =>
    onChange({ ...value, selectedAreas: value.selectedAreas.map(a => a.area === area ? { ...a, notes } : a) })

  const severityColors: Record<ChallengeSeverity, string> = {
    watch: 'border-slate-500/40 text-slate-400',
    moderate: 'border-amber-500/40 text-amber-400',
    high: 'border-orange-500/40 text-orange-400',
    critical: 'border-red-500/40 text-red-400',
  }

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">HC challenges</h2><p className="text-sm text-slate-400 mt-1">Select the human capital challenge areas relevant to this engagement and set their severity.</p></div>
      <div className="flex flex-wrap gap-2">
        {areas.map(area => (
          <button key={area} type="button" onClick={() => toggleArea(area)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              selectedAreaIds.includes(area) ? 'bg-blue-600/20 border-blue-500/60 text-blue-300' : 'bg-[#131720] border-[#1e2433] text-slate-400 hover:border-[#252d3f] hover:text-slate-300')}>
            {HC_AREA_LABELS[area]}
          </button>
        ))}
      </div>

      {value.selectedAreas.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected areas: set severity</p>
          {value.selectedAreas.map(sel => (
            <div key={sel.area} className="rounded-xl border border-[#1e2433] bg-[#0a0c12] p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white">{HC_AREA_LABELS[sel.area]}</span>
                <div className="flex gap-1">
                  {(['watch', 'moderate', 'high', 'critical'] as ChallengeSeverity[]).map(sev => (
                    <button key={sev} type="button" onClick={() => updateSeverity(sel.area, sev)}
                      className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border transition-all', sel.severity === sev ? `bg-current/10 ${severityColors[sev]}` : 'border-[#1e2433] text-slate-600 hover:border-[#252d3f]')}>
                      {SEVERITY_LABELS[sev]}
                    </button>
                  ))}
                </div>
              </div>
              <input type="text" placeholder="Notes (optional)" value={sel.notes}
                onChange={e => updateAreaNotes(sel.area, e.target.value)}
                className="w-full rounded-lg border border-[#1e2433] bg-[#131720] text-white placeholder:text-slate-600 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/60" />
            </div>
          ))}
        </div>
      )}

      {value.selectedAreas.length > 1 && (
        <SelectField
          label="Top priority area"
          options={['none', ...value.selectedAreas.map(a => a.area)] as (HcChallengeArea | 'none')[]}
          labels={{ none: 'Not set', ...HC_AREA_LABELS } as Record<HcChallengeArea | 'none', string>}
          value={value.topPriorityArea}
          onChange={v => onChange({ ...value, topPriorityArea: v })}
        />
      )}

      <Textarea label="Pain points note (optional)" rows={3} placeholder="Describe the key pain points we need to address..." value={value.painPointsNote} onChange={e => onChange({ ...value, painPointsNote: e.target.value })} />
    </div>
  )
}

// ── Step 4: Advisory questions ─────────────────────────────────────────────

function StepAdvisoryQuestions({ questions, constraints: cnst, selectedAreas, onQuestionsChange, onConstraintsChange }: {
  questions: AdvisoryQuestion[]; constraints: ConstraintsSection
  selectedAreas: HcChallengeArea[]; onQuestionsChange: (v: AdvisoryQuestion[]) => void; onConstraintsChange: (v: ConstraintsSection) => void
}) {
  const addQuestion = () =>
    onQuestionsChange([...questions, { id: genId(), questionText: '', audience: 'hr-leadership', urgency: 'near-term', linkedChallengeArea: selectedAreas[0] ?? 'none', desiredOutputType: 'executive-deck' }])
  const updateQ = (id: string, key: keyof AdvisoryQuestion, val: string) =>
    onQuestionsChange(questions.map(q => q.id === id ? { ...q, [key]: val } : q))
  const removeQ = (id: string) => onQuestionsChange(questions.filter(q => q.id !== id))

  const addConstraint = () => onConstraintsChange({ ...cnst, constraints: [...cnst.constraints, { id: genId(), type: 'budget', description: '' }] })
  const updateC = (id: string, key: keyof Constraint, val: string) =>
    onConstraintsChange({ ...cnst, constraints: cnst.constraints.map(c => c.id === id ? { ...c, [key]: val } : c) })
  const removeC = (id: string) => onConstraintsChange({ ...cnst, constraints: cnst.constraints.filter(c => c.id !== id) })

  const addAssumption = () => onConstraintsChange({ ...cnst, assumptions: [...cnst.assumptions, { id: genId(), description: '' }] })
  const updateA = (id: string, val: string) =>
    onConstraintsChange({ ...cnst, assumptions: cnst.assumptions.map(a => a.id === id ? { ...a, description: val } : a) })
  const removeA = (id: string) => onConstraintsChange({ ...cnst, assumptions: cnst.assumptions.filter(a => a.id !== id) })

  const areaOptions: (HcChallengeArea | 'none')[] = ['none', ...selectedAreas]
  const areaLabels = { none: 'Not linked', ...HC_AREA_LABELS } as Record<HcChallengeArea | 'none', string>

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">Questions, constraints & assumptions</h2><p className="text-sm text-slate-400 mt-1">Define the advisory questions this engagement must answer, plus any constraints and assumptions.</p></div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Advisory questions</p>
          <button type="button" onClick={addQuestion} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add question
          </button>
        </div>
        {questions.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">No questions yet. Add one to define what this engagement must answer.</p>
        )}
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-[#1e2433] bg-[#0a0c12] p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Q{i + 1}</span>
              <button type="button" onClick={() => removeQ(q.id)} className="text-slate-600 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
            </div>
            <textarea placeholder="What specific question must this engagement answer?" value={q.questionText}
              onChange={e => updateQ(q.id, 'questionText', e.target.value)} rows={2}
              className="w-full rounded-lg border border-[#1e2433] bg-[#131720] text-white placeholder:text-slate-600 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SelectField label="Audience" options={Object.keys(ADV_AUDIENCE_LABELS) as AdvisoryAudience[]} labels={ADV_AUDIENCE_LABELS} value={q.audience as AdvisoryAudience} onChange={v => updateQ(q.id, 'audience', v)} />
              <SelectField label="Urgency" options={Object.keys(ADV_URGENCY_LABELS) as AdvisoryUrgency[]} labels={ADV_URGENCY_LABELS} value={q.urgency as AdvisoryUrgency} onChange={v => updateQ(q.id, 'urgency', v)} />
              <SelectField label="HC area" options={areaOptions} labels={areaLabels} value={q.linkedChallengeArea} onChange={v => updateQ(q.id, 'linkedChallengeArea', v)} />
              <SelectField label="Output type" options={Object.keys(OUTPUT_TYPE_LABELS) as DesiredOutputType[]} labels={OUTPUT_TYPE_LABELS} value={q.desiredOutputType as DesiredOutputType} onChange={v => updateQ(q.id, 'desiredOutputType', v)} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Constraints</p>
          <button type="button" onClick={addConstraint} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add constraint
          </button>
        </div>
        {cnst.constraints.map(c => (
          <div key={c.id} className="flex gap-2">
            <select value={c.type} onChange={e => updateC(c.id, 'type', e.target.value)}
              className="rounded-xl border border-[#1e2433] bg-[#131720] text-white px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/60 w-32 flex-shrink-0">
              {(Object.keys(CONSTRAINT_TYPE_LABELS) as ConstraintType[]).map(t => <option key={t} value={t} className="bg-[#131720]">{CONSTRAINT_TYPE_LABELS[t]}</option>)}
            </select>
            <input placeholder="Describe the constraint..." value={c.description} onChange={e => updateC(c.id, 'description', e.target.value)}
              className="flex-1 rounded-xl border border-[#1e2433] bg-[#131720] text-white placeholder:text-slate-600 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60" />
            <button type="button" onClick={() => removeC(c.id)} className="text-slate-600 hover:text-red-400 transition-colors px-2"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Assumptions</p>
          <button type="button" onClick={addAssumption} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add assumption
          </button>
        </div>
        {cnst.assumptions.map(a => (
          <div key={a.id} className="flex gap-2">
            <input placeholder="Describe the assumption..." value={a.description} onChange={e => updateA(a.id, e.target.value)}
              className="flex-1 rounded-xl border border-[#1e2433] bg-[#131720] text-white placeholder:text-slate-600 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60" />
            <button type="button" onClick={() => removeA(a.id)} className="text-slate-600 hover:text-red-400 transition-colors px-2"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <Textarea label="Out-of-scope note (optional)" rows={2} placeholder="What is explicitly excluded from this engagement?" value={cnst.outOfScopeNote} onChange={e => onConstraintsChange({ ...cnst, outOfScopeNote: e.target.value })} />
    </div>
  )
}

// ── Step 5: Desired outputs ────────────────────────────────────────────────

function StepDesiredOutputs({ value, onChange }: { value: DesiredOutputs; onChange: (v: DesiredOutputs) => void }) {
  const p = <K extends keyof DesiredOutputs>(k: K, v: DesiredOutputs[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold text-white">Desired outputs & AI metadata</h2><p className="text-sm text-slate-400 mt-1">Define what this engagement should produce and how it should be framed.</p></div>
      <ChipGroup label="Output types" description="Select one or more desired deliverable formats." options={Object.keys(OUTPUT_TYPE_LABELS) as DesiredOutputType[]} labels={OUTPUT_TYPE_LABELS} value={value.outputTypes} onChange={next => p('outputTypes', next)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="Primary audience" options={Object.keys(ADV_AUDIENCE_LABELS) as AdvisoryAudience[]} labels={ADV_AUDIENCE_LABELS} value={value.primaryAudience} onChange={v => p('primaryAudience', v)} />
        <SelectField label="Output depth" options={Object.keys(OUTPUT_DEPTH_LABELS) as OutputDepth[]} labels={OUTPUT_DEPTH_LABELS} value={value.outputDepth} onChange={v => p('outputDepth', v)} />
        <SelectField label="Preferred tone" options={Object.keys(TONE_LABELS) as PreferredTone[]} labels={TONE_LABELS} value={value.preferredTone} onChange={v => p('preferredTone', v)} />
        <SelectField label="Innovation appetite" options={Object.keys(INNOVATION_LABELS) as InnovationAppetite[]} labels={INNOVATION_LABELS} value={value.innovationAppetite} onChange={v => p('innovationAppetite', v)} />
        <SelectField label="Implementation orientation" options={Object.keys(IMPL_ORIENT_LABELS) as ImplementationOrientation[]} labels={IMPL_ORIENT_LABELS} value={value.implementationOrientation} onChange={v => p('implementationOrientation', v)} />
        <SelectField label="Confidentiality" options={Object.keys(BRIEF_CONF_LABELS) as BriefConfidentiality[]} labels={BRIEF_CONF_LABELS} value={value.confidentialityLevel} onChange={v => p('confidentialityLevel', v)} />
        <div className="sm:col-span-2">
          <SelectField label="Expected delivery window" options={Object.keys(TIME_HORIZON_LABELS) as TimeHorizon[]} labels={TIME_HORIZON_LABELS} value={value.expectedDeliveryWindow} onChange={v => p('expectedDeliveryWindow', v)} />
        </div>
      </div>
    </div>
  )
}

// ── Step 6: Review ─────────────────────────────────────────────────────────

const ALL_STUDIOS = [
  { name: 'HC Strategy Charter', area: 'strategy-business-alignment', href: '/skills', icon: '', description: 'Align HC strategy with business agenda' },
  { name: 'Org Design Blueprint', area: 'organization-design', href: '/skills', icon: '', description: 'Redesign structures and reporting lines' },
  { name: 'Workforce Planning', area: 'workforce-planning', href: '/skills', icon: '', description: 'Model headcount and capability gaps' },
  { name: 'HiPo Studio', area: 'leadership', href: '/hipo-studio', icon: '', description: 'Identify and develop high-potential talent' },
  { name: 'Succession Planning', area: 'succession', href: '/skills', icon: '', description: 'Build leadership pipeline readiness' },
  { name: 'Performance Management', area: 'performance', href: '/skills', icon: '', description: 'Design performance frameworks' },
  { name: 'Employee Experience', area: 'employee-experience', href: '/skills', icon: '', description: 'Map and improve EX touchpoints' },
  { name: 'Total Rewards', area: 'rewards', href: '/skills', icon: '', description: 'Benchmark and design compensation' },
  { name: 'Talent Acquisition', area: 'talent-acquisition', href: '/skills', icon: '', description: 'Attract and hire top talent' },
  { name: 'Learning & Training', area: 'learning-training', href: '/skills', icon: '', description: 'Build learning journeys and curricula' },
  { name: 'Skills Development', area: 'capability-skills', href: '/skills', icon: '', description: 'Close critical skill gaps' },
  { name: 'Leadership Development', area: 'leadership', href: '/skills', icon: '', description: 'Develop leadership at all levels' },
  { name: 'Capability Assessment', area: 'capability-skills', href: '/skills', icon: '', description: 'Assess and map organizational capabilities' },
  { name: 'Process Excellence', area: 'process-excellence', href: '/skills', icon: '', description: 'Streamline and optimize HC processes' },
  { name: 'Analytics & Productivity', area: 'analytics-productivity', href: '/skills', icon: '', description: 'Build people analytics dashboards' },
  { name: 'Mobility Studio', area: 'mobility', href: '/skills', icon: '', description: 'Design internal mobility programs' },
  { name: 'Culture & Change', area: 'culture-change-readiness', href: '/skills', icon: '', description: 'Assess and shift organizational culture' },
  { name: 'AI & Digital Transform', area: 'ai-digital-transformation', href: '/skills', icon: '', description: 'Lead AI-enabled HC transformation' },
  { name: 'Framework Review', area: 'governance-operating-model', href: '/skills', icon: '', description: 'Review governance and operating models' },
  { name: 'Benchmarking Studio', area: 'analytics-productivity', href: '/skills', icon: '', description: 'Benchmark against industry peers' },
  { name: 'Deck Generator', area: 'strategy-business-alignment', href: '/skills', icon: '', description: 'Generate executive-ready presentations' },
  { name: 'Playbook Studio', area: 'culture-change-readiness', href: '/skills', icon: '', description: 'Create implementation playbooks' },
  { name: 'Infographic Studio', area: 'analytics-productivity', href: '/skills', icon: '', description: 'Visualize data and insights' },
  { name: 'Brand Workspace', area: 'strategy-business-alignment', href: '/skills', icon: '', description: 'Build employer brand strategy' },
  { name: 'Coaching & Mentoring', area: 'leadership', href: '/skills', icon: '', description: 'Design coaching programs' },
  { name: 'Early Career', area: 'talent-acquisition', href: '/skills', icon: '', description: 'Build graduate and early career pipelines' },
  { name: 'Business Plan Studio', area: 'strategy-business-alignment', href: '/skills', icon: '', description: 'Craft HC business cases and plans' },
]

function CircleProgress({ pct, size = 80, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e2433" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct < 40 ? '#64748b' : pct < 70 ? '#f59e0b' : pct < 90 ? '#3b82f6' : '#10b981'}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  )
}

function StepReview({ brief, onLaunch, launching, launchError }: { brief: ChallengeBriefData; onLaunch: () => void; launching?: boolean; launchError?: string | null }) {
  const navigate = useNavigate()
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [hoveredStudio, setHoveredStudio] = useState<string | null>(null)

  const selectedAreaIds = brief.hcChallenges.selectedAreas.map(a => a.area)
  // Brief-driven recommendations: score studios from signals, fall back to naive area-match
  const briefDriven = recommendStudios(signalsFromBriefContent(brief), 8)
  const briefDrivenNames = new Set(briefDriven.map(r => r.name))
  const legacyMatch = ALL_STUDIOS.filter(s => selectedAreaIds.includes(s.area as HcChallengeArea))
  const recommended = [
    ...briefDriven.map(r => {
      const legacy = ALL_STUDIOS.find(s => s.name === r.name)
      return legacy ?? { name: r.name, icon: '', area: 'none' as HcChallengeArea, description: r.description, why: r.reasons[0] ?? '' }
    }),
    ...legacyMatch.filter(s => !briefDrivenNames.has(s.name)),
  ]
  const displayStudios = recommended.length > 0 ? recommended : ALL_STUDIOS.slice(0, 12)
  const activeStudios = displayStudios.filter(s => !deselected.has(s.name))

  const toggleStudio = (name: string) => {
    setDeselected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const sections = [
    { label: 'Organization', done: brief.organization.organizationName.length > 0, value: brief.organization.organizationName || ' - ', weight: 15 },
    { label: 'Situation summary', done: brief.businessSituation.situationSummary.length > 10, value: brief.businessSituation.situationSummary.length > 10 ? `${brief.businessSituation.situationSummary.substring(0, 60)}…` : 'Not filled', weight: 20 },
    { label: 'Strategic drivers', done: brief.businessSituation.strategicDrivers.length > 0, value: brief.businessSituation.strategicDrivers.length > 0 ? `${brief.businessSituation.strategicDrivers.length} driver${brief.businessSituation.strategicDrivers.length > 1 ? 's' : ''}` : 'None selected', weight: 10 },
    { label: 'HC challenges', done: brief.hcChallenges.selectedAreas.length > 0, value: brief.hcChallenges.selectedAreas.length > 0 ? `${brief.hcChallenges.selectedAreas.length} area${brief.hcChallenges.selectedAreas.length > 1 ? 's' : ''}` : 'None selected', weight: 25 },
    { label: 'Advisory questions', done: brief.advisoryQuestions.length > 0, value: brief.advisoryQuestions.length > 0 ? `${brief.advisoryQuestions.length} question${brief.advisoryQuestions.length > 1 ? 's' : ''}` : 'None added', weight: 15 },
    { label: 'Desired outputs', done: brief.desiredOutputs.outputTypes.length > 0, value: brief.desiredOutputs.outputTypes.length > 0 ? `${brief.desiredOutputs.outputTypes.length} format${brief.desiredOutputs.outputTypes.length > 1 ? 's' : ''}` : 'None selected', weight: 15 },
  ]

  const completionPct = Math.min(100, sections.filter(s => s.done).reduce((a, s) => a + s.weight, 0))
  const readinessLabel = completionPct < 40 ? 'Basic context' : completionPct < 70 ? 'Advisory ready' : completionPct < 90 ? 'AI ready' : 'Expert review ready'
  const readinessColor = completionPct < 40 ? 'text-slate-400' : completionPct < 70 ? 'text-amber-400' : completionPct < 90 ? 'text-blue-400' : 'text-emerald-400'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Brief readiness review</h2>
        <p className="text-sm text-slate-400 mt-1">Your engagement profile is ready. Select the studios you want to launch.</p>
      </div>

      {/* Score ring + section cards */}
      <div className="rounded-xl border border-[#1e2433] bg-[#0a0c12] p-5">
        <div className="flex items-center gap-5 mb-4">
          <div className="relative flex-shrink-0">
            <CircleProgress pct={completionPct} size={80} stroke={7} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white leading-none">{completionPct}%</span>
            </div>
          </div>
          <div>
            <p className={cn('text-base font-bold', readinessColor)}>{readinessLabel}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sections.filter(s => s.done).length} of {sections.length} sections complete</p>
            <div className="mt-2 h-1.5 rounded-full bg-[#1e2433] w-40 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sections.map(item => (
            <div key={item.label} className={cn('flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors',
              item.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[#1e2433] bg-[#131720]')}>
              <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                item.done ? 'bg-emerald-500' : 'bg-[#1e2433]')}>
                {item.done && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className={cn('text-xs font-semibold', item.done ? 'text-slate-200' : 'text-slate-500')}>{item.label}</p>
                <p className={cn('text-xs truncate mt-0.5', item.done ? 'text-slate-400' : 'text-slate-600')}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Brief summary chips */}
      <div className="rounded-xl border border-[#1e2433] bg-[#0a0c12] p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Brief snapshot</p>
        <div className="flex flex-wrap gap-2">
          {brief.organization.organizationName && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
              🏢 {brief.organization.organizationName}
            </span>
          )}
          {brief.organization.industry && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#1e2433] text-slate-300">
              {brief.organization.industry.replace(/-/g, ' ')}
            </span>
          )}
          {brief.organization.region && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#1e2433] text-slate-300">
              🌍 {brief.organization.region.toUpperCase()}
            </span>
          )}
          {brief.businessSituation.strategicDrivers.map(d => (
            <span key={d} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
              {d.replace(/-/g, ' ')}
            </span>
          ))}
          {brief.hcChallenges.selectedAreas.map(a => (
            <span key={a.area} className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border',
              a.severity === 'critical' ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : a.severity === 'high' ? 'bg-orange-500/10 border-orange-500/20 text-orange-300'
              : 'bg-slate-500/10 border-slate-500/20 text-slate-300')}>
              {a.area.replace(/-/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Studio selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {recommended.length > 0 ? `Matched studios: ${activeStudios.length} selected` : `Available studios: ${activeStudios.length} selected`}
          </p>
          {deselected.size > 0 && (
            <button type="button" onClick={() => setDeselected(new Set())}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              Reset selection
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {displayStudios.map(studio => {
            const active = !deselected.has(studio.name)
            return (
              <motion.button
                key={studio.name}
                type="button"
                onClick={() => toggleStudio(studio.name)}
                onMouseEnter={() => setHoveredStudio(studio.name)}
                onMouseLeave={() => setHoveredStudio(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'relative flex flex-col gap-1 px-3 py-2.5 rounded-lg border transition-all text-left',
                  active
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : 'border-[#1e2433] bg-[#0a0c12] opacity-40'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{studio.icon}</span>
                  <span className={cn('text-xs font-semibold truncate', active ? 'text-slate-200' : 'text-slate-500')}>
                    {studio.name}
                  </span>
                  {active && (
                    <div className="ml-auto w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
                <AnimatePresence>
                  {hoveredStudio === studio.name && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[10px] text-slate-500 leading-tight"
                    >
                      {studio.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.button>
            )
          })}
        </div>
        {displayStudios.length < ALL_STUDIOS.length && (
          <p className="text-xs text-slate-600 text-center">
            +{ALL_STUDIOS.length - displayStudios.length} more studios in the full library
          </p>
        )}
      </div>

      {/* Launch CTA */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{activeStudios.length} studio{activeStudios.length !== 1 ? 's' : ''} ready to launch</p>
          <p className="text-xs text-slate-400 mt-0.5">Your brief is saved. Studios will use your context automatically.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={() => navigate('/skills')}>
            Browse all
          </Button>
          <Button size="sm" onClick={onLaunch} disabled={launching} rightIcon={<ArrowRight className="w-4 h-4" />}>
            {launching ? 'Generating…' : 'Generate diagnosis'}
          </Button>
        </div>
      </div>
      {launchError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {launchError}
        </div>
      )}
    </div>
  )
}

// ── Step metadata ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 'org', shortLabel: 'Org', icon: Building2 },
  { id: 'situation', shortLabel: 'Situation', icon: BarChart2 },
  { id: 'challenges', shortLabel: 'Challenges', icon: AlertTriangle },
  { id: 'questions', shortLabel: 'Questions', icon: HelpCircle },
  { id: 'outputs', shortLabel: 'Outputs', icon: LayoutList },
  { id: 'review', shortLabel: 'Review', icon: CheckSquare },
]

// ── Brief persistence key ──────────────────────────────────────────────────


// ── Page ───────────────────────────────────────────────────────────────────

export default function ChallengeBrief() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? ''

  const { getBrief, saveBrief: saveToStore } = useBriefStore()
  const { isCompleted: isWsOnboardingDone } = useOnboardingCompletions()
  const setActiveWorkspace = useClientProfileStore(s => s.setActiveWorkspace)
  const getProfileFor = useClientProfileStore(s => s.getProfileFor)
  const [orgPrefilled, setOrgPrefilled] = useState(false)

  // Gate: the brief is only meaningful after onboarding. If a workspace is
  // attached but its onboarding is not yet done, send the user there first.
  useEffect(() => {
    if (workspaceId && !isWsOnboardingDone(workspaceId)) {
      navigate(`/onboarding?workspaceId=${workspaceId}`, { replace: true })
    }
  }, [workspaceId, isWsOnboardingDone, navigate])

  // Pre-fill organization step from clientProfile (captured at Onboarding)
  // so users don't re-answer the same questions. Only fills EMPTY brief fields.
  useEffect(() => {
    if (workspaceId) setActiveWorkspace(workspaceId)
    const profile = workspaceId ? getProfileFor(workspaceId) : getProfileFor('_unscoped')
    const org = profile?.organization
    if (!org) return
    setBriefState(prev => {
      const cur = prev.organization
      const isDefault = <T,>(v: T, def: T) => v === undefined || v === null || v === '' || v === def
      const nextName = isDefault(cur.organizationName, '') && org.name ? org.name : cur.organizationName
      const nextIndustry = isDefault(cur.industry, 'other') && org.industry ? mapIndustry(org.industry) : cur.industry
      const nextRegion = isDefault(cur.region, 'gcc') && org.region ? mapRegion(org.region) : cur.region
      const nextSize = isDefault(cur.organizationSize, 'large') && org.organizationSize ? mapSize(org.organizationSize) : cur.organizationSize
      const nextMaturity = isDefault(cur.maturityStage, 'mature') && org.maturityStage ? mapMaturity(org.maturityStage) : cur.maturityStage
      const nextOpModel = isDefault(cur.operatingModel, 'single-entity') && org.operatingModel ? mapOperatingModel(org.operatingModel) : cur.operatingModel
      const changed =
        nextName !== cur.organizationName || nextIndustry !== cur.industry ||
        nextRegion !== cur.region || nextSize !== cur.organizationSize ||
        nextMaturity !== cur.maturityStage || nextOpModel !== cur.operatingModel
      if (!changed) return prev
      setOrgPrefilled(true)
      return {
        ...prev,
        organization: {
          ...cur,
          organizationName: nextName,
          industry: nextIndustry,
          region: nextRegion,
          organizationSize: nextSize,
          maturityStage: nextMaturity,
          operatingModel: nextOpModel,
        },
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Restore existing brief for this workspace if available
  const [stepIndex, setStepIndex] = useState(0)
  const [brief, setBriefState] = useState<ChallengeBriefData>(() => {
    if (!workspaceId) return defaultBrief()
    const existing = getBrief(workspaceId)
    if (!existing) return defaultBrief()
    // Reconstruct ChallengeBriefData from stored brief
    return {
      ...defaultBrief(),
      organization: {
        ...defaultBrief().organization,
        organizationName: existing.organizationName,
        industry: (existing.industry || 'other') as any,
        region: (existing.region || 'gcc') as any,
        organizationSize: (existing.organizationSize || 'large') as any,
        maturityStage: (existing.maturityStage || 'mature') as any,
        operatingModel: (existing.operatingModel || 'single-entity') as any,
      },
    }
  })
  const [saved, setSaved] = useState(false)
  const [remoteBriefId, setRemoteBriefId] = useState<string | null>(null)
  const remoteBriefIdRef = useRef<string | null>(null)
  const createInFlightRef = useRef<Promise<string | null> | null>(null)

  // Resume from server-side brief if one exists for this workspace
  useEffect(() => {
    if (!workspaceId) return
    challengeBriefsAPI.list().then(res => {
      const raw = (Array.isArray(res.data) ? res.data : res.data?.briefs ?? []) as Array<Record<string, unknown>>
      const existing = raw.find(b => b.workspace_id === workspaceId && b.status === 'draft')
      if (!existing) return
      const id = String(existing.id ?? '')
      setRemoteBriefId(id)
      remoteBriefIdRef.current = id
      const content = existing.content as Partial<ChallengeBriefData> & { _stepIndex?: number } | undefined
      if (content) {
        setBriefState(prev => ({ ...prev, ...content }))
        if (typeof content._stepIndex === 'number') setStepIndex(content._stepIndex)
      }
    }).catch(() => {})
  }, [workspaceId])

  // JSON-clean payload: drop undefined, Date, Set values that fail server validation
  const cleanForJSON = useCallback((obj: unknown): unknown => {
    try { return JSON.parse(JSON.stringify(obj)) } catch { return {} }
  }, [])

  const updateBrief = (next: ChallengeBriefData) => {
    setBriefState(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Server-side autosave (debounced) — creates the brief on first save, patches thereafter
  const autosavePayload = useMemo(() => ({ ...brief, _stepIndex: stepIndex }), [brief, stepIndex])
  const onSaveBrief = useCallback(async (v: typeof autosavePayload) => {
    if (!workspaceId) return
    const cleanContent = cleanForJSON(v) as Record<string, unknown>
    // Race-safe: if a create is already in flight, await it instead of starting another
    if (!remoteBriefIdRef.current && createInFlightRef.current) {
      const id = await createInFlightRef.current
      if (id) await challengeBriefsAPI.update(id, { content: cleanContent })
      return
    }
    if (remoteBriefIdRef.current) {
      await challengeBriefsAPI.update(remoteBriefIdRef.current, { content: cleanContent })
      return
    }
    // First save — POST and gate other concurrent calls until done
    createInFlightRef.current = (async () => {
      try {
        const res = await challengeBriefsAPI.create({
          workspace_id: workspaceId,
          title: (v.organization?.organizationName as string) || 'Untitled brief',
          content: cleanContent,
        })
        const id = (res.data as { id?: string })?.id ?? null
        if (id) {
          remoteBriefIdRef.current = id
          setRemoteBriefId(id)
        }
        return id
      } finally {
        // tiny tick to ensure any waiters resolve before we clear the gate
        setTimeout(() => { createInFlightRef.current = null }, 0)
      }
    })()
    await createInFlightRef.current
  }, [workspaceId, cleanForJSON])
  const { status: briefSaveStatus } = useAutosave({ value: autosavePayload, onSave: onSaveBrief, delay: 800, enabled: !!workspaceId })

  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  const advance = () => { setStepIndex(s => Math.min(STEPS.length - 1, s + 1)) }
  // The workspace hub redirects back to this brief until it is completed, so
  // exiting an incomplete brief goes to the Workspaces list to avoid a loop.
  const exitTarget = workspaceId && getBrief(workspaceId) ? `/workspaces/${workspaceId}` : '/workspaces'
  const back = () => {
    if (isFirst && workspaceId) { navigate(exitTarget) }
    else setStepIndex(s => Math.max(0, s - 1))
  }
  const exitAndSave = () => { navigate(workspaceId ? exitTarget : '/workspaces') }

  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const completeBrief = async () => {
    if (workspaceId) {
      saveToStore(workspaceId, {
        organizationName: brief.organization.organizationName,
        industry: brief.organization.industry,
        region: brief.organization.region,
        organizationSize: brief.organization.organizationSize,
        maturityStage: brief.organization.maturityStage,
        operatingModel: brief.organization.operatingModel,
        strategicDrivers: brief.businessSituation.strategicDrivers,
        hcAreas: brief.hcChallenges.selectedAreas.map(a => a.area),
        outputTypes: brief.desiredOutputs.outputTypes,
        completedAt: new Date().toISOString(),
      })
    }
    setLaunching(true)
    setLaunchError(null)
    try {
      const res = await api.post('/hc-platform/diagnose-from-brief', {
        brief: cleanForJSON(brief),
        workspace_id: workspaceId ?? null,
      })
      const diagnosis = res.data as { review_id: string }
      try { localStorage.setItem('aivora-active-review-id', diagnosis.review_id) } catch { /* ignore */ }
      // Brief complete: go straight to the AI Advisory for this workspace.
      if (workspaceId) navigate(`/advisor/${workspaceId}`)
      else navigate(`/brief-results/${diagnosis.review_id}`, { state: { diagnosis } })
    } catch (err: any) {
      setLaunchError(err?.response?.data?.detail || 'Could not generate diagnosis. Try again.')
      setLaunching(false)
    }
  }

  const variants = {
    enter: { opacity: 0, x: 20, filter: 'blur(3px)' },
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, x: -20, filter: 'blur(3px)' },
  }

  return (
    <div className="min-h-full bg-[#0c0e14]">
      <div className="flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-5xl space-y-6">
          {/* Back to workspace */}
          {workspaceId && (
            <div className="flex items-center justify-between">
              <button type="button" onClick={exitAndSave}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors font-medium">
                <ArrowLeft className="w-4 h-4" />
                Back to workspace
              </button>
              <div className="flex items-center gap-4">
                <button type="button"
                  onClick={() => navigate(`/onboarding?workspaceId=${workspaceId}&edit=1`)}
                  className="text-sm text-slate-600 hover:text-blue-400 transition-colors">
                  Edit onboarding
                </button>
                <button type="button" onClick={exitAndSave}
                  className="text-sm text-slate-600 hover:text-blue-400 transition-colors">
                  Save &amp; exit
                </button>
              </div>
            </div>
          )}

          <JourneyTimeline current="brief" workspaceId={workspaceId || null} />

          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Challenge Brief</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Advisory brief builder</h1>
              <p className="text-sm text-slate-400 mt-1.5 max-w-lg">
                Build an engagement brief that powers all 27 HC studios with your client context.
              </p>
            </div>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl flex-shrink-0 mt-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STEPS.map((s, i) => {
              const isActive = i === stepIndex; const isDone = i < stepIndex; const Icon = s.icon
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <button type="button" onClick={() => isDone && setStepIndex(i)}
                    className={cn('inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all',
                      isActive ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_14px_rgba(59,130,246,0.35)]' :
                      isDone ? 'bg-blue-600/12 border-blue-500/30 text-blue-400 cursor-pointer hover:bg-blue-600/20' :
                      'bg-[#131720] border-[#1e2433] text-slate-500 cursor-default')}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{s.shortLabel}</span>
                    <span className="sm:hidden">{i + 1}</span>
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />}
                </div>
              )
            })}
          </div>

          {/* Progress */}
          <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
              animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Step body */}
          <div className="rounded-2xl border border-[#1a1e2e] bg-[#0f1117] p-6 sm:p-8 shadow-[0_4px_32px_rgba(0,0,0,0.4)]">
            <AnimatePresence mode="wait">
              <motion.div key={stepIndex} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18 }}>
                {stepIndex === 0 && <StepOrg value={brief.organization} onChange={v => updateBrief({ ...brief, organization: v })} prefilled={orgPrefilled} />}
                {stepIndex === 1 && <StepSituation value={brief.businessSituation} onChange={v => updateBrief({ ...brief, businessSituation: v })} />}
                {stepIndex === 2 && <StepHcChallenges value={brief.hcChallenges} onChange={v => updateBrief({ ...brief, hcChallenges: v })} />}
                {stepIndex === 3 && (
                  <StepAdvisoryQuestions
                    questions={brief.advisoryQuestions}
                    constraints={brief.constraints}
                    selectedAreas={brief.hcChallenges.selectedAreas.map(a => a.area)}
                    onQuestionsChange={v => updateBrief({ ...brief, advisoryQuestions: v })}
                    onConstraintsChange={v => updateBrief({ ...brief, constraints: v })}
                  />
                )}
                {stepIndex === 4 && <StepDesiredOutputs value={brief.desiredOutputs} onChange={v => updateBrief({ ...brief, desiredOutputs: v })} />}
                {stepIndex === 5 && <StepReview brief={brief} onLaunch={completeBrief} launching={launching} launchError={launchError} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="lg" onClick={back} disabled={isFirst} leftIcon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
            <div className="flex items-center gap-4">
              <SaveIndicator status={briefSaveStatus} />
              <span className="text-sm text-slate-600 font-medium">Step {stepIndex + 1} of {STEPS.length}</span>
              {!isLast && (
                <Button size="lg" onClick={advance} rightIcon={<ArrowRight className="w-4 h-4" />}>Save & continue</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Profile → Brief mapping helpers ───────────────────────────────────────

function mapIndustry(v: string): OrgIndustry {
  const map: Record<string, OrgIndustry> = {
    'oil-gas': 'oil-gas', 'banking-finance': 'banking-finance', healthcare: 'healthcare-pharma',
    'public-sector': 'public-sector', retail: 'retail-consumer', telco: 'telecom',
    tech: 'technology-software', manufacturing: 'manufacturing', education: 'education',
    hospitality: 'hospitality', 'professional-services': 'professional-services',
    'transport-logistics': 'transportation-logistics', 'real-estate': 'construction-real-estate',
    utilities: 'energy-utilities',
  }
  return map[v] ?? 'other'
}

function mapRegion(v: string): OrgRegion {
  const map: Record<string, OrgRegion> = {
    gcc: 'gcc', mena: 'mena', africa: 'africa', europe: 'europe',
    americas: 'north-america', 'asia-pacific': 'asia-pacific', global: 'global',
  }
  return map[v] ?? 'other'
}

function mapSize(v: string): OrgSize {
  const map: Record<string, OrgSize> = { micro: 'small', small: 'small', mid: 'mid', large: 'large', enterprise: 'enterprise' }
  return map[v] ?? 'mid'
}

function mapMaturity(v: string): OrgMaturityStage {
  const map: Record<string, OrgMaturityStage> = { startup: 'startup', growth: 'growth', scale: 'scaling', mature: 'mature', restructuring: 'transformation' }
  return map[v] ?? 'mature'
}

function mapOperatingModel(v: string): OrgOperatingModel {
  const map: Record<string, OrgOperatingModel> = {
    'single-entity': 'single-entity', 'multi-entity': 'multi-entity',
    'gcc-shared-services': 'matrix', holding: 'holding-group', 'joint-venture': 'joint-venture',
  }
  return map[v] ?? 'single-entity'
}

function mapDrivers(priorities: string[]): StrategicDriver[] {
  const map: Record<string, StrategicDriver> = {
    growth: 'growth', 'cost-efficiency': 'cost-optimization', 'digital-transformation': 'digital-disruption',
    'm-and-a': 'merger-acquisition', 'esg-sustainability': 'sustainability-esg',
    nationalization: 'nationalization', resilience: 'restructuring',
  }
  return priorities.map(p => map[p]).filter(Boolean) as StrategicDriver[]
}

function mapUrgency(v: string): TimeHorizon {
  const map: Record<string, TimeHorizon> = {
    immediate: 'immediate', 'this-week': 'immediate', 'this-month': 'short-term',
    'this-quarter': 'medium-term', exploratory: 'long-term',
  }
  return map[v] ?? 'medium-term'
}

function mapHcAreas(priorities: string[]): ChallengeAreaSelection[] {
  const map: Record<string, HcChallengeArea> = {
    'workforce-planning': 'workforce-planning', 'leadership-development': 'leadership',
    'succession-planning': 'succession', 'employee-experience': 'employee-experience',
    'rewards-strategy': 'rewards', 'skills-capability': 'capability-skills',
    'talent-acquisition': 'talent-acquisition', 'performance-management': 'performance',
    'learning-development': 'learning-training', nationalization: 'governance-operating-model',
    'organization-design': 'organization-design', 'change-management': 'culture-change-readiness',
    'hr-operating-model': 'governance-operating-model',
  }
  return priorities
    .map(p => map[p]).filter(Boolean)
    .map(area => ({ area: area as HcChallengeArea, severity: 'moderate' as ChallengeSeverity, notes: '' }))
}

function mapOutputTypes(types: string[]): DesiredOutputType[] {
  const map: Record<string, DesiredOutputType> = {
    'exec-deck': 'executive-deck', 'board-pack': 'executive-deck', playbook: 'playbook',
    infographic: 'infographic', 'narrative-report': 'consulting-report', 'operational-toolkit': 'implementation-plan',
  }
  return types.map(t => map[t]).filter(Boolean) as DesiredOutputType[]
}
