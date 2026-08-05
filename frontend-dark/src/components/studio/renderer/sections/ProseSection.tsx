interface ProseData {
  body?: string
  text?: string
  paragraphs?: string[]
}

export default function ProseSection({ data }: { data: ProseData }) {
  const paragraphs =
    data.paragraphs && data.paragraphs.length > 0
      ? data.paragraphs
      : (data.body || data.text || '').split(/\n\n+/).filter(Boolean)
  if (paragraphs.length === 0) return null
  return (
    <div className="rounded-2xl border border-[#2A3648] bg-[#1B2431] p-5 sm:p-6">
      <div className="space-y-3 max-w-3xl">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-slate-300 leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}
