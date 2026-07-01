import { motion } from 'framer-motion'

interface Stat {
  label: string
  value: string | number
  caption?: string
  unit?: string
}

interface StatBlockData {
  stats?: Stat[]
}

export default function StatBlockSection({ data }: { data: StatBlockData }) {
  const stats = data.stats || []
  if (stats.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-gradient-to-br from-[#0f1117] to-[#131720] p-6 sm:p-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {stats.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-baseline gap-1">
              <div className="text-4xl font-bold text-white tabular-nums tracking-tight">
                {s.value}
              </div>
              {s.unit && <div className="text-sm text-slate-500">{s.unit}</div>}
            </div>
            <div className="text-xs text-slate-400 mt-2 font-semibold uppercase tracking-wider">
              {s.label}
            </div>
            {s.caption && (
              <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{s.caption}</div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
