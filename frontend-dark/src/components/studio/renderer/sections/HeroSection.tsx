import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface HeroData {
  headline?: string
  subheadline?: string
  eyebrow?: string
  highlights?: string[]
}

export default function HeroSection({ title, data }: { title?: string; data: HeroData }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#2A3648] bg-gradient-to-br from-[#0f1117] to-[#1B2431] p-6 sm:p-8 shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
    >
      {data.eyebrow && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">{data.eyebrow}</span>
        </div>
      )}
      <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
        {data.headline || title}
      </h2>
      {data.subheadline && (
        <p className="text-slate-300 mt-3 text-sm sm:text-base leading-relaxed max-w-3xl">
          {data.subheadline}
        </p>
      )}
      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {data.highlights.map((h, i) => (
            <span
              key={i}
              className="px-3 py-1 rounded-md border border-[#2A3648] bg-[#0B1220] text-xs text-slate-300"
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </motion.section>
  )
}
