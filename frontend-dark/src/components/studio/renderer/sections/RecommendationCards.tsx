import { motion } from 'framer-motion'
import { ArrowUpRight, Gauge, Sparkles, Zap } from 'lucide-react'
import { SourceBadge } from './SourceBadge'

export interface RecommendationCardsData {
  columns?: 1 | 2 | 3
  items: Array<{
    id: string
    title: string
    rationale: string
    priority: 'high' | 'medium' | 'low'
    effort?: 'low' | 'medium' | 'high'
    impact?: 'low' | 'medium' | 'high'
    tags?: string[]
    cta?: { label: string; href?: string }
  }>
}

type Priority = 'high' | 'medium' | 'low'
type Level = 'low' | 'medium' | 'high'

interface PriorityTheme {
  chip: string
  border: string
  dot: string
  label: string
}

const PRIORITY_THEME: Record<Priority, PriorityTheme> = {
  high: {
    chip: 'text-rose-300 bg-rose-500/15 border-rose-500/40',
    border: '#f43f5e',
    dot: 'bg-rose-500',
    label: 'High priority',
  },
  medium: {
    chip: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    border: '#f59e0b',
    dot: 'bg-amber-500',
    label: 'Medium priority',
  },
  low: {
    chip: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
    border: '#10b981',
    dot: 'bg-emerald-500',
    label: 'Low priority',
  },
}

const LEVEL_VALUE: Record<Level, number> = { low: 1, medium: 2, high: 3 }

function LevelDots({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: Level
  color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const filled = LEVEL_VALUE[value]
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i <= filled ? color : 'bg-[#1e2433]'
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-semibold text-slate-300 capitalize tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function recommendationcards({
  title,
  data,
  footnote,
}: {
  title: string
  data: RecommendationCardsData & { source?: string }
  footnote?: string
}) {
  // Advisor shape: data.cards: [{id,title,description,priority,horizon,source}]
  const rawCards: any[] = Array.isArray((data as any)?.cards) ? (data as any).cards : []
  if ((!Array.isArray(data?.items) || (data.items ?? []).length === 0) && rawCards.length) {
    ;(data as any).items = rawCards.map((c, i) => ({
      id: c.id ?? `card-${i}`,
      title: c.title ?? `Recommendation ${i + 1}`,
      rationale: c.description ?? c.rationale ?? '',
      priority: (c.priority ?? 'medium') as 'high' | 'medium' | 'low',
      tags: [c.horizon, c.type].filter(Boolean) as string[],
    }))
  }
  // hc-strategy shape: data.pillars: [{pillar_id,title,rationale,gap,current_score,target_score,benchmark_avg,linked_initiatives}]
  const rawPillars: any[] = Array.isArray((data as any)?.pillars) ? (data as any).pillars : []
  if ((!Array.isArray(data?.items) || (data.items ?? []).length === 0) && rawPillars.length) {
    ;(data as any).items = rawPillars.map((p, i) => ({
      id: p.pillar_id ?? `pillar-${i}`,
      title: p.title ?? `Pillar ${i + 1}`,
      rationale: p.rationale ?? '',
      priority: (typeof p.gap === 'number' && p.gap > 1.5 ? 'high' : p.gap > 0.8 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      tags: [
        p.anchor_dimension ? `dim: ${p.anchor_dimension}` : null,
        typeof p.gap === 'number' ? `gap: ${p.gap.toFixed(1)}` : null,
      ].filter(Boolean) as string[],
    }))
  }
  // Tolerant adapter: accept canonical {items} OR HIPO builder shape {recommendations:[{name,top_gaps,recommendations:[{type,title,source}]}]}
  const rawRecs: any[] = Array.isArray((data as any)?.recommendations) ? (data as any).recommendations : []
  if ((!Array.isArray(data?.items) || (data.items ?? []).length === 0) && rawRecs.length) {
    const flat: any[] = []
    rawRecs.forEach((r, hi) => {
      const owner = r.name ?? r.employee_name
      const inner = Array.isArray(r.recommendations) ? r.recommendations : []
      inner.forEach((rec: any, ri: number) => {
        flat.push({
          id: `${owner ?? hi}-${ri}`,
          title: rec.title ?? rec.name ?? 'Recommendation',
          rationale: owner
            ? `For ${owner}${Array.isArray(r.top_gaps) && r.top_gaps.length ? ` · Gaps: ${r.top_gaps.slice(0,2).join(', ')}` : ''}`
            : (rec.rationale ?? ''),
          priority: rec.priority ?? 'medium',
          effort: rec.effort,
          impact: rec.impact,
          tags: rec.source ? [rec.source.split(':').slice(-1)[0]] : undefined,
        })
      })
    })
    ;(data as any).items = flat
  }
  const columns = data.columns ?? 2
  const gridCols =
    columns === 1
      ? 'grid-cols-1'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500 tabular-nums">
          ({(data.items ?? []).length})
        </span>
        <SourceBadge source={(data as any)?.source} footnote={footnote} />
      </div>

      {(data.items ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1e2433] bg-[#0f1117] py-10 text-center">
          <p className="text-sm text-slate-500">No recommendations yet.</p>
        </div>
      ) : (
        <div className={`grid gap-4 ${gridCols}`}>
          {(data.items ?? []).map((item, i) => {
            const theme = PRIORITY_THEME[item.priority]
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: 'easeOut' }}
                className="relative rounded-xl border border-[#1a1e2e] bg-[#0f1117] p-5 pl-[18px] flex flex-col gap-3 overflow-hidden"
                style={{ borderLeft: `3px solid ${theme.border}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${theme.chip}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
                      {theme.label}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white leading-snug">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {item.rationale}
                </p>

                {(item.impact || item.effort) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                    {item.impact && (
                      <LevelDots
                        label="Impact"
                        value={item.impact}
                        color="bg-blue-500"
                        icon={Zap}
                      />
                    )}
                    {item.effort && (
                      <LevelDots
                        label="Effort"
                        value={item.effort}
                        color="bg-slate-400"
                        icon={Gauge}
                      />
                    )}
                  </div>
                )}

                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-[#1a1e2e] border border-[#1e2433] text-[10px] font-medium text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.cta && (
                  <div className="pt-1 mt-auto">
                    <a
                      href={item.cta.href || '#'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e2433] bg-transparent text-xs font-semibold text-blue-300 hover:text-white hover:bg-blue-500/10 hover:border-blue-500/40 transition-colors"
                    >
                      {item.cta.label}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {footnote && (
        <p className="mt-5 pt-4 border-t border-[#1e2433] text-xs text-slate-500 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

export default recommendationcards
