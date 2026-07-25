import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, Users, FileSearch,
  ArrowRight, ArrowLeft, Check, Plus, X, ChevronRight, Upload, FileText,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { cn } from '../lib/utils'
import { useOnboardingCompletions } from '../store/onboardingCompletions'
import { onboardingAPI } from '../lib/api'
import { hcAiAdvisoryAPI } from '../lib/hcPlatformApi'
import { useAutosave } from '../hooks/useAutosave'
import { SaveIndicator } from '../components/ui/SaveIndicator'
import { JourneyTimeline } from '../components/journey/JourneyTimeline'
import {
  useClientProfileStore,
  defaultProfile,
  type ClientProfile,
  type BusinessPriority,
  type HcPriority,
  type TransformationAgendaItem,
  type WorkforceChallenge,
  type TalentChallenge,
  type LeadershipChallenge,
  type ExRewardChallenge,
  type NationalizationProgram,
  type RateBand,
  type AvailableDocument,
  type PreferredOutputType,
  type ClientAudience,
  type ConfidentialityLevel,
  type UrgencyBand,
} from '../store/clientProfile'

// ── Option labels ──────────────────────────────────────────────────────────

const BUSINESS_PRIORITY_LABELS: Record<BusinessPriority, string> = {
  growth: 'Growth', 'cost-efficiency': 'Cost & efficiency', resilience: 'Resilience',
  'esg-sustainability': 'ESG & sustainability', 'digital-transformation': 'Digital transformation',
  'm-and-a': 'M&A', 'customer-experience': 'Customer experience', innovation: 'Innovation',
  'operational-excellence': 'Operational excellence', 'risk-compliance': 'Risk & compliance',
  'talent-capability': 'Talent & capability', 'geographic-expansion': 'Geographic expansion',
}

const HC_PRIORITY_LABELS: Record<HcPriority, string> = {
  'workforce-planning': 'Workforce planning', 'leadership-development': 'Leadership development',
  'succession-planning': 'Succession planning', 'employee-experience': 'Employee experience',
  'rewards-strategy': 'Rewards strategy', 'skills-capability': 'Skills & capability',
  'talent-acquisition': 'Talent acquisition', 'performance-management': 'Performance management',
  'learning-development': 'Learning & development', nationalization: 'Nationalization',
  'diversity-inclusion': 'Diversity & inclusion', 'organization-design': 'Organization design',
  'change-management': 'Change management', 'hr-operating-model': 'HR operating model',
}

const TRANSFORMATION_LABELS: Record<TransformationAgendaItem, string> = {
  digital: 'Digital', cultural: 'Cultural', 'operating-model': 'Operating model',
  'm-and-a-integration': 'M&A integration', 'post-merger': 'Post-merger',
  'cost-optimization': 'Cost optimization', 'growth-acceleration': 'Growth acceleration',
  'esg-transformation': 'ESG transformation', 'regulatory-driven': 'Regulatory-driven', none: 'Other (please specify)',
}

const WORKFORCE_CHALLENGE_LABELS: Record<WorkforceChallenge, string> = {
  'high-attrition': 'High attrition', scarcity: 'Talent scarcity',
  'contractor-heavy': 'Contractor-heavy', 'aging-workforce': 'Ageing workforce',
  'skill-mismatch': 'Skill mismatch', 'engagement-decline': 'Engagement decline',
  'remote-hybrid-strain': 'Remote / hybrid strain', 'diversity-gaps': 'Diversity gaps',
  'productivity-decline': 'Productivity decline', none: 'Other (please specify)',
}

const TALENT_CHALLENGE_LABELS: Record<TalentChallenge, string> = {
  'hipo-gap': 'HiPo gap', 'succession-risk': 'Succession risk',
  'niche-skills-shortage': 'Niche skills shortage', 'leadership-bench-thin': 'Leadership bench thin',
  'external-hire-dependency': 'External hire dependency',
  'retention-of-critical-talent': 'Retention of critical talent',
  'graduate-pipeline': 'Graduate pipeline', none: 'Other (please specify)',
}

const LEADERSHIP_CHALLENGE_LABELS: Record<LeadershipChallenge, string> = {
  'succession-risk': 'Succession risk', 'limited-bench': 'Limited bench',
  'leadership-quality': 'Leadership quality', 'transition-failures': 'Transition failures',
  'executive-misalignment': 'Executive misalignment',
  'leadership-development-gap': 'Leadership development gap', none: 'Other (please specify)',
}

const EX_REWARD_LABELS: Record<ExRewardChallenge, string> = {
  'engagement-decline': 'Engagement decline', 'pay-equity': 'Pay equity',
  'benefits-competitiveness': 'Benefits competitiveness', 'ex-journey-friction': 'EX journey friction',
  'culture-misalignment': 'Culture misalignment', 'wellbeing-concerns': 'Wellbeing concerns',
  'rewards-cost-pressure': 'Rewards cost pressure', 'incentive-misalignment': 'Incentive misalignment',
  none: 'Other (please specify)',
}

const NATIONALIZATION_LABELS: Record<NationalizationProgram, string> = {
  emiratisation: 'Emiratisation (UAE)', saudization: 'Saudization (KSA)',
  qatarization: 'Qatarization (Qatar)', omanisation: 'Omanisation (Oman)',
  bahrainisation: 'Bahrainisation (Bahrain)', kuwaitisation: 'Kuwaitisation (Kuwait)',
  other: 'Other',
}

const RATE_BAND_LABELS: Record<RateBand, string> = {
  '0-10': '0-10%', '10-25': '10-25%', '25-50': '25-50%',
  '50-75': '50-75%', '75-100': '75-100%', unknown: 'Unknown',
}

const FOUNDATION_LABELS: Record<string, string> = {
  'career-paths': 'Career paths', 'job-families': 'Job families',
  'skills-profiles': 'Skills profiles', 'mobility-policy': 'Internal mobility policy',
  'internal-job-board': 'Internal job posting', 'succession-plans': 'Succession plans',
  'competency-framework': 'Competency framework', none: 'None of these yet',
}

const AVAILABLE_DOC_LABELS: Record<AvailableDocument, string> = {
  'strategy-deck': 'Strategy deck', 'org-chart': 'Org chart', 'hc-policy': 'HC policy',
  'engagement-survey': 'Engagement survey', 'exit-data': 'Exit data', 'comp-bands': 'Comp bands',
  'competency-framework': 'Competency framework', 'succession-plan': 'Succession plan',
  'training-catalog': 'Training catalog', 'kpi-dashboard': 'KPI dashboard',
  'previous-assessment': 'Previous assessment', other: 'Other',
}

const OUTPUT_LABELS: Record<PreferredOutputType, string> = {
  'exec-deck': 'Executive deck', 'board-pack': 'Board pack', playbook: 'Playbook',
  infographic: 'Infographic', 'narrative-report': 'Narrative report',
  'operational-toolkit': 'Operational toolkit',
}

const AUDIENCE_LABELS: Record<ClientAudience, string> = {
  board: 'Board', 'exec-committee': 'Executive committee', 'hr-leadership': 'HR leadership',
  'line-managers': 'Line managers', employees: 'Employees', external: 'External',
}

const CONFIDENTIALITY_LABELS: Record<ConfidentialityLevel, string> = {
  internal: 'Internal', restricted: 'Restricted', confidential: 'Confidential',
  'strictly-confidential': 'Strictly confidential',
}

const URGENCY_LABELS: Record<UrgencyBand, string> = {
  exploratory: 'Exploratory', 'this-quarter': 'This quarter', 'this-month': 'This month',
  'this-week': 'This week', immediate: 'Immediate',
}

// ── Shared UI components ───────────────────────────────────────────────────

function ChipGroup<T extends string>({
  label, description, options, labels, value, onChange,
  otherKey, otherValue, onOtherText,
}: {
  label: string
  description?: string
  options: T[]
  labels: Record<T, string>
  value: T[]
  onChange: (next: T[]) => void
  // When the option keyed `otherKey` is selected, reveal a free-text area that
  // writes through onOtherText. Lets the user add anything not in the presets.
  otherKey?: T
  otherValue?: string
  onOtherText?: (text: string) => void
}) {
  const toggle = (opt: T) =>
    onChange(value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt])
  const showOther = !!otherKey && !!onOtherText && value.includes(otherKey)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={cn(
              'px-3.5 py-2 rounded-xl text-sm font-medium border transition-all',
              value.includes(opt)
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                : 'bg-[#131720] border-[#1e2433] text-slate-400 hover:border-[#2a3048] hover:text-slate-300 hover:bg-[#161b28]'
            )}>
            {labels[opt]}
          </button>
        ))}
      </div>
      {showOther && (
        <textarea
          value={otherValue ?? ''}
          onChange={e => onOtherText!(e.target.value)}
          rows={2}
          placeholder={`Describe your other ${label.toLowerCase()}...`}
          className="w-full rounded-xl bg-[#0c0e14] border border-[#1e2433] text-sm text-white placeholder:text-slate-600 px-3.5 py-2.5 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
        />
      )}
    </div>
  )
}

function SelectField<T extends string>({
  label, options, labels, value, onChange, placeholder,
}: {
  label: string
  options: T[]
  labels: Record<T, string>
  value: T | ''
  onChange: (v: T) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label>
      <select
        value={value}
        onChange={e => { if (e.target.value) onChange(e.target.value as T) }}
        className={cn(
          'w-full rounded-xl border border-[#1e2433] bg-[#131720] px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60 hover:border-[#252d3f] transition-all',
          value ? 'text-white' : 'text-slate-500'
        )}
      >
        <option value="" className="bg-[#131720] text-slate-500">{placeholder ?? `Select ${label.toLowerCase()}...`}</option>
        {options.map(opt => (
          <option key={opt} value={opt} className="bg-[#131720] text-white">{labels[opt]}</option>
        ))}
      </select>
    </div>
  )
}

// ── Step 1: Priorities ─────────────────────────────────────────────────────

function StepPriorities({ value, onChange }: {
  value: ClientProfile['agenda']
  onChange: (v: ClientProfile['agenda']) => void
}) {
  const [draft, setDraft] = useState('')
  const addPainPoint = () => {
    const t = draft.trim()
    if (!t || value.keyPainPoints.includes(t) || value.keyPainPoints.length >= 12) return
    onChange({ ...value, keyPainPoints: [...value.keyPainPoints, t] })
    setDraft('')
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">What's on the agenda?</h2>
        <p className="text-sm text-slate-400 mt-1">Pick the business and human-capital priorities that matter most this cycle.</p>
      </div>
      <ChipGroup label="Business priorities" description="Top-of-mind objectives at the enterprise level." options={Object.keys(BUSINESS_PRIORITY_LABELS) as BusinessPriority[]} labels={BUSINESS_PRIORITY_LABELS} value={value.businessPriorities} onChange={next => onChange({ ...value, businessPriorities: next })} />
      <ChipGroup label="Human-capital priorities" description="What does the people agenda need to deliver?" options={Object.keys(HC_PRIORITY_LABELS) as HcPriority[]} labels={HC_PRIORITY_LABELS} value={value.hcPriorities} onChange={next => onChange({ ...value, hcPriorities: next })} />
      <ChipGroup label="Transformation agenda" description="Active or upcoming transformation themes." options={Object.keys(TRANSFORMATION_LABELS) as TransformationAgendaItem[]} labels={TRANSFORMATION_LABELS} value={value.transformationAgenda} onChange={next => onChange({ ...value, transformationAgenda: next })} otherKey={'none' as TransformationAgendaItem} otherValue={value.transformationAgendaOther} onOtherText={t => onChange({ ...value, transformationAgendaOther: t })} />
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Key pain points</p>
        <p className="text-xs text-slate-500">Short statements work best (e.g. "Frontline attrition above 18%"). Up to 12 entries.</p>
        <div className="flex gap-2">
          <Input placeholder="Describe a pain point and press Enter" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPainPoint() } }} />
          <Button variant="secondary" onClick={addPainPoint} disabled={!draft.trim() || value.keyPainPoints.length >= 12} leftIcon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
        </div>
        {value.keyPainPoints.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {value.keyPainPoints.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131720] border border-[#1e2433] text-xs text-slate-300">
                {p}
                <button type="button" onClick={() => onChange({ ...value, keyPainPoints: value.keyPainPoints.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-600">{value.keyPainPoints.length} / 12</p>
      </div>
    </div>
  )
}

// ── Step 3: Workforce ──────────────────────────────────────────────────────

function StepWorkforce({ value, onChange }: {
  value: ClientProfile['workforceContext']
  onChange: (v: ClientProfile['workforceContext']) => void
}) {
  const patch = <K extends keyof ClientProfile['workforceContext']>(k: K, v: ClientProfile['workforceContext'][K]) =>
    onChange({ ...value, [k]: v })
  const patchNat = <K extends keyof ClientProfile['workforceContext']['nationalizationContext']>(k: K, v: ClientProfile['workforceContext']['nationalizationContext'][K]) =>
    onChange({ ...value, nationalizationContext: { ...value.nationalizationContext, [k]: v } })
  const isNatApplicable = value.nationalizationContext.applicable

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Workforce challenges & nationalization</h2>
        <p className="text-sm text-slate-400 mt-1">Tell us where the friction is to weight recommendations that move the needle fastest.</p>
      </div>
      <ChipGroup label="Workforce challenges" options={Object.keys(WORKFORCE_CHALLENGE_LABELS) as WorkforceChallenge[]} labels={WORKFORCE_CHALLENGE_LABELS} value={value.workforceChallenges} onChange={next => patch('workforceChallenges', next)} otherKey={'none' as WorkforceChallenge} otherValue={value.workforceChallengesOther} onOtherText={t => patch('workforceChallengesOther', t)} />
      <ChipGroup label="Talent challenges" options={Object.keys(TALENT_CHALLENGE_LABELS) as TalentChallenge[]} labels={TALENT_CHALLENGE_LABELS} value={value.talentChallenges} onChange={next => patch('talentChallenges', next)} otherKey={'none' as TalentChallenge} otherValue={value.talentChallengesOther} onOtherText={t => patch('talentChallengesOther', t)} />
      <ChipGroup label="Leadership challenges" options={Object.keys(LEADERSHIP_CHALLENGE_LABELS) as LeadershipChallenge[]} labels={LEADERSHIP_CHALLENGE_LABELS} value={value.leadershipChallenges} onChange={next => patch('leadershipChallenges', next)} otherKey={'none' as LeadershipChallenge} otherValue={value.leadershipChallengesOther} onOtherText={t => patch('leadershipChallengesOther', t)} />
      <ChipGroup label="Employee experience & rewards challenges" options={Object.keys(EX_REWARD_LABELS) as ExRewardChallenge[]} labels={EX_REWARD_LABELS} value={value.exRewardChallenges} onChange={next => patch('exRewardChallenges', next)} otherKey={'none' as ExRewardChallenge} otherValue={value.exRewardChallengesOther} onOtherText={t => patch('exRewardChallengesOther', t)} />

      <div className="rounded-xl border border-[#1e2433] bg-[#0a0c12] p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">Nationalization program in scope?</p>
            <p className="text-xs text-slate-500 mt-0.5">Emiratisation, Saudization, Qatarization, Omanisation, Bahrainisation or Kuwaitisation.</p>
          </div>
          <button type="button" onClick={() => patchNat('applicable', !isNatApplicable)}
            className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0', isNatApplicable ? 'bg-blue-600' : 'bg-[#1e2433]')}>
            <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', isNatApplicable ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>
        {isNatApplicable && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#1e2433]">
            <SelectField label="Program" options={Object.keys(NATIONALIZATION_LABELS) as NationalizationProgram[]} labels={NATIONALIZATION_LABELS} value={(value.nationalizationContext.programName ?? 'emiratisation') as NationalizationProgram} onChange={v => patchNat('programName', v)} />
            <SelectField label="Current rate band" options={Object.keys(RATE_BAND_LABELS) as RateBand[]} labels={RATE_BAND_LABELS} value={(value.nationalizationContext.currentRateBand ?? 'unknown') as RateBand} onChange={v => patchNat('currentRateBand', v)} />
            <SelectField label="Target rate band" options={Object.keys(RATE_BAND_LABELS) as RateBand[]} labels={RATE_BAND_LABELS} value={(value.nationalizationContext.targetRateBand ?? 'unknown') as RateBand} onChange={v => patchNat('targetRateBand', v)} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Evidence & Outputs ─────────────────────────────────────────────

const EVIDENCE_ACCEPT = '.pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.csv,.png,.jpg,.jpeg'

function StepEvidence({ workspaceId, evidence, onChangeEvidence }: {
  workspaceId: string
  evidence: ClientProfile['evidence']
  onChangeEvidence: (v: ClientProfile['evidence']) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const files = evidence.uploadedFiles ?? []

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    setError(null)
    const uploaded: { evidence_id: string; filename: string }[] = []
    for (const file of Array.from(fileList)) {
      try {
        const res = await hcAiAdvisoryAPI.uploadEvidence(file)
        uploaded.push({ evidence_id: res.data.evidence_id, filename: res.data.filename })
      } catch {
        setError(`Could not upload "${file.name}". Supported: PDF, Word, PowerPoint, Excel, text and images (up to 10MB each).`)
      }
    }
    if (uploaded.length) {
      onChangeEvidence({ ...evidence, uploadedFiles: [...files, ...uploaded] })
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (id: string) =>
    onChangeEvidence({ ...evidence, uploadedFiles: files.filter(f => f.evidence_id !== id) })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Upload your evidence</h2>
        <p className="text-sm text-slate-400 mt-1">Add any documents you can share - strategy decks, org charts, HC policies, engagement surveys, exit data, comp bands. The AI Advisory reads and grounds its analysis in them.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !workspaceId}
        className={cn(
          'w-full rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center gap-2 transition-colors',
          uploading ? 'border-blue-500/40 bg-blue-500/5 cursor-wait' : 'border-[#2a3048] bg-[#0c0e14] hover:border-blue-500/50 hover:bg-blue-500/5'
        )}
      >
        {uploading ? (
          <span className="w-6 h-6 rounded-full border-2 border-[#1e2433] border-t-blue-500 animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-blue-400" />
        )}
        <p className="text-sm font-semibold text-white">{uploading ? 'Uploading...' : 'Click to upload files'}</p>
        <p className="text-xs text-slate-500">Multiple files, multiple types - PDF, Word, PowerPoint, Excel, text, images</p>
      </button>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Uploaded ({files.length})</p>
          {files.map(f => (
            <div key={f.evidence_id} className="flex items-center gap-3 rounded-xl border border-[#1e2433] bg-[#0f1117] px-3.5 py-2.5">
              <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="text-sm text-slate-200 truncate flex-1">{f.filename}</span>
              <button type="button" onClick={() => removeFile(f.evidence_id)} className="text-slate-500 hover:text-rose-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Textarea label="Notes about evidence (optional)" rows={3} placeholder="e.g. Engagement survey is 11 months old; comp bands cover GCC only." value={evidence.notes ?? ''} onChange={e => onChangeEvidence({ ...evidence, notes: e.target.value || undefined })} />
    </div>
  )
}

// ── Step metadata ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 'priorities', shortLabel: 'Priorities', icon: Target },
  { id: 'workforce', shortLabel: 'Workforce', icon: Users },
  { id: 'evidence', shortLabel: 'Evidence', icon: FileSearch },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? ''
  // ?edit=1 opens the form for editing even when onboarding is already
  // complete (used by the brief's "Edit onboarding" link) - answers are kept.
  const editMode = searchParams.get('edit') === '1'

  const { profile: storedProfile, isCompleted, save, markCompleted, setActiveWorkspace } = useClientProfileStore()

  // Switch the profile store to this workspace's record before reading anything.
  // This ensures the form shows the right workspace's saved answers, never the
  // last workspace's data.
  useEffect(() => {
    setActiveWorkspace(workspaceId || null)
  }, [workspaceId, setActiveWorkspace])

  const { isCompleted: isWsCompleted, markCompleted: markWsCompleted } = useOnboardingCompletions()
  const finishingRef = useRef(false)

  // Guard: only skip if THIS workspace's onboarding is done.
  // The global isCompleted flag stays set across engagements, so we must scope
  // the skip to the workspace; otherwise creating a new workspace silently jumps
  // to the brief and the form appears auto-filled from the prior engagement.
  useEffect(() => {
    if (editMode || finishingRef.current) return
    if (workspaceId) {
      if (isWsCompleted(workspaceId)) {
        navigate(`/workspaces/${workspaceId}`, { replace: true })
      }
    } else if (isCompleted) {
      navigate('/advisor', { replace: true })
    }
  }, [isCompleted, workspaceId, editMode, navigate]) // eslint-disable-line

  // Seed draft from this workspace's stored profile.
  const [draft, setDraft] = useState<ClientProfile>(() => ({ ...defaultProfile(), ...storedProfile, organization: { ...defaultProfile().organization, ...storedProfile.organization } }))
  const [stepIndex, setStepIndex] = useState(0)

  // When the workspace changes, hard-reset the local draft to that workspace's
  // stored record (fresh defaults if it's a brand-new workspace).
  useEffect(() => {
    setDraft({ ...defaultProfile(), ...storedProfile, organization: { ...defaultProfile().organization, ...storedProfile.organization } })
    setStepIndex(0)
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Server-side resumable state — load on mount, scoped to this workspace
  useEffect(() => {
    onboardingAPI.get(workspaceId || undefined).then(res => {
      const remote = (res.data?.state ?? {}) as Partial<ClientProfile> & { _stepIndex?: number }
      if (remote && Object.keys(remote).length > 0) {
        setDraft(d => ({ ...d, ...remote, organization: { ...d.organization, ...(remote.organization ?? {}) } }))
        if (typeof remote._stepIndex === 'number') setStepIndex(remote._stepIndex)
      }
    }).catch(() => {})
  }, [workspaceId])

  const autosavePayload = useMemo(() => ({ ...draft, _stepIndex: stepIndex }), [draft, stepIndex])
  const onSaveOnboarding = useCallback(async (v: typeof autosavePayload) => {
    let clean: Record<string, unknown> = {}
    try { clean = JSON.parse(JSON.stringify(v)) } catch { clean = {} }
    await onboardingAPI.save(clean, workspaceId || undefined)
  }, [workspaceId])
  const { status: saveStatus } = useAutosave({ value: autosavePayload, onSave: onSaveOnboarding, delay: 800 })

  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  const advance = () => { save(draft); setStepIndex(s => Math.min(STEPS.length - 1, s + 1)) }
  const back = () => setStepIndex(s => Math.max(0, s - 1))
  const finish = () => {
    finishingRef.current = true
    save(draft)
    markCompleted()
    if (workspaceId) markWsCompleted(workspaceId)
    const dest = workspaceId
      ? `/challenge-brief?workspaceId=${workspaceId}`
      : '/challenge-brief'
    navigate(dest)
  }

  const variants = {
    enter: { opacity: 0, x: 24, filter: 'blur(4px)' },
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, x: -24, filter: 'blur(4px)' },
  }

  const exitAndSave = () => {
    save(draft)
    // Workspace hub redirects onward (to the brief) until the brief is done -
    // exit to the Workspaces list instead so Back never bounces the user around.
    navigate('/workspaces')
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
              <button type="button" onClick={exitAndSave}
                className="text-sm text-slate-600 hover:text-blue-400 transition-colors">
                Save &amp; exit
              </button>
            </div>
          )}

          <JourneyTimeline current="onboarding" workspaceId={workspaceId || null} />

          {/* Page header */}
          <div className="text-center pb-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
              <Target className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">Client Onboarding</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Build your client profile</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              Your answers unlock smarter recommendations across all 27 HC studios.
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {STEPS.map((s, i) => {
              const isActive = i === stepIndex
              const isDone = i < stepIndex
              const Icon = s.icon
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => isDone && setStepIndex(i)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all',
                      isActive ? 'bg-blue-600 border-blue-600 text-white shadow-[0_0_16px_rgba(59,130,246,0.35)]' :
                      isDone ? 'bg-blue-600/12 border-blue-500/30 text-blue-400 cursor-pointer hover:bg-blue-600/20' :
                      'bg-[#131720] border-[#1e2433] text-slate-500 cursor-default'
                    )}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{s.shortLabel}</span>
                    <span className="sm:hidden">{i + 1}</span>
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-700 flex-shrink-0" />}
                </div>
              )
            })}
          </div>

          {/* Progress bar */}
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
              <motion.div key={stepIndex} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
                {stepIndex === 0 && <StepPriorities value={draft.agenda} onChange={v => setDraft({ ...draft, agenda: v })} />}
                {stepIndex === 1 && <StepWorkforce value={draft.workforceContext} onChange={v => setDraft({ ...draft, workforceContext: v })} />}
                {stepIndex === 2 && <StepEvidence workspaceId={workspaceId} evidence={draft.evidence} onChangeEvidence={v => setDraft({ ...draft, evidence: v })} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="lg" onClick={back} disabled={isFirst} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back
            </Button>
            <div className="flex items-center gap-4">
              <SaveIndicator status={saveStatus} />
              <span className="text-sm text-slate-600 font-medium">Step {stepIndex + 1} of {STEPS.length}</span>
              {isLast ? (
                <Button size="lg" onClick={finish} leftIcon={<Check className="w-4 h-4" />}>
                  Save & go to brief
                </Button>
              ) : (
                <Button size="lg" onClick={advance} rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Save & continue
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
