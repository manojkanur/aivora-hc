import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, RotateCcw, ArrowRight, FileText, Target, Plus, LayoutGrid,
  MessageSquare, Loader2, Send, ClipboardList, Paperclip, X, Pencil, Briefcase,
  Check, Circle, CircleDot, ListChecks, FileBarChart2, SlidersHorizontal, Download,
  ChevronDown, Search, History, Wand2, PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QuestionCard } from '../components/advisory/QuestionCard'
import { useAdvisoryStore } from '../store/advisory'
import { getDiagnosticQuestions } from '../lib/advisory/questionRouter'
import { getTier, getDimension } from '../lib/advisory/scoring'
import { topRecommendations, getStudio } from '../lib/advisory/recommendations'
import chatPersona from '../lib/seeds/chatPersona.json'
import type { AnswerValue, Question } from '../lib/advisory/types'
import StudioOutput, { type StudioOutputDocument, type StudioOutputSection } from '../components/studio/renderer/StudioRenderer'
import { hcAiAdvisoryAPI, hcSkillsAPI, type AdvisoryProfile, type ChatPlan, type SummaryReport, type AdvisorySkill, type AdvisoryRevisionRow } from '../lib/hcPlatformApi'
import { useClientProfileStore } from '../store/clientProfile'
import { workspacesAPI, challengeBriefsAPI, draftsAPI, exportsAPI } from '../lib/api'
import { cn } from '../lib/utils'
import { useBriefStore, type WorkspaceBrief } from '../store/briefStore'

const DELIVERABLE_TOPICS: Array<{ key: string; label: string }> = [
  { key: 'hipo_program', label: 'HIPO Program' },
  { key: 'succession_framework', label: 'Succession Framework' },
  { key: 'leadership_development', label: 'Leadership Development' },
  { key: 'performance_management', label: 'Performance Management' },
  { key: 'culture_program', label: 'Culture Program' },
  { key: 'talent_review', label: 'Talent Review' },
  { key: 'engagement_program', label: 'Engagement Program' },
  { key: 'diversity_program', label: 'Diversity Program' },
  { key: 'comp_framework', label: 'Compensation Framework' },
  { key: 'learning_strategy', label: 'Learning Strategy' },
  { key: 'org_design', label: 'Org Design' },
  { key: 'evp_strategy', label: 'EVP Strategy' },
  { key: 'total_rewards', label: 'Total Rewards' },
  { key: 'change_management', label: 'Change Management' },
  { key: 'dei_strategy', label: 'DEI Strategy' },
  { key: 'workforce_planning', label: 'Workforce Planning' },
]

function pickLatestBrief(briefs: Record<string, WorkspaceBrief>): WorkspaceBrief | null {
  const entries = Object.values(briefs)
  if (entries.length === 0) return null
  let latest = entries[0]
  for (const b of entries) {
    if (new Date(b.completedAt).getTime() > new Date(latest.completedAt).getTime()) {
      latest = b
    }
  }
  return latest
}

function readActiveReviewId(): string | null {
  try {
    const raw = localStorage.getItem('aivora-active-review-id')
    if (raw) return raw
  } catch { /* ignore */ }
  return null
}

// ---------------------------------------------------------------------------
// Advisory profile (first-run intake)
// ---------------------------------------------------------------------------

const PROFILE_STORAGE_KEY = 'aivora-advisory-profile-v1'

function parseProfile(raw: string | null): AdvisoryProfile | null {
  try {
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.persona === 'string') return parsed as AdvisoryProfile
  } catch { /* ignore */ }
  return null
}

function loadStoredProfile(workspaceId: string): AdvisoryProfile | null {
  try {
    return parseProfile(localStorage.getItem(`${PROFILE_STORAGE_KEY}:${workspaceId}`))
  } catch { /* ignore */ }
  return null
}

function saveStoredProfile(workspaceId: string, profile: AdvisoryProfile): void {
  try { localStorage.setItem(`${PROFILE_STORAGE_KEY}:${workspaceId}`, JSON.stringify(profile)) } catch { /* ignore */ }
}

/**
 * Derive the advisory persona from the client onboarding profile instead of
 * asking again. The strongest signal is the human-capital priority mix; we map
 * it to the role that most naturally owns that agenda.
 */
function derivePersona(clientProfile: unknown): string {
  const cp = clientProfile as { agenda?: { hcPriorities?: string[] } } | null
  const hc = cp?.agenda?.hcPriorities ?? []
  const map: Record<string, string> = {
    'leadership-development': 'Leadership Development',
    'succession-planning': 'Talent Management',
    'talent-acquisition': 'Talent Acquisition',
    'learning-development': 'Learning',
    'skills-capability': 'Learning',
    'workforce-planning': 'Workforce Planning',
    'organization-design': 'Organization Development',
    'hr-operating-model': 'HR Operations',
    'rewards-strategy': 'Total Rewards',
    'employee-experience': 'Employee Experience',
  }
  for (const p of hc) {
    if (map[p]) return map[p]
  }
  return 'CHRO'
}

// ---------------------------------------------------------------------------
// Markdown rendering for assistant replies
// ---------------------------------------------------------------------------

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-slate-200 leading-relaxed space-y-3 [&_strong]:text-white [&_code]:text-blue-300 [&_code]:bg-slate-500/15 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-base font-semibold text-white mt-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold text-white mt-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-sm font-semibold text-white mt-1">{children}</h4>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">{children}</a>,
          table: ({ children }) => (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="text-slate-300">{children}</thead>,
          th: ({ children }) => <th className="text-left font-semibold border border-[#1e2433] bg-[#0c0e14] px-2.5 py-1.5">{children}</th>,
          td: ({ children }) => <td className="border border-[#1e2433] px-2.5 py-1.5 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-blue-500/40 pl-3 text-slate-400 italic">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Real conversational chat — the primary tab
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'user' | 'assistant'; content: string; id: string; plan?: ChatPlan | null }
type Attachment = { evidence_id: string; filename: string }

const CHAT_STORAGE_KEY = 'aivora-advisor-chat-v2'

const ADVISORY_PATHS: string[] = [
  'Assess our HC maturity',
  'Build a talent mobility strategy',
  'Design a HIPO program',
  'Draft a workforce plan',
]

const FORMAT_HINTS: string[] = ['Framework', 'Roadmap', 'RACI', 'KPI scorecard', 'Executive brief', 'SWOT']

const EVIDENCE_ACCEPT = '.pdf,.docx,.txt,.md,.pptx'

function loadStoredChat(workspaceId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${CHAT_STORAGE_KEY}:${workspaceId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.slice(-40)
  } catch { /* ignore */ }
  return []
}

function saveStoredChat(workspaceId: string, messages: ChatMessage[]): void {
  try { localStorage.setItem(`${CHAT_STORAGE_KEY}:${workspaceId}`, JSON.stringify(messages.slice(-40))) } catch { /* ignore */ }
}

// Server-side Challenge Brief content (relevant slice)
interface BriefContent {
  organization?: { organizationName?: string; industry?: string; region?: string; organizationSize?: string; maturityStage?: string; operatingModel?: string }
  businessSituation?: { situationSummary?: string; strategicDrivers?: string[] }
  hcChallenges?: { selectedAreas?: Array<{ area: string; severity: string; notes?: string }> }
  advisoryQuestions?: Array<{ questionText: string }>
  desiredOutputs?: { outputTypes?: string[] }
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-500/10 border-red-500/30 text-red-300',
  high: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  moderate: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  watch: 'bg-[#0c0e14] border-[#1e2433] text-slate-400',
}

function slugLabel(v?: string): string {
  return (v ?? '').replace(/-/g, ' ')
}

/** Pinned infographic summary of what the client supplied in the brief. */
function BriefingCard({ content }: { content: BriefContent }) {
  const org = content.organization ?? {}
  const sit = content.businessSituation ?? {}
  const areas = content.hcChallenges?.selectedAreas ?? []
  const drivers = sit.strategicDrivers ?? []
  const outputs = content.desiredOutputs?.outputTypes ?? []
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{org.organizationName || 'Client brief'}</p>
            <p className="text-[11px] text-slate-500 capitalize truncate">
              {[slugLabel(org.industry), slugLabel(org.region), slugLabel(org.organizationSize), slugLabel(org.maturityStage)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600">From the Challenge Brief</span>
      </div>
      {sit.situationSummary && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{sit.situationSummary}</p>
      )}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {areas.slice(0, 8).map((a, i) => (
            <span key={i} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize', SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.watch)}>
              {slugLabel(a.area)}
              <span className="opacity-70">{a.severity}</span>
            </span>
          ))}
        </div>
      )}
      {(drivers.length > 0 || outputs.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 capitalize">
          {drivers.length > 0 && <span><span className="font-semibold text-slate-400">Drivers:</span> {drivers.slice(0, 5).map(slugLabel).join(', ')}</span>}
          {outputs.length > 0 && <span><span className="font-semibold text-slate-400">Wants:</span> {outputs.slice(0, 4).map(slugLabel).join(', ')}</span>}
        </div>
      )}
    </div>
  )
}

const PREFS_STORAGE_KEY = 'aivora-advisor-prefs-v1'

interface ChatPrefs { length: 'default' | 'longer' | 'shorter'; style: 'consultant' | 'coach' | 'analyst' | 'custom'; instructions: string }
const DEFAULT_PREFS: ChatPrefs = { length: 'longer', style: 'consultant', instructions: '' }

function loadPrefs(workspaceId: string): ChatPrefs {
  try {
    const raw = localStorage.getItem(`${PREFS_STORAGE_KEY}:${workspaceId}`)
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_PREFS
}

function PrefsModal({ prefs, onSave, onClose }: { prefs: ChatPrefs; onSave: (p: ChatPrefs) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ChatPrefs>(prefs)
  const chip = (active: boolean) => active
    ? 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white transition-colors'
    : 'px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 border border-[#1e2433] bg-[#0c0e14] hover:border-blue-500/40 transition-colors'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#1e2433] bg-[#131720] p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-white">Configure chat</h2>
          <p className="text-xs text-slate-500 mt-1">Shape how the advisor responds in this workspace.</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">Response length</p>
          <div className="flex gap-2">
            {(['default', 'longer', 'shorter'] as const).map(l => (
              <button key={l} onClick={() => setDraft(d => ({ ...d, length: l }))} className={chip(draft.length === l)}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">Style</p>
          <div className="flex gap-2 flex-wrap">
            {(['consultant', 'coach', 'analyst', 'custom'] as const).map(st => (
              <button key={st} onClick={() => setDraft(d => ({ ...d, style: st }))} className={chip(draft.style === st)}>
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
          {draft.style === 'custom' && (
            <textarea
              value={draft.instructions}
              onChange={e => setDraft(d => ({ ...d, instructions: e.target.value }))}
              rows={3}
              placeholder="e.g. Always give GCC-specific examples, avoid jargon, address me as the CHRO"
              className="mt-3 w-full rounded-xl bg-[#0c0e14] border border-[#1e2433] text-sm text-white placeholder:text-slate-600 px-3.5 py-2.5 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => { onSave(draft); onClose() }} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">Save</button>
        </div>
      </div>
    </div>
  )
}

const PLAN_STORAGE_KEY = 'aivora-advisor-plan-v1'

function loadStoredPlan(workspaceId: string): ChatPlan | null {
  try {
    const raw = localStorage.getItem(`${PLAN_STORAGE_KEY}:${workspaceId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.steps)) return parsed as ChatPlan
  } catch { /* ignore */ }
  return null
}

type SessionReport =
  | { kind: 'detailed'; document: StudioOutputDocument }
  | { kind: 'summary'; summary: SummaryReport }

const DONUT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4']

function SummaryReportView({ summary }: { summary: SummaryReport }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-6">
        <h2 className="text-xl font-bold text-white">{summary.title}</h2>
        {summary.subtitle && <p className="text-sm text-slate-400 mt-1">{summary.subtitle}</p>}
        <p className="text-sm text-slate-300 leading-relaxed mt-4">{summary.overview}</p>
      </div>

      {summary.kpis && summary.kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {summary.kpis.map((k, i) => (
            <div key={i} className="rounded-2xl border border-[#1e2433] bg-[#131720] p-4">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{k.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{k.value}{k.unit && <span className="text-sm text-slate-400 ml-1">{k.unit}</span>}</p>
              {k.meaning && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{k.meaning}</p>}
            </div>
          ))}
        </div>
      )}

      {(summary.charts ?? []).map((c, ci) => {
        const total = c.items.reduce((a, it) => a + Math.max(0, it.value ?? 0), 0) || 1
        if (c.type === 'gantt') {
          const span = Math.max(6, ...c.items.map(it => (it.start ?? 0) + (it.duration ?? 1)))
          return (
            <div key={ci} className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
              <h3 className="text-sm font-semibold text-white">{c.title}</h3>
              {c.explanation && <p className="text-xs text-slate-500 mt-1 mb-4">{c.explanation}</p>}
              <div className="space-y-2.5 mt-4">
                {c.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-36 text-xs text-slate-300 truncate flex-shrink-0">{it.label}</span>
                    <div className="flex-1 h-5 rounded-md bg-[#1e2433] relative overflow-hidden">
                      <div
                        className="absolute top-0 h-full rounded-md bg-gradient-to-r from-blue-600 to-blue-400 flex items-center px-2"
                        style={{ left: `${((it.start ?? 0) / span) * 100}%`, width: `${Math.max(4, ((it.duration ?? 1) / span) * 100)}%` }}
                      >
                        <span className="text-[9px] font-bold text-white whitespace-nowrap">M{(it.start ?? 0) + 1}-M{(it.start ?? 0) + (it.duration ?? 1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-[10px] text-slate-600 pl-[9.75rem]">
                  <span>Month 1</span><span>Month {span}</span>
                </div>
              </div>
            </div>
          )
        }
        return (
          <div key={ci} className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
            <h3 className="text-sm font-semibold text-white">{c.title}</h3>
            {c.explanation && <p className="text-xs text-slate-500 mt-1 mb-4">{c.explanation}</p>}
            {c.type === 'donut' || c.type === 'pie' ? (
              <div className="flex items-center gap-6 flex-wrap mt-4">
                <div className="w-32 h-32 rounded-full flex-shrink-0" style={{
                  background: `conic-gradient(${c.items.map((it, i) => {
                    const start = c.items.slice(0, i).reduce((a, x) => a + ((x.value ?? 0) / total) * 100, 0)
                    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}% ${start + ((it.value ?? 0) / total) * 100}%`
                  }).join(', ')})`,
                }}>
                  {c.type === 'donut' && <div className="w-full h-full rounded-full" style={{ background: 'radial-gradient(circle at center, #131720 0 38%, transparent 39%)' }} />}
                </div>
                <div className="space-y-1.5">
                  {c.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-slate-300">{it.label}</span>
                      <span className="text-slate-500 tabular-nums">{Math.round(((it.value ?? 0) / total) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 mt-4">
                {c.items.map((it, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{it.label}</span>
                      <span className="text-slate-500 tabular-nums">{it.value ?? 0}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#1e2433] overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, it.value ?? 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {summary.takeaways && summary.takeaways.length > 0 && (
        <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">What this means</h3>
          <div className="space-y-3">
            {summary.takeaways.map((t, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-white">{t.title}</p>
                  {t.explanation && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t.explanation}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.data_notes && summary.data_notes.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="text-sm font-semibold text-amber-300 mb-3">Where these numbers come from</h3>
          <div className="space-y-3">
            {summary.data_notes.map((n, i) => (
              <div key={i} className="text-xs leading-relaxed">
                <p className="font-semibold text-white">{n.point}</p>
                {n.why && <p className="text-slate-400 mt-0.5">{n.why}</p>}
                {n.basis && <p className="text-slate-500 mt-0.5"><span className="font-semibold text-slate-400">Based on:</span> {n.basis}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.next_steps && summary.next_steps.length > 0 && (
        <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Next steps</h3>
          <ol className="space-y-2">
            {summary.next_steps.map((st, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300">
                <span className="text-blue-400 font-bold tabular-nums flex-shrink-0">{i + 1}.</span>
                {st}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

/** Claude-style plan block rendered inside the conversation. */
function PlanCardInline({ plan }: { plan: ChatPlan }) {
  const done = plan.steps.filter(st => st.status === 'done').length
  return (
    <div className="mt-3 rounded-xl border border-blue-500/25 bg-[#0c0e14] overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#1e2433] bg-blue-500/5">
        <ListChecks className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <p className="text-xs font-bold text-white flex-1 truncate">{plan.title}</p>
        <span className="text-[11px] font-bold text-blue-400 tabular-nums">{done}/{plan.steps.length}</span>
      </div>
      <div className="divide-y divide-[#161b28]">
        {plan.steps.map((st, i) => (
          <div key={i} className="flex gap-3 px-3.5 py-2.5">
            <span className={cn(
              'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5 border',
              st.status === 'done' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : st.status === 'in_progress' ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                : 'bg-[#131720] border-[#1e2433] text-slate-500'
            )}>
              {st.status === 'done' ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn('text-xs font-semibold', st.status === 'pending' ? 'text-slate-400' : 'text-white')}>
                {st.title}
                {st.status === 'in_progress' && <span className="ml-2 text-[10px] font-medium text-blue-400">in progress</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanRail({ plan, onFinalize, finalizing }: { plan: ChatPlan; onFinalize: (t: 'summary' | 'detailed') => void; finalizing: 'summary' | 'detailed' | null }) {
  const doneCount = plan.steps.filter(st => st.status === 'done').length
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-4 space-y-3 lg:sticky lg:top-4">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex-1 truncate">{plan.title}</p>
        <span className="text-xs font-bold text-blue-400">{doneCount}/{plan.steps.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
          animate={{ width: `${plan.steps.length ? (doneCount / plan.steps.length) * 100 : 0}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>
      <div className="space-y-2">
        {plan.steps.map((st, i) => (
          <div key={i} className={
            st.status === 'done' ? 'rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3.5 py-2.5'
              : st.status === 'in_progress' ? 'rounded-xl border border-blue-500/30 bg-blue-500/5 px-3.5 py-2.5'
              : 'rounded-xl border border-[#1e2433] bg-[#0c0e14] px-3.5 py-2.5'
          }>
            <div className="flex items-center gap-2.5">
              {st.status === 'done'
                ? <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-emerald-400" /></span>
                : <span className={st.status === 'in_progress'
                    ? 'w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0'
                    : 'w-5 h-5 rounded-full bg-[#131720] border border-[#1e2433] text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0'}>{i + 1}</span>}
              <span className={st.status === 'pending' ? 'text-sm font-medium text-slate-500' : 'text-sm font-medium text-white'}>{st.title}</span>
            </div>
            {st.note && <p className="text-[11px] text-slate-500 mt-1.5 pl-7">{st.note}</p>}
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-[#1e2433] space-y-2">
        <p className="text-[11px] text-slate-500 leading-relaxed">Happy with the plan? Turn this session into a report.</p>
        <button
          onClick={() => onFinalize('summary')}
          disabled={!!finalizing}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-[#1e2433] bg-[#0c0e14] text-slate-200 hover:border-blue-500/40 transition-colors disabled:opacity-50"
        >
          {finalizing === 'summary' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileBarChart2 className="w-3.5 h-3.5" />}
          Summary report
        </button>
        <button
          onClick={() => onFinalize('detailed')}
          disabled={!!finalizing}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_2px_12px_rgba(37,99,235,0.35)] transition-colors disabled:opacity-50"
        >
          {finalizing === 'detailed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Detailed report
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Claude-style tool-call approval card. Nothing generates until approved.
// ---------------------------------------------------------------------------

function ApprovalCard({
  studioName, orgName, reportType, onApprove, onEdit, onCancel,
}: {
  studioName: string
  orgName: string
  reportType: 'summary' | 'detailed'
  onApprove: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  return (
    <div className="max-w-xl rounded-2xl border border-blue-500/30 bg-[#0c0e14] overflow-hidden shadow-[0_2px_20px_rgba(37,99,235,0.15)]">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e2433] bg-blue-500/5">
        <Wand2 className="w-3.5 h-3.5 text-blue-400" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-300">Deep research + report</p>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-sm text-slate-200 leading-relaxed">
          I'll research and generate the{' '}
          <span className="font-semibold text-white">{studioName}</span>{' '}
          {reportType === 'summary' ? 'executive summary' : 'report'} for{' '}
          <span className="font-semibold text-white">{orgName}</span>, using your challenge brief, onboarding and any uploaded evidence.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={onApprove}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1e2433] bg-[#131720] hover:border-blue-500/40 text-slate-200 text-xs font-semibold transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Change studio
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-transparent text-slate-500 hover:text-white text-xs font-semibold transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The single-screen advisory workspace: chat on the left, live report on the
// right. One conversation drives everything - generating, refining, exporting.
// All state persists server-side per workspace with a revision trail.
// ---------------------------------------------------------------------------

function ConversationPanel({ profile, workspaceId, workspaceName }: { profile: AdvisoryProfile; workspaceId: string; workspaceName: string | null }) {
  const briefs = useBriefStore(s => s.briefs)
  const brief = briefs[workspaceId] ?? null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const getProfileFor = useClientProfileStore(st => st.getProfileFor)
  const [attachments, setAttachments] = useState<Attachment[]>(() => {
    const cp = getProfileFor(workspaceId) as unknown as { evidence?: { uploadedFiles?: Attachment[] } }
    return cp?.evidence?.uploadedFiles ?? []
  })
  const [plan, setPlan] = useState<ChatPlan | null>(null)
  const [report, setReport] = useState<SessionReport | null>(null)
  const [finalizing, setFinalizing] = useState<'summary' | 'detailed' | null>(null)
  const [pendingApproval, setPendingApproval] = useState<{ type: 'summary' | 'detailed'; studio: string | null } | null>(null)

  // Skill picker
  const [skills, setSkills] = useState<AdvisorySkill[]>([])
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [suggestedSkill, setSuggestedSkill] = useState<string | null>(null)

  // Report side controls
  const [reportOpen, setReportOpen] = useState(false)   // whether the right panel is expanded (mobile / user toggle)
  const [revisions, setRevisions] = useState<AdvisoryRevisionRow[]>([])
  const [revsOpen, setRevsOpen] = useState(false)
  const [refineDraft, setRefineDraft] = useState('')
  const [refining, setRefining] = useState(false)

  const [briefContent, setBriefContent] = useState<BriefContent | null>(null)
  const [briefLoaded, setBriefLoaded] = useState(false)
  const [sessionLoaded, setSessionLoaded] = useState(false)

  // Threads: many advisory chats per workspace. sessionId is the active thread.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [threads, setThreads] = useState<import('../lib/hcPlatformApi').AdvisoryThreadSummary[]>([])
  const [threadsOpen, setThreadsOpen] = useState(false)

  const [savedDraftId, setSavedDraftId] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [prefs, setPrefs] = useState<ChatPrefs>(() => loadPrefs(workspaceId))
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)   // highlighted item in the slash menu
  const [planExpanded, setPlanExpanded] = useState(false)   // compact plan box -> full steps on click

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const openedRef = useRef(false)
  const hydratedRef = useRef(false)

  const savePrefs = (p: ChatPrefs) => {
    setPrefs(p)
    try { localStorage.setItem(`${PREFS_STORAGE_KEY}:${workspaceId}`, JSON.stringify(p)) } catch { /* ignore */ }
  }

  const selectedSkillObj = selectedSkill ? skills.find(s => s.slug === selectedSkill) ?? null : null
  const orgName = brief?.organizationName || briefContent?.organization?.organizationName || workspaceName || 'your organisation'

  // ── Load the studio skill catalogue (all 27) ──
  useEffect(() => {
    let cancelled = false
    hcSkillsAPI.list().then(res => { if (!cancelled) setSkills(Array.isArray(res.data) ? res.data : []) }).catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [])

  // ── Pull the full server-side brief ──
  useEffect(() => {
    let cancelled = false
    challengeBriefsAPI.list().then(res => {
      if (cancelled) return
      const raw = (Array.isArray(res.data) ? res.data : res.data?.briefs ?? []) as Array<Record<string, unknown>>
      const mine = raw
        .filter(b => b.workspace_id === workspaceId && b.content)
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
      if (mine.length > 0) setBriefContent(mine[0].content as BriefContent)
      setBriefLoaded(true)
    }).catch(() => setBriefLoaded(true))
    return () => { cancelled = true }
  }, [workspaceId])

  // Apply a loaded thread's state into the panel.
  const applyThreadState = (s: import('../lib/hcPlatformApi').AdvisorySessionState) => {
    setSessionId(s.id)
    setMessages(Array.isArray(s.messages) && s.messages.length > 0
      ? s.messages.map((m, i) => ({ role: m.role, content: m.content, id: m.id ?? `h-${i}`, plan: m.plan ?? undefined }))
      : [])
    openedRef.current = Array.isArray(s.messages) && s.messages.length > 0
    setPlan(s.plan ?? null)
    setSelectedSkill(s.selected_skill ?? null)
    setSavedDraftId(s.saved_draft_id ?? null)
    if (s.report_document) {
      if (s.report_kind === 'summary') {
        const sr = (s.report_document as { summary_report?: SummaryReport }).summary_report ?? (s.report_document as unknown as SummaryReport)
        setReport({ kind: 'summary', summary: sr })
      } else {
        setReport({ kind: 'detailed', document: s.report_document as unknown as StudioOutputDocument })
      }
      setReportOpen(true)
    } else {
      setReport(null)
      setReportOpen(false)
    }
  }

  const refreshThreads = async () => {
    try {
      const res = await hcAiAdvisoryAPI.listThreads(workspaceId)
      setThreads(Array.isArray(res.data) ? res.data : [])
    } catch { /* ignore */ }
  }

  // ── Hydrate: list threads, load the most recent (or create one) ──
  useEffect(() => {
    let cancelled = false
    hcAiAdvisoryAPI.listThreads(workspaceId).then(async res => {
      if (cancelled) return
      const list = Array.isArray(res.data) ? res.data : []
      setThreads(list)
      if (list.length > 0) {
        const full = await hcAiAdvisoryAPI.getThread(list[0].id)
        if (!cancelled) applyThreadState(full.data)
      } else {
        const created = await hcAiAdvisoryAPI.createThread(workspaceId, {})
        if (!cancelled) { applyThreadState(created.data); setThreads([{
          id: created.data.id!, title: created.data.title ?? 'New chat', selected_skill: null,
          has_report: false, report_kind: null, message_count: 0,
          updated_at: created.data.updated_at ?? null, created_at: null }]) }
      }
    }).catch(() => { /* fresh */ }).finally(() => { if (!cancelled) { setSessionLoaded(true); hydratedRef.current = true } })
    return () => { cancelled = true }
  }, [workspaceId])

  // ── Autosave the active thread (debounced), auto-titling from the first ask ──
  useEffect(() => {
    if (!hydratedRef.current || !sessionId) return
    const t = setTimeout(() => {
      // Derive a thread title once, from the first user message (or the studio).
      const current = threads.find(t => t.id === sessionId)
      const hasTitle = !!current?.title && current.title !== 'New chat'
      let titlePatch: string | undefined
      if (!hasTitle) {
        const firstUser = messages.find(m => m.role === 'user')?.content?.trim()
        const derived = firstUser
          ? firstUser.replace(/\s+/g, ' ').slice(0, 60)
          : (selectedSkill ? (skills.find(s => s.slug === selectedSkill)?.name ?? '') : '')
        if (derived) titlePatch = derived
      }
      void hcAiAdvisoryAPI.saveThread(sessionId, {
        messages: messages.map(m => ({ role: m.role, content: m.content, id: m.id, plan: m.plan ?? null })),
        plan,
        selected_skill: selectedSkill,
        saved_draft_id: savedDraftId,
        ...(titlePatch ? { title: titlePatch } : {}),
      }).then(() => {
        if (titlePatch) {
          setThreads(prev => prev.map(t => t.id === sessionId ? { ...t, title: titlePatch! } : t))
        }
      }).catch(() => { /* best-effort */ })
    }, 900)
    return () => clearTimeout(t)
  }, [sessionId, messages, plan, selectedSkill, savedDraftId])

  // ── Fresh session: the advisor opens the conversation itself ──
  useEffect(() => {
    if (openedRef.current || !briefLoaded || !sessionLoaded || messages.length > 0) return
    openedRef.current = true
    setSending(true)
    hcAiAdvisoryAPI.chat({
      messages: [],
      brief: (briefContent as unknown as Record<string, unknown>) ?? (brief ? (brief as unknown as Record<string, unknown>) : null),
      context: { workspace_id: workspaceId, workspace_name: workspaceName ?? undefined },
      profile,
      client_profile: (getProfileFor(workspaceId) as unknown as Record<string, unknown>) ?? null,
    }).then(res => {
      setMessages(prev => prev.length === 0 ? [{ role: 'assistant', content: res.data.reply, id: `a-${Date.now()}` }] : prev)
    }).catch(() => { /* fall back to static empty state */ }).finally(() => { setSending(false); setTimeout(() => textareaRef.current?.focus(), 0) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, briefLoaded, sessionLoaded, sessionId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [draft])

  // ── Report generation ──
  const finalizeSession = async (
    type: 'summary' | 'detailed',
    history?: ChatMessage[],
    planOverride?: ChatPlan | null,
    studioSlug?: string | null,
    note?: string,
  ) => {
    const msgs = history ?? messages
    if (finalizing || msgs.length === 0) return
    setError(null)
    setFinalizing(type)
    setReportOpen(true)
    try {
      const res = await hcAiAdvisoryAPI.finalizeReport({
        studio: studioSlug ?? selectedSkill ?? null,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
        report_type: type,
        report_state: report ? ((report.kind === 'detailed' ? report.document : report.summary) as unknown as Record<string, unknown>) : undefined,
        plan_state: planOverride !== undefined ? planOverride : plan,
        brief: (briefContent as unknown as Record<string, unknown>) ?? (brief ? (brief as unknown as Record<string, unknown>) : null),
        client_profile: (getProfileFor(workspaceId) as unknown as Record<string, unknown>) ?? null,
        profile,
        evidence_ids: attachments.length > 0 ? attachments.map(a => a.evidence_id) : undefined,
        context: { workspace_id: workspaceId, workspace_name: workspaceName ?? undefined },
      })
      setSavedDraftId(null)
      let nextReport: SessionReport | null = null
      if (type === 'detailed' && res.data.document) {
        nextReport = { kind: 'detailed', document: res.data.document as unknown as StudioOutputDocument }
      } else if (type === 'summary' && res.data.summary) {
        nextReport = { kind: 'summary', summary: res.data.summary }
      }
      if (!nextReport) { setError('The report came back empty. Try again.'); return }
      setReport(nextReport)
      // Persist the report + snapshot a revision.
      const docForSave = nextReport.kind === 'detailed'
        ? (nextReport.document as unknown as Record<string, unknown>)
        : ({ studio_id: 'ai_advisory:executive_summary', title: nextReport.summary.title, subtitle: nextReport.summary.subtitle ?? '', summary_report: nextReport.summary } as Record<string, unknown>)
      if (sessionId) {
        void hcAiAdvisoryAPI.saveThreadReport(sessionId, {
          report_document: docForSave, report_kind: type, note: note ?? 'Generated from the advisory session',
        }).then(() => { void refreshRevisions(); void refreshThreads() }).catch(() => { /* best-effort */ })
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not generate the report. Try again.')
    } finally {
      setFinalizing(null)
    }
  }

  const refreshRevisions = async () => {
    if (!sessionId) return
    try {
      const res = await hcAiAdvisoryAPI.listThreadRevisions(sessionId)
      setRevisions(Array.isArray(res.data) ? res.data : [])
    } catch { /* ignore */ }
  }

  const restoreRevision = (r: AdvisoryRevisionRow) => {
    if (r.report_kind === 'summary') {
      const sr = (r.report_document as { summary_report?: SummaryReport }).summary_report ?? (r.report_document as unknown as SummaryReport)
      setReport({ kind: 'summary', summary: sr })
    } else {
      setReport({ kind: 'detailed', document: r.report_document as unknown as StudioOutputDocument })
    }
    setSavedDraftId(null)
    setRevsOpen(false)
  }

  const approveGeneration = () => {
    if (!pendingApproval) return
    const p = pendingApproval
    setPendingApproval(null)
    void finalizeSession(p.type, messages, plan, p.studio ?? selectedSkill)
  }

  // ── Refine the open report through the same chat ──
  const sendRefine = async (content: string) => {
    const clean = content.trim()
    if (!clean || refining || finalizing || !report) return
    setError(null)
    setRefineDraft('')
    // Push the refine ask into the visible thread so history stays coherent.
    const askMsg: ChatMessage = { role: 'user', content: clean, id: `ru-${Date.now()}` }
    const next = [...messages, askMsg]
    setMessages(next)
    setRefining(true)
    try {
      const res = await hcAiAdvisoryAPI.chat({
        messages: next.map(m => ({ role: m.role, content: m.content })),
        brief: (briefContent as unknown as Record<string, unknown>) ?? (brief ? (brief as unknown as Record<string, unknown>) : null),
        context: { workspace_id: workspaceId, workspace_name: workspaceName ?? undefined },
        profile,
        client_profile: (getProfileFor(workspaceId) as unknown as Record<string, unknown>) ?? null,
        report_state: (report.kind === 'detailed' ? report.document : report.summary) as unknown as Record<string, unknown>,
        preferences: prefs,
      })
      const withReply = [...next, { role: 'assistant' as const, content: res.data.reply, id: `ra-${Date.now()}` }]
      setMessages(withReply)
      // Regenerate the report with the refinement, snapshotting a new revision.
      void finalizeSession(report.kind, withReply, plan, selectedSkill, clean)
    } catch {
      setError('The advisor is unavailable right now. Try again.')
    } finally {
      setRefining(false)
    }
  }

  // ── #7/#10: confirmed report -> Draft Inbox draft -> export + Canvas pipeline ──
  const confirmAndPublish = async () => {
    if (!report || savingDraft) return
    setSavingDraft(true)
    setError(null)
    try {
      const content = report.kind === 'detailed'
        ? (report.document as unknown as Record<string, unknown>)
        : ({ studio_id: 'ai_advisory:executive_summary', title: report.summary.title, subtitle: report.summary.subtitle ?? '', summary_report: report.summary } as Record<string, unknown>)
      const res = await draftsAPI.create({
        workspace_id: workspaceId,
        content,
        skill_name: report.kind === 'detailed' ? ((report.document as { studio_name?: string }).studio_name ?? 'Strategy') : 'Strategy',
      })
      setSavedDraftId(String((res.data as { id?: string })?.id ?? ''))
    } catch {
      setError('Could not publish the report to the Draft Inbox. Try again.')
    } finally {
      setSavingDraft(false)
    }
  }

  const exportDraft = async (fmt: 'pptx' | 'pdf' | 'docx' | 'html') => {
    if (!savedDraftId || exporting) return
    setExporting(fmt)
    try {
      const res = await exportsAPI.create(savedDraftId, fmt)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `advisory-report.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: unknown }; code?: string }
      let detail = ''
      if (e.response?.data instanceof Blob) {
        try { detail = JSON.parse(await (e.response.data as Blob).text())?.detail ?? '' } catch { /* ignore */ }
      }
      if (e.response?.status === 401) setError('Your session expired. Refresh the page and sign in again, then re-export.')
      else if (e.code === 'ECONNABORTED') setError(`The ${fmt.toUpperCase()} took too long to build. Try again.`)
      else setError(detail || `Could not export as ${fmt.toUpperCase()}. Try again.`)
    } finally {
      setExporting(null)
    }
  }

  const sendMessage = async (content: string) => {
    const clean = content.trim()
    if (!clean || sending) return
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: clean, id: `u-${Date.now()}` }
    const next = [...messages, userMsg]
    setMessages(next)
    setDraft('')
    setSending(true)
    const payload = {
      messages: next.map(m => ({ role: m.role, content: m.content })),
      brief: (briefContent as unknown as Record<string, unknown>) ?? (brief ? (brief as unknown as Record<string, unknown>) : null),
      context: { workspace_id: workspaceId, workspace_name: workspaceName ?? undefined },
      profile,
      evidence_ids: attachments.length > 0 ? attachments.map(a => a.evidence_id) : undefined,
      client_profile: (getProfileFor(workspaceId) as unknown as Record<string, unknown>) ?? null,
      plan_state: plan,
      report_state: report ? ((report.kind === 'detailed' ? report.document : report.summary) as unknown as Record<string, unknown>) : undefined,
      preferences: prefs,
    }

    const applyResult = (reply: string, nextPlan: ChatPlan | null, finalize: 'summary' | 'detailed' | null, studio: string | null) => {
      setPlan(nextPlan)
      if (studio && !selectedSkill) setSuggestedSkill(studio)
      if (finalize === 'summary' || finalize === 'detailed') {
        // Ask for approval (Claude-style tool card) before generating anything.
        setPendingApproval({ type: finalize, studio: studio ?? selectedSkill })
      }
    }

    const assistantId = `a-${Date.now()}`
    try {
      setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId }])
      let acc = ''
      const meta = await hcAiAdvisoryAPI.chatStream(payload, (tok) => {
        acc += tok
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc } : m))
      })
      const nextPlan = meta.plan ?? null
      const planChanged = JSON.stringify(nextPlan) !== JSON.stringify(plan)
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc, plan: planChanged && nextPlan ? nextPlan : undefined } : m))
      applyResult(acc, nextPlan, meta.finalize, meta.studio)
    } catch {
      try {
        const res = await hcAiAdvisoryAPI.chat(payload)
        const reply = res.data.reply
        const nextPlan = res.data.plan ?? null
        const planChanged = JSON.stringify(nextPlan) !== JSON.stringify(plan)
        setMessages(prev => {
          const withoutPlaceholder = prev.filter(m => m.id !== assistantId)
          return [...withoutPlaceholder, { role: 'assistant', content: reply, id: assistantId, plan: planChanged && nextPlan ? nextPlan : undefined }]
        })
        applyResult(reply, nextPlan, res.data.finalize ?? null, res.data.studio ?? null)
      } catch (err: unknown) {
        setMessages(prev => prev.filter(m => m.id !== assistantId))
        setError(err instanceof Error ? err.message : 'The advisor is unavailable right now.')
      }
    } finally {
      setSending(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const resetLocalThreadState = () => {
    setMessages([])
    setAttachments([])
    setPlan(null)
    setReport(null)
    setReportOpen(false)
    setRevisions([])
    setSavedDraftId(null)
    setSelectedSkill(null)
    setPendingApproval(null)
    setThreadsOpen(false)
    openedRef.current = false
  }

  const newThread = async () => {
    try {
      const res = await hcAiAdvisoryAPI.createThread(workspaceId, {})
      resetLocalThreadState()
      applyThreadState(res.data)
      await refreshThreads()
    } catch { setError('Could not start a new chat. Try again.') }
  }

  const switchThread = async (id: string) => {
    if (id === sessionId) { setThreadsOpen(false); return }
    setThreadsOpen(false)
    try {
      const res = await hcAiAdvisoryAPI.getThread(id)
      resetLocalThreadState()
      applyThreadState(res.data)
    } catch { setError('Could not open that chat. Try again.') }
  }

  const deleteThread = async (id: string) => {
    try {
      await hcAiAdvisoryAPI.deleteThread(id)
      const remaining = threads.filter(t => t.id !== id)
      setThreads(remaining)
      if (id === sessionId) {
        if (remaining.length > 0) { await switchThread(remaining[0].id) }
        else { await newThread() }
      }
    } catch { setError('Could not delete that chat. Try again.') }
  }

  // "Clear" now resets the CURRENT thread's conversation (keeps the thread + its report history).
  const clear = () => {
    setMessages([])
    setAttachments([])
    setPlan(null)
    setPendingApproval(null)
    openedRef.current = false
    if (sessionId) void hcAiAdvisoryAPI.saveThread(sessionId, { messages: [], plan: null }).catch(() => { /* ignore */ })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft) }
  }

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || uploading) return
    setError(null)
    setUploading(true)
    try {
      const res = await hcAiAdvisoryAPI.uploadEvidence(file)
      setAttachments(prev => [...prev, { evidence_id: res.data.evidence_id, filename: res.data.filename }])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not read that file. Try a pdf, docx, txt, md or pptx.')
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.evidence_id !== id))

  // The plan is "active" while it is running (not every step done). Once the
  // report is generated we treat the plan as background and collapse it.
  const planActive = !!plan && !report && plan.steps.some(s => s.status !== 'done')
  const hasReportPane = reportOpen && (report || finalizing)

  // A "generate report" affordance surfaces once there is a plan or enough conversation.
  const canGenerate = messages.filter(m => m.role === 'user').length >= 1 || !!plan
  const requestGeneration = (type: 'summary' | 'detailed') => {
    if (!selectedSkill && suggestedSkill) setSelectedSkill(suggestedSkill)
    setPendingApproval({ type, studio: selectedSkill ?? suggestedSkill })
  }

  // ── Slash-command studio picker ──
  // When the draft is exactly "/<query>" (a single leading-slash token), show a
  // filterable menu of all 27 studios. Picking one sets the active studio.
  const slashMatch = /^\/([\w-]*)$/.exec(draft)
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : null
  const slashResults = slashQuery !== null
    ? skills.filter(s => s.slug.toLowerCase().includes(slashQuery) || s.name.toLowerCase().includes(slashQuery))
    : []
  const slashOpen = slashQuery !== null && slashResults.length > 0
  const pickStudioSlash = (s: AdvisorySkill) => {
    setSelectedSkill(s.slug)
    setDraft('')
    setSlashIdx(0)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  return (
    <div className={cn('grid gap-4 items-start w-full',
      // Claude model: panels always FILL the available width; the message text
      // inside each panel is capped + centred for readability.
      hasReportPane ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'
        : planActive ? 'lg:grid-cols-[minmax(0,1fr)_320px]'
        : 'grid-cols-1')}>
      {/* ─────────────────── LEFT: conversation ─────────────────── */}
      <div className="flex flex-col h-[calc(100vh-8rem)] rounded-2xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden w-full">
        {/* Toolbar: threads + active studio chip (set via /slash command) + report toggle */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#161b28] flex-wrap">
          {/* Thread switcher */}
          <div className="relative">
            <button onClick={() => { setThreadsOpen(o => !o); if (!threadsOpen) void refreshThreads() }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e2433] bg-[#131720] hover:border-blue-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors max-w-[220px]">
              <MessageSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="truncate">{threads.find(t => t.id === sessionId)?.title || 'Chat'}</span>
              <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
            </button>
            {threadsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setThreadsOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-40 w-72 rounded-xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                  <button onClick={newThread}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-[#161b28] hover:bg-white/5 transition-colors">
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-semibold text-white">New chat</span>
                  </button>
                  <div className="max-h-72 overflow-y-auto">
                    {threads.map(t => (
                      <div key={t.id} className={cn('group flex items-center gap-2 px-3 py-2 transition-colors',
                        t.id === sessionId ? 'bg-blue-600/10' : 'hover:bg-white/5')}>
                        <button onClick={() => switchThread(t.id)} className="min-w-0 flex-1 text-left">
                          <span className="block text-xs font-medium text-white truncate">{t.title || 'New chat'}</span>
                          <span className="block text-[10px] text-slate-500 truncate">
                            {t.has_report ? `${t.report_kind ?? 'report'} · ` : ''}{t.message_count} messages
                          </span>
                        </button>
                        {threads.length > 1 && (
                          <button onClick={() => deleteThread(t.id)} title="Delete chat"
                            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-all flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={newThread} title="New chat"
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[#1e2433] bg-[#131720] hover:border-blue-500/40 text-slate-300 hover:text-white transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
            Type <code className="text-blue-300 bg-blue-500/10 px-1 py-0.5 rounded">/</code> to pick a studio
          </span>
          <div className="flex-1" />
          {report && !hasReportPane && (
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 transition-colors">
              <PanelRightOpen className="w-3.5 h-3.5" /> Show report
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={clear} className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-5">
          <div className="w-full px-5 sm:px-8 space-y-5">
          {briefContent && <BriefingCard content={briefContent} />}
          {messages.length === 1 && !sending && (
            <div className="flex flex-wrap gap-2">
              {[
                ...(briefContent?.advisoryQuestions ?? []).slice(0, 3).map(q => q.questionText),
                'Design a solution for our top challenge',
                'Plan the 12-month roadmap',
              ].filter(Boolean).slice(0, 5).map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                  className="rounded-full border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3.5 py-1.5 text-xs text-blue-300 transition-colors text-left">
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.length === 0 && !sending && (
            <div className="max-w-2xl mx-auto text-center space-y-6 py-8">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">Talk to your HC advisor</h2>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Twenty years of consulting experience, on demand. Ask anything about your workforce, capability, leadership pipeline, or strategy, then turn the conversation into a full studio report.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">Where do you want to start?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {ADVISORY_PATHS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      className="rounded-full border border-[#1e2433] bg-[#0f1117] hover:border-blue-500/40 hover:bg-[#111420] px-4 py-2 text-sm text-slate-200 transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map(m => (
              m.role === 'assistant' && m.content.length === 0 ? null : (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {m.role === 'assistant' ? (
                  <div className="flex gap-3 max-w-[92%]">
                    <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3">
                      <AssistantMarkdown content={m.content} />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <div className="rounded-2xl rounded-tr-sm bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                )}
              </motion.div>
              )
            ))}
          </AnimatePresence>

          {/* Claude-style tool-call approval - nothing generates until approved */}
          {pendingApproval && (
            <ApprovalCard
              studioName={
                (pendingApproval.studio && skills.find(s => s.slug === pendingApproval.studio)?.name)
                || (selectedSkillObj?.name)
                || (pendingApproval.type === 'summary' ? 'Executive Summary' : 'Advisory')
              }
              orgName={orgName}
              reportType={pendingApproval.type}
              onApprove={approveGeneration}
              onEdit={() => { setPendingApproval(null); setDraft('/'); setTimeout(() => textareaRef.current?.focus(), 0) }}
              onCancel={() => setPendingApproval(null)}
            />
          )}

          {sending && !(messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content.length > 0) && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs px-3 py-2">{error}</div>
          )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-[#1e2433] bg-[#0f1117] py-3.5">
          <div className="w-full px-5 sm:px-8 relative">
          {/* Generate-report affordance */}
          {canGenerate && !pendingApproval && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-600 mr-1">Turn this into a</span>
              <button onClick={() => requestGeneration('detailed')} disabled={!!finalizing}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-500 px-3 py-1 text-[11px] font-semibold text-white transition-colors disabled:opacity-50">
                <FileText className="w-3 h-3" /> Detailed report
              </button>
              <button onClick={() => requestGeneration('summary')} disabled={!!finalizing}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1e2433] bg-[#0c0e14] hover:border-blue-500/40 px-3 py-1 text-[11px] font-semibold text-slate-200 transition-colors disabled:opacity-50">
                <FileBarChart2 className="w-3 h-3" /> Summary
              </button>
            </div>
          )}
          {/* Slash-command studio menu - floats ABOVE the composer so the full
              list (all 27) is reachable and scrollable, never clipped. */}
          {slashOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-40 rounded-xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden shadow-[0_-8px_32px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#161b28]">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-600">Studios · pick one to shape the report</span>
                <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{slashResults.length}</span>
              </div>
              <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain">
                {slashResults.map((s, i) => (
                  <button key={s.slug} onMouseEnter={() => setSlashIdx(i)} onClick={() => pickStudioSlash(s)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      i === slashIdx ? 'bg-blue-600/15' : 'hover:bg-white/5')}>
                    <span className="w-7 h-7 rounded-lg bg-[#131720] border border-[#1e2433] flex items-center justify-center flex-shrink-0">
                      <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white truncate">{s.name}</span>
                      <span className="block text-[11px] text-slate-500 truncate">/{s.slug}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col rounded-2xl border border-[#1e2433] bg-[#0c0e14] focus-within:border-blue-500/40 transition-colors px-2 py-2">
            {/* Attached context (studio + evidence) - inside the input box, above the text */}
            {(selectedSkillObj || attachments.length > 0) && (
              <div className="flex flex-wrap gap-1.5 px-1 pb-2 pt-0.5">
                {selectedSkillObj && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-300 text-[11px] font-semibold px-2.5 py-1">
                    <LayoutGrid className="w-3 h-3" />
                    <span className="max-w-[200px] truncate">{selectedSkillObj.name}</span>
                    <button onClick={() => setSelectedSkill(null)} className="hover:text-white transition-colors" aria-label="Clear studio">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {attachments.map(a => (
                  <span key={a.evidence_id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[11px] px-2.5 py-1">
                    <Paperclip className="w-3 h-3" />
                    <span className="max-w-[180px] truncate">{a.filename}</span>
                    <button onClick={() => removeAttachment(a.evidence_id)} className="hover:text-white transition-colors" aria-label={`Remove ${a.filename}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept={EVIDENCE_ACCEPT} className="hidden" onChange={handleFilePicked} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || sending} title="Attach evidence"
              className="flex-shrink-0 w-9 h-9 rounded-xl text-slate-500 hover:text-blue-400 hover:bg-white/5 flex items-center justify-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <button onClick={() => setPrefsOpen(true)} title="Configure chat"
              className="flex-shrink-0 w-9 h-9 rounded-xl text-slate-500 hover:text-blue-400 hover:bg-white/5 flex items-center justify-center transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <textarea ref={textareaRef} value={draft} onChange={e => { setDraft(e.target.value); setSlashIdx(0) }}
              onKeyDown={e => {
                if (slashOpen) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, slashResults.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickStudioSlash(slashResults[slashIdx]); return }
                  if (e.key === 'Escape') { e.preventDefault(); setDraft(''); return }
                }
                onKeyDown(e)
              }}
              rows={1} disabled={sending} autoFocus
              placeholder={brief ? `Ask about ${brief.organizationName || 'your organisation'}...  (type / for studios)` : 'Ask anything, or type / to pick a studio...'}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none px-2 py-2 resize-none leading-relaxed self-center" />
            <button onClick={() => sendMessage(draft)} disabled={!draft.trim() || sending} title="Send (Enter)"
              className={draft.trim() && !sending
                ? 'flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition-colors'
                : 'flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600/25 text-white/60 flex items-center justify-center cursor-not-allowed transition-colors'}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* ─────── RIGHT: minimal working-plan box (while working, no report yet) ─────── */}
      {planActive && !hasReportPane && plan && (() => {
        const done = plan.steps.filter(s => s.status === 'done').length
        const active = plan.steps.find(s => s.status === 'in_progress')
        const pct = plan.steps.length ? Math.round((done / plan.steps.length) * 100) : 0
        return (
          <div className="self-start rounded-2xl border border-[#1e2433] bg-[#0f1117] overflow-hidden">
            {/* Compact header: title + N/M */}
            <button onClick={() => setPlanExpanded(v => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
              <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                <ListChecks className="w-4 h-4 text-blue-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">Working plan</span>
                <span className="block text-sm font-semibold text-white truncate">{plan.title}</span>
              </span>
              <span className="text-sm font-bold text-blue-400 tabular-nums flex-shrink-0">{done}/{plan.steps.length}</span>
              <ChevronDown className={cn('w-4 h-4 text-slate-500 flex-shrink-0 transition-transform', planExpanded && 'rotate-180')} />
            </button>
            {/* Progress bar */}
            <div className="px-4 pb-3">
              <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                  animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
              </div>
              {!planExpanded && active && (
                <p className="text-[11px] text-slate-500 mt-2 truncate">
                  <span className="text-blue-400 font-medium">Now:</span> {active.title}
                </p>
              )}
            </div>
            {/* Expanded step detail (optional) */}
            {planExpanded && (
              <div className="px-4 pb-4 border-t border-[#161b28] pt-3 max-h-[50vh] overflow-y-auto">
                <PlanCardInline plan={plan} />
              </div>
            )}
          </div>
        )
      })()}

      {/* ─────────────────── RIGHT: live report canvas ─────────────────── */}
      {hasReportPane && (
        <div className="flex flex-col h-[calc(100vh-8rem)] rounded-2xl border border-[#1e2433] bg-[#0f1117] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2433] bg-[#0f1117]/95 backdrop-blur flex-wrap">
            <FileBarChart2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {report?.kind === 'detailed' ? ((report.document as { title?: string }).title ?? 'Studio deliverable')
                  : report?.kind === 'summary' ? report.summary.title : 'Generating report...'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {report?.kind === 'detailed' ? `${(report.document as { studio_name?: string }).studio_name ?? 'Studio deliverable'} · from this session`
                  : report ? 'Executive summary · from this session' : ''}
              </p>
            </div>
            {revisions.length > 0 && (
              <button onClick={() => { setRevsOpen(o => !o); if (!revsOpen) void refreshRevisions() }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#1e2433] bg-[#131720] hover:border-blue-500/40 text-[11px] font-semibold text-slate-300 transition-colors">
                <History className="w-3 h-3" /> v{revisions[0]?.version ?? 1}
              </button>
            )}
            <button onClick={() => setReportOpen(false)} title="Hide report"
              className="w-8 h-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>

          {/* Revision trail dropdown */}
          {revsOpen && revisions.length > 0 && (
            <div className="border-b border-[#1e2433] bg-[#0c0e14] max-h-52 overflow-y-auto">
              {revisions.map(r => (
                <button key={r.version} onClick={() => restoreRevision(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-[#161b28] last:border-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-bold flex items-center justify-center flex-shrink-0">v{r.version}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white truncate">{r.note || 'Report update'}</span>
                    <span className="block text-[10px] text-slate-500 capitalize">{r.report_kind ?? 'detailed'} report</span>
                  </span>
                  <RotateCcw className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Report body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {report ? (
              <div className="max-w-3xl mx-auto">
                {report.kind === 'detailed' ? <StudioOutput document={report.document} /> : <SummaryReportView summary={report.summary} />}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-[#1e2433] border-t-blue-500 animate-spin" />
                <p className="text-sm text-slate-500">Researching and building the {finalizing === 'summary' ? 'executive summary' : 'studio report'}...</p>
              </div>
            )}
          </div>

          {/* Report actions + refine */}
          <div className="border-t border-[#1e2433] bg-[#0c0e14] px-4 py-3 space-y-2.5">
            {report && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {savedDraftId ? (
                  <>
                    {(['pdf', 'pptx', 'docx', 'html'] as const).map(fmt => (
                      <button key={fmt} onClick={() => exportDraft(fmt)} disabled={!!exporting}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1e2433] bg-[#131720] hover:border-blue-500/40 text-[11px] font-semibold text-slate-200 transition-colors disabled:opacity-50">
                        {exporting === fmt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                    <Link to={`/canvas/${savedDraftId}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[11px] font-semibold transition-colors">
                      <Pencil className="w-3 h-3" /> Canvas
                    </Link>
                  </>
                ) : (
                  <button onClick={confirmAndPublish} disabled={savingDraft || !!finalizing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                    {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve output - unlock downloads
                  </button>
                )}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-[#1e2433] bg-[#0f1117] focus-within:border-blue-500/40 transition-colors px-2 py-1.5">
              <Wand2 className="w-4 h-4 text-blue-400 flex-shrink-0 self-center ml-1" />
              <textarea value={refineDraft} onChange={e => setRefineDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRefine(refineDraft) } }}
                rows={1} disabled={refining || !!finalizing || !report}
                placeholder="Refine the report - add a section, benchmarks, simplify..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none px-1 py-1.5 resize-none leading-relaxed self-center" />
              <button onClick={() => sendRefine(refineDraft)} disabled={!refineDraft.trim() || refining || !!finalizing || !report}
                className={refineDraft.trim() && !refining && !finalizing
                  ? 'flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors'
                  : 'flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600/25 text-white/60 flex items-center justify-center cursor-not-allowed transition-colors'}>
                {refining || finalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {prefsOpen && <PrefsModal prefs={prefs} onSave={savePrefs} onClose={() => setPrefsOpen(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Structured deliverable panel (kept as a tab)
// ---------------------------------------------------------------------------

function DeliverablePanel() {
  const [topic, setTopic] = useState<string>(DELIVERABLE_TOPICS[0].key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<StudioOutputDocument | null>(null)
  const briefs = useBriefStore(s => s.briefs)
  const currentBrief = pickLatestBrief(briefs)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setDoc(null)
    try {
      const reviewId = readActiveReviewId()
      const res = await hcAiAdvisoryAPI.deliverable({
        topic,
        review_id: reviewId,
        brief: currentBrief ? (currentBrief as unknown as Record<string, unknown>) : null,
      })
      setDoc(res.data.document as StudioOutputDocument)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate deliverable'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateSection = async (sectionId: string, hint: string | null) => {
    if (!doc) return
    try {
      const reviewId = readActiveReviewId()
      const res = await hcAiAdvisoryAPI.regenerateSection({
        topic,
        section_id: sectionId,
        review_id: reviewId,
        brief: currentBrief ? (currentBrief as unknown as Record<string, unknown>) : null,
        hint,
      })
      const updated = res.data.section as StudioOutputSection
      setDoc(prev => prev ? { ...prev, sections: prev.sections.map(s => s.id === updated.id ? updated : s) } : prev)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate section'
      setError(msg)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Generate Framework / Program</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Produces a multi-section deliverable grounded in the recommendation library and your latest review data.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#0c0e14] border border-[#1e2433] text-sm text-slate-100 px-3 py-2.5 focus:outline-none focus:border-blue-500/50"
          >
            {DELIVERABLE_TOPICS.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] ring-1 ring-blue-500/40"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>
        )}
      </div>

      {doc && (
        <div className="rounded-2xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden">
          <StudioOutput document={doc} onRegenerateSection={handleRegenerateSection} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guided diagnostic (the old wizard, kept as a tab)
// ---------------------------------------------------------------------------

type Bubble =
  | { role: 'advisor'; text: string; id: string }
  | { role: 'user';    text: string; id: string }
  | { role: 'question'; question: Question; id: string }
  | { role: 'report'; id: string }

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function formatAnswerLabel(q: Question, v: AnswerValue): string {
  if (q.type === 'likert' && typeof v === 'number') {
    return ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'][v - 1] ?? `${v}`
  }
  if (q.type === 'single' && typeof v === 'string') {
    return q.options?.find(o => o.value === v)?.label ?? v
  }
  if (q.type === 'multi' && Array.isArray(v)) {
    if (v.length === 0) return '(none selected)'
    return v.map(val => q.options?.find(o => o.value === val)?.label ?? val).join(', ')
  }
  return String(v)
}

function ackForAnswer(q: Question, v: AnswerValue): string {
  if (q.dimensions.length === 0) return pickRandom(chatPersona.acknowledgments.mid)
  if (q.type === 'likert' && typeof v === 'number') {
    if (v <= 2) return pickRandom(chatPersona.acknowledgments.low)
    if (v === 3) return pickRandom(chatPersona.acknowledgments.mid)
    return pickRandom(chatPersona.acknowledgments.high)
  }
  if (q.type === 'single' && typeof v === 'string' && q.options) {
    const idx = q.options.findIndex(o => o.value === v)
    const rel = idx / Math.max(1, q.options.length - 1)
    if (rel < 0.34) return pickRandom(chatPersona.acknowledgments.low)
    if (rel < 0.67) return pickRandom(chatPersona.acknowledgments.mid)
    return pickRandom(chatPersona.acknowledgments.high)
  }
  return pickRandom(chatPersona.acknowledgments.mid)
}

function GuidedDiagnostic() {
  const { answers, setAnswer, report, diagnosticComplete, markDiagnosticComplete, resetDiagnostic } = useAdvisoryStore()
  const allQuestions = useMemo(() => getDiagnosticQuestions(), [])
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showReport, setShowReport] = useState(diagnosticComplete)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showReport) return
    if (bubbles.length === 0) {
      const opening = pickRandom(chatPersona.openings)
      const firstQ = allQuestions[0]
      setBubbles([
        { role: 'advisor', text: opening, id: 'opening' },
        { role: 'question', question: firstQ, id: `q-${firstQ.id}` },
      ])
    }
  }, [bubbles.length, allQuestions, showReport])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, showReport])

  const handleAnswer = (q: Question, v: AnswerValue) => {
    setAnswer(q.id, v)
    const ack = ackForAnswer(q, v)
    const nextIdx = currentIdx + 1
    const next = allQuestions[nextIdx]
    const userLabel = formatAnswerLabel(q, v)
    const lastDim = q.dimensions[0]
    const nextDim = next?.dimensions[0]
    const showTransition = next && nextDim && nextDim !== lastDim
    const transition = showTransition
      ? pickRandom(chatPersona.transitions).replace('{dimension}', getDimension(nextDim)?.name.toLowerCase() ?? '')
      : null

    setBubbles(prev => {
      const replaced = prev.map(b => (b.role === 'question' && b.question.id === q.id ? { role: 'user' as const, text: userLabel, id: `u-${q.id}` } : b))
      const additions: Bubble[] = [{ role: 'advisor', text: ack, id: `a-${q.id}` }]
      if (transition) additions.push({ role: 'advisor', text: transition, id: `t-${q.id}` })
      if (next) additions.push({ role: 'question', question: next, id: `q-${next.id}` })
      else additions.push({ role: 'report', id: 'final-report' })
      return [...replaced, ...additions]
    })
    setCurrentIdx(nextIdx)
    if (!next) {
      markDiagnosticComplete()
      setShowReport(true)
    }
  }

  const restart = () => {
    resetDiagnostic()
    setBubbles([])
    setCurrentIdx(0)
    setShowReport(false)
  }

  return (
    <div>
      {(bubbles.length > 0 || showReport) && (
        <div className="flex justify-end mb-3">
          <button onClick={restart} className="text-xs text-slate-400 hover:text-white flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1e2433] hover:border-blue-500/40">
            <RotateCcw className="w-3.5 h-3.5" /> Restart diagnostic
          </button>
        </div>
      )}

      {!showReport && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Guided assessment progress</span>
            <span>{currentIdx} of {allQuestions.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
            <motion.div
              className="h-full bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${(currentIdx / allQuestions.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="space-y-4 max-h-[calc(100vh-18rem)] overflow-y-auto pr-2">
        <AnimatePresence initial={false}>
          {bubbles.map(b => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {b.role === 'advisor' && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3 text-sm text-slate-200 leading-relaxed">
                    {b.text}
                  </div>
                </div>
              )}
              {b.role === 'user' && (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] px-4 py-2.5 text-sm max-w-[70%]">
                    {b.text}
                  </div>
                </div>
              )}
              {b.role === 'question' && (
                <div className="pl-11">
                  <QuestionCard
                    question={b.question}
                    value={answers[b.question.id]}
                    onChange={v => handleAnswer(b.question, v)}
                    index={currentIdx}
                    total={allQuestions.length}
                  />
                </div>
              )}
              {b.role === 'report' && report && <ReportPanel />}
            </motion.div>
          ))}
        </AnimatePresence>
        {showReport && report && bubbles.length === 0 && <ReportPanel standalone />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page shell with tabs
// ---------------------------------------------------------------------------

type Tab = 'chat' | 'deliverable' | 'assessment'

interface WorkspaceSummary { id: string; name: string; client_name?: string | null }

/** Shown at /advisor with no workspace: each workspace has its own advisory session. */
function WorkspacePicker() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    workspacesAPI.list()
      .then(res => {
        if (cancelled) return
        const raw: Array<WorkspaceSummary & { status?: string }> = res.data?.items ?? res.data ?? []
        const list = raw.filter(w => !w.status || w.status === 'active')
        if (list.length === 1) {
          navigate(`/advisor/${list[0].id}`, { replace: true })
        } else {
          setWorkspaces(list)
        }
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Could not load your workspaces. Refresh to try again.</p>
      </div>
    )
  }

  if (!workspaces) {
    return (
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl rounded-2xl border border-[#1e2433] bg-[#131720] p-7 sm:p-8 space-y-6"
      >
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Choose a workspace</h1>
            <p className="text-sm text-slate-400 mt-1.5">Each workspace has its own advisory session, evidence and history.</p>
          </div>
        </div>
        {workspaces.length === 0 ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-400">You do not have a workspace yet. Create one to start an advisory session.</p>
            <Link to="/workspaces" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
              <Plus className="w-4 h-4" /> Create workspace
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map(ws => (
              <Link
                key={ws.id}
                to={`/advisor/${ws.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#1e2433] bg-[#0c0e14] px-4 py-3 hover:border-blue-500/40 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{ws.name}</div>
                  {ws.client_name && <div className="text-xs text-slate-500 truncate">{ws.client_name}</div>}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default function AdvisorChat() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const briefs = useBriefStore(s => s.briefs)
  const [profile, setProfile] = useState<AdvisoryProfile | null>(() => (workspaceId ? loadStoredProfile(workspaceId) : null))
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)

  const hasBrief = useBriefStore(st => st.hasBrief)
  // The advisory only opens after the brief is completed and summarised.
  useEffect(() => {
    if (workspaceId && !hasBrief(workspaceId)) {
      navigate(`/challenge-brief?workspaceId=${workspaceId}`, { replace: true })
    }
  }, [workspaceId, hasBrief, navigate])

  const getProfileFor = useClientProfileStore(st => st.getProfileFor)

  useEffect(() => {
    if (!workspaceId) return
    setProfile(loadStoredProfile(workspaceId))
    let cancelled = false
    workspacesAPI.get(workspaceId)
      .then(res => { if (!cancelled) setWorkspaceName(res.data?.name ?? null) })
      .catch(() => { if (!cancelled) navigate('/advisor', { replace: true }) })
    return () => { cancelled = true }
  }, [workspaceId, navigate])

  // No manual intake screen: the advisory profile is derived automatically from
  // what the client already gave us in onboarding + the challenge brief, so the
  // advisor opens straight into the conversation.
  useEffect(() => {
    if (!workspaceId) return
    if (loadStoredProfile(workspaceId)) return
    const wsBrief = briefs[workspaceId] ?? null
    const derived: AdvisoryProfile = {
      persona: derivePersona(getProfileFor(workspaceId)),
      organization_name: wsBrief?.organizationName || workspaceName || undefined,
      industry: wsBrief?.industry || undefined,
      region: wsBrief?.region || undefined,
      company_size: wsBrief?.organizationSize || undefined,
    }
    saveStoredProfile(workspaceId, derived)
    setProfile(derived)
  }, [workspaceId, workspaceName, briefs, getProfileFor])

  if (!workspaceId) {
    return <WorkspacePicker />
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center">
        <span className="w-6 h-6 rounded-full border-2 border-[#1e2433] border-t-blue-500 animate-spin" />
      </div>
    )
  }

  const orgLine = [...new Set([workspaceName, profile.organization_name, profile.industry].filter(Boolean))].join(' · ')

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-4 space-y-3 w-full">
      {/* Slim single-row header: identity + inline actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold text-white">Advisory Command Centre</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2.5 py-0.5">
                {profile.persona}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {orgLine && <span className="text-xs text-slate-400 truncate">{orgLine}</span>}
              <Link
                to={`/onboarding?workspaceId=${workspaceId}&edit=1`}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-400 transition-colors"
              >
                <ClipboardList className="w-3 h-3" /> Edit onboarding
              </Link>
              <Link
                to={`/challenge-brief?workspaceId=${workspaceId}`}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-400 transition-colors"
              >
                <FileText className="w-3 h-3" /> Edit brief
              </Link>
              <Link
                to="/advisor"
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-400 transition-colors"
              >
                <Briefcase className="w-3 h-3" /> Switch workspace
              </Link>
            </div>
          </div>
        </div>

      </div>

      <ConversationPanel key={workspaceId} profile={profile} workspaceId={workspaceId} workspaceName={workspaceName} />
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors'
          : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors'
      }
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Report panel (assessment result)
// ---------------------------------------------------------------------------

function ReportPanel({ standalone = false }: { standalone?: boolean }) {
  const report = useAdvisoryStore(s => s.report)
  if (!report) return null
  const tier = getTier(report.overallTier)
  const recs = topRecommendations(report, 3)
  const closing = chatPersona.closingNarratives[report.overallTier as keyof typeof chatPersona.closingNarratives]

  return (
    <div className={standalone ? '' : 'pl-11'}>
      <div className="rounded-2xl border border-[#1e2433] bg-gradient-to-br from-[#131720] to-[#0c0e14] p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">Assessment complete</div>
            <h2 className="text-2xl font-semibold text-white">Overall maturity: <span style={{ color: tier.color }}>{tier.label}</span></h2>
            <p className="text-sm text-slate-400 mt-1">Score: <span className="text-white font-medium">{report.overallScore}</span> / 100</p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold" style={{ color: tier.color }}>{report.overallScore}</div>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-blue-500/40 pl-4 italic">{closing}</p>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-blue-400" /> Dimension scores</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.dimensions.map(d => {
              const dim = getDimension(d.dimensionId)!
              const t = getTier(d.tier)
              return (
                <div key={d.dimensionId} className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">{dim.name}</span>
                    <span className="text-xs font-semibold" style={{ color: t.color }}>{d.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: t.color }} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1.5">{t.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Top recommendations</h3>
          <div className="space-y-3">
            {recs.map(r => {
              const dim = getDimension(r.dimensionId)
              return (
                <div key={r.id} className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-blue-400 mb-1">{dim?.name} · {r.horizon}</div>
                      <div className="text-sm font-medium text-white">{r.title}</div>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${r.priority === 'high' ? 'bg-red-500/15 text-red-400' : r.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{r.priority}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{r.rationale}</p>
                  {r.suggestedStudios.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.suggestedStudios.map(sid => {
                        const studio = getStudio(sid)
                        if (!studio) return null
                        return (
                          <Link key={sid} to="/skills" className="text-[11px] text-blue-300 hover:text-blue-200 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-lg">
                            {studio.name} →
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/workspaces" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] ring-1 ring-blue-500/40">
            <Plus className="w-4 h-4" /> Add workspace
          </Link>
          <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e2433] hover:border-blue-500/40 text-slate-200 text-sm">
            Open dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/skills" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e2433] hover:border-blue-500/40 text-slate-200 text-sm">
            Browse studios
          </Link>
        </div>
      </div>
    </div>
  )
}
