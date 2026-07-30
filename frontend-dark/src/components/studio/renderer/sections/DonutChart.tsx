import { motion } from 'framer-motion'

/**
 * Pie / donut chart - a real circular chart for share/composition data
 * (e.g. a build/buy/borrow/automate sourcing mix). Renders an SVG donut with a
 * labelled legend. Set variant "pie" for a full pie (no hole).
 *
 * data: {
 *   variant?: "donut" | "pie",
 *   valueFormat?: "percent" | "number",
 *   items: [{ label, value, color? }],
 *   narration?: string
 * }
 */

interface Item {
  label: string
  value: number
  color?: string
}

export interface DonutChartData {
  items: Item[]
  variant?: 'donut' | 'pie'
  valueFormat?: 'percent' | 'number'
  narration?: string
  source?: string
}

// Professional palette matching the dashboard style.
const PALETTE = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#14b8a6', '#ef4444', '#0ea5e9', '#64748b', '#1e3a8a', '#a855f7']

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = (angle - 90) * (Math.PI / 180)
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  // Guard: a single 100% slice can't be a 360deg arc (start==end) - draw as a ring/circle.
  const sweep = end - start
  const large = sweep > 180 ? 1 : 0
  const [ox1, oy1] = polar(cx, cy, rOuter, start)
  const [ox2, oy2] = polar(cx, cy, rOuter, end)
  if (rInner <= 0) {
    return `M ${cx} ${cy} L ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2} Z`
  }
  const [ix2, iy2] = polar(cx, cy, rInner, end)
  const [ix1, iy1] = polar(cx, cy, rInner, start)
  return `M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1} Z`
}

export default function DonutChart({ data }: { title?: string; data: DonutChartData; footnote?: string }) {
  const items = Array.isArray(data?.items) ? data.items.filter(x => x && typeof x.value === 'number' && x.value > 0) : []
  if (items.length === 0) return null

  const total = items.reduce((s, x) => s + x.value, 0) || 1
  const isPie = data.variant === 'pie'
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 6
  const rInner = isPie ? 0 : rOuter * 0.58

  const fmt = (v: number) => {
    if (data.valueFormat === 'percent') return `${Math.round(v)}%`
    // If values look like a percentage-ish set, show the share; else raw.
    return String(v)
  }
  const pctOf = (v: number) => `${Math.round((v / total) * 100)}%`

  let angle = 0
  const slices = items.map((it, i) => {
    const sweep = (it.value / total) * 360
    const start = angle
    const end = angle + sweep
    angle = end
    const color = it.color || PALETTE[i % PALETTE.length]
    // Full-circle single slice: draw a ring/disk instead of a degenerate arc.
    const path = sweep >= 359.999
      ? undefined
      : arcPath(cx, cy, rOuter, rInner, start, end)
    return { it, color, path, full: sweep >= 359.999 }
  })

  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <motion.svg
          width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {slices.map((s, i) => (
            s.full ? (
              <g key={i}>
                <circle cx={cx} cy={cy} r={rOuter} fill={s.color} />
                {!isPie && <circle cx={cx} cy={cy} r={rInner} fill="#131720" />}
              </g>
            ) : (
              <path key={i} d={s.path} fill={s.color} stroke="#131720" strokeWidth={2} />
            )
          ))}
        </motion.svg>
        <div className="flex-1 w-full space-y-1.5">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1 text-sm text-slate-300 truncate">{s.it.label}</span>
              <span className="text-sm font-bold text-white tabular-nums flex-shrink-0">
                {data.valueFormat === 'percent' ? fmt(s.it.value) : pctOf(s.it.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {data.narration && <p className="mt-3 text-xs italic text-slate-500">{data.narration}</p>}
    </div>
  )
}
