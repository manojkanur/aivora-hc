import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { SourceBadge } from './SourceBadge'

export interface HorizontalBarChartData {
  items: Array<{
    label: string
    value: number
    sentiment?: 'good' | 'warning' | 'bad' | 'neutral'
    // Optional per-bar benchmark; if any item has one, a dashed vertical line is drawn at that x.
    benchmark?: number
  }>
  max?: number
  valueFormat?: 'number' | 'percent' | 'currency'
  sortBy?: 'value_desc' | 'value_asc' | 'none'
  showValues?: boolean
  // Chart-level benchmark (applies to all bars). Either this or per-item benchmark triggers the dashed line.
  benchmark?: number
}

interface HorizontalBarChartProps {
  title: string
  data: HorizontalBarChartData & { source?: string }
  footnote?: string
}

const ACCENT = '#3b82f6'

const SENTIMENT_COLOR: Record<
  NonNullable<HorizontalBarChartData['items'][number]['sentiment']>,
  string
> = {
  good: '#10b981',
  warning: '#f59e0b',
  bad: '#f43f5e',
  neutral: '#64748b',
}

function formatValue(
  v: number,
  fmt: HorizontalBarChartData['valueFormat'],
): string {
  if (!Number.isFinite(v)) return ' - '
  switch (fmt) {
    case 'percent':
      return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`
    case 'currency': {
      const abs = Math.abs(v)
      if (abs >= 1_000_000_000)
        return `$${(v / 1_000_000_000).toFixed(1)}B`
      if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
      if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
      return `$${v.toFixed(0)}`
    }
    default: {
      const abs = Math.abs(v)
      if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (abs >= 10_000) return `${(v / 1_000).toFixed(1)}K`
      if (Number.isInteger(v)) return v.toLocaleString()
      return v.toFixed(2)
    }
  }
}

function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label
  return `${label.slice(0, max - 1)}…`
}

export function horizontalbarchart({
  title,
  data,
  footnote,
}: HorizontalBarChartProps) {
  const { rows, domainMax, hasSentiment, showValues, valueFormat, benchmark } =
    useMemo(() => {
      const itemsRaw: HorizontalBarChartData['items'] = Array.isArray(data?.items) ? data.items : []
      // Tolerant adapter: accept quadrants[{label,count,names[]}] (HIPO visibility)
      const quads: any[] = Array.isArray((data as any)?.quadrants) ? (data as any).quadrants : []
      const items: HorizontalBarChartData['items'] = itemsRaw.length > 0
        ? itemsRaw
        : quads.map((q) => ({ label: String(q.label ?? ''), value: q.count ?? (Array.isArray(q.names) ? q.names.length : 0) }))
      const sortBy = data?.sortBy ?? 'value_desc'

      const sorted = [...items]
      if (sortBy === 'value_desc') sorted.sort((a, b) => b.value - a.value)
      else if (sortBy === 'value_asc') sorted.sort((a, b) => a.value - b.value)

      const sentimentPresent = items.some((it) => it.sentiment)

      const prepared = sorted.map((it) => ({
        label: it.label,
        displayLabel: truncateLabel(it.label),
        value: Number.isFinite(it.value) ? it.value : 0,
        sentiment: it.sentiment,
        fill: it.sentiment
          ? SENTIMENT_COLOR[it.sentiment]
          : ACCENT,
        benchmark:
          typeof it.benchmark === 'number' && Number.isFinite(it.benchmark)
            ? it.benchmark
            : undefined,
      }))

      // Pick a chart-level benchmark: explicit `data.benchmark`, else first per-item benchmark.
      const chartBenchmark =
        typeof data?.benchmark === 'number' && Number.isFinite(data.benchmark)
          ? data.benchmark
          : prepared.find((r) => r.benchmark !== undefined)?.benchmark

      const computedMax =
        data?.max ??
        Math.max(
          1,
          ...prepared.map((r) => r.value).filter((v) => Number.isFinite(v)),
          chartBenchmark ?? 0,
        )

      return {
        rows: prepared,
        domainMax: computedMax,
        hasSentiment: sentimentPresent,
        showValues: data?.showValues ?? true,
        valueFormat: data?.valueFormat ?? 'number',
        benchmark: chartBenchmark,
      }
    }, [data])

  const hasData = rows.length > 0

  // Layout constants for the custom SVG renderer.
  const LABEL_W = 140
  const BAR_H = 22
  const ROW_GAP = 14
  const PAD_TOP = 8
  const PAD_BOTTOM = 28 // room for x-axis ticks
  const PAD_RIGHT = 64 // room for value labels at bar end
  const rowsCount = rows.length
  const chartHeight = Math.max(
    180,
    PAD_TOP + PAD_BOTTOM + rowsCount * (BAR_H + ROW_GAP),
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
          <SourceBadge source={data?.source} footnote={footnote} />
        </div>
        {hasSentiment && (
          <div className="hidden sm:flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
            <LegendDot color={SENTIMENT_COLOR.good} label="Good" />
            <LegendDot color={SENTIMENT_COLOR.warning} label="Warning" />
            <LegendDot color={SENTIMENT_COLOR.bad} label="Bad" />
            <LegendDot color={SENTIMENT_COLOR.neutral} label="Neutral" />
          </div>
        )}
      </div>

      {hasData ? (
        <div className="w-full">
          <BarsSvg
            rows={rows}
            domainMax={domainMax}
            benchmark={benchmark}
            valueFormat={valueFormat}
            showValues={showValues}
            labelW={LABEL_W}
            barH={BAR_H}
            rowGap={ROW_GAP}
            padTop={PAD_TOP}
            padBottom={PAD_BOTTOM}
            padRight={PAD_RIGHT}
            height={chartHeight}
          />
        </div>
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm text-slate-500">
          No data available
        </div>
      )}

      {footnote && (
        <p className="text-xs text-slate-500 mt-4 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

// Custom SVG renderer — uses framer-motion for staggered easeOut width animation
// and renders soft horizontal gradients per sentiment for richer fills.
function BarsSvg({
  rows,
  domainMax,
  benchmark,
  valueFormat,
  showValues,
  labelW,
  barH,
  rowGap,
  padTop,
  padBottom,
  padRight,
  height,
}: {
  rows: Array<{
    label: string
    displayLabel: string
    value: number
    sentiment?: 'good' | 'warning' | 'bad' | 'neutral'
    fill: string
    benchmark?: number
  }>
  domainMax: number
  benchmark?: number
  valueFormat: HorizontalBarChartData['valueFormat']
  showValues: boolean
  labelW: number
  barH: number
  rowGap: number
  padTop: number
  padBottom: number
  padRight: number
  height: number
}) {
  // Use a viewBox-less responsive layout: width adapts via the wrapper, we use percentages
  // for the bar widths. The fixed left label gutter is rendered as a separate column.
  return (
    <div className="relative w-full" style={{ height }}>
      {/* Y labels column (fixed width) */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: labelW, paddingTop: padTop, paddingBottom: padBottom }}
      >
        {rows.map((r, i) => (
          <div
            key={`yl-${i}`}
            className="text-[11px] text-slate-400 truncate pr-3 flex items-center"
            style={{
              height: barH,
              marginBottom: i === rows.length - 1 ? 0 : rowGap,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
            title={r.label}
          >
            {r.displayLabel}
          </div>
        ))}
      </div>

      {/* Plot area */}
      <div
        className="absolute top-0 bottom-0"
        style={{ left: labelW, right: 0 }}
      >
        <div
          className="relative w-full h-full"
          style={{ paddingTop: padTop, paddingBottom: padBottom, paddingRight: padRight }}
        >
          {/* gridlines: 0%, 25%, 50%, 75%, 100% */}
          <div className="absolute inset-0 pointer-events-none" style={{ paddingTop: padTop, paddingBottom: padBottom, paddingRight: padRight }}>
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <div
                key={`g-${p}`}
                className="absolute top-0 bottom-0 border-l border-dashed"
                style={{
                  left: `calc(${p * 100}% )`,
                  borderColor: '#1e2433',
                }}
              />
            ))}
          </div>

          {/* Benchmark dashed vertical line */}
          {typeof benchmark === 'number' && domainMax > 0 && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: `calc(${Math.min(100, (benchmark / domainMax) * 100)}% )`,
              }}
              title={`Benchmark: ${formatValue(benchmark, valueFormat)}`}
            >
              <div
                className="absolute top-0 bottom-0 border-l-2 border-dashed"
                style={{ borderColor: 'rgba(226,232,240,0.55)', transform: 'translateX(-1px)' }}
              />
              <div
                className="absolute -top-1 -translate-x-1/2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0f1117] border border-[#1e2433] text-slate-300 whitespace-nowrap"
              >
                Benchmark {formatValue(benchmark, valueFormat)}
              </div>
            </div>
          )}

          {/* Bars */}
          <div className="relative w-full h-full">
            {rows.map((r, i) => {
              const pct = domainMax > 0 ? Math.max(0, Math.min(1, r.value / domainMax)) : 0
              const topOffset = padTop + i * (barH + rowGap)
              const gradientFrom =
                r.sentiment === 'good'
                  ? 'from-emerald-500/90'
                  : r.sentiment === 'warning'
                    ? 'from-amber-500/90'
                    : r.sentiment === 'bad'
                      ? 'from-rose-500/90'
                      : r.sentiment === 'neutral'
                        ? 'from-slate-500/90'
                        : 'from-blue-500/90'
              const gradientVia =
                r.sentiment === 'good'
                  ? 'via-emerald-500/60'
                  : r.sentiment === 'warning'
                    ? 'via-amber-500/60'
                    : r.sentiment === 'bad'
                      ? 'via-rose-500/60'
                      : r.sentiment === 'neutral'
                        ? 'via-slate-500/60'
                        : 'via-blue-500/60'
              const gradientTo =
                r.sentiment === 'good'
                  ? 'to-emerald-400/30'
                  : r.sentiment === 'warning'
                    ? 'to-amber-400/30'
                    : r.sentiment === 'bad'
                      ? 'to-rose-400/30'
                      : r.sentiment === 'neutral'
                        ? 'to-slate-400/30'
                        : 'to-blue-400/30'

              return (
                <div
                  key={`row-${i}`}
                  className="absolute left-0"
                  style={{
                    top: topOffset,
                    height: barH,
                    right: padRight,
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.05 }}
                    className={[
                      'h-full rounded-r-md relative overflow-hidden',
                      'bg-gradient-to-r',
                      gradientFrom,
                      gradientVia,
                      gradientTo,
                    ].join(' ')}
                    style={{ boxShadow: `0 0 0 1px ${r.fill}33 inset` }}
                  />
                  {showValues && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.05 + 0.35 }}
                      className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-200 whitespace-nowrap pl-2"
                      style={{
                        left: `calc(${pct * 100}% )`,
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                    >
                      {formatValue(r.value, valueFormat)}
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>

          {/* X-axis ticks */}
          <div className="absolute left-0 right-0" style={{ bottom: 4, paddingRight: padRight }}>
            <div className="relative h-4 text-[10px] text-slate-500 tabular-nums">
              {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                <span
                  key={`t-${p}`}
                  className="absolute -translate-x-1/2"
                  style={{ left: `calc(${p * 100}% )` }}
                >
                  {formatValue(domainMax * p, valueFormat)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  )
}

export default horizontalbarchart
