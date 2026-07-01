import { motion } from 'framer-motion'

interface TimelineItem {
  label: string
  date?: string
  description?: string
  status?: 'done' | 'active' | 'upcoming'
}

interface TimelineData {
  items?: TimelineItem[]
}

function dotCls(status?: string): string {
  if (status === 'done') return 'bg-emerald-500 border-emerald-400'
  if (status === 'active') return 'bg-blue-500 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]'
  return 'bg-[#1e2433] border-slate-600'
}

export default function TimelineSection({ data }: { data: TimelineData }) {
  const items = data.items || []
  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5 sm:p-6">
      <ol className="relative border-l border-[#1e2433] ml-2">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="ml-6 pb-6 last:pb-0"
          >
            <span
              className={`absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2 ${dotCls(item.status)}`}
            />
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-white">{item.label}</div>
              {item.date && (
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  {item.date}
                </div>
              )}
            </div>
            {item.description && (
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
