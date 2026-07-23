import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Activity,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Target,
  Clock,
  Award,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Layers,
  Gauge,
  Zap,
  Heart,
  type LucideIcon,
} from 'lucide-react'
import { SourceBadge } from './SourceBadge'

type Sentiment = 'good' | 'warning' | 'bad' | 'neutral'
type Direction = 'up' | 'down' | 'flat'

interface KpiDelta {
  value: number
  direction: Direction
  sentiment: Sentiment
  // Optional descriptive suffix that overrides the default "%" formatting (e.g. "pp", "%" + period).
  unit?: string
  period?: string
}

interface KpiItem {
  label: string
  value: string | number
  unit?: string
  delta?: KpiDelta
  sublabel?: string
  icon?: string
  // Optional tiny inline trend line (4-12 points). Rendered as a small SVG below the value.
  sparkline?: number[]
  // Optional target/goal value displayed as a muted sub-label.
  target?: string | number
}

export interface KpiGridData {
  columns?: 2 | 3 | 4
  items: KpiItem[]
}

interface KpiGridProps {
  title: string
  data: KpiGridData & { source?: string }
  footnote?: string
}

const ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  users: Users,
  dollar: DollarSign,
  'dollar-sign': DollarSign,
  target: Target,
  clock: Clock,
  award: Award,
  alert: AlertTriangle,
  'alert-triangle': AlertTriangle,
  check: CheckCircle2,
  'check-circle': CheckCircle2,
  sparkles: Sparkles,
  bar: BarChart3,
  'bar-chart': BarChart3,
  layers: Layers,
  gauge: Gauge,
  zap: Zap,
  heart: Heart,
}

function resolveIcon(name?: string): LucideIcon {
  if (!name) return Activity
  return ICON_MAP[name.toLowerCase()] ?? Activity
}

const sentimentText: Record<Sentiment, string> = {
  good: 'text-emerald-300',
  warning: 'text-amber-300',
  bad: 'text-rose-300',
  neutral: 'text-slate-300',
}

const sentimentBg: Record<Sentiment, string> = {
  good: 'bg-emerald-500/10 border-emerald-500/30',
  warning: 'bg-amber-500/10 border-amber-500/30',
  bad: 'bg-rose-500/10 border-rose-500/30',
  neutral: 'bg-slate-500/10 border-slate-500/30',
}

const directionIcon: Record<Direction, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
}

const columnsClass: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

// Tile padding scales inversely with column density so a 2-up grid feels heroic and a 4-up grid stays compact.
const tilePadding: Record<2 | 3 | 4, string> = {
  2: 'p-6',
  3: 'p-5',
  4: 'p-4',
}

// Value typography scales with density too.
const valueSize: Record<2 | 3 | 4, string> = {
  2: 'text-4xl sm:text-5xl',
  3: 'text-3xl sm:text-4xl',
  4: 'text-2xl sm:text-3xl',
}

function magnitudeOf(value: string | number): number {
  if (typeof value === 'number') return Math.abs(value)
  // Strip everything but digits, decimal points, and minus to recover the underlying number.
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? Math.abs(n) : 0
}

function formatDelta(n: number, unit?: string): string {
  const abs = Math.abs(n)
  const fixed = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${fixed}${unit ?? '%'}`
}

// Tiny inline sparkline. Renders a 40x12 viewBox polyline using the accent stroke.
function Sparkline({ points, color = '#3b82f6' }: { points: number[]; color?: string }) {
  if (!Array.isArray(points) || points.length < 2) return null
  const w = 40
  const h = 12
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const stepX = w / (points.length - 1)
  const d = points
    .map((p, i) => {
      const x = i * stepX
      const y = h - ((p - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="mt-1.5 block"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function kpigrid({ title, data, footnote }: KpiGridProps) {
  // Tolerant adapter: backend uses `kpis` for HIPO sections, `items` is canonical.
  const items: KpiItem[] = Array.isArray(data?.items) && data.items.length > 0
    ? data.items
    : Array.isArray((data as any)?.kpis)
      ? (data as any).kpis
      : []
  const columns: 2 | 3 | 4 = data.columns ?? (items.length >= 4 ? 4 : items.length === 3 ? 3 : 2)

  // Identify the hero metric: the single item with the largest magnitude. If everything is zero/non-numeric,
  // fall back to the first item so the studio still has a visual anchor.
  let heroIndex = 0
  let heroMag = -Infinity
  items.forEach((it, i) => {
    const m = magnitudeOf(it.value)
    if (m > heroMag) {
      heroMag = m
      heroIndex = i
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
        <SourceBadge source={data?.source} footnote={footnote} />
      </div>

      <div className={`grid grid-cols-1 ${columnsClass[columns]} gap-3 sm:gap-4`}>
        {items.map((item, i) => {
          const Icon = resolveIcon(item.icon)
          const isHero = i === heroIndex && items.length > 1
          // Tolerant: backend sometimes sends delta as a string label ("low") instead of {value,direction,sentiment}.
          const rawDelta: any = item.delta
          const delta: KpiDelta | undefined =
            rawDelta && typeof rawDelta === 'object' && 'direction' in rawDelta
              ? (rawDelta as KpiDelta)
              : undefined
          const DeltaIcon = delta ? directionIcon[delta.direction] : null

          return (
            <motion.div
              key={`${item.label}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3, ease: 'easeOut' }}
              className={[
                'relative overflow-hidden rounded-xl border',
                tilePadding[columns],
                isHero
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : 'border-[#1e2433] bg-[#0f1117]',
              ].join(' ')}
            >
              {isHero && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl"
                />
              )}

              <div className="relative flex items-start justify-between gap-3 mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {item.label}
                </div>
                <Icon className={`w-4 h-4 shrink-0 ${isHero ? 'text-blue-400' : 'text-slate-500'}`} />
              </div>

              <div className="relative flex items-baseline gap-1.5 flex-wrap">
                <div
                  className={[
                    'font-bold text-white leading-tight break-words min-w-0',
                    // Monospace + tabular only for short numeric-ish values; long
                    // words like "Moderate" render in the normal font and can wrap.
                    String(item.value).length <= 6 ? 'font-mono tabular-nums' : '',
                    String(item.value).length > 10 ? 'text-2xl' : valueSize[columns],
                  ].join(' ')}
                >
                  {item.value}
                </div>
                {item.unit && (
                  <div className="text-sm text-slate-500 tabular-nums">{item.unit}</div>
                )}
              </div>

              {Array.isArray(item.sparkline) &&
                item.sparkline.length >= 4 &&
                item.sparkline.length <= 12 && (
                  <Sparkline points={item.sparkline} />
                )}

              {item.target !== undefined && item.target !== null && item.target !== '' && (
                <div className="relative mt-1.5 text-[11px] text-slate-500 tabular-nums">
                  Target: <span className="text-slate-400">{item.target}</span>
                </div>
              )}

              <div className="relative mt-3 flex items-start justify-between gap-2">
                {item.sublabel ? (
                  <div className="text-xs text-slate-400 leading-relaxed">{item.sublabel}</div>
                ) : (
                  <div />
                )}

                {delta && DeltaIcon && (
                  <div
                    className={[
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold tabular-nums whitespace-nowrap',
                      sentimentBg[delta.sentiment],
                      sentimentText[delta.sentiment],
                    ].join(' ')}
                  >
                    <DeltaIcon className="w-3 h-3" />
                    <span>{formatDelta(delta.value, delta.unit)}</span>
                    {delta.period && (
                      <span className="opacity-70 font-medium">{delta.period}</span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {footnote && (
        <p className="mt-4 pt-4 border-t border-[#1e2433] text-xs text-slate-500 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

export default kpigrid
