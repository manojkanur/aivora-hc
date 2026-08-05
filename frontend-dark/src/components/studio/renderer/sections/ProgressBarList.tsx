import { motion } from 'framer-motion'
import { useCountUp } from './useCountUp'

/**
 * Labeled horizontal progress bars with counts - the signature "By stage"
 * block from the executive-tracker dashboard design. Renders one or two
 * columns of `label ---- [colored bar] ---- value` rows.
 *
 * data: {
 *   columns?: 1 | 2,                    // default: 2 if >6 items else 1
 *   max?: number,                       // bar scale; default = largest value
 *   valueFormat?: 'number' | 'percent',
 *   items: [{ label, value, color?, sentiment? }]
 * }
 */

type Sentiment = 'good' | 'warning' | 'bad' | 'neutral' | 'info' | 'accent'

interface Item {
  label: string
  value: number
  color?: string
  sentiment?: Sentiment
}

export interface ProgressBarListData {
  items: Item[]
  columns?: 1 | 2
  max?: number
  valueFormat?: 'number' | 'percent'
  narration?: string
  source?: string
}

// Brand-aligned palette matching the AIVORA report system.
const SENTIMENT_COLOR: Record<Sentiment, string> = {
  good: '#2E9E5B',      // success - completed / positive
  warning: '#C97A1E',   // warning - attention
  bad: '#D14343',       // risk - negative
  neutral: '#8C96A6',   // neutral - on hold / other
  info: '#5B96F5',      // brand mid blue
  accent: '#175FCC',    // brand strong - default
}

// Rotating accent palette when neither color nor sentiment is provided, so a
// list still reads as a coherent, on-brand dashboard.
const PALETTE = ['#2E7DFA', '#17BFA0', '#5B96F5', '#0D3C82', '#8C96A6']

function colorFor(item: Item, i: number): string {
  if (item.color) return item.color
  if (item.sentiment && SENTIMENT_COLOR[item.sentiment]) return SENTIMENT_COLOR[item.sentiment]
  return PALETTE[i % PALETTE.length]
}

function Row({ item, i, max, valueFormat }: { item: Item; i: number; max: number; valueFormat?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (item.value / max) * 100)) : 0
  const color = colorFor(item, i)
  const animated = useCountUp(item.value)
  const shown = valueFormat === 'percent' ? `${Math.round(animated)}%` : String(Math.round(animated))
  return (
    <div className="group flex items-center gap-3 py-1.5">
      <span className="w-28 flex-shrink-0 text-sm text-slate-300 group-hover:text-white transition-colors truncate" title={item.label}>{item.label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-[#2A3648] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 8px ${color}44` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
        />
      </div>
      <span className="w-8 flex-shrink-0 text-right text-sm font-bold text-white tabular-nums">{shown}</span>
    </div>
  )
}

export default function ProgressBarList({ data }: { title?: string; data: ProgressBarListData; footnote?: string }) {
  const items = Array.isArray(data?.items) ? data.items.filter(x => x && typeof x.value === 'number') : []
  if (items.length === 0) return null

  const max = data.max && data.max > 0 ? data.max : Math.max(...items.map(x => x.value), 1)
  const twoCol = (data.columns ?? (items.length > 6 ? 2 : 1)) === 2 && items.length > 3
  const mid = Math.ceil(items.length / 2)
  const left = twoCol ? items.slice(0, mid) : items
  const right = twoCol ? items.slice(mid) : []

  return (
    <div className="rounded-2xl border border-[#2A3648] bg-[#1B2431] p-5 sm:p-6">
      <div className={twoCol ? 'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0' : ''}>
        <div>
          {left.map((it, i) => (
            <Row key={`l-${i}`} item={it} i={i} max={max} valueFormat={data.valueFormat} />
          ))}
        </div>
        {twoCol && (
          <div>
            {right.map((it, i) => (
              <Row key={`r-${i}`} item={it} i={mid + i} max={max} valueFormat={data.valueFormat} />
            ))}
          </div>
        )}
      </div>
      {data.narration && <p className="mt-3 text-xs italic text-slate-500">{data.narration}</p>}
    </div>
  )
}
