import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Kpi {
  label: string
  value: string | number
  unit?: string
  delta?: number
  trend?: 'up' | 'down' | 'flat'
  caption?: string
}

interface KpiGridData {
  kpis?: Kpi[]
}

function trendIcon(trend?: string) {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5" />
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5" />
  return <Minus className="w-3.5 h-3.5" />
}

function trendColor(trend?: string): string {
  if (trend === 'up') return 'text-emerald-400'
  if (trend === 'down') return 'text-rose-400'
  return 'text-slate-400'
}

export default function KpiGridSection({ data }: { data: KpiGridData }) {
  const kpis = data.kpis || []
  if (kpis.length === 0) return null
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((k, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="rounded-xl border border-[#1e2433] bg-[#131720] p-4"
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {k.label}
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <div className="text-2xl font-bold text-white tabular-nums">{k.value}</div>
            {k.unit && <div className="text-xs text-slate-500">{k.unit}</div>}
          </div>
          {(typeof k.delta === 'number' || k.trend) && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trendColor(k.trend)}`}>
              {trendIcon(k.trend)}
              {typeof k.delta === 'number' && (
                <span className="tabular-nums">
                  {k.delta > 0 ? '+' : ''}
                  {k.delta}%
                </span>
              )}
            </div>
          )}
          {k.caption && <div className="text-[10px] text-slate-500 mt-1">{k.caption}</div>}
        </motion.div>
      ))}
    </div>
  )
}
