import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

export interface RadarChartData {
  axes: string[]
  series: Array<{ name: string; values: number[]; color?: string }>
  max?: number
  showLegend?: boolean
}

interface RadarChartProps {
  title: string
  data: RadarChartData & { source?: string }
  footnote?: string
}

const DEFAULT_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#a855f7']

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-[#1e2433] bg-[#0f1117] px-3 py-2 shadow-lg">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-slate-300">{p.name}</span>
            <span className="ml-auto text-white tabular-nums font-medium">
              {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function radarchart({ title, data, footnote }: RadarChartProps) {
  const { chartData, seriesConfig, domainMax } = useMemo(() => {
    const axes = data?.axes ?? []
    const series = data?.series ?? []

    const computedMax =
      data?.max ??
      Math.max(
        1,
        ...series.flatMap((s) => s.values ?? []).filter((v) => Number.isFinite(v)),
      )

    const chart = axes.map((axisLabel, i) => {
      const row: Record<string, string | number> = { axis: axisLabel }
      series.forEach((s) => {
        const v = s.values?.[i]
        row[s.name] = Number.isFinite(v) ? (v as number) : 0
      })
      return row
    })

    const configured = series.map((s, i) => ({
      name: s.name,
      color: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }))

    return { chartData: chart, seriesConfig: configured, domainMax: computedMax }
  }, [data])

  const showLegend = data?.showLegend ?? data?.series?.length > 1
  const hasData = chartData.length > 0 && seriesConfig.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <span
          className="ml-auto inline-flex items-center text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-help"
          title={`Source: ${data?.source || footnote || 'not specified'}`}
        >
          ⓘ source
        </span>
      </div>

      {hasData ? (
        <div className="w-full h-[340px] sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsRadarChart
              data={chartData}
              outerRadius="75%"
              margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
            >
              <PolarGrid stroke="#1e2433" strokeDasharray="2 4" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{
                  fill: '#94a3b8',
                  fontSize: 11,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                stroke="#1e2433"
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, domainMax]}
                tick={{ fill: '#475569', fontSize: 10 }}
                stroke="transparent"
                axisLine={false}
                tickFormatter={(v) =>
                  typeof v === 'number' ? v.toFixed(domainMax <= 5 ? 1 : 0) : `${v}`
                }
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#1e2433', strokeWidth: 1 }}
              />
              {seriesConfig.map((s) => (
                <Radar
                  key={s.name}
                  name={s.name}
                  dataKey={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={s.color}
                  fillOpacity={0.25}
                  isAnimationActive
                  animationDuration={600}
                />
              ))}
              {showLegend && (
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    color: '#94a3b8',
                    fontSize: 12,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    paddingTop: 8,
                  }}
                />
              )}
            </RechartsRadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[340px] flex items-center justify-center text-sm text-slate-500">
          No data available
        </div>
      )}

      {footnote && (
        <p className="text-xs text-slate-500 mt-4 leading-relaxed">{footnote}</p>
      )}
    </motion.div>
  )
}

export default radarchart
