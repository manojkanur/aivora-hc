import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

type Sentiment = 'good' | 'warning' | 'bad' | 'neutral'

interface ComparisonColumn {
  key: string
  label: string
  highlight?: boolean
}

interface ComparisonCell {
  value: string | number
  sentiment?: Sentiment
  badge?: string
}

interface ComparisonRow {
  label: string
  cells: ComparisonCell[]
}

export interface ComparisonTableData {
  columns: ComparisonColumn[]
  rows: ComparisonRow[]
  rowLabelHeader?: string
}

function sentimentPillClass(sentiment?: Sentiment): string {
  switch (sentiment) {
    case 'good':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
    case 'warning':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
    case 'bad':
      return 'text-rose-300 bg-rose-500/10 border-rose-500/30'
    default:
      return 'text-slate-300 bg-slate-500/10 border-slate-500/20'
  }
}

function isNumeric(value: string | number): boolean {
  if (typeof value === 'number') return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return false
    return !Number.isNaN(Number(trimmed.replace(/[,%$\s]/g, '')))
  }
  return false
}

export function comparisontable({
  title,
  data,
  footnote,
}: {
  title: string
  data: ComparisonTableData & { source?: string }
  footnote?: string
}) {
  // Tolerant adapter: accept four shapes:
  //  A) canonical: columns:[{key,label}], rows:[{label,cells:[{value}]}]
  //  B) advisor:   columns:[{key,label}], rows:[{<key>:val,...}]   (rows are flat dicts)
  //  C) HIPO:      columns:string[],      rows:[{<key>:val,...}]
  //  D) hc-strategy: columns:string[],    kpis:[{<key>:val,...}]   (any of: kpis, items, entries, records)
  const rawCols: any = data?.columns ?? []
  const altRows: any[] =
    (Array.isArray((data as any)?.kpis) && (data as any).kpis) ||
    (Array.isArray((data as any)?.entries) && (data as any).entries) ||
    (Array.isArray((data as any)?.records) && (data as any).records) ||
    []
  const rawRows: any[] = Array.isArray(data?.rows) && data.rows.length > 0
    ? data.rows
    : altRows
  let columns: ComparisonColumn[] = []
  let rows: ComparisonRow[] = []
  if (rawCols.length > 0 && typeof rawCols[0] === 'string') {
    // shape C
    const colKeys = rawCols as string[]
    columns = colKeys.slice(1).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }))
    const firstKey = colKeys[0]
    rows = rawRows.map((r: any) => ({
      label: String(r?.[firstKey] ?? ''),
      cells: colKeys.slice(1).map((k) => ({ value: r?.[k] != null ? String(r[k]) : ' - ' })),
    }))
  } else if (rawCols.length > 0 && typeof rawCols[0] === 'object' && rawRows.length > 0 && !Array.isArray((rawRows[0] as any)?.cells)) {
    // shape B — advisor: flat dict rows, first column is row label
    columns = (rawCols as ComparisonColumn[]).slice(1)
    const firstKey = (rawCols[0] as ComparisonColumn).key
    rows = rawRows.map((r: any) => ({
      label: String(r?.[firstKey] ?? ''),
      cells: columns.map((c) => ({ value: r?.[c.key] != null ? String(r[c.key]) : ' - ' })),
    }))
  } else {
    // shape A
    columns = rawCols as ComparisonColumn[]
    rows = rawRows as ComparisonRow[]
  }
  const rowLabelHeader = data?.rowLabelHeader ?? ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <span
          className="ml-auto inline-flex items-center text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-help"
          title={`Source: ${(data as any)?.source || footnote || 'not specified'}`}
        >
          ⓘ source
        </span>
      </div>

      <div className="rounded-xl border border-[#1e2433] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#0f1117] border-b border-[#1e2433]">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
                  {rowLabelHeader}
                </th>
                {columns.map((col) => {
                  const highlight = col.highlight === true
                  return (
                    <th
                      key={col.key}
                      className={[
                        'px-4 py-3 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-right',
                        highlight
                          ? 'text-blue-300 bg-blue-500/10 border-l border-r border-blue-500/30 shadow-[inset_0_0_18px_rgba(59,130,246,0.18)]'
                          : 'text-slate-500',
                      ].join(' ')}
                    >
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        {highlight && <Star className="w-3 h-3 text-blue-300 fill-blue-300" />}
                        {col.label}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={`${row.label}-${rIdx}`}
                  className={[
                    'border-b border-[#1e2433] last:border-b-0',
                    rIdx % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                    {row.label}
                  </td>
                  {columns.map((col, cIdx) => {
                    const cell = row.cells[cIdx]
                    const highlight = col.highlight === true
                    const hasSentiment = cell?.sentiment && cell.sentiment !== 'neutral'
                    const numeric = cell ? isNumeric(cell.value) : false

                    return (
                      <td
                        key={`${col.key}-${rIdx}`}
                        className={[
                          'px-4 py-3 text-right align-middle',
                          highlight
                            ? 'bg-blue-500/[0.06] border-l border-r border-blue-500/20'
                            : '',
                        ].join(' ')}
                      >
                        {cell == null ? (
                          <span className="text-slate-600"> - </span>
                        ) : hasSentiment ? (
                          <span
                            className={[
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold',
                              numeric ? 'tabular-nums' : '',
                              sentimentPillClass(cell.sentiment),
                            ].join(' ')}
                          >
                            <span>{cell.value}</span>
                            {cell.badge && (
                              <span className="text-[10px] uppercase tracking-wider opacity-80">
                                {cell.badge}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span
                            className={[
                              'inline-flex items-center gap-1.5',
                              numeric ? 'tabular-nums' : '',
                              highlight ? 'text-white font-semibold' : 'text-slate-300',
                            ].join(' ')}
                          >
                            <span>{cell.value}</span>
                            {cell.badge && (
                              <span
                                className={[
                                  'px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wider font-semibold',
                                  highlight
                                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                    : 'border-[#1e2433] bg-[#0f1117] text-slate-400',
                                ].join(' ')}
                              >
                                {cell.badge}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {footnote && (
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">{footnote}</p>
      )}
    </motion.div>
  )
}

export default comparisontable
