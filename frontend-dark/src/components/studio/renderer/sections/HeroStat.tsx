import { motion } from 'framer-motion'
import { useCountUp } from './useCountUp'

/**
 * Hero stat block - a big headline number with a label and up to ~4 supporting
 * sub-stats, matching the "TOTAL POSITIONS 100 / 24 Joined / 40 in pipeline"
 * panel from the executive-tracker dashboard. Numbers count up on appear.
 *
 * data: {
 *   label: string,          // e.g. "Total positions"
 *   value: number|string,   // e.g. 100
 *   unit?: string,          // optional suffix e.g. "%"
 *   substats?: [{ value: number|string, label: string, sentiment?: "good|warning|bad|neutral|accent" }],
 *   footnote?: string
 * }
 */

type Sentiment = 'good' | 'warning' | 'bad' | 'neutral' | 'accent'

interface SubStat {
  value: number | string
  label: string
  sentiment?: Sentiment
}

export interface HeroStatData {
  label: string
  value: number | string
  unit?: string
  substats?: SubStat[]
  narration?: string
}

const SENT: Record<Sentiment, string> = {
  good: '#2E9E5B', warning: '#C97A1E', bad: '#D14343', neutral: '#8C96A6', accent: '#2E7DFA',
}

function BigNumber({ value }: { value: number | string }) {
  const raw = String(value)
  const m = raw.match(/-?\d[\d,]*\.?\d*/)
  const target = m ? parseFloat(m[0].replace(/,/g, '')) : NaN
  const animated = useCountUp(Number.isFinite(target) ? target : 0)
  if (!m || !Number.isFinite(target)) return <>{raw}</>
  const decimals = (m[0].split('.')[1] || '').length
  const shown = decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toLocaleString()
  return <>{raw.replace(m[0], shown)}</>
}

export default function HeroStat({ data }: { title?: string; data: HeroStatData; footnote?: string }) {
  if (!data || (data.value === undefined && !data.label)) return null
  const subs = (data.substats || []).slice(0, 4)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/[0.07] to-[#0f1219] p-6 sm:p-7"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        {/* Hero number */}
        <div className="sm:pr-8 sm:border-r sm:border-[#2A3648]">
          {data.label && (
            <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1">{data.label}</div>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl sm:text-6xl font-bold text-blue-400 leading-none tabular-nums">
              <BigNumber value={data.value} />
            </span>
            {data.unit && <span className="text-2xl font-semibold text-blue-400/80">{data.unit}</span>}
          </div>
        </div>
        {/* Sub-stats */}
        {subs.length > 0 && (
          <div className="flex flex-wrap gap-x-8 gap-y-3 flex-1">
            {subs.map((s, i) => (
              <div key={i} className="min-w-[80px]">
                <div className="text-2xl font-bold tabular-nums" style={{ color: SENT[s.sentiment || 'accent'] }}>
                  <BigNumber value={s.value} />
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {data.narration && <p className="mt-4 text-xs italic text-slate-500">{data.narration}</p>}
    </motion.div>
  )
}
