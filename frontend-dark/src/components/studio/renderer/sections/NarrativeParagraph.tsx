import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { SourceBadge } from './SourceBadge'

type Sentiment = 'good' | 'warning' | 'bad' | 'neutral'

interface Highlight {
  phrase: string
  sentiment?: Sentiment
}

interface NarrativeParagraphData {
  body: string
  highlights?: Highlight[]
  readingTimeMin?: number
}

// Sentiment -> Tailwind classes for the tinted underline
const sentimentUnderline: Record<Sentiment, string> = {
  good: 'decoration-emerald-500 text-emerald-100',
  warning: 'decoration-amber-500 text-amber-100',
  bad: 'decoration-rose-500 text-rose-100',
  neutral: 'decoration-blue-500 text-blue-100',
}

// Escape regex special chars in a phrase before composing it into a RegExp
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Render markdown-lite: supports **bold** and highlight phrases via the provided list.
// Highlights take precedence; bold is applied to the remaining text segments.
function renderMarkdownLite(body: string, highlights: Highlight[] = []): ReactNode[] {
  // Build a single regex that captures any of the highlight phrases (longest first
  // to avoid shorter phrases swallowing longer ones).
  const ordered = [...highlights]
    .filter((h) => h.phrase && h.phrase.trim().length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length)

  const sentimentLookup = new Map<string, Sentiment>()
  for (const h of ordered) {
    sentimentLookup.set(h.phrase.toLowerCase(), h.sentiment ?? 'neutral')
  }

  const highlightRegex = ordered.length
    ? new RegExp(`(${ordered.map((h) => escapeRegex(h.phrase)).join('|')})`, 'gi')
    : null

  // First pass: split by highlights so we can wrap them; non-highlight chunks
  // then pass through the bold pass.
  const chunks: Array<{ text: string; isHighlight: boolean }> = []
  if (highlightRegex) {
    const parts = body.split(highlightRegex)
    for (const part of parts) {
      if (!part) continue
      const isHighlight = sentimentLookup.has(part.toLowerCase())
      chunks.push({ text: part, isHighlight })
    }
  } else {
    chunks.push({ text: body, isHighlight: false })
  }

  const nodes: ReactNode[] = []
  let keyCounter = 0

  for (const chunk of chunks) {
    if (chunk.isHighlight) {
      const sentiment = sentimentLookup.get(chunk.text.toLowerCase()) ?? 'neutral'
      nodes.push(
        <span
          key={`h-${keyCounter++}`}
          className={`underline decoration-2 underline-offset-4 ${sentimentUnderline[sentiment]}`}
        >
          {chunk.text}
        </span>
      )
      continue
    }

    // Bold pass on plain text chunks: split on **...** preserving the delimiters.
    const boldParts = chunk.text.split(/(\*\*[^*]+\*\*)/g)
    for (const part of boldParts) {
      if (!part) continue
      const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
      if (boldMatch) {
        nodes.push(
          <strong key={`b-${keyCounter++}`} className="font-semibold text-white">
            {boldMatch[1]}
          </strong>
        )
      } else {
        nodes.push(<span key={`t-${keyCounter++}`}>{part}</span>)
      }
    }
  }

  return nodes
}

export function narrativeparagraph({
  title,
  data,
  footnote,
}: {
  title: string
  data: NarrativeParagraphData & { source?: string }
  footnote?: string
}) {
  const rendered = renderMarkdownLite(data.body, data.highlights)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            {title}
          </h3>
          <SourceBadge source={(data as any)?.source} footnote={footnote} />
        </div>
        {typeof data.readingTimeMin === 'number' && data.readingTimeMin > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#1e2433] bg-[#0c0e14] text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            <Clock className="w-3 h-3 text-slate-500" />
            <span className="tabular-nums">{data.readingTimeMin}</span>
            <span>min read</span>
          </div>
        )}
      </div>

      <p className="max-w-prose text-sm sm:text-[15px] leading-relaxed text-slate-300">
        {rendered}
      </p>

      {footnote && (
        <p className="mt-4 pt-4 border-t border-[#1e2433] text-xs text-slate-500 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.section>
  )
}

export default narrativeparagraph
