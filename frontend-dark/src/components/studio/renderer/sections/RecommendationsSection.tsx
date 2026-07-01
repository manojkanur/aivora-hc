import { motion } from 'framer-motion'
import { Target, Clock, TrendingUp, Award, Sparkles } from 'lucide-react'

interface Recommendation {
  key?: string
  title: string
  description?: string
  tier?: string
  category?: string
  matched_dimension?: string
  time_horizon?: string
  default_impact?: string
  default_effort?: string
}

interface RecommendationsData {
  items?: Recommendation[]
  recommendations?: Recommendation[]
}

export default function RecommendationsSection({ data }: { data: RecommendationsData }) {
  const items = data.items || data.recommendations || []
  if (items.length === 0) return null
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((r, i) => (
        <motion.div
          key={r.key || i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="rounded-xl border border-[#1e2433] bg-[#131720] p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-start gap-2 flex-1">
              <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="font-semibold text-white text-sm leading-snug">{r.title}</div>
            </div>
            {r.tier && (
              <div className="px-2 py-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[10px] uppercase font-semibold whitespace-nowrap">
                {r.tier}
              </div>
            )}
          </div>
          {r.description && (
            <p className="text-xs text-slate-400 leading-relaxed mb-3 pl-6">{r.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500 pl-6">
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
  )
}
