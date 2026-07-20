import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Building2, Zap, Download, ShieldCheck, Search,
  ChevronLeft, ChevronRight, Filter, Pencil, X, Save, Check,
  CreditCard, BookOpen, ChevronDown, ChevronUp, Plus, Trash2,
  Tag, Bot, Brain, TrendingUp, Activity, AlertTriangle, Layers,
  Cpu, Globe, BarChart2, RefreshCw, FolderPlus, Sparkles,
  ArrowUpRight, Eye, Settings2, Database, Upload, Link2, FileText,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useSkillKb } from '../store/skillKnowledgeBase'
import { useCategorySkills } from '../store/categorySkills'
import { Input, Textarea } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { adminAPI } from '../lib/api'
import { AnimatedSection, fadeUp, staggerContainer } from '../lib/animations'
import { cn } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  total_tenants: number
  active_users_today: number
  ai_jobs_today: number
  total_exports: number
}

interface Skill {
  id: string
  name: string
  slug?: string
  category: string
  tier: 'starter' | 'professional' | 'enterprise' | 'advisory'
  credit_cost: number
  enabled: boolean
  instructions?: string
  /** The studio's report master instruction (the "skill file" that drives report generation). */
  report_spec?: string
  has_report_spec?: boolean
  llm_model?: string
  is_custom?: boolean
  description?: string
}

interface SkillCategory {
  id: string
  name: string
  description?: string
  color: string
  skill_ids: string[]
}

interface AdminUser {
  id: string
  name: string
  email: string
  tenant: string
  plan: string
  level: number
  xp: number
  role: string
  credits?: number
  created_at: string
}

interface AuditEntry {
  id: string
  timestamp: string
  user: string
  action: string
  resource: string
  ip: string
  payload?: {
    phase?: string
    ai_job_id?: string
    workspace_id?: string
    skill?: { id?: string; slug?: string; name?: string }
    user_input?: Record<string, unknown>
    memory_snapshot?: Record<string, unknown>
    agent?: { model?: string; provider?: string }
    output_summary?: string
  }
}

interface SkillInsight {
  total_runs: number
  unique_users: number
  avg_satisfaction: number
  common_gaps: string[]
  trending_topics: string[]
  suggested_improvements: string[]
  usage_trend: 'rising' | 'stable' | 'declining'
  last_evolved?: string
}

interface LlmConfig {
  global_model: string
  skill_overrides: Record<string, string>
}

type AdminTab = 'skills' | 'categories' | 'llm' | 'users' | 'audit'

// ─── LLM Options ──────────────────────────────────────────────────────────────

// Only models the configured OpenAI key can actually serve. The backend
// verifies the model with a live test call before saving, so an unavailable
// model is rejected instead of silently breaking the advisor.
const LLM_OPTIONS = [
  { id: 'gpt-5.1',       label: 'GPT-5.1',       provider: 'OpenAI', badge: 'Recommended' },
  { id: 'gpt-5.2',       label: 'GPT-5.2',       provider: 'OpenAI', badge: 'Deepest'      },
  { id: 'gpt-5',         label: 'GPT-5',         provider: 'OpenAI', badge: 'Reasoning'    },
  { id: 'gpt-5-mini',    label: 'GPT-5 Mini',    provider: 'OpenAI', badge: 'Fast'         },
  { id: 'gpt-4.1',       label: 'GPT-4.1',       provider: 'OpenAI', badge: 'Long Context' },
  { id: 'gpt-4o',        label: 'GPT-4o',        provider: 'OpenAI', badge: ''             },
]

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  OpenAI:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  Google:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  Mistral:   'text-violet-400 bg-violet-500/10 border-violet-500/20',
}

const CATEGORY_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#84cc16']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function getLlmLabel(id?: string) {
  if (!id) return null
  return LLM_OPTIONS.find(m => m.id === id) ?? null
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, index, loading }: {
  label: string; value: string | number; icon: React.ElementType; index: number; loading: boolean
}) {
  return (
    <motion.div variants={fadeUp} custom={index}>
      <div className="rounded-xl p-5 flex flex-col gap-3 bg-[#131720] border border-[#1e2433]">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#1e2433]">
          <Icon className="w-[18px] h-[18px] text-blue-400" />
        </div>
        {loading ? (
          <><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-28" /></>
        ) : (
          <><div className="text-2xl font-bold text-white">{value}</div>
          <div className="text-sm text-slate-400">{label}</div></>
        )}
      </div>
    </motion.div>
  )
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={enabled} onClick={onToggle}
      className="relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{ backgroundColor: enabled ? '#3b82f6' : '#1e2433' }}>
      <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(4px)' }} />
    </button>
  )
}

// ─── Inline Credit Editor ─────────────────────────────────────────────────────

function InlineCreditEditor({ value, onSave }: {
  value: number
  onSave: (v: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => { setDraft(String(value)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }

  const commit = async () => {
    const num = parseInt(draft, 10)
    if (isNaN(num) || num < 0 || num === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(num)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input ref={inputRef} type="number" min={0} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-20 bg-[#0c0e14] border border-blue-500/50 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-400 text-center" />
        <button onClick={commit} disabled={saving}
          className="w-6 h-6 rounded flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white transition-colors flex-shrink-0">
          {saving ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
            : <Check className="w-3 h-3" />}
        </button>
        <button onClick={() => setEditing(false)}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <button onClick={open}
      className={cn('flex items-center gap-1.5 group transition-colors',
        saved ? 'text-green-400' : 'text-slate-300 hover:text-white')}>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      {saved
        ? <Check className="w-3 h-3 text-green-400" />
        : <Pencil className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" />}
    </button>
  )
}

// ─── Default Instructions ─────────────────────────────────────────────────────

const GLOBAL_DEFAULT = `You are an expert Human Capital (HC) advisor at Aivora HC. You help senior HR leaders and executives make evidence-based decisions about their workforce.

Tone & style:
- Executive-ready: concise, confident, data-informed
- Use structured output: headlines, bullet points, clear sections
- Avoid jargon; define acronyms on first use
- Always contextualise advice to the client's industry, size, and maturity stage

Output format:
- Lead with a 2-3 sentence executive summary
- Follow with structured findings or recommendations
- Close with 2-3 prioritised next steps

Constraints:
- Do not fabricate benchmarks; caveat any estimates
- Flag where additional data would improve confidence
- Maintain confidentiality framing appropriate to the client's stated level`

const DEFAULT_INSTRUCTIONS: Record<string, string> = {
  'hc framework': `You are an expert HC Strategy advisor. When generating an HC Framework output:\n\n1. Open with the strategic context (industry, size, maturity stage)\n2. Map the HC framework across four pillars: Talent Acquisition, Development, Performance, and Retention\n3. For each pillar, identify: current state, gap, and recommended intervention\n4. Prioritise interventions by impact (High / Medium / Low) and effort (Quick Win / Strategic / Long-term)\n5. Close with a one-page executive summary table\n\nTone: Board-ready, structured, evidence-based.`,
  'succession planning': `You are a Succession Planning specialist. Structure all outputs as follows:\n\n1. Critical Role Identification\n2. Pipeline Assessment: Ready Now / 1-2yr / 3-5yr\n3. Development Actions: per successor, 3 targeted priorities\n4. Risk Heatmap: visualise coverage gaps\n5. Board Narrative: one paragraph suitable for a Talent Committee report`,
  'workforce planning': `You are a Strategic Workforce Planning advisor. All outputs must include:\n\n1. Demand forecast (1-3yr horizon)\n2. Supply analysis (attrition risk, retirement exposure)\n3. Gap analysis (headcount and capability)\n4. Scenario planning (base / optimistic / stress)\n5. Action roadmap with quarterly milestones`,
  'talent assessment': `You are a Talent Assessment expert. Structure outputs as:\n\n1. Assessment framework overview\n2. Individual or cohort summary\n3. Talent segmentation (HiPo / Solid / Underperformer)\n4. Calibration guidance\n5. Development recommendations per segment`,
  'learning': `You are an L&D strategist. All recommendations must:\n\n1. Align learning objectives to business priorities\n2. Map to 70-20-10 blend\n3. Recommend specific modalities\n4. Include success metrics\n5. Estimate time-to-capability`,
  'engagement': `You are an Employee Engagement advisor. Structure all outputs as:\n\n1. Engagement diagnostic summary\n2. Benchmark context\n3. Prioritised intervention areas (top 3)\n4. Action plan with owner, timeline, success metric\n5. Communication strategy`,
  'compensation': `You are a Total Rewards advisor. All outputs must:\n\n1. Summarise current reward philosophy\n2. Benchmark positioning (P25/P50/P75)\n3. Identify compression or equity issues\n4. Recommend reward mix adjustments\n5. Include implementation roadmap`,
  'organisation design': `You are an Organisation Design specialist. Structure outputs as:\n\n1. Design principles\n2. Current state assessment\n3. Future state options (2 scenarios with trade-offs)\n4. Recommended model with rationale\n5. Transition plan`,
  'hipo': `You are a HiPo Development advisor. All outputs must:\n\n1. Define HiPo criteria\n2. Summarise current HiPo cohort profile\n3. Recommend development architecture\n4. Address retention risk explicitly\n5. Include 12-month activation roadmap`,
}

function getDefaultInstruction(skillName: string): string {
  const lower = skillName.toLowerCase()
  for (const [key, val] of Object.entries(DEFAULT_INSTRUCTIONS)) {
    if (lower.includes(key)) return val
  }
  return GLOBAL_DEFAULT
}

// ─── Instruction Edit Panel ───────────────────────────────────────────────────

function InstructionEditPanel({ skill, onClose, onSave }: {
  skill: Skill
  onClose: () => void
  onSave: (id: string, instructions: string) => Promise<void>
}) {
  const defaultText = getDefaultInstruction(skill.name)
  // Edit the report_spec (the "skill file") that actually drives report generation.
  const [text, setText] = useState(skill.report_spec || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isDefault = !skill.report_spec && !text

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(skill.id, text)
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1000)
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl rounded-2xl border border-[#1e2433] bg-[#131720] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433]">
            <div>
              <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-0.5">Report Spec (Skill File)</p>
              <h3 className="text-base font-bold text-white">{skill.name}</h3>
            </div>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1e2433] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-slate-500">This is the master instruction that drives this studio's report. Edit it to change the studio's expertise, dimensions, KPIs and framing. Leave empty to use the platform's generic report contract.</p>
            {isDefault && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                <BookOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300">No custom report spec set. This studio uses the generic report contract until you add one.</span>
              </div>
            )}
            <Textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Enter the studio's report spec (markdown)…" rows={14} className="font-mono text-xs" />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-600">{text.length} characters</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}
                  leftIcon={saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}>
                  {saved ? 'Saved!' : saving ? 'Saving…' : 'Save report spec'}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Create Custom Studio Modal ───────────────────────────────────────────────

const TIER_OPTIONS: Skill['tier'][] = ['starter', 'professional', 'enterprise', 'advisory']

function CreateStudioModal({ categories, onClose, onCreate }: {
  categories: SkillCategory[]
  onClose: () => void
  onCreate: (skill: Omit<Skill, 'id' | 'enabled'>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0]?.name ?? 'custom')
  const [tier, setTier] = useState<Skill['tier']>('professional')
  const [creditCost, setCreditCost] = useState(10)
  const [instructions, setInstructions] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Studio name is required'
    if (name.trim().length < 3) e.name = 'Name must be at least 3 characters'
    if (creditCost < 0) e.credits = 'Credits must be 0 or more'
    return e
  }

  const handleCreate = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        category,
        tier,
        credit_cost: creditCost,
        instructions: instructions.trim() || getDefaultInstruction(name),
        llm_model: llmModel || undefined,
        is_custom: true,
      })
      onClose()
    } catch {
      setErrors({ submit: 'Failed to create studio. Please try again.' })
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 24 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[#1e2433] bg-[#131720] shadow-2xl">

          <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e2433] sticky top-0 bg-[#131720] z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Create Custom Studio</h2>
                <p className="text-xs text-slate-500 mt-0.5">Add a new AI advisory studio to the platform</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Basic info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Basic Information</h3>
              <Input
                label="Studio Name"
                placeholder="e.g. Talent Intelligence Studio"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: '' })) }}
                error={errors.name}
              />
              <Textarea
                label="Description (optional)"
                placeholder="What does this studio help users accomplish?"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Config */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#1e2433] bg-[#0c0e14] text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60">
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Tier</label>
                <select value={tier} onChange={e => setTier(e.target.value as Skill['tier'])}
                  className="w-full rounded-xl border border-[#1e2433] bg-[#0c0e14] text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60">
                  {TIER_OPTIONS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Credit Cost</label>
                <input
                  type="number" min={0} value={creditCost}
                  onChange={e => setCreditCost(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#1e2433] bg-[#0c0e14] text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                />
                {errors.credits && <p className="text-xs text-red-400">{errors.credits}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">LLM Model (optional)</label>
                <select value={llmModel} onChange={e => setLlmModel(e.target.value)}
                  className="w-full rounded-xl border border-[#1e2433] bg-[#0c0e14] text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/60">
                  <option value="">Use global default</option>
                  {LLM_OPTIONS.map(m => (
                    <option key={m.id} value={m.id}>{m.label} ({m.provider})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">System Instructions</label>
                <button type="button" onClick={() => setInstructions(getDefaultInstruction(name || 'global'))}
                  className="text-xs text-violet-400 hover:text-violet-300 font-semibold transition-colors">
                  Load suggested default
                </button>
              </div>
              <Textarea
                placeholder="Enter the system prompt that defines this studio's AI behaviour…"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-slate-600">{instructions.length} characters · {instructions.length === 0 ? 'Will use auto-detected default on save' : ''}</p>
            </div>

            {errors.submit && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-sm text-red-400">{errors.submit}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving}
                leftIcon={saving ? undefined : <Sparkles className="w-4 h-4" />}
                isLoading={saving}>
                Create Studio
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Self-Evolving Insights Panel ─────────────────────────────────────────────

// Mock insights for display (in production these come from the API)
function buildMockInsight(skill: Skill): SkillInsight {
  const seed = skill.id.charCodeAt(0) + skill.id.charCodeAt(skill.id.length - 1)
  const trends = ['rising', 'stable', 'declining'] as const
  return {
    total_runs: 120 + (seed % 800),
    unique_users: 20 + (seed % 120),
    avg_satisfaction: 3.5 + (seed % 15) / 10,
    common_gaps: [
      'Users often skip benchmark context step',
      'Low uptake on scenario planning output',
      'Frequently ask follow-up on data gaps',
    ].slice(0, 1 + (seed % 3)),
    trending_topics: [
      'Nationalization compliance',
      'AI-driven workforce planning',
      'Total rewards benchmarking',
      'Leadership succession risk',
    ].slice(0, 2 + (seed % 3)),
    suggested_improvements: [
      'Add a "quick brief" mode for fast advisory outputs',
      'Integrate live benchmark data from market surveys',
      'Include automated gap-to-recommendation mapping',
    ].slice(0, 1 + (seed % 3)),
    usage_trend: trends[seed % 3],
    last_evolved: new Date(Date.now() - (seed * 86400000) % (30 * 86400000)).toISOString(),
  }
}

function SkillInsightsPanel({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const [insight, setInsight] = useState<SkillInsight | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    adminAPI.skillInsights(skill.id)
      .then(res => setInsight(res.data))
      .catch(() => setInsight(buildMockInsight(skill)))
      .finally(() => setLoading(false))
  }, [skill.id]) // eslint-disable-line

  const trendIcon = insight?.usage_trend === 'rising'
    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
    : insight?.usage_trend === 'declining'
    ? <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />
    : <Activity className="w-4 h-4 text-amber-400" />

  const trendColor = insight?.usage_trend === 'rising' ? 'text-emerald-400'
    : insight?.usage_trend === 'declining' ? 'text-red-400' : 'text-amber-400'

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-xl rounded-2xl border border-[#1e2433] bg-[#131720] shadow-2xl overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433] bg-[#0f1117]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                <Brain className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-violet-400 font-semibold uppercase tracking-wider">Self-Evolving Intelligence</p>
                <h3 className="text-sm font-bold text-white">{skill.name}</h3>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : insight ? (
            <div className="p-5 space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Runs', value: insight.total_runs.toLocaleString(), icon: BarChart2, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                  { label: 'Unique Users', value: insight.unique_users, icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                  { label: 'Satisfaction', value: `${insight.avg_satisfaction.toFixed(1)}/5`, icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                ].map(kpi => (
                  <div key={kpi.label} className={cn('rounded-xl border p-3', kpi.bg)}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <kpi.icon className={cn('w-3.5 h-3.5', kpi.color)} />
                    </div>
                    <div className={cn('text-lg font-bold', kpi.color)}>{kpi.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Usage trend */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0c0e14] border border-[#1e2433]">
                <div className="flex items-center gap-2">
                  {trendIcon}
                  <span className={cn('text-sm font-semibold capitalize', trendColor)}>
                    {insight.usage_trend} usage
                  </span>
                </div>
                {insight.last_evolved && (
                  <span className="text-xs text-slate-600">
                    Last evolved: {new Date(insight.last_evolved).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Common gaps */}
              {insight.common_gaps.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Detected Usage Gaps</p>
                  </div>
                  <div className="space-y-1.5">
                    {insight.common_gaps.map((gap, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                        <p className="text-sm text-slate-300">{gap}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending topics */}
              {insight.trending_topics.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Trending Topics</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {insight.trending_topics.map((topic, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 font-medium">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI suggestions */}
              {insight.suggested_improvements.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">AI-Suggested Improvements</p>
                  </div>
                  <div className="space-y-1.5">
                    {insight.suggested_improvements.map((sug, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-violet-500/5 border border-violet-500/15">
                        <ArrowUpRight className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-slate-300">{sug}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-600">Data refreshes every 24 hours</span>
                <Button size="sm" variant="secondary"
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => { setLoading(true); setTimeout(() => { setInsight(buildMockInsight(skill)); setLoading(false) }, 800) }}>
                  Refresh
                </Button>
              </div>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Knowledge Base per Skill ──────────────────────────────────────────────

function SkillKnowledgeBase({ skillId, skillName }: { skillId: string; skillName: string }) {
  const { getKb, addDocument, removeDocument, addUrl, removeUrl } = useSkillKb()
  const kb = getKb(skillId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newUrl, setNewUrl] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => {
      addDocument(skillId, { name: file.name, size: file.size, type: file.type || 'application/octet-stream' })
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAddUrl = () => {
    const trimmed = newUrl.trim()
    if (!trimmed) return
    try {
      // basic URL validation — accept anything that parses
      new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    } catch { return }
    addUrl(skillId, trimmed.includes('://') ? trimmed : `https://${trimmed}`, newLabel.trim() || undefined)
    setNewUrl('')
    setNewLabel('')
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Knowledge Base</span>
          <span className="text-[10px] text-slate-500">· {skillName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>{kb.documents.length} {kb.documents.length === 1 ? 'file' : 'files'}</span>
          <span>·</span>
          <span>{kb.urls.length} {kb.urls.length === 1 ? 'URL' : 'URLs'}</span>
        </div>
      </div>

      {/* Documents */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Documents (PDF, DOCX)
          </span>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition-colors">
            <Upload className="w-3 h-3" /> Upload
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
        {kb.documents.length === 0 ? (
          <p className="text-[11px] text-slate-600 italic">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {kb.documents.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#0c0e14] border border-[#1e2433]">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="text-xs text-slate-300 truncate">{d.name}</span>
                  <span className="text-[10px] text-slate-600 flex-shrink-0">{formatSize(d.size)}</span>
                </div>
                <button type="button" onClick={() => removeDocument(skillId, d.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* URLs */}
      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
          <Link2 className="w-3 h-3" /> Site URLs
        </span>
        <div className="flex gap-2">
          <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddUrl() }}
            placeholder="https://example.com/resource"
            className="flex-1 px-3 py-1.5 rounded-lg bg-[#0c0e14] border border-[#1e2433] text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddUrl() }}
            placeholder="Label (optional)"
            className="w-32 px-3 py-1.5 rounded-lg bg-[#0c0e14] border border-[#1e2433] text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          <button type="button" onClick={handleAddUrl}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {kb.urls.length === 0 ? (
          <p className="text-[11px] text-slate-600 italic">No URLs added yet.</p>
        ) : (
          <div className="space-y-1.5">
            {kb.urls.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#0c0e14] border border-[#1e2433]">
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  {u.label && <span className="text-xs text-slate-300 font-semibold">{u.label}:</span>}
                  <a href={u.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 truncate">{u.url}</a>
                </div>
                <button type="button" onClick={() => removeUrl(skillId, u.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab({ categories }: { categories: SkillCategory[] }) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [insightSkill, setInsightSkill] = useState<Skill | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCustom, setFilterCustom] = useState(false)

  useEffect(() => {
    adminAPI.skills()
      .then(res => setSkills(res.data?.skills ?? res.data ?? []))
      .catch(() => setError('Failed to load skills'))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (skill: Skill) => {
    if (togglingId) return
    setTogglingId(skill.id)
    try {
      await adminAPI.updateSkill(skill.id, { enabled: !skill.enabled })
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, enabled: !s.enabled } : s))
    } catch { } finally { setTogglingId(null) }
  }

  const handleSaveCredits = async (id: string, credit_cost: number) => {
    await adminAPI.updateSkill(id, { credit_cost })
    setSkills(prev => prev.map(s => s.id === id ? { ...s, credit_cost } : s))
  }

  const handleSaveInstructions = async (id: string, report_spec: string) => {
    await adminAPI.updateSkill(id, { report_spec })
    setSkills(prev => prev.map(s => s.id === id ? { ...s, report_spec, has_report_spec: !!report_spec.trim() } : s))
  }

  const handleCreate = async (data: Omit<Skill, 'id' | 'enabled'>) => {
    const res = await adminAPI.createSkill({ ...data, enabled: true })
    const newSkill = res.data?.skill ?? { ...data, id: `custom_${Date.now()}`, enabled: true }
    setSkills(prev => [...prev, newSkill])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this custom studio? This cannot be undone.')) return
    await adminAPI.deleteSkill(id).catch(() => {})
    setSkills(prev => prev.filter(s => s.id !== id))
  }

  const filtered = skills.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
    const matchCustom = !filterCustom || s.is_custom
    return matchSearch && matchCustom
  })

  if (loading) return (
    <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: i < 5 ? '1px solid #1e2433' : undefined }}>
          <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-11 rounded-full" />
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <>
      <AnimatedSection variants={fadeUp} className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input placeholder="Search studios…" value={search}
              onChange={e => setSearch(e.target.value)} leftElement={<Search className="w-4 h-4" />} />
          </div>
          <button
            onClick={() => setFilterCustom(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
              filterCustom
                ? 'bg-blue-600/15 border-blue-500/30 text-blue-400'
                : 'bg-transparent border-[#1e2433] text-slate-500 hover:text-slate-300'
            )}>
            <Filter className="w-3.5 h-3.5" />
            Custom only
          </button>
          <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
            New Studio
          </Button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-5 px-1 text-xs text-slate-500">
          <span><span className="text-white font-semibold">{skills.length}</span> total studios</span>
          <span><span className="text-emerald-400 font-semibold">{skills.filter(s => s.enabled).length}</span> enabled</span>
          <span><span className="text-blue-400 font-semibold">{skills.filter(s => s.is_custom).length}</span> custom</span>
          <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-blue-400" /> Click credits to edit inline</span>
          <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /> Click intelligence icon for usage insights</span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
            <Zap className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="font-medium text-slate-300">{search ? `No studios match "${search}"` : 'No studios found'}</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e2433] bg-[#0c0e14]">
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500 w-6"></th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">Studio Name</th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500 hidden md:table-cell">Category</th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">Tier</th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">
                    <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-blue-400" /> Credits</span>
                  </th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-violet-400" /> Instructions</span>
                  </th>
                  <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">
                    <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /> Intel</span>
                  </th>
                  <th className="text-right text-xs font-semibold px-4 py-3 text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((skill, i) => (
                  <>
                    <tr key={skill.id}
                      className="transition-colors hover:bg-[#1a1f2e] cursor-pointer"
                      style={{ borderBottom: expandedId === skill.id ? 'none' : i < filtered.length - 1 ? '1px solid #1e2433' : undefined }}
                      onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}>
                      <td className="px-4 py-3 w-6">
                        {expandedId === skill.id
                          ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                          : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{skill.name}</span>
                          {skill.is_custom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-semibold">Custom</span>
                          )}
                          {skill.llm_model && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                              {getLlmLabel(skill.llm_model)?.label.split(' ').slice(0, 2).join(' ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm capitalize text-slate-400">{skill.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tier={skill.tier}>{skill.tier}</Badge>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <InlineCreditEditor value={skill.credit_cost ?? 0} onSave={v => handleSaveCredits(skill.id, v)} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button type="button"
                          onClick={() => setEditingSkill(skill)}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all',
                            skill.instructions
                              ? 'border-violet-500/30 text-violet-400 bg-violet-500/5 hover:bg-violet-500/15'
                              : 'border-[#1e2433] text-slate-400 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5'
                          )}>
                          <Pencil className="w-3 h-3" />
                          {skill.instructions ? 'Edit' : 'Add'}
                        </button>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button type="button"
                          onClick={() => setInsightSkill(skill)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center border border-violet-500/20 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 transition-colors"
                          title="View usage intelligence">
                          <Brain className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {skill.is_custom && (
                            <button onClick={() => handleDelete(skill.id)}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Toggle enabled={skill.enabled} onToggle={() => handleToggle(skill)} />
                        </div>
                      </td>
                    </tr>

                    <AnimatePresence>
                      {expandedId === skill.id && (
                        <tr key={`${skill.id}-expanded`}
                          style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1e2433' : undefined }}>
                          <td colSpan={8} className="px-6 pb-4 pt-0">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}>
                              <div className="space-y-3">
                                <div className="bg-[#0c0e14] border border-[#1e2433] rounded-xl p-4 space-y-3">
                                  {skill.description && (
                                    <p className="text-sm text-slate-400">{skill.description}</p>
                                  )}
                                  {skill.llm_model && (
                                    <div className="flex items-center gap-2">
                                      <Cpu className="w-3.5 h-3.5 text-slate-500" />
                                      <span className="text-xs text-slate-500">LLM override:</span>
                                      <span className="text-xs font-semibold text-slate-300">{getLlmLabel(skill.llm_model)?.label}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-violet-400">Instructions</span>
                                    <button type="button" onClick={() => setEditingSkill(skill)}
                                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                                      Edit →
                                    </button>
                                  </div>
                                  {skill.instructions
                                    ? <p className="text-xs text-slate-400 font-mono leading-relaxed whitespace-pre-wrap line-clamp-6">{skill.instructions}</p>
                                    : <p className="text-xs text-slate-600 italic">No custom instructions. Using Aivora default.</p>}
                                </div>
                                <SkillKnowledgeBase skillId={skill.id} skillName={skill.name} />
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedSection>

      {editingSkill && (
        <InstructionEditPanel skill={editingSkill} onClose={() => setEditingSkill(null)} onSave={handleSaveInstructions} />
      )}

      {insightSkill && (
        <SkillInsightsPanel skill={insightSkill} onClose={() => setInsightSkill(null)} />
      )}

      {showCreate && (
        <CreateStudioModal categories={categories} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </>
  )
}

// ─── Category Manager Tab ─────────────────────────────────────────────────────

const MARKETPLACE_CATEGORY_KEYS = ['strategy', 'talent', 'learning', 'advisory', 'commercial'] as const
type MarketplaceKey = typeof MARKETPLACE_CATEGORY_KEYS[number]
const MARKETPLACE_DEFAULTS: Record<MarketplaceKey, string> = {
  strategy: 'Strategy & Transformation',
  talent: 'Talent & People',
  learning: 'Learning',
  advisory: 'Advisory',
  commercial: 'Commercial',
}

function loadMarketplaceLabels(): Record<MarketplaceKey, string> {
  try {
    const stored = localStorage.getItem('aivora_category_labels')
    if (stored) return { ...MARKETPLACE_DEFAULTS, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return { ...MARKETPLACE_DEFAULTS }
}

const PILL_COLORS: Record<MarketplaceKey, string> = {
  strategy:   '#6366f1',
  talent:     '#3b82f6',
  learning:   '#22c55e',
  advisory:   '#f59e0b',
  commercial: '#ec4899',
}

function MarketplaceCategoryEditor({ pillLabels, setPillLabels, pillSaved, onSave, skills }: {
  pillLabels: Record<MarketplaceKey, string>
  setPillLabels: React.Dispatch<React.SetStateAction<Record<MarketplaceKey, string>>>
  pillSaved: boolean
  onSave: () => void
  skills: Skill[]
}) {
  const [active, setActive] = useState<MarketplaceKey | 'all'>('all')
  const { assignments, assign, unassign } = useCategorySkills()
  const assignedToActive = active !== 'all' ? (assignments[active] ?? []) : []

  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Tag className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Marketplace Category Labels</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click a pill to rename it. Updates the Studios filter bar.</p>
          </div>
        </div>
        <button onClick={onSave}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
            pillSaved
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]')}>
          {pillSaved ? <><Check className="w-3.5 h-3.5" /> Saved!</> : <><Save className="w-3.5 h-3.5" /> Save Labels</>}
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Interactive pill preview */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Live Preview: click a pill to edit</p>
          <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-[#1e2433] bg-[#0c0e14]">
            <button onClick={() => setActive('all')}
              className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                active === 'all'
                  ? 'bg-[#3b82f6] text-white shadow-[0_0_12px_rgba(59,130,246,0.4)] scale-105'
                  : 'bg-[#1a1e2e] text-slate-400 hover:text-white hover:bg-[#252b3b]')}>
              All
            </button>
            {MARKETPLACE_CATEGORY_KEYS.map(k => (
              <button key={k} onClick={() => setActive(k)}
                className={cn('px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                  active === k
                    ? 'text-white scale-105 shadow-lg'
                    : 'bg-[#1a1e2e] text-slate-400 hover:text-white hover:bg-[#252b3b]')}
                style={active === k ? { background: PILL_COLORS[k], boxShadow: `0 0 16px ${PILL_COLORS[k]}60` } : {}}>
                {pillLabels[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Active pill editor */}
        {active !== 'all' && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[#2a3048] bg-[#0c0e14] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: PILL_COLORS[active] }} />
              <p className="text-xs font-bold text-white uppercase tracking-wider">{active}</p>
            </div>
            <div className="flex gap-3 items-center">
              <input
                value={pillLabels[active]}
                onChange={e => setPillLabels(prev => ({ ...prev, [active]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') onSave() }}
                placeholder={`Label for "${active}"…`}
                className="flex-1 px-4 py-2.5 text-sm border border-[#2a3048] rounded-xl bg-[#131720] text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': PILL_COLORS[active] } as React.CSSProperties}
                autoFocus
              />
              <button onClick={onSave}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-colors"
                style={{ background: PILL_COLORS[active] }}>
                Save
              </button>
            </div>
            <p className="text-[11px] text-slate-600">Press Enter or click Save to apply. Changes affect all users immediately.</p>
          </motion.div>
        )}

        {/* Skills assignment for active category */}
        {active !== 'all' && (
          <motion.div
            key={`${active}-skills`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-[#2a3048] bg-[#0c0e14] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" style={{ color: PILL_COLORS[active] }} />
                <p className="text-xs font-bold text-white uppercase tracking-wider">Studios in this category</p>
              </div>
              <span className="text-[11px] text-slate-500">{assignedToActive.length} of {skills.length} assigned</span>
            </div>
            {skills.length === 0 ? (
              <p className="text-[11px] text-slate-600 italic">No studios loaded yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {skills.map(s => {
                  const checked = assignedToActive.includes(s.name)
                  return (
                    <label key={s.id}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all',
                        checked
                          ? 'bg-[#131720] border-[#2a3048]'
                          : 'bg-[#0a0d15] border-[#1e2433] hover:border-[#2a3048]')}
                      style={checked ? { borderColor: PILL_COLORS[active] + '60', boxShadow: `0 0 0 1px ${PILL_COLORS[active]}30` } : {}}>
                      <input type="checkbox" className="hidden"
                        checked={checked}
                        onChange={() => checked ? unassign(active, s.name) : assign(active, s.name)} />
                      <div className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all',
                        checked ? 'border-transparent' : 'border-[#2a3048]')}
                        style={checked ? { background: PILL_COLORS[active] } : {}}>
                        {checked && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={cn('text-xs truncate flex-1', checked ? 'text-white font-semibold' : 'text-slate-400')}>
                        {s.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-600">Studios assigned here will appear under "{pillLabels[active]}" in the Studios Marketplace filter.</p>
          </motion.div>
        )}

        {active === 'all' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {MARKETPLACE_CATEGORY_KEYS.map(k => (
              <button key={k} onClick={() => setActive(k)}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border border-[#1e2433] bg-[#0c0e14] hover:border-[#2a3048] hover:bg-[#131720] transition-colors text-left group">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: PILL_COLORS[k] + '20', border: `1px solid ${PILL_COLORS[k]}40` }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: PILL_COLORS[k] }} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{k}</p>
                  <p className="text-xs font-semibold text-white mt-0.5 group-hover:text-blue-300 transition-colors">{pillLabels[k]}</p>
                </div>
                <Pencil className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors mt-auto" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoriesTab({ skills }: { skills: Skill[] }) {
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<SkillCategory | null>(null)
  const [pillLabels, setPillLabels] = useState<Record<MarketplaceKey, string>>(loadMarketplaceLabels)
  const [pillSaved, setPillSaved] = useState(false)

  const savePillLabels = () => {
    localStorage.setItem('aivora_category_labels', JSON.stringify(pillLabels))
    setPillSaved(true)
    setTimeout(() => setPillSaved(false), 2000)
  }

  useEffect(() => {
    adminAPI.categories()
      .then(res => setCategories(res.data?.categories ?? res.data ?? []))
      .catch(() => {
        // Derive from current skills for display
        const cats = Array.from(new Set(skills.map(s => s.category))).map((name, i) => ({
          id: `cat_${i}`,
          name,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
          skill_ids: skills.filter(s => s.category === name).map(s => s.id),
        }))
        setCategories(cats)
      })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Studios will move to Uncategorised.')) return
    await adminAPI.deleteCategory(id).catch(() => {})
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  const handleSave = async (cat: Partial<SkillCategory> & { id?: string }) => {
    if (cat.id) {
      await adminAPI.updateCategory(cat.id, cat).catch(() => {})
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, ...cat } as SkillCategory : c))
    } else {
      const res = await adminAPI.createCategory(cat).catch(() => null)
      const newCat = res?.data?.category ?? { ...cat, id: `cat_${Date.now()}`, skill_ids: [] }
      setCategories(prev => [...prev, newCat as SkillCategory])
    }
    setShowCreate(false)
    setEditing(null)
  }

  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
  )

  return (
    <AnimatedSection variants={fadeUp} className="space-y-6">

      {/* ── Marketplace pill labels ── */}
      <MarketplaceCategoryEditor pillLabels={pillLabels} setPillLabels={setPillLabels} pillSaved={pillSaved} onSave={savePillLabels} skills={skills} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Backend skill category groups, used to organise studios in the admin panel.
        </p>
        <Button onClick={() => setShowCreate(true)} leftIcon={<FolderPlus className="w-4 h-4" />}>
          New Category
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1e2433] p-12 text-center">
          <Layers className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-semibold text-slate-300">No categories yet</p>
          <p className="text-sm text-slate-500 mt-1">Create a category to group related studios together.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const catSkills = skills.filter(s => cat.skill_ids?.includes(s.id) || s.category === cat.name)
            return (
              <div key={cat.id} className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5 space-y-4 hover:border-[#2a3048] transition-colors group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: cat.color + '20', border: `1px solid ${cat.color}40` }}>
                      <Tag className="w-5 h-5" style={{ color: cat.color }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white capitalize">{cat.name}</h3>
                      {cat.description && <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(cat)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(cat.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2">{catSkills.length} studio{catSkills.length !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {catSkills.slice(0, 5).map(s => (
                      <span key={s.id} className="text-xs px-2 py-0.5 rounded-md bg-[#0c0e14] border border-[#1e2433] text-slate-400">
                        {s.name}
                      </span>
                    ))}
                    {catSkills.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-md text-slate-600">+{catSkills.length - 5} more</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      <AnimatePresence>
        {(showCreate || editing) && (
          <CategoryFormModal
            initial={editing ?? undefined}
            skills={skills}
            onSave={handleSave}
            onClose={() => { setShowCreate(false); setEditing(null) }}
          />
        )}
      </AnimatePresence>
    </AnimatedSection>
  )
}

function CategoryFormModal({ initial, skills, onSave, onClose }: {
  initial?: SkillCategory
  skills: Skill[]
  onSave: (cat: Partial<SkillCategory> & { id?: string }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0])
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.skill_ids ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleSkill = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSave = async () => {
    if (!name.trim()) { setError('Category name is required'); return }
    setSaving(true)
    await onSave({ id: initial?.id, name: name.trim(), description: description.trim(), color, skill_ids: selectedIds })
    setSaving(false)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-[#1e2433] bg-[#131720] shadow-2xl">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433]">
          <h2 className="text-base font-bold text-white">{initial ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Input label="Category Name" placeholder="e.g. Talent & Development" value={name}
            onChange={e => { setName(e.target.value); setError('') }} error={error} />

          <Textarea label="Description (optional)" placeholder="What types of studios are in this group?"
            value={description} onChange={e => setDescription(e.target.value)} rows={2} />

          {/* Color picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('w-8 h-8 rounded-xl border-2 transition-all', color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Studio assignment */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Studios in this category ({selectedIds.length} selected)
            </label>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-[#1e2433] divide-y divide-[#1e2433]">
              {skills.map(skill => (
                <label key={skill.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/3 cursor-pointer transition-colors">
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    selectedIds.includes(skill.id)
                      ? 'border-blue-500 bg-blue-600'
                      : 'border-slate-600 bg-transparent'
                  )}>
                    {selectedIds.includes(skill.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-sm text-slate-300">{skill.name}</span>
                  <span className="text-xs text-slate-600 ml-auto">{skill.category}</span>
                  <input type="checkbox" className="hidden" checked={selectedIds.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)} />
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}
              leftIcon={!saving ? <Save className="w-4 h-4" /> : undefined}>
              {initial ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── LLM Configuration Tab ────────────────────────────────────────────────────

function LlmTab({ skills }: { skills: Skill[] }) {
  const [config, setConfig] = useState<LlmConfig>({ global_model: 'gpt-4o', skill_overrides: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    adminAPI.llmConfig()
      .then(res => setConfig(res.data ?? config))
      .catch(() => {}) // use defaults
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  const saveConfig = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await adminAPI.updateLlmConfig(config)
      if (res.data?.global_model) setConfig(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(detail || 'Could not save the model configuration.')
    } finally { setSaving(false) }
  }

  const setGlobal = (model: string) => setConfig(c => ({ ...c, global_model: model }))
  const setOverride = (skillId: string, model: string) =>
    setConfig(c => {
      const overrides = { ...c.skill_overrides }
      if (!model) delete overrides[skillId]
      else overrides[skillId] = model
      return { ...c, skill_overrides: overrides }
    })
  const clearAllOverrides = () => setConfig(c => ({ ...c, skill_overrides: {} }))

  const filtered = skills.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
  const overrideCount = Object.keys(config.skill_overrides).length
  const globalLlm = getLlmLabel(config.global_model)

  return (
    <AnimatedSection variants={fadeUp} className="space-y-6">
      {/* Global selector */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Global LLM Model</h3>
            <p className="text-xs text-slate-500 mt-0.5">Drives the AI Advisory chat and report generation. Larger models give more detailed, better-reasoned output.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LLM_OPTIONS.map(model => {
            const isSelected = config.global_model === model.id
            return (
              <button key={model.id} type="button" onClick={() => setGlobal(model.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                  isSelected
                    ? 'border-blue-500/50 bg-blue-600/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                    : 'border-[#1e2433] bg-[#0c0e14] hover:border-[#2a3048]'
                )}>
                <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                  isSelected ? 'border-blue-500 bg-blue-600' : 'border-slate-600')}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{model.label}</span>
                    {model.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-slate-400 font-medium">{model.badge}</span>
                    )}
                  </div>
                  <span className={cn('text-xs mt-0.5 inline-flex px-1.5 py-0.5 rounded border font-medium', PROVIDER_COLORS[model.provider] ?? 'text-slate-400')}>
                    {model.provider}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {globalLlm && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <Cpu className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm text-blue-300">
              <span className="font-semibold">{globalLlm.label}</span>
              <span className="text-blue-400/60 ml-1">({globalLlm.provider})</span>
              {' '}will be used for all studios by default
            </span>
          </div>
        )}
      </div>

      {/* Per-studio overrides */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#131720] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433]">
          <div className="flex items-center gap-3">
            <Settings2 className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-white">Per-Studio Overrides</h3>
            {overrideCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-semibold">
                {overrideCount} override{overrideCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-48">
              <Input placeholder="Filter studios…" value={search}
                onChange={e => setSearch(e.target.value)} leftElement={<Search className="w-3.5 h-3.5" />} />
            </div>
            {overrideCount > 0 && (
              <button onClick={clearAllOverrides}
                className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors px-2">
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-[#1e2433] max-h-[480px] overflow-y-auto">
          {filtered.map(skill => {
            const override = config.skill_overrides[skill.id]
            const overrideLlm = getLlmLabel(override)
            return (
              <div key={skill.id} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#1a1f2e] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{skill.name}</span>
                    {skill.is_custom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-semibold flex-shrink-0">Custom</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-600 capitalize">{skill.category}</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {override && overrideLlm ? (
                    <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', PROVIDER_COLORS[overrideLlm.provider] ?? 'text-slate-400')}>
                      {overrideLlm.provider}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">Using global</span>
                  )}
                  <select
                    value={override ?? ''}
                    onChange={e => setOverride(skill.id, e.target.value)}
                    className="rounded-lg border border-[#1e2433] bg-[#0c0e14] text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60 min-w-[180px]">
                    <option value="">Use global ({globalLlm?.label ?? config.global_model})</option>
                    {LLM_OPTIONS.map(m => (
                      <option key={m.id} value={m.id}>{m.label} ({m.provider})</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No studios match "{search}"
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0f1117] border border-[#1e2433]">
        <div className="text-sm text-slate-400">
          {saveError
            ? <span className="text-rose-400">{saveError}</span>
            : 'Changes apply to all new AI sessions within 30 seconds of saving.'}
        </div>
        <Button onClick={saveConfig} isLoading={saving}
          leftIcon={saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}>
          {saved ? 'Saved!' : 'Save LLM Config'}
        </Button>
      </div>
    </AnimatedSection>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchUsers = useCallback((p: number, q: string) => {
    setLoading(true)
    setError(null)
    adminAPI.users({ page: p, search: q || undefined })
      .then(res => {
        const raw = res.data?.users ?? res.data ?? []
        setUsers(Array.isArray(raw) ? raw : [])
      })
      .catch(() => { setError('Failed to load users'); setUsers([]) })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  useEffect(() => { fetchUsers(1, '') }, [fetchUsers])

  const handleSearch = (value: string) => { setSearch(value); setPage(1); fetchUsers(1, value) }
  const handlePageChange = (newPage: number) => { setPage(newPage); fetchUsers(newPage, search) }

  const handleSaveCredits = async (id: string, credits: number) => {
    await adminAPI.updateUser(id, { credits })
    setUsers(prev => prev.map(u => u.id === id ? { ...u, credits } : u))
  }

  if (error) return (
    <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <AnimatedSection variants={fadeUp} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="max-w-sm flex-1">
          <Input placeholder="Search by name or email..." value={search}
            onChange={e => handleSearch(e.target.value)} leftElement={<Search className="w-4 h-4" />} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CreditCard className="w-3 h-3 text-blue-400" />
          Click a credit balance to edit it
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3"
              style={{ borderBottom: i < 7 ? '1px solid #1e2433' : undefined }}>
              <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-medium text-slate-300">No users found</p>
          {search && <p className="text-sm mt-1 text-slate-500">No results for "{search}"</p>}
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-[#1e2433] bg-[#0c0e14]">
                    {['Name', 'Email', 'Tenant', 'Plan', 'Level', 'XP', 'Role'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold px-4 py-3 text-slate-500">{h}</th>
                    ))}
                    <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">
                      <span className="flex items-center gap-1"><CreditCard className="w-3 h-3 text-blue-400" /> Credits</span>
                    </th>
                    <th className="text-left text-xs font-semibold px-4 py-3 text-slate-500">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr key={user.id} className="transition-colors hover:bg-[#1a1f2e]"
                      style={{ borderBottom: i < users.length - 1 ? '1px solid #1e2433' : undefined }}>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-slate-200">{user.name}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-400">{user.email}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-400">{user.tenant}</span></td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize bg-[#1e2433] text-slate-300 border border-[#2a3045]">{user.plan}</span>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm font-semibold text-white">{user.level}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-400">{user.xp?.toLocaleString()}</span></td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium capitalize', user.role === 'admin' ? 'text-blue-400' : 'text-slate-500')}>{user.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <InlineCreditEditor value={user.credits ?? 0} onSave={v => handleSaveCredits(user.id, v)} />
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-500">{formatDate(user.created_at)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {users.length === PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Page {page}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)} leftIcon={<ChevronLeft className="w-4 h-4" />}>Prev</Button>
                <Button variant="secondary" size="sm"
                  onClick={() => handlePageChange(page + 1)} rightIcon={<ChevronRight className="w-4 h-4" />}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatedSection>
  )
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  'ai_job.dispatched', 'ai_job.completed', 'ai_draft.chat', 'ai_canvas.edit',
  'request.POST.auth.login', 'request.POST.auth.logout', 'request.POST.auth.signup',
  'request.POST.workspaces', 'request.PATCH.workspaces',
  'request.POST.challenge-briefs', 'request.PATCH.challenge-briefs', 'request.POST.challenge-briefs.run',
  'request.POST.ai.jobs', 'request.PATCH.ai.drafts.approval', 'request.PATCH.ai.drafts.content',
  'request.POST.exports', 'request.POST.publish',
  'request.PUT.me.onboarding', 'request.POST.settings',
]

/**
 * Single audit log row. AI-engine rows expand to show the four-phase trace:
 * user input + skill + memory -> agent brain -> output.
 */
function AuditRow({ entry, isLast }: { entry: AuditEntry; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const p = entry.payload
  const hasTrace = entry.action.startsWith('ai_job') && !!p
  return (
    <>
      <tr
        className={cn('transition-colors hover:bg-[#1a1f2e]', hasTrace && 'cursor-pointer')}
        onClick={hasTrace ? () => setOpen(o => !o) : undefined}
        style={{ borderBottom: isLast && !open ? undefined : '1px solid #1e2433' }}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs font-mono text-slate-500">{formatDate(entry.timestamp)}</span>
        </td>
        <td className="px-4 py-3"><span className="text-sm font-medium text-slate-200">{entry.user}</span></td>
        <td className="px-4 py-3">
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full border',
            hasTrace ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' : 'bg-[#1e2433] text-slate-300 border-[#2a3045]',
          )}>
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-3"><span className="text-sm text-slate-400">{entry.resource}</span></td>
        <td className="px-4 py-3"><span className="text-xs font-mono text-slate-500">{entry.ip}</span></td>
      </tr>
      {open && hasTrace && (
        <tr style={{ borderBottom: isLast ? undefined : '1px solid #1e2433' }}>
          <td colSpan={5} className="px-4 py-4 bg-[#0c0e14]">
            <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3">
              Agent run trace
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <TracePhase
                no="1"
                title="User Input"
                subtitle="Form context"
                tone="blue"
                content={p?.user_input}
              />
              <TracePhase
                no="2"
                title="Skill"
                subtitle={p?.skill?.name ?? p?.skill?.slug ?? entry.action}
                tone="violet"
                content={p?.skill}
              />
              <TracePhase
                no="3"
                title="Memory"
                subtitle="Onboarding snapshot"
                tone="emerald"
                content={p?.memory_snapshot}
              />
              <TracePhase
                no="4"
                title="Agent Brain"
                subtitle={p?.agent?.model ?? 'LLM'}
                tone="amber"
                content={p?.output_summary ? { output: p.output_summary } : p?.agent}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function TracePhase({ no, title, subtitle, tone, content }: {
  no: string
  title: string
  subtitle: string
  tone: 'blue' | 'violet' | 'emerald' | 'amber'
  content?: unknown
}) {
  const toneCls: Record<typeof tone, { ring: string; chip: string }> = {
    blue:    { ring: 'border-blue-500/30',    chip: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    violet:  { ring: 'border-violet-500/30',  chip: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
    emerald: { ring: 'border-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    amber:   { ring: 'border-amber-500/30',   chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  }
  const t = toneCls[tone]
  const json = content ? JSON.stringify(content, null, 2) : ' - '
  return (
    <div className={cn('rounded-xl border p-3 bg-[#131720]', t.ring)}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border', t.chip)}>{no}</span>
        <span className="text-xs font-semibold text-white">{title}</span>
      </div>
      <div className="text-[11px] text-slate-400 mb-2 truncate">{subtitle}</div>
      <pre className="text-[10px] leading-relaxed text-slate-400 bg-[#0c0e14] border border-[#1e2433] rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap">
        {json.length > 800 ? json.slice(0, 800) + '\n...' : json}
      </pre>
    </div>
  )
}

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const fetchAudit = useCallback(
    (params: { date_from?: string; date_to?: string; action?: string }) => {
      setLoading(true)
      setError(null)
      adminAPI.auditLog({
        date_from: params.date_from || undefined,
        date_to: params.date_to || undefined,
        action: params.action || undefined,
      })
        .then(res => {
          const raw = res.data?.entries ?? res.data ?? []
          setEntries(Array.isArray(raw) ? raw : [])
        })
        .catch(() => { setError('Failed to load audit log'); setEntries([]) })
        .finally(() => setLoading(false))
    }, [] // eslint-disable-line
  )

  useEffect(() => { fetchAudit({}) }, []) // eslint-disable-line

  const applyFilters = () => fetchAudit({ date_from: dateFrom, date_to: dateTo, action: actionFilter })
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setActionFilter(''); fetchAudit({}) }

  const inputStyle = "rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0c0e14] border-[#1e2433] text-slate-200"

  return (
    <AnimatedSection variants={fadeUp} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-[#1e2433] bg-[#131720]">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-500">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-500">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-500">Action</label>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className={cn(inputStyle, 'min-w-[160px]')} style={{ colorScheme: 'dark' }}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={applyFilters} leftIcon={<Filter className="w-3.5 h-3.5" />}>Apply</Button>
          {(dateFrom || dateTo || actionFilter) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: i < 7 ? '1px solid #1e2433' : undefined }}>
              <Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
          <p className="text-red-400">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl p-12 text-center border border-[#1e2433] bg-[#131720]">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="font-medium text-slate-300">No audit entries found</p>
          <p className="text-sm mt-1 text-slate-500">Try adjusting the date range or action filter.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-[#1e2433] bg-[#131720]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[#1e2433] bg-[#0c0e14]">
                  {['Timestamp', 'User', 'Action', 'Resource', 'IP'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold px-4 py-3 text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <AuditRow key={entry.id} entry={entry} isLast={i === entries.length - 1} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AnimatedSection>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AdminTab2 = 'skills' | 'categories' | 'llm' | 'users' | 'audit'

const TABS: { id: AdminTab2; label: string; icon: React.ElementType }[] = [
  { id: 'skills',      label: 'Studios',        icon: Zap        },
  { id: 'categories',  label: 'Categories',      icon: Tag        },
  { id: 'llm',         label: 'LLM Config',      icon: Cpu        },
  { id: 'users',       label: 'Users & Credits', icon: Users      },
  { id: 'audit',       label: 'Audit Log',       icon: ShieldCheck},
]

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab2>('skills')
  // Shared skills & categories state so SkillsTab and CategoriesTab/LlmTab stay in sync
  const [sharedSkills, setSharedSkills] = useState<Skill[]>([])
  const [sharedCategories, setSharedCategories] = useState<SkillCategory[]>([])

  useEffect(() => {
    adminAPI.stats().then(res => setStats(res.data)).catch(() => {}).finally(() => setStatsLoading(false))
    // Pre-load skills for Category + LLM tabs
    adminAPI.skills()
      .then(res => setSharedSkills(res.data?.skills ?? res.data ?? []))
      .catch(() => {})
    adminAPI.categories()
      .then(res => setSharedCategories(res.data?.categories ?? res.data ?? []))
      .catch(() => {})
  }, [])

  const statCards = [
    { label: 'Total Tenants',      value: stats?.total_tenants ?? ' - ',      icon: Building2 },
    { label: 'Active Users Today', value: stats?.active_users_today ?? ' - ', icon: Users },
    { label: 'AI Jobs Today',      value: stats?.ai_jobs_today ?? ' - ',      icon: Zap },
    { label: 'Total Exports',      value: stats?.total_exports ?? ' - ',      icon: Download },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <AnimatedSection variants={fadeUp}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-600/20 border border-blue-500/30">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm mt-0.5 text-slate-400">Manage studios, categories, LLM config, credits and audit logs</p>
          </div>
        </div>
      </AnimatedSection>

      <motion.div initial="hidden" animate="visible" variants={staggerContainer}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <StatCard key={card.label} label={card.label} value={card.value}
            icon={card.icon} index={i} loading={statsLoading} />
        ))}
      </motion.div>

      <div>
        <div className="flex gap-1 border-b border-[#1e2433] overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-[#2a3045]'
              )}>
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <div className={activeTab === 'skills'     ? '' : 'hidden'}><SkillsTab categories={sharedCategories} /></div>
          <div className={activeTab === 'categories' ? '' : 'hidden'}><CategoriesTab skills={sharedSkills} /></div>
          <div className={activeTab === 'llm'        ? '' : 'hidden'}><LlmTab skills={sharedSkills} /></div>
          <div className={activeTab === 'users'      ? '' : 'hidden'}><UsersTab /></div>
          <div className={activeTab === 'audit'      ? '' : 'hidden'}><AuditLogTab /></div>
        </div>
      </div>
    </div>
  )
}
