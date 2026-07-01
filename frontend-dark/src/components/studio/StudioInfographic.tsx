/**
 * Studio output infographic.
 *
 * Takes the raw `draft.content` JSON the AI engine produces (shape varies by
 * skill, but always nested objects + arrays) and lays it out as a HiPo-style
 * visual report. Falls back gracefully when keys are missing.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  FileText, Target, Lightbulb, AlertTriangle, Sparkles,
  TrendingUp, Layers, Calendar, CheckCircle2, Compass, Briefcase, Award,
} from 'lucide-react'
import { cn } from '../../lib/utils'

type Json = Record<string, unknown>

interface Props {
  content: Json
}

// Internal / Canvas-related keys that should never appear in the report body.
// These are present on a draft after the user opens it in Canvas (slide tree,
// brand kit colors, format, internal title), and on a fresh draft as metadata.
const SKIP_KEYS = new Set([
  'skill_slug', 'generated_at', 'tool_input', 'tool_name', 'raw_text',
  'canvas_slides', 'canvas_brand', 'canvas_title', 'canvas_format',
  'title', 'workspace_id', 'job_id', 'version',
])

// Likely "title-bearing" keys we treat as the executive summary if no
// executive_summary is provided.
const SUMMARY_KEYS = ['executive_summary', 'summary', 'overview', 'industry_context', 'hc_vision', 'strategy_vision']

// Keys that should render as numbered finding cards.
const FINDINGS_KEYS = ['key_findings', 'top_priorities', 'quick_wins', 'heat_map_insights']

// Keys that render as priority-cards with chips.
const RECS_KEYS = ['recommendations', 'priority_improvement_areas', 'risks_and_mitigations']

// Keys that render as a horizontal pipeline / phased roadmap.
const ROADMAP_KEYS = ['implementation_plan', 'maturity_roadmap', 'implementation_roadmap', '12_month_roadmap', '90_day_plan']

// Keys that render as KPI strip.
const METRICS_KEYS = ['success_metrics', 'metrics_and_targets', 'success_metrics_array', 'benchmark_results']

// Keys that render as paired column cards (left/right or attract/develop/retain).
const PILLAR_KEYS = ['strategic_pillars', 'talent_lifecycle', 'sourcing_strategy', 'hiring_process']

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function isArrayOfStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function isArrayOfObjects(v: unknown): v is Json[] {
  return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'object' && x !== null && !Array.isArray(x))
}

export function StudioInfographic({ content }: Props) {
  const groups = useMemo(() => groupContent(content), [content])

  return (
    <div className="space-y-7">
      {groups.summary && <ExecutiveSummary text={groups.summary} />}

      {groups.maturityScore && <MaturityScore data={groups.maturityScore} />}

      {groups.findings.map(([k, v]) => (
        <FindingsBlock key={k} title={prettyKey(k)} items={v} />
      ))}

      {groups.recommendations.map(([k, v]) => (
        <RecommendationsBlock key={k} title={prettyKey(k)} items={v} />
      ))}

      {groups.pillars.map(([k, v]) => (
        <PillarsBlock key={k} title={prettyKey(k)} items={v} />
      ))}

      {groups.roadmaps.map(([k, v]) => (
        <RoadmapBlock key={k} title={prettyKey(k)} items={v} />
      ))}

      {groups.metrics.map(([k, v]) => (
        <MetricsBlock key={k} title={prettyKey(k)} items={v} />
      ))}

      {groups.dimensionScores && <DimensionScores items={groups.dimensionScores} />}

      {groups.other.length > 0 && (
        <section>
          <SectionBanner Icon={FileText}>Additional sections</SectionBanner>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups.other.map(([k, v]) => (
              <GenericCard key={k} title={prettyKey(k)} value={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function SectionBanner({ Icon, children, accent = 'blue' }: { Icon: typeof Target; children: React.ReactNode; accent?: 'blue' | 'violet' | 'amber' | 'emerald' }) {
  const tone = {
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30' },
    violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  }[accent]
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', tone.bg, tone.border)}>
        <Icon className={cn('w-3.5 h-3.5', tone.text)} />
      </div>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{children}</h3>
    </div>
  )
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

function ExecutiveSummary({ text }: { text: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-[#0c0e14] p-5 sm:p-6"
    >
      <SectionBanner Icon={Compass}>Executive summary</SectionBanner>
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{text}</p>
    </motion.section>
  )
}

function MaturityScore({ data }: { data: { score: number; level: string } }) {
  const pct = Math.min(100, Math.max(0, (data.score / 5) * 100))
  return (
    <section className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5">
      <SectionBanner Icon={Award} accent="amber">Overall maturity</SectionBanner>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1e2433" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f59e0b" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 264} 264`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-white tabular-nums">{data.score.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">/ 5.0</div>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-300 font-bold mb-1">Level</div>
          <div className="text-xl font-bold text-white">{data.level}</div>
        </div>
      </div>
    </section>
  )
}

function FindingsBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <SectionBanner Icon={Lightbulb} accent="amber">{title}</SectionBanner>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 flex gap-3"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-300 flex-shrink-0">
              {i + 1}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed flex-1">{item}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function RecommendationsBlock({ title, items }: { title: string; items: Json[] }) {
  return (
    <section>
      <SectionBanner Icon={Target} accent="violet">{title}</SectionBanner>
      <div className="space-y-3">
        {items.map((rec, i) => {
          const titleVal = asString(rec.recommendation ?? rec.area ?? rec.risk ?? rec.title ?? '')
          const rationale = asString(rec.rationale ?? rec.mitigation ?? rec.current_state ?? rec.gap_analysis ?? rec.description ?? '')
          const priority = String(rec.priority ?? '').toLowerCase()
          const timeline = asString(rec.timeline ?? '')
          const actions = isArrayOfStrings(rec.actions) ? rec.actions : []
          const tone = priority.includes('high') ? 'red' : priority.includes('low') ? 'emerald' : 'amber'
          const toneCls = { red: 'bg-red-500/15 text-red-300 border-red-500/30', amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30', emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }[tone]
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white leading-snug">{titleVal || `Recommendation ${i + 1}`}</div>
                  {rationale && <p className="text-xs text-slate-400 leading-relaxed mt-1.5">{rationale}</p>}
                </div>
                {priority && (
                  <span className={cn('text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full border whitespace-nowrap', toneCls)}>
                    {priority}
                  </span>
                )}
              </div>
              {(actions.length > 0 || timeline) && (
                <div className="mt-3 pt-3 border-t border-[#1e2433] flex flex-wrap gap-2">
                  {timeline && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-[#0c0e14] border border-[#1e2433] px-2.5 py-1 rounded-full">
                      <Calendar className="w-3 h-3" /> {timeline}
                    </span>
                  )}
                  {actions.map((a, j) => (
                    <span key={j} className="text-[11px] text-slate-300 bg-blue-500/5 border border-blue-500/20 px-2.5 py-1 rounded-full">{a}</span>
                  ))}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

function PillarsBlock({ title, items }: { title: string; items: Json[] | Json }) {
  // Accepts either an array (strategic_pillars) or a flat object (talent_lifecycle: {attract, develop, retain, transition}).
  const cards: Array<{ title: string; body: string; chips?: string[] }> = []
  if (Array.isArray(items)) {
    for (const it of items) {
      cards.push({
        title: asString(it.pillar ?? it.channel ?? it.stage ?? it.area ?? ''),
        body: asString(it.description ?? it.rationale ?? ''),
        chips: [
          ...((it.initiatives as string[] | undefined) ?? []),
          ...((it.kpis as string[] | undefined) ?? []),
          ...((it.year1_actions as string[] | undefined) ?? []),
        ].filter(Boolean),
      })
    }
  } else {
    for (const [k, v] of Object.entries(items)) {
      cards.push({ title: prettyKey(k), body: asString(v) })
    }
  }

  return (
    <section>
      <SectionBanner Icon={Layers} accent="violet">{title}</SectionBanner>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-violet-300 bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 rounded-full">{String(i + 1).padStart(2, '0')}</span>
              <h4 className="text-sm font-semibold text-white">{c.title}</h4>
            </div>
            {c.body && <p className="text-xs text-slate-300 leading-relaxed">{c.body}</p>}
            {c.chips && c.chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {c.chips.slice(0, 6).map((chip, j) => (
                  <span key={j} className="text-[11px] text-slate-300 bg-violet-500/5 border border-violet-500/20 px-2 py-0.5 rounded-full">{chip}</span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function RoadmapBlock({ title, items }: { title: string; items: Json[] }) {
  return (
    <section>
      <SectionBanner Icon={Briefcase} accent="emerald">{title}</SectionBanner>
      <div className="relative">
        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/40 to-transparent" />
        <div className="space-y-3">
          {items.map((it, i) => {
            const phase = asString(it.phase ?? it.week_range ?? it.timeline ?? `Phase ${i + 1}`)
            const timeline = asString(it.timeline ?? '')
            const actions: string[] = (isArrayOfStrings(it.actions) ? it.actions
                              : isArrayOfStrings(it.focus_areas) ? it.focus_areas
                              : isArrayOfStrings(it.milestones) ? it.milestones
                              : [])
            const outcome = asString(it.expected_outcome ?? it.success_metrics?.toString() ?? '')

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative pl-9"
              >
                <div className="absolute left-0 top-2 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold text-emerald-300">
                  {i + 1}
                </div>
                <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-white">{phase}</h4>
                    {timeline && timeline !== phase && (
                      <span className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">{timeline}</span>
                    )}
                  </div>
                  {actions.length > 0 && (
                    <ul className="space-y-1.5">
                      {actions.map((a, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <span className="leading-relaxed">{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {outcome && (
                    <div className="mt-2 pt-2 border-t border-[#1e2433] text-[11px] text-slate-400">
                      <span className="text-emerald-300">Outcome:</span> {outcome}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function MetricsBlock({ title, items }: { title: string; items: string[] | Json[] }) {
  return (
    <section>
      <SectionBanner Icon={TrendingUp} accent="blue">{title}</SectionBanner>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((m, i) => {
          if (typeof m === 'string') {
            return (
              <div key={i} className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4">
                <div className="text-[10px] uppercase tracking-widest text-blue-300 font-bold mb-1">Metric {i + 1}</div>
                <div className="text-xs text-white leading-snug">{m}</div>
              </div>
            )
          }
          const metric = asString(m.metric ?? '')
          const baseline = asString(m.baseline ?? m.organisation_value ?? '')
          const target = asString(m.target ?? m.top_quartile ?? '')
          const median = asString(m.industry_median ?? '')
          return (
            <div key={i} className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4">
              <div className="text-[10px] uppercase tracking-widest text-blue-300 font-bold mb-1">{metric}</div>
              {baseline && <div className="text-xs text-slate-500">Now: <span className="text-white tabular-nums">{baseline}</span></div>}
              {median && <div className="text-xs text-slate-500">Median: <span className="text-slate-300 tabular-nums">{median}</span></div>}
              {target && <div className="text-xs text-emerald-300 mt-1">Target: <span className="font-semibold tabular-nums">{target}</span></div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DimensionScores({ items }: { items: Json[] }) {
  return (
    <section>
      <SectionBanner Icon={Layers} accent="violet">Dimension scores</SectionBanner>
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 space-y-3">
        {items.map((d, i) => {
          const dim = asString(d.dimension ?? '')
          const score = typeof d.score === 'number' ? d.score : Number(d.score) || 0
          const level = asString(d.level ?? '')
          const pct = Math.min(100, Math.max(0, (score / 5) * 100))
          const tone = pct >= 70 ? 'emerald' : pct >= 40 ? 'amber' : 'red'
          const cls = { emerald: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-red-400' }[tone]
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <div className="text-sm font-medium text-white">{dim}</div>
                  {level && <div className="text-[11px] text-slate-500">{level}</div>}
                </div>
                <div className="text-sm font-bold text-white tabular-nums">{score.toFixed(1)}<span className="text-[10px] text-slate-500"> / 5</span></div>
              </div>
              <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                <div className={cn('h-full rounded-full', cls)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GenericCard({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4">
      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">{title}</div>
      {typeof value === 'string' ? (
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{value}</p>
      ) : isArrayOfStrings(value) ? (
        <ul className="space-y-1">
          {value.map((s, i) => <li key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-slate-600">{i + 1}.</span><span className="leading-relaxed">{s}</span></li>)}
        </ul>
      ) : (
        <pre className="text-[11px] text-slate-400 bg-[#0c0e14] border border-[#1e2433] rounded-lg p-2 overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  )
}

// ─── Grouping logic ──────────────────────────────────────────────────────────

interface Groups {
  summary?: string
  maturityScore?: { score: number; level: string }
  findings: Array<[string, string[]]>
  recommendations: Array<[string, Json[]]>
  pillars: Array<[string, Json[] | Json]>
  roadmaps: Array<[string, Json[]]>
  metrics: Array<[string, string[] | Json[]]>
  dimensionScores?: Json[]
  other: Array<[string, unknown]>
}

function groupContent(content: Json): Groups {
  const entries = Object.entries(content).filter(([k]) => !SKIP_KEYS.has(k))
  const groups: Groups = {
    findings: [], recommendations: [], pillars: [], roadmaps: [], metrics: [], other: [],
  }

  // First pass: summary + maturity score
  for (const [k, v] of entries) {
    if (!groups.summary && SUMMARY_KEYS.includes(k) && typeof v === 'string') {
      groups.summary = v
    }
  }
  if (typeof content.overall_maturity_score === 'number' && typeof content.overall_maturity_level === 'string') {
    groups.maturityScore = { score: content.overall_maturity_score, level: content.overall_maturity_level }
  }
  if (Array.isArray(content.dimension_scores) && isArrayOfObjects(content.dimension_scores)) {
    groups.dimensionScores = content.dimension_scores
  }

  // Second pass: categorize each entry
  for (const [k, v] of entries) {
    if (SUMMARY_KEYS.includes(k) && groups.summary === v) continue
    if (k === 'overall_maturity_score' || k === 'overall_maturity_level' || k === 'dimension_scores') continue

    if (FINDINGS_KEYS.includes(k) && isArrayOfStrings(v)) {
      groups.findings.push([k, v])
    } else if (RECS_KEYS.includes(k) && isArrayOfObjects(v)) {
      groups.recommendations.push([k, v])
    } else if (PILLAR_KEYS.includes(k) && (isArrayOfObjects(v) || (typeof v === 'object' && v !== null && !Array.isArray(v)))) {
      groups.pillars.push([k, v as Json[] | Json])
    } else if (ROADMAP_KEYS.includes(k) && isArrayOfObjects(v)) {
      groups.roadmaps.push([k, v])
    } else if (METRICS_KEYS.includes(k) && (isArrayOfStrings(v) || isArrayOfObjects(v))) {
      groups.metrics.push([k, v])
    } else {
      groups.other.push([k, v])
    }
  }
  return groups
}

// Reference unused icons (kept for future block types)
void AlertTriangle
void Sparkles
