interface TableData {
  columns?: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center' }>
  headers?: string[]
  rows?: Array<Record<string, unknown> | unknown[]>
}

function alignCls(align?: string): string {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

export default function TableSection({ data }: { data: TableData }) {
  const cols = data.columns
  const headers = cols ? cols.map(c => c.label) : data.headers || []
  const rows = data.rows || []
  if (rows.length === 0 || headers.length === 0) return null

  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-[#1e2433]">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 font-semibold ${alignCls(cols?.[i]?.align)}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const cells = Array.isArray(row)
                ? row
                : cols
                  ? cols.map(c => (row as Record<string, unknown>)[c.key])
                  : Object.values(row as Record<string, unknown>)
              return (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]'}>
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-4 py-3 text-slate-200 ${alignCls(cols?.[ci]?.align)}`}
                    >
                      {String(cell ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
