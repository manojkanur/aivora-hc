import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, BarChart3, AlertTriangle, Target, TrendingUp,
  Sparkles, CheckCircle2, Clock, Layers, Award, ChevronDown, Info,
} from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'

interface ScoringExplanation {
  inputs_used: string[]
  basis: string
  methodology: string
  evidence_used: string[]
  missing_information: string[]
  confidence: string
  rating_rationale: string
  business_meaning: string
}
interface DimensionResult {
  code: string
  name: string | null
  score: number
  band: string | null
  criticality: string | null
  gap_size: number | null
  interpretation: string | null
  scoring_explanation?: ScoringExplanation | null
}
interface RiskFlag {
  risk_type: string
  severity: string
  description: string
  suggested_action: string
  affected_dimensions: string[]
}
interface BenchmarkDim {
  code: string
  name: string | null
  company_score: number
  benchmark_average: number
  top_quartile: number
  gap: number
  positioning: string
}
interface RecommendationOut {
  key: string
  title: string
  description: string | null
  category: string | null
  time_horizon: string | null
  tier: string | null
  default_impact: string | null
  default_effort: string | null
  matched_dimension: string | null
}
interface DiagnosisResponse {
  review_id: string
  company_name: string
  industry: string | null
  region: string | null
  company_size: string | null
  overall_score: number
  overall_band: string
  overall_interpretation: string
  dimensions: DimensionResult[]
  risk_flags: RiskFlag[]
  benchmark_profile_name: string | null
  benchmark_positioning_summary: string | null
  benchmark_overall: {
    company_score?: number
    benchmark_average?: number
    gap?: number
    positioning?: string
  } | null
  benchmark_dimensions: BenchmarkDim[]
  recommendations: RecommendationOut[]
}

function bandColor(band: string | null): string {
  const k = (band || '').toLowerCase()
  if (k.includes('lead') || k.includes('optim')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  if (k.includes('defin') || k.includes('manag')) return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
  if (k.includes('repeat')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
}

function positioningColor(p: string): string {
  switch (p) {
    case 'leading': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    case 'competitive': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
    case 'emerging': return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    default: return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  }
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'critical': return 'text-rose-300 bg-rose-500/15 border-rose-500/40'
    case 'high': return 'text-orange-300 bg-orange-500/15 border-orange-500/40'
    case 'medium': return 'text-amber-300 bg-amber-500/15 border-amber-500/40'
    default: return 'text-slate-300 bg-slate-500/15 border-slate-500/40'
  }
}

function confidenceColor(c: string): string {
  switch (c) {
    case 'high': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    default: return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  }
}

const BASIS_LABELS: Record<string, string> = {
  user_answers: 'Based on your answers',
  evidence: 'Based on uploaded evidence',
  benchmark_assumption: 'Baseline assumption',
  ai_inference: 'AI inference',
  mixed: 'Mixed sources',
}

function MaturityBar({ score, color = 'bg-blue-500' }: { score: number; color?: string }) {
  const pct = Math.min(100, (score / 5) * 100)
  return (
    <div className="h-2 bg-[#2A3648] rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

/** Inline expandable "Why this score?" panel. Hidden entirely when the payload has no explanation. */
function WhyThisScore({ explanation }: { explanation: ScoringExplanation }) {
  const [open, setOpen] = useState(false)
  const lowOrMedium = explanation.confidence !== 'high'
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        Why this score?
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-lg border border-[#2A3648] bg-[#0f1117] p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 font-semibold">
                  {BASIS_LABELS[explanation.basis] || explanation.basis}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border font-semibold capitalize ${confidenceColor(explanation.confidence)}`}>
                  {explanation.confidence} confidence
                </span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">How it was scored</div>
                <p className="text-slate-300 leading-relaxed">{explanation.methodology}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Inputs used</div>
                <ul className="space-y-1">
                  {explanation.inputs_used.map((inp, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-300">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span className="leading-relaxed">{inp}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {explanation.evidence_used.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Evidence used</div>
                  <ul className="space-y-1">
                    {explanation.evidence_used.map((ev, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-slate-300">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span className="leading-relaxed">{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Why this rating</div>
                <p className="text-slate-300 leading-relaxed">{explanation.rating_rationale}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">What it means for the business</div>
                <p className="text-slate-300 leading-relaxed">{explanation.business_meaning}</p>
              </div>
              {lowOrMedium && explanation.missing_information.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-1.5 text-amber-300 font-semibold mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    What would improve accuracy
                  </div>
                  <ul className="space-y-1">
                    {explanation.missing_information.map((m, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-amber-200/90">
                        <span className="mt-0.5">•</span>
                        <span className="leading-relaxed">{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DimensionCard({ d, index }: { d: DimensionResult; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-[#222E3E] bg-[#1B2431] p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-white">{d.name || d.code}</div>
          {d.band && (
            <div className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold mt-1 ${bandColor(d.band)}`}>
              {d.band}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white tabular-nums">{d.score.toFixed(2)}</div>
          {d.criticality && (
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">{d.criticality}</div>
          )}
        </div>
      </div>
      <MaturityBar score={d.score} color={
        d.score >= 3.5 ? 'bg-emerald-500' :
        d.score >= 2.5 ? 'bg-blue-500' :
        d.score >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'
      } />
      {d.interpretation && (
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">{d.interpretation}</p>
      )}
      {d.scoring_explanation && <WhyThisScore explanation={d.scoring_explanation} />}
    </motion.div>
  )
}

function RecommendationCard({ r, index }: { r: RecommendationOut; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl border border-[#222E3E] bg-[#1B2431] p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="font-semibold text-white text-sm">{r.title}</div>
        {r.tier && (
          <div className="px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[10px] uppercase font-semibold whitespace-nowrap">
            {r.tier}
          </div>
        )}
      </div>
      {r.description && (
        <p className="text-xs text-slate-400 leading-relaxed mb-3">{r.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        {r.matched_dimension && (
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3" />
            {r.matched_dimension}
          </span>
        )}
        {r.time_horizon && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {r.time_horizon.replace(/_/g, ' ')}
          </span>
        )}
        {r.default_impact && (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {r.default_impact} impact
          </span>
        )}
        {r.default_effort && (
          <span className="flex items-center gap-1">
            <Award className="w-3 h-3" />
            {r.default_effort} effort
          </span>
        )}
      </div>
    </motion.div>
  )
}

/** Collapsed-by-default chevron accordion section. */
function Collapsible({
  title, icon, badge, children,
}: {
  title: string
  icon: ReactNode
  badge?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-[#222E3E] bg-[#1B2431] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#161a26] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge && <span className="text-xs text-slate-500">({badge})</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-[#2A3648] pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BriefResults() {
  const { reviewId } = useParams<{ reviewId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const initial = (location.state as { diagnosis?: DiagnosisResponse } | null)?.diagnosis ?? null

  const [data, setData] = useState<DiagnosisResponse | null>(initial)
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initial || !reviewId) return
    setLoading(true)
    api.get<DiagnosisResponse>(`/hc-platform/diagnose-from-brief/${reviewId}`)
      .then(res => { setData(res.data); setError(null) })
      .catch(err => setError(err?.response?.data?.detail || 'Failed to load diagnosis'))
      .finally(() => setLoading(false))
  }, [reviewId, initial])

  // Top 2-3 priority gaps: lowest-scoring dimensions below the 4.0 target.
  const priorityGaps = useMemo(() => {
    if (!data) return []
    return [...data.dimensions]
      .filter(d => d.score < 4)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
  }, [data])

  // Key evidence + overall confidence, derived from scoring explanations when present.
  const evidenceSummary = useMemo(() => {
    if (!data) return null
    const explained = data.dimensions.filter(d => d.scoring_explanation)
    if (explained.length === 0) return null
    const inputs = new Set<string>()
    explained.forEach(d => {
      if (d.scoring_explanation!.basis === 'user_answers') {
        d.scoring_explanation!.inputs_used.forEach(i => inputs.add(i))
      }
    })
    const lows = explained.filter(d => d.scoring_explanation!.confidence === 'low').length
    const highs = explained.filter(d => d.scoring_explanation!.confidence === 'high').length
    const confidence = lows >= explained.length / 2 ? 'low' : highs === explained.length ? 'high' : 'medium'
    return { inputs: Array.from(inputs).slice(0, 6), confidence }
  }, [data])

  if (loading) {
    return (
      <div className="min-h-full bg-[#0B1220] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading diagnosis…
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-full bg-[#0B1220] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <p className="text-white font-semibold">{error || 'No diagnosis found'}</p>
          <Button onClick={() => navigate('/workspaces')}>Back to workspaces</Button>
        </div>
      </div>
    )
  }

  const nextAction = data.recommendations[0] ?? null

  return (
    <div className="min-h-full bg-[#0B1220]">
      <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-white mb-3">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Diagnosis generated</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{data.company_name}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mt-1.5">
              {data.industry && <span className="capitalize">{data.industry.replace(/-/g, ' ')}</span>}
              {data.region && <><span>·</span><span className="capitalize">{data.region.replace(/-/g, ' ')}</span></>}
              {data.company_size && <><span>·</span><span className="capitalize">{data.company_size}</span></>}
            </div>
          </div>
        </div>

        {/* Overall score card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[#222E3E] bg-gradient-to-br from-[#0f1117] to-[#1B2431] p-6 sm:p-8 shadow-[0_4px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3 mb-2">
            <Target className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">HC Maturity Score</h2>
          </div>
          <div className="flex items-end gap-6 flex-wrap">
            <div>
              <div className="text-6xl font-bold text-white tabular-nums">{data.overall_score.toFixed(2)}</div>
              <div className="text-sm text-slate-500 mt-1">out of 5.00</div>
            </div>
            <div className={`px-4 py-2 rounded-xl border text-sm font-semibold ${bandColor(data.overall_band)}`}>
              {data.overall_band}
            </div>
          </div>
          {data.overall_interpretation && (
            <p className="text-slate-300 mt-4 text-sm leading-relaxed max-w-3xl">{data.overall_interpretation}</p>
          )}
        </motion.div>

        {/* Top priority gaps */}
        {priorityGaps.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-semibold text-white">Top priority gaps</h2>
              <span className="text-xs text-slate-500">({priorityGaps.length})</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {priorityGaps.map((d, i) => (
                <DimensionCard key={d.code} d={d} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Recommended next action */}
        {nextAction && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Recommended next action</h2>
            </div>
            <RecommendationCard r={nextAction} index={0} />
          </div>
        )}

        {/* Key evidence + overall confidence */}
        {evidenceSummary && (
          <div className="rounded-xl border border-[#222E3E] bg-[#1B2431] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Key evidence and confidence</h2>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold capitalize ${confidenceColor(evidenceSummary.confidence)}`}>
                {evidenceSummary.confidence} confidence
              </span>
            </div>
            {evidenceSummary.inputs.length > 0 ? (
              <ul className="space-y-1.5">
                {evidenceSummary.inputs.map((inp, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{inp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                No brief inputs were mapped to these scores - they rest on baseline assumptions.
              </p>
            )}
            {evidenceSummary.confidence !== 'high' && (
              <p className="text-xs text-amber-300/90 mt-3 leading-relaxed">
                Scores are based on self-reported brief answers and baseline assumptions. Expand a dimension's
                "Why this score?" panel to see what information would improve accuracy.
              </p>
            )}
          </div>
        )}

        {/* Collapsed detail sections */}
        <div className="space-y-4">
          <Collapsible
            title="All dimension scores"
            icon={<Layers className="w-4 h-4 text-blue-400" />}
            badge={String(data.dimensions.length)}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {data.dimensions.map((d, i) => (
                <DimensionCard key={d.code} d={d} index={i} />
              ))}
            </div>
          </Collapsible>

          {data.risk_flags.length > 0 && (
            <Collapsible
              title="Risk flags"
              icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
              badge={String(data.risk_flags.length)}
            >
              <div className="space-y-3">
                {data.risk_flags.map((r, i) => (
                  <div key={i} className="rounded-xl border border-[#222E3E] bg-[#0f1117] p-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="font-semibold text-white text-sm">{r.risk_type.replace(/_/g, ' ')}</div>
                      <div className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase ${severityColor(r.severity)}`}>
                        {r.severity}
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{r.description}</p>
                    <div className="mt-3 pt-3 border-t border-[#2A3648]">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Suggested action</div>
                      <p className="text-sm text-blue-300">{r.suggested_action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {data.benchmark_dimensions.length > 0 && (
            <Collapsible
              title="Benchmark positioning"
              icon={<BarChart3 className="w-4 h-4 text-blue-400" />}
            >
              {data.benchmark_profile_name && (
                <p className="text-xs text-slate-500 mb-4">vs. {data.benchmark_profile_name}</p>
              )}
              {data.benchmark_positioning_summary && (
                <p className="text-sm text-slate-300 mb-4 leading-relaxed max-w-3xl">{data.benchmark_positioning_summary}</p>
              )}
              <div className="rounded-xl border border-[#222E3E] bg-[#0f1117] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-[#2A3648]">
                      <th className="text-left px-4 py-3 font-semibold">Dimension</th>
                      <th className="text-right px-4 py-3 font-semibold">You</th>
                      <th className="text-right px-4 py-3 font-semibold">Peers</th>
                      <th className="text-right px-4 py-3 font-semibold">Top quartile</th>
                      <th className="text-right px-4 py-3 font-semibold">Gap</th>
                      <th className="text-right px-4 py-3 font-semibold">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.benchmark_dimensions.map((d, i) => (
                      <tr key={d.code} className={i % 2 === 0 ? 'bg-transparent' : 'bg-[#1B2431]'}>
                        <td className="px-4 py-3 text-white capitalize">{d.name || d.code.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right text-white tabular-nums">{d.company_score.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{d.benchmark_average.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{d.top_quartile.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${d.gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {d.gap >= 0 ? '+' : ''}{d.gap.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold ${positioningColor(d.positioning)}`}>
                            {d.positioning}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          )}

          {data.recommendations.length > 0 && (
            <Collapsible
              title="All recommendations"
              icon={<Sparkles className="w-4 h-4 text-amber-400" />}
              badge={String(data.recommendations.length)}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                {data.recommendations.map((r, i) => (
                  <RecommendationCard key={r.key} r={r} index={i} />
                ))}
              </div>
            </Collapsible>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#222E3E]">
          <Button variant="ghost" onClick={() => navigate(-1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to brief
          </Button>
          <Button onClick={() => navigate('/workspaces')}>Done</Button>
        </div>
      </div>
    </div>
  )
}
