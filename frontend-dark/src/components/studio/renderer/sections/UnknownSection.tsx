import { HelpCircle } from 'lucide-react'

interface UnknownProps {
  layout: string
  title?: string
  data: unknown
}

export default function UnknownSection({ layout, title, data }: UnknownProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[#1e2433] bg-[#131720] p-5">
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="w-4 h-4 text-amber-400" />
        <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
          Unknown layout: {layout}
        </div>
      </div>
      {title && <div className="text-sm text-white mb-2">{title}</div>}
      <pre className="text-[11px] text-slate-400 leading-relaxed overflow-x-auto bg-[#0c0e14] rounded-lg p-3 border border-[#1e2433]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
