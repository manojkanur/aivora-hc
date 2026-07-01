import { motion } from 'framer-motion'

interface HeatmapCell {
  label: string
  score: number
  band?: string
  caption?: string
}

interface HeatmapData {
  cells?: HeatmapCell[]
  max?: number
}

function scoreColor(pct: number): string {
  if (pct >= 0.8) return 'bg-emerald-500/80 border-emerald-400/40'
  if (pct >= 0.6) return 'bg-blue-500/70 border-blue-400/40'
  if (pct >= 0.4) return 'bg-amber-500/70 border-amber-400/40'
  return 'bg-rose-500/70 border-rose-400/40'
}

export default function HeatmapSection({ data }: { data: HeatmapData }) {
  const cells = data.cells || []
  const max = data.max ?? 5
  if (cells.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5 sm:p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cells.map((c, i) => {
          const pct = Math.max(0, Math.min(1, c.score / max))
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className={`rounded-xl border p-4 ${scoreColor(pct)}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/80 font-semibold">
                {c.label}
              </div>
              <div className="text-2xl font-bold text-white tabular-nums mt-1">
                {c.score.toFixed(2)}
              </div>
              {c.band && (
                <div className="text-[10px] uppercase tracking-wider text-white/80 mt-1">
                  {c.band}
                </div>
              )}
              {c.caption && (
                <div className="text-[10px] text-white/70 mt-1 leading-tight">{c.caption}</div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
