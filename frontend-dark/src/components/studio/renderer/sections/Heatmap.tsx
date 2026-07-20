import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { SourceBadge } from './SourceBadge'

export interface HeatmapData {
  rows: string[]
  cols: string[]
  values: number[][]
  scale?: { min: number; max: number }
  valueFormat?: 'number' | 'percent'
  colorScale?: 'sequential' | 'diverging'
}

interface HeatmapProps {
  title: string
  data: HeatmapData & { source?: string }
  footnote?: string
  /** Studio accent (hex). Defaults to platform blue. */
  accentColor?: string
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Parse a #rrggbb hex string into [r,g,b]. Falls back to platform blue. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [59, 130, 246]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
}

function rgbCss(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

/** Blend two RGB triples by t in [0,1]. */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const k = clamp01(t)
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

function formatValue(v: number, fmt: 'number' | 'percent' | undefined): string {
  if (!Number.isFinite(v)) return ' - '
  if (fmt === 'percent') return `${(v * 100).toFixed(1)}%`
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)
}

// Diverging endpoints: rose-500 → slate-500 → emerald-500
const DIVERGING_BAD: [number, number, number] = [244, 63, 94]
const DIVERGING_MID: [number, number, number] = [100, 116, 139]
const DIVERGING_GOOD: [number, number, number] = [16, 185, 129]

// Sequential base (dark card-like): blends from this toward the accent.
const SEQUENTIAL_BASE: [number, number, number] = [19, 23, 32]

export function heatmap({
  title,
  data,
  footnote,
  accentColor,
}: HeatmapProps) {
  // Tolerant adapter: accept three shapes:
  //  A) canonical: rows: string[], cols: string[], values: number[][]
  //  B) HIPO: capabilities: string[], hipos: [{name, gaps: number[]}]
  //  C) hc-strategy: roles: string[], clusters: string[], matrix: number[][]
  const cols: string[] = Array.isArray(data?.cols)
    ? data.cols
    : Array.isArray((data as any)?.capabilities)
      ? (data as any).capabilities
      : Array.isArray((data as any)?.clusters)
        ? (data as any).clusters
        : []
  const rowsSrc: any[] = Array.isArray((data as any)?.hipos) ? (data as any).hipos : []
  const rows: string[] = Array.isArray(data?.rows) && data.rows.length > 0
    ? data.rows
    : Array.isArray((data as any)?.roles) && (data as any).roles.length > 0
      ? (data as any).roles
      : rowsSrc.map((h, i) => h.name ?? h.employee_name ?? `Row ${i + 1}`)
  const values: number[][] = Array.isArray(data?.values) && data.values.length > 0
    ? data.values
    : Array.isArray((data as any)?.matrix) && (data as any).matrix.length > 0
      ? (data as any).matrix
      : rowsSrc.map((h) => Array.isArray(h.gaps) ? h.gaps : [])
  const { scale, valueFormat, colorScale = 'sequential' } = data
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null)

  const accentRgb = useMemo(() => hexToRgb(accentColor || '#3b82f6'), [accentColor])

  const { min, max, absMax } = useMemo(() => {
    if (scale) {
      return { min: scale.min, max: scale.max, absMax: Math.max(Math.abs(scale.min), Math.abs(scale.max)) }
    }
    let mn = Infinity
    let mx = -Infinity
    for (const row of values) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = 0
      mx = 1
    }
    return { min: mn, max: mx, absMax: Math.max(Math.abs(mn), Math.abs(mx)) }
  }, [values, scale])

  const colorFor = (v: number): string => {
    if (!Number.isFinite(v)) return '#0f1117'
    if (colorScale === 'diverging') {
      const denom = absMax === 0 ? 1 : absMax
      const t = Math.max(-1, Math.min(1, v / denom))
      if (t >= 0) return rgbCss(mix(DIVERGING_MID, DIVERGING_GOOD, t))
      return rgbCss(mix(DIVERGING_MID, DIVERGING_BAD, -t))
    }
    const denom = max - min === 0 ? 1 : max - min
    const t = clamp01((v - min) / denom)
    return rgbCss(mix(SEQUENTIAL_BASE, accentRgb, t))
  }

  const textColorFor = (v: number): string => {
    if (!Number.isFinite(v)) return '#475569'
    if (colorScale === 'diverging') {
      const intensity = absMax === 0 ? 0 : Math.abs(v) / absMax
      return intensity > 0.55 ? '#ffffff' : '#e2e8f0'
    }
    const denom = max - min === 0 ? 1 : max - min
    const t = clamp01((v - min) / denom)
    return t > 0.55 ? '#ffffff' : '#cbd5e1'
  }

  const nCols = Math.max(1, cols.length)
  const nRows = Math.max(1, rows.length)
  // Cell size adapts to dimensions; clamp between 28 and 64px.
  const cellSize = Math.max(28, Math.min(64, Math.round(560 / Math.max(nCols, nRows))))
  const rowLabelWidth = 120
  const colLabelHeight = 56
  const gridW = nCols * cellSize
  const gridH = nRows * cellSize
  const svgW = rowLabelWidth + gridW + 8
  const svgH = colLabelHeight + gridH + 8

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
        <SourceBadge source={data?.source} footnote={footnote} />
      </div>

      <div className="relative overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="block"
          role="img"
          aria-label={title}
        >
          {/* Column labels */}
          {cols.map((c, ci) => {
            const x = rowLabelWidth + ci * cellSize + cellSize / 2
            return (
              <text
                key={`col-${ci}`}
                x={x}
                y={colLabelHeight - 10}
                transform={`rotate(-35 ${x} ${colLabelHeight - 10})`}
                textAnchor="end"
                fontSize={11}
                fill="#94a3b8"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {c}
              </text>
            )
          })}

          {/* Row labels + cells */}
          {rows.map((rLabel, ri) => {
            const y = colLabelHeight + ri * cellSize
            return (
              <g key={`row-${ri}`}>
                <text
                  x={rowLabelWidth - 10}
                  y={y + cellSize / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#94a3b8"
                >
                  {rLabel}
                </text>
                {cols.map((_, ci) => {
                  const v = values[ri]?.[ci] ?? NaN
                  const x = rowLabelWidth + ci * cellSize
                  const isHover = hover && hover.r === ri && hover.c === ci
                  return (
                    <g key={`cell-${ri}-${ci}`}>
                      <rect
                        x={x + 1}
                        y={y + 1}
                        width={cellSize - 2}
                        height={cellSize - 2}
                        rx={4}
                        fill={colorFor(v)}
                        stroke={isHover ? '#ffffff' : '#1e2433'}
                        strokeWidth={isHover ? 1.5 : 1}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget as SVGRectElement
                          const rect = target.getBoundingClientRect()
                          const parent = (target.ownerSVGElement?.parentElement as HTMLElement | null)
                          const pRect = parent?.getBoundingClientRect()
                          setHover({
                            r: ri,
                            c: ci,
                            x: rect.left - (pRect?.left ?? 0) + rect.width / 2,
                            y: rect.top - (pRect?.top ?? 0),
                          })
                        }}
                        onMouseLeave={() => setHover(null)}
                        style={{ cursor: 'pointer', transition: 'stroke 120ms ease' }}
                      />
                      {cellSize >= 36 && Number.isFinite(v) && (
                        <text
                          x={x + cellSize / 2}
                          y={y + cellSize / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={Math.min(12, cellSize / 3.4)}
                          fill={textColorFor(v)}
                          style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}
                        >
                          {formatValue(v, valueFormat)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[#1e2433] bg-[#0c0e14] px-3 py-2 text-xs shadow-lg"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            <div className="text-slate-400">
              {rows[hover.r]} <span className="text-slate-600">·</span> {cols[hover.c]}
            </div>
            <div className="text-white font-semibold tabular-nums">
              {formatValue(values[hover.r]?.[hover.c] ?? NaN, valueFormat)}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
        {colorScale === 'diverging' ? (
          <>
            <span className="tabular-nums">{formatValue(-absMax, valueFormat)}</span>
            <div
              className="h-2 w-40 rounded-full"
              style={{
                background: `linear-gradient(to right, ${rgbCss(DIVERGING_BAD)}, ${rgbCss(DIVERGING_MID)}, ${rgbCss(DIVERGING_GOOD)})`,
              }}
            />
            <span className="tabular-nums">{formatValue(absMax, valueFormat)}</span>
          </>
        ) : (
          <>
            <span className="tabular-nums">{formatValue(min, valueFormat)}</span>
            <div
              className="h-2 w-40 rounded-full"
              style={{
                background: `linear-gradient(to right, ${rgbCss(SEQUENTIAL_BASE)}, ${rgbCss(accentRgb)})`,
              }}
            />
            <span className="tabular-nums">{formatValue(max, valueFormat)}</span>
          </>
        )}
      </div>

      {footnote && (
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">{footnote}</p>
      )}
    </motion.div>
  )
}

export default heatmap
