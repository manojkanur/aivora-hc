import { motion } from 'framer-motion'
import { ListOrdered } from 'lucide-react'
import { SourceBadge } from './SourceBadge'

type ScoreFormat = 'number' | 'percent' | 'bar'

interface RankedItem {
  rank: number
  title: string
  score?: number
  scoreMax?: number
  subtitle?: string
  meta?: string[]
}

export interface RankedListData {
  items: RankedItem[]
  scoreFormat?: ScoreFormat
}

interface RankedListProps {
  title: string
  data: RankedListData & { source?: string }
  footnote?: string
}

// Top-3 ranks get heroic display-size numerals with gradient fills.
// #1 is the largest and most saturated, #2/#3 step down in size and intensity.
const topRankStyles: Record<number, { size: string; gradient: string; glow: string }> = {
  1: {
    size: 'text-6xl sm:text-7xl',
    gradient: 'bg-gradient-to-br from-blue-300 via-blue-400 to-blue-600',
    glow: 'drop-shadow-[0_0_24px_rgba(59,130,246,0.45)]',
  },
  2: {
    size: 'text-5xl sm:text-6xl',
    gradient: 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500',
    glow: 'drop-shadow-[0_0_18px_rgba(148,163,184,0.3)]',
  },
  3: {
    size: 'text-5xl sm:text-6xl',
    gradient: 'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600',
    glow: 'drop-shadow-[0_0_18px_rgba(245,158,11,0.3)]',
  },
}

function formatScore(score: number, scoreMax: number | undefined, format: ScoreFormat): string {
  if (format === 'percent') {
    const pct = scoreMax && scoreMax > 0 ? (score / scoreMax) * 100 : score
    return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`
  }
  // Number / bar both show the raw score, with an optional /max suffix in the caller.
  const fixed = Math.abs(score) >= 100 ? score.toFixed(0) : Math.abs(score) >= 10 ? score.toFixed(1) : score.toFixed(2)
  return fixed
}

export function rankedlist({ title, data, footnote }: RankedListProps) {
  // Tolerant adapter: accept the canonical `items` shape OR the HIPO builder's
  // `hipos` array (employee_name / composite_score / subtitle fields).
  const rawHipos: any[] = Array.isArray((data as any)?.hipos) ? (data as any).hipos : []
  const fromHipos = rawHipos.map((h, i) => ({
    rank: i + 1,
    title: h.employee_name ?? h.name ?? h.title ?? `#${i + 1}`,
    score: typeof h.composite_score === 'number' ? h.composite_score : h.score,
    scoreMax: 1,
    subtitle: [h.current_role, h.function].filter(Boolean).join(' · '),
    meta: [
      h.target_role ? `→ ${h.target_role}` : null,
      h.readiness ? h.readiness.replace(/_/g, ' ') : null,
      Array.isArray(h.top_gaps) && h.top_gaps.length ? `gaps: ${h.top_gaps.slice(0, 2).join(', ')}` : null,
    ].filter(Boolean) as string[],
  }))
  // Items can come as program_components-style entries with description/effort/impact
  const itemsNormalised: RankedItem[] = Array.isArray(data?.items) && data.items.length > 0
    ? (data.items as any[]).map((it, i) => ({
        rank: it.rank ?? i + 1,
        title: it.title ?? `#${i + 1}`,
        score: typeof it.score === 'number' ? it.score : undefined,
        scoreMax: it.scoreMax,
        subtitle: it.subtitle ?? it.description,
        meta: Array.isArray(it.meta)
          ? it.meta
          : ([it.effort && `effort: ${it.effort}`, it.impact && `impact: ${it.impact}`].filter(Boolean) as string[]),
      }))
    : fromHipos
  const items = [...itemsNormalised].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  const scoreFormat: ScoreFormat = data?.scoreFormat ?? 'number'

  // Bar fill scales relative to the top score so the leader is always visually dominant at 100%.
  // We compute peak from raw scores (not formatted strings) to keep the comparison meaningful.
  const peakScore = items.reduce((acc, it) => {
    if (typeof it.score !== 'number') return acc
    return Math.max(acc, it.score)
  }, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <ListOrdered className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <SourceBadge source={data?.source} footnote={footnote} />
      </div>

      <ol className="space-y-3">
        {items.map((item, i) => {
          const isTopThree = item.rank >= 1 && item.rank <= 3
          const topStyle = isTopThree ? topRankStyles[item.rank] : null

          const hasScore = typeof item.score === 'number'
          const barWidth =
            hasScore && peakScore > 0
              ? Math.max(2, Math.min(100, ((item.score as number) / peakScore) * 100))
              : 0

          const scoreLabel = hasScore ? formatScore(item.score as number, item.scoreMax, scoreFormat) : null
          const showMaxSuffix =
            hasScore && scoreFormat === 'number' && typeof item.scoreMax === 'number' && item.scoreMax > 0

          return (
            <motion.li
              key={`${item.rank}-${item.title}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3, ease: 'easeOut' }}
              className={[
                'relative overflow-hidden rounded-xl border border-[#1e2433]',
                isTopThree
                  ? 'bg-gradient-to-r from-[#0f1117] via-[#131720] to-[#131720] p-4 sm:p-5'
                  : 'bg-[#0f1117] p-4',
              ].join(' ')}
            >
              <div className="flex items-center gap-4 sm:gap-5">
                {/* Rank numeral */}
                <div className="shrink-0 flex items-center justify-center min-w-[3.5rem] sm:min-w-[4.5rem]">
                  {topStyle ? (
                    <span
                      className={[
                        'font-mono font-bold tabular-nums leading-none bg-clip-text text-transparent select-none',
                        topStyle.size,
                        topStyle.gradient,
                        topStyle.glow,
                      ].join(' ')}
                    >
                      {item.rank}
                    </span>
                  ) : (
                    <span className="font-mono font-semibold tabular-nums text-2xl text-slate-500 select-none">
                      {item.rank}
                    </span>
                  )}
                </div>

                {/* Title + bar + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-semibold text-white truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{item.subtitle}</div>
                      )}
                    </div>

                    {scoreLabel && (
                      <div className="text-right shrink-0">
                        <div
                          className={[
                            'font-mono font-bold tabular-nums leading-none',
                            isTopThree ? 'text-xl sm:text-2xl text-white' : 'text-lg text-slate-200',
                          ].join(' ')}
                        >
                          {scoreLabel}
                          {showMaxSuffix && (
                            <span className="text-xs font-normal text-slate-500 ml-1">
                              / {item.scoreMax}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {hasScore && (
                    <div className="mt-3 h-1.5 bg-[#1e2433] rounded-full overflow-hidden">
                      <motion.div
                        className={[
                          'h-full rounded-full',
                          isTopThree
                            ? 'bg-gradient-to-r from-blue-400 to-blue-600'
                            : 'bg-blue-500/70',
                        ].join(' ')}
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 + i * 0.04 }}
                      />
                    </div>
                  )}

                  {item.meta && item.meta.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                      {item.meta.map((m, mi) => (
                        <span key={mi} className="inline-flex items-center">
                          {mi > 0 && <span className="mr-3 text-slate-700">·</span>}
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.li>
          )
        })}
      </ol>

      {footnote && (
        <p className="mt-4 pt-4 border-t border-[#1e2433] text-xs text-slate-500 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

export default rankedlist
