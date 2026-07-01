import { CheckCircle2 } from 'lucide-react'

interface BulletData {
  items?: Array<string | { title?: string; description?: string }>
}

export default function BulletListSection({ data }: { data: BulletData }) {
  const items = data.items || []
  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5 sm:p-6">
      <ul className="space-y-3">
        {items.map((item, i) => {
          const isObj = typeof item === 'object' && item !== null
          const title = isObj ? item.title : (item as string)
          const description = isObj ? item.description : undefined
          return (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-white">{title}</div>
                {description && (
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
