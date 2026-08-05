import { useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Modern pie / donut chart for share/composition data (e.g. a
 * build/buy/borrow/automate sourcing mix). Animated draw-in, gradient slices,
 * hover-to-highlight, a center readout on the donut, and a clean legend with
 * share bars. Set variant "pie" for a full pie (no hole).
 *
 * data: {
 *   variant?: "donut" | "pie",
 *   valueFormat?: "percent" | "number",
 *   items: [{ label, value, color? }],
 *   centerLabel?: string,        // donut center caption (default: "Total")
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
  centerLabel?: string
  narration?: string
  source?: string
}

// Restrained brand ramp that reads well on the dark card.
const PALETTE = ['#2E7DFA', '#17BFA0', '#5B96F5', '#0D3C82', '#8C96A6']

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = (angle - 90) * (Math.PI / 180)
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
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

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 0xff) + amt), b = clamp((n & 0xff) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function DonutChart({ data }: { title?: string; data: DonutChartData; footnote?: string }) {
  const items = Array.isArray(data?.items) ? data.items.filter(x => x && typeof x.value === 'number' && x.value > 0) : []
  const [hover, setHover] = useState<number | null>(null)
  if (items.length === 0) return null

  const total = items.reduce((s, x) => s + x.value, 0) || 1
  const isPie = data.variant === 'pie'
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 8
  const rInner = isPie ? 0 : rOuter * 0.6

  const pct = (v: number) => Math.round((v / total) * 100)
  const showVal = (v: number) => data.valueFormat === 'percent' ? `${Math.round(v)}%` : `${pct(v)}%`

  let angle = 0
  const slices = items.map((it, i) => {
    const sweep = (it.value / total) * 360
    const start = angle
    const end = angle + sweep
    angle = end
    const base = it.color || PALETTE[i % PALETTE.length]
    const full = sweep >= 359.999
    return { it, i, base, start, end, full, path: full ? undefined : arcPath(cx, cy, rOuter, rInner, start, end) }
  })

  // Largest slice drives the donut-center readout.
  const lead = slices.reduce((a, b) => (b.it.value > a.it.value ? b : a), slices[0])
  const gid = `donutgrad-${Math.round(total)}-${items.length}`

  return (
    <div className="rounded-2xl border border-[#2A3648] bg-gradient-to-br from-[#141824] to-[#0f1219] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
              {slices.map(s => (
                <linearGradient key={s.i} id={`${gid}-${s.i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={shade(s.base, 28)} />
                  <stop offset="100%" stopColor={shade(s.base, -18)} />
                </linearGradient>
              ))}
            </defs>
            {slices.map(s => {
              const active = hover === null || hover === s.i
              const inner = s.full && !isPie
              return s.full ? (
                <g key={s.i}>
                  <circle cx={cx} cy={cy} r={rOuter} fill={`url(#${gid}-${s.i})`} />
                  {inner && <circle cx={cx} cy={cy} r={rInner} fill="#0f1219" />}
                </g>
              ) : (
                <motion.path
                  key={s.i}
                  d={s.path}
                  fill={`url(#${gid}-${s.i})`}
                  stroke="#0f1219"
                  strokeWidth={2.5}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: active ? 1 : 0.28 }}
                  transition={{ duration: 0.35, delay: s.i * 0.06 }}
                  onMouseEnter={() => setHover(s.i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
              )
            })}
          </svg>
          {!isPie && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <motion.span
                key={hover ?? 'lead'}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                className="text-2xl font-bold text-white tabular-nums">
                {showVal((hover !== null ? slices[hover].it : lead.it).value)}
              </motion.span>
              <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 max-w-[80px] text-center truncate">
                {(hover !== null ? slices[hover].it : lead.it).label}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 w-full space-y-2.5">
          {slices.map(s => (
            <div key={s.i}
              onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}
              className={cnLegend(hover === null || hover === s.i)}>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.base }} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-200 truncate">{s.it.label}</span>
                  <span className="text-sm font-bold text-white tabular-nums flex-shrink-0">{showVal(s.it.value)}</span>
                </span>
                <span className="mt-1 block h-1 rounded-full bg-[#2A3648] overflow-hidden">
                  <motion.span className="block h-full rounded-full" style={{ backgroundColor: s.base }}
                    initial={{ width: 0 }} animate={{ width: `${pct(s.it.value)}%` }}
                    transition={{ duration: 0.6, delay: s.i * 0.06, ease: 'easeOut' }} />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {data.narration && <p className="mt-4 text-xs italic text-slate-500">{data.narration}</p>}
    </div>
  )
}

function cnLegend(active: boolean): string {
  return `flex items-center gap-2.5 transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`
}
