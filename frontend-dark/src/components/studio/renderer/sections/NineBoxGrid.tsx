import { motion } from 'framer-motion'
import { Grid3x3 } from 'lucide-react'

export interface NineBoxCell {
  row: 0 | 1 | 2
  col: 0 | 1 | 2
  label: string
  people: string[]
}

export interface NineBoxGridData {
  boxes: NineBoxCell[]
  x_axis?: string
  y_axis?: string
  source?: string
}

interface NineBoxGridProps {
  title: string
  data: NineBoxGridData
  footnote?: string
}

// Color intensity by (row, col). Top-right (high perf + high pot) is the
// "stars" cell and gets the strongest highlight; bottom-left is the lowest.
// Note: row 0 is the TOP row (highest potential), col 2 is the rightmost
// (highest performance).
const cellTone: Record<string, string> = {
  // High potential row (row 0)
  '0,0': 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
  '0,1': 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/25',
  '0,2': 'from-blue-500/25 to-blue-500/10 border-blue-500/40',
  // Medium potential (row 1)
  '1,0': 'from-slate-500/10 to-slate-500/5 border-slate-500/20',
  '1,1': 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
  '1,2': 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/25',
  // Low potential (row 2)
  '2,0': 'from-rose-500/15 to-rose-500/5 border-rose-500/25',
  '2,1': 'from-slate-500/10 to-slate-500/5 border-slate-500/20',
  '2,2': 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
}

function cellAt(boxes: NineBoxCell[], row: number, col: number): NineBoxCell | undefined {
  return boxes.find((b) => b.row === row && b.col === col)
}

export default function NineBoxGrid({ title, data, footnote }: NineBoxGridProps) {
  const boxes = Array.isArray(data?.boxes) ? data.boxes : []
  const xAxis = data?.x_axis ?? 'Performance'
  const yAxis = data?.y_axis ?? 'Potential'

  return (
    <div className="rounded-xl border border-[#1e2433] bg-[#131720] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4 text-slate-300">
        <Grid3x3 className="w-4 h-4 text-blue-400" />
        <span className="text-xs uppercase tracking-widest text-slate-500">
          {yAxis} × {xAxis}
        </span>
      </div>

      <div className="flex gap-3">
        {/* Y-axis label (rotated) */}
        <div className="flex flex-col items-center justify-center pr-2">
          <div
            className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {yAxis} →
          </div>
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((row) =>
              [0, 1, 2].map((col) => {
                const cell = cellAt(boxes, row, col)
                const people = cell?.people ?? []
                const label = cell?.label ?? `R${row}C${col}`
                const tone = cellTone[`${row},${col}`] ?? 'from-slate-500/5 to-slate-500/5 border-slate-500/20'
                return (
                  <motion.div
                    key={`${row}-${col}`}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: (row * 3 + col) * 0.03 }}
                    className={`relative rounded-lg border bg-gradient-to-br ${tone} p-3 min-h-[120px] flex flex-col gap-2`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-white leading-tight">
                        {label}
                      </div>
                      <div className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/30 border border-white/10 text-slate-300 tabular-nums">
                        {people.length}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {people.slice(0, 3).map((p, i) => (
                        <div
                          key={i}
                          className="text-[11px] text-slate-300 truncate"
                          title={p}
                        >
                          • {p}
                        </div>
                      ))}
                      {people.length > 3 && (
                        <div className="text-[10px] text-slate-500 italic">
                          +{people.length - 3} more
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              }),
            )}
          </div>

          {/* X-axis label */}
          <div className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
            {xAxis} →
          </div>
        </div>
      </div>

      {footnote && (
        <div className="text-[11px] text-slate-500 italic leading-relaxed pt-3">
          {footnote}
        </div>
      )}
    </div>
  )
}
