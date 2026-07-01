import { Quote } from 'lucide-react'

interface QuoteData {
  text?: string
  body?: string
  author?: string
  role?: string
}

export default function QuoteSection({ data }: { data: QuoteData }) {
  const text = data.text || data.body
  if (!text) return null
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-gradient-to-br from-[#0f1117] to-[#131720] p-6 sm:p-8">
      <Quote className="w-6 h-6 text-blue-400/60 mb-3" />
      <blockquote className="text-base sm:text-lg text-white leading-relaxed font-medium max-w-3xl">
        “{text}”
      </blockquote>
      {(data.author || data.role) && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          {data.author && <span className="font-semibold text-slate-300">{data.author}</span>}
          {data.role && (
            <>
              <span className="text-slate-600">·</span>
              <span>{data.role}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
