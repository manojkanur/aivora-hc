import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, BarChart3, AlertTriangle, Target, TrendingUp,
  Sparkles, CheckCircle2, Clock, Layers, Award,
} from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'

interface DimensionResult {
  code: string
  name: string | null
  score: number
  band: string | null
  criticality: string | null
  gap_size: number | null
  interpretation: string | null
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

function MaturityBar({ score, color = 'bg-blue-500' }: { score: number; color?: string }) {
  const pct = Math.min(100, (score / 5) * 100)
  return (
    <div className="h-2 bg-[#1e2433] rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
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

  if (loading) {
    return (
      <div className="min-h-full bg-[#0c0e14] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading diagnosis…
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-full bg-[#0c0e14] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <p className="text-white font-semibold">{error || 'No diagnosis found'}</p>
          <Button onClick={() => navigate('/workspaces')}>Back to workspaces</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#0c0e14]">
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
          className="rounded-2xl border border-[#1a1e2e] bg-gradient-to-br from-[#0f1117] to-[#131720] p-6 sm:p-8 shadow-[0_4px_32px_rgba(0,0,0,0.4)]">
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

        {/* Dimension grid */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Dimensions</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {data.dimensions.map((d, i) => (
              <motion.div key={d.code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-[#1a1e2e] bg-[#131720] p-5">
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
              </motion.div>
            ))}
          </div>
        </div>

        {/* Risk flags */}
        {data.risk_flags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h2 className="text-lg font-semibold text-white">Risk flags</h2>
              <span className="text-xs text-slate-500">({data.risk_flags.length})</span>
            </div>
            <div className="space-y-3">
              {data.risk_flags.map((r, i) => (
                <div key={i} className="rounded-xl border border-[#1a1e2e] bg-[#131720] p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="font-semibold text-white text-sm">{r.risk_type.replace(/_/g, ' ')}</div>
                    <div className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase ${severityColor(r.severity)}`}>
                      {r.severity}
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{r.description}</p>
                  <div className="mt-3 pt-3 border-t border-[#1e2433]">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Suggested action</div>
                    <p className="text-sm text-blue-300">{r.suggested_action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Benchmark */}
        {data.benchmark_dimensions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Benchmark positioning</h2>
            </div>
            {data.benchmark_profile_name && (
              <p className="text-xs text-slate-500 mb-4">vs. {data.benchmark_profile_name}</p>
            )}
            {data.benchmark_positioning_summary && (
              <p className="text-sm text-slate-300 mb-4 leading-relaxed max-w-3xl">{data.benchmark_positioning_summary}</p>
            )}
            <div className="rounded-xl border border-[#1a1e2e] bg-[#131720] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-[#1e2433]">
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
                    <tr key={d.code} className={i % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]'}>
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
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Prioritised recommendations</h2>
              <span className="text-xs text-slate-500">({data.recommendations.length})</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {data.recommendations.map((r, i) => (
                <motion.div key={r.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-xl border border-[#1a1e2e] bg-[#131720] p-5">
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
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#1a1e2e]">
          <Button variant="ghost" onClick={() => navigate(-1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to brief
          </Button>
          <Button onClick={() => navigate('/workspaces')}>Done</Button>
        </div>
      </div>
    </div>
  )
}
