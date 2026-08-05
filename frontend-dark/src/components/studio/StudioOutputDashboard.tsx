/**
 * Shared studio output dashboard — modeled on HiPo Studio's Advisory Dashboard.
 * Used by SkillStudio's output phase so every one of the 27 generic studios
 * renders its draft as a HiPo-style report.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Target, AlertTriangle, Zap, Sparkles, Building2, MapPin, Users, TrendingUp,
  ClipboardCheck, FileText, Download, ArrowRight, RefreshCw, MessageSquareText,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { StudioInfographic } from './StudioInfographic'
import { StudioChat } from './StudioChat'

interface KPI {
  label: string
  value: string | number
  unit?: string
  tone?: 'blue' | 'amber' | 'red' | 'emerald' | 'violet'
  Icon?: typeof Target
}

interface OrgIntel {
  industry?: string
  region?: string
  size?: string
  maturity?: string
  model?: string
}

interface MaturityCell {
  label: string
  level: 'High' | 'Medium' | 'Low'
}

interface Recommendation {
  title: string
  rationale?: string
  tone?: 'high' | 'medium' | 'low'
}

interface StudioOutputDashboardProps {
  studioName: string
  studioCategory?: string
  orgName?: string
  status: string                    // 'pending' | 'approved' | 'submitted'
  generatedAt?: string

  // Sections — every studio fills the ones it has, blanks are skipped.
  kpis?: KPI[]
  orgIntel?: OrgIntel
  maturity?: MaturityCell[]
  recommendations?: Recommendation[]
  notes?: string
  rawContent?: Record<string, unknown>  // fallback render at the bottom

  // Actions
  onApprove?: () => void
  onOpenCanvas?: () => void
  onNewRun?: () => void
  onAskAi?: () => void
  exportToolbar?: React.ReactNode      // injected — keeps the existing PDF/PPTX/DOCX flow

  // Chat: when draftId is supplied, the floating AI panel is mounted so the
  // user can discuss or instruct edits to this report.
  draftId?: string
  onContentPatched?: (content: Record<string, unknown>) => void
}

const TONE_COLOR: Record<NonNullable<KPI['tone']>, { bg: string; text: string; border: string }> = {
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  red:     { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
}

const LEVEL_TONE: Record<MaturityCell['level'], { bg: string; text: string }> = {
  High:   { bg: 'bg-red-500/15',     text: 'text-red-300' },
  Medium: { bg: 'bg-amber-500/15',   text: 'text-amber-300' },
  Low:    { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
}

export function StudioOutputDashboard(props: StudioOutputDashboardProps) {
  const {
    studioName, studioCategory, orgName, status, generatedAt,
    kpis = [], orgIntel, maturity = [], recommendations = [], notes,
    rawContent, onApprove, onOpenCanvas, onNewRun, onAskAi, exportToolbar,
    draftId, onContentPatched,
  } = props

  // Auto-derive a few KPIs if none provided (so blank studios still feel populated)
  const defaultKpis: KPI[] = useMemo(() => kpis.length ? kpis : [
    { label: 'Status', value: status, tone: status === 'approved' ? 'emerald' : 'amber', Icon: ClipboardCheck },
    { label: 'Recommendations', value: recommendations.length, tone: 'violet', Icon: Sparkles },
    { label: 'Maturity factors', value: maturity.length, tone: 'blue', Icon: Target },
    { label: 'Pain points', value: 0, unit: 'logged', tone: 'red', Icon: AlertTriangle },
  ], [kpis, status, recommendations.length, maturity.length])

  return (
    <div className="space-y-7">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{orgName ? orgName : studioName}</h1>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-500">{studioName} · Clean view</span>
              <span className="ml-1 text-[10px] uppercase tracking-widest font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full">{status === 'approved' ? 'Live' : 'New'}</span>
            </div>
            {studioCategory && <div className="text-xs text-slate-500 mt-1">{studioCategory} · {generatedAt ?? 'just now'}</div>}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onAskAi && (
            <button onClick={onAskAi} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A3648] bg-[#0B1220] text-slate-300 text-xs hover:border-blue-500/40 hover:text-white">
              <MessageSquareText className="w-3.5 h-3.5" /> Ask AI
            </button>
          )}
          {onNewRun && (
            <button onClick={onNewRun} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A3648] bg-[#0B1220] text-slate-300 text-xs hover:border-blue-500/40 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" /> New run
            </button>
          )}
          {onOpenCanvas && (
            <button onClick={onOpenCanvas} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-200 text-xs hover:bg-blue-500/20">
              <FileText className="w-3.5 h-3.5" /> Open in Canvas
            </button>
          )}
          {status === 'pending' && onApprove && (
            <button onClick={onApprove} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
              <ClipboardCheck className="w-3.5 h-3.5" /> Approve
            </button>
          )}
          {exportToolbar}
        </div>
      </motion.header>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {defaultKpis.map((k, i) => {
          const t = TONE_COLOR[k.tone ?? 'blue']
          const Icon = k.Icon ?? Target
          return (
            <motion.div
              key={`${k.label}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn('rounded-2xl border bg-[#0f1117] p-4', t.border)}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('w-4 h-4', t.text)} />
                <span className={cn('text-[10px] uppercase tracking-wider font-semibold', t.text)}>{k.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white tabular-nums">{k.value}</span>
                {k.unit && <span className="text-xs text-slate-500">{k.unit}</span>}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column: Org intel + maturity */}
        <div className="lg:col-span-1 space-y-4">
          {orgIntel && (
            <section className="rounded-2xl border border-[#2A3648] bg-[#0f1117] p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Organization intelligence</h3>
              <div className="space-y-2.5 text-sm">
                {orgIntel.industry && <Row Icon={Building2} label="Industry" value={orgIntel.industry} />}
                {orgIntel.region   && <Row Icon={MapPin}     label="Region"   value={orgIntel.region} />}
                {orgIntel.size     && <Row Icon={Users}      label="Size"     value={orgIntel.size} />}
                {orgIntel.maturity && <Row Icon={TrendingUp} label="Maturity" value={orgIntel.maturity} accent="amber" />}
                {orgIntel.model    && <Row Icon={Target}     label="Model"    value={orgIntel.model} />}
              </div>
            </section>
          )}

          <MaturityHeatmap maturity={maturity} />
          <WorkforceRiskCard recommendations={recommendations} />
        </div>

        {/* Right column: Recommendations + Notes + raw content */}
        <div className="lg:col-span-2 space-y-4">
          {recommendations.length > 0 && (
            <motion.section
              key={`recs-${recommendations.length}-${recommendations.map(r => r.title).join('|').slice(0, 60)}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              className="rounded-2xl border border-[#2A3648] bg-[#0f1117] p-4 sm:p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Recommendations</h3>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 tabular-nums">{recommendations.length} total</span>
              </div>
              <ul className="space-y-2.5">
                {recommendations.map((r, i) => {
                  const dotColor = r.tone === 'high' ? 'bg-red-400' : r.tone === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'
                  return (
                    <motion.li
                      key={`${i}-${r.title}`}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
                      <div>
                        <div className="text-white">{r.title}</div>
                        {r.rationale && <div className="text-xs text-slate-400 mt-0.5">{r.rationale}</div>}
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            </motion.section>
          )}

          {(notes !== undefined) && (
            <section className="rounded-2xl border border-[#2A3648] bg-[#0f1117] p-4 sm:p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Advisory notes</h3>
              {notes && notes.trim().length > 0 ? (
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{notes}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">No notes. Click <span className="text-slate-300">Edit Report</span> to add context.</p>
              )}
            </section>
          )}

          {/* Infographic render of the AI's structured output. The `key` flips
              whenever content updates so framer-motion replays its enter
              animations, giving the user a clear visual cue that the section
              was just rewritten by the AI. */}
          {rawContent && Object.keys(rawContent).length > 0 && (
            <StudioInfographic
              key={hashContent(rawContent)}
              content={rawContent}
            />
          )}
        </div>
      </div>

      {/* ── Live Deliverables strip ────────────────────────────────── */}
      <section className="rounded-2xl border border-[#2A3648] bg-gradient-to-br from-[#0B1220] to-[#0B1220] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-300" /> Live Deliverables Canvas
          </h3>
          {onOpenCanvas && (
            <button onClick={onOpenCanvas} className="text-xs text-blue-300 hover:text-blue-200 inline-flex items-center gap-1">
              Open Canvas <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            'Executive Deck', 'HC Framework', 'Workforce Roadmap', 'Benchmarking', 'Maturity Dashboard', 'AI Recommendations',
          ].map((d, i) => (
            <button
              key={d}
              onClick={onOpenCanvas}
              className="text-left rounded-xl border border-[#2A3648] bg-[#0f1117] hover:border-[#2a3048] hover:bg-[#111420] p-3 group transition-all"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-slate-500 tabular-nums">{i + 1}</span>
                <Download className="w-3 h-3 text-slate-500 group-hover:text-blue-300" />
              </div>
              <div className="text-xs text-white leading-snug">{d}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Floating AI chat — discuss or edit the report */}
      {draftId && (
        <StudioChat
          draftId={draftId}
          studioName={studioName}
          onContentPatched={onContentPatched}
        />
      )}
    </div>
  )
}

// Cheap stable hash of the content so we can use it as a React key. Whenever
// the AI patches the draft, the hash changes and the infographic re-mounts
// with fresh animations.
function hashContent(content: Record<string, unknown>): string {
  let h = 0
  const s = JSON.stringify(content) || ''
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return String(h)
}

// ── Maturity heatmap with synthesized 6-dim fallback ────────────────────────

const DEFAULT_DIMS: Array<{ label: string; level: 'High' | 'Medium' | 'Low' }> = [
  { label: 'Strategy', level: 'Medium' },
  { label: 'Processes', level: 'Medium' },
  { label: 'People', level: 'High' },
  { label: 'Data', level: 'Low' },
  { label: 'Tech', level: 'Medium' },
  { label: 'Governance', level: 'Low' },
]

function MaturityHeatmap({ maturity }: { maturity: Array<{ label: string; level: 'High' | 'Medium' | 'Low' }> }) {
  const dims = maturity.length > 0 ? maturity : DEFAULT_DIMS
  const counts = { High: 0, Medium: 0, Low: 0 }
  for (const d of dims) counts[d.level]++
  return (
    <section className="rounded-2xl border border-[#2A3648] bg-[#0f1117] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Maturity heatmap</h3>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
          <span className="text-red-300">High {counts.High}</span>
          <span className="text-amber-300">Med {counts.Medium}</span>
          <span className="text-emerald-300">Low {counts.Low}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {dims.map(m => {
          const t = LEVEL_TONE[m.level]
          return (
            <div key={m.label} className={cn('rounded-lg px-2.5 py-3 text-center text-xs font-medium border border-transparent', t.bg, t.text)}>
              <div className="font-semibold">{m.label}</div>
              <div className="text-[10px] uppercase tracking-widest opacity-70 mt-0.5">{m.level}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Workforce risk donut, synthesised from recommendation priorities if no
// explicit risk numbers are provided ────────────────────────────────────────

function WorkforceRiskCard({ recommendations }: { recommendations: Array<{ tone?: 'high' | 'medium' | 'low' }> }) {
  let high = recommendations.filter(r => r.tone === 'high').length
  let med = recommendations.filter(r => r.tone === 'medium').length
  let low = recommendations.filter(r => r.tone === 'low').length
  if (high + med + low === 0) { high = 2; med = 3; low = 1 }   // sensible default
  const total = high + med + low
  const pct = (n: number) => (n / total) * 100
  const C = 2 * Math.PI * 42  // circumference at r=42
  const hPct = pct(high), mPct = pct(med), lPct = pct(low)
  const hLen = (hPct / 100) * C
  const mLen = (mPct / 100) * C
  const lLen = (lPct / 100) * C

  return (
    <section className="rounded-2xl border border-[#2A3648] bg-[#0f1117] p-4 sm:p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Workforce risk</h3>
      <div className="flex items-center gap-4">
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2A3648" strokeWidth="10" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#ef4444" strokeWidth="10"
                    strokeDasharray={`${hLen} ${C - hLen}`} strokeDashoffset="0" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f59e0b" strokeWidth="10"
                    strokeDasharray={`${mLen} ${C - mLen}`} strokeDashoffset={-hLen} />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#10b981" strokeWidth="10"
                    strokeDasharray={`${lLen} ${C - lLen}`} strokeDashoffset={-(hLen + mLen)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Risk</div>
            <div className="text-base font-bold text-white tabular-nums">{Math.round(hPct)}%</div>
          </div>
        </div>
        <div className="flex-1 space-y-2 text-xs">
          <RiskRow label="High" color="bg-red-400" value={high} pct={hPct} />
          <RiskRow label="Medium" color="bg-amber-400" value={med} pct={mPct} />
          <RiskRow label="Low" color="bg-emerald-400" value={low} pct={lPct} />
        </div>
      </div>
    </section>
  )
}

function RiskRow({ label, color, value, pct }: { label: string; color: string; value: number; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', color)} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="text-slate-500 tabular-nums">{Math.round(pct)}%  ·  {value}</span>
    </div>
  )
}

function Row({ Icon, label, value, accent }: { Icon: typeof Target; label: string; value: string; accent?: 'amber' | 'blue' }) {
  const valCol = accent === 'amber' ? 'text-amber-300' : accent === 'blue' ? 'text-blue-300' : 'text-white'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn('text-xs font-semibold truncate max-w-[60%]', valCol)}>{value}</span>
    </div>
  )
}

/**
 * Render whatever shape the draft content actually has — strings, arrays, dicts.
 * Mirrors the original renderDraftContent so we don't drop AI-generated body.
 */
function RawContentRender({ content }: { content: Record<string, unknown> }) {
  const entries = Object.entries(content).filter(([k]) =>
    !['skill_slug', 'workspace_id', 'tool_input'].includes(k)
  )

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 italic">No content.</p>
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, value]) => (
        <section key={key}>
          <h4 className="text-[11px] uppercase tracking-wider text-blue-300 mb-1.5">{prettyKey(key)}</h4>
          <RenderValue value={value} />
        </section>
      ))}
    </div>
  )
}

function prettyKey(k: string) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function RenderValue({ value }: { value: unknown }): React.ReactElement | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{value}</p>
  if (typeof value === 'number' || typeof value === 'boolean') return <p className="text-sm text-slate-300">{String(value)}</p>
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
            <span className="leading-relaxed">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'object') {
    return (
      <div className="space-y-2 pl-2 border-l border-[#2A3648]">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{prettyKey(k)}</div>
            <RenderValue value={v} />
          </div>
        ))}
      </div>
    )
  }
  return null
}
