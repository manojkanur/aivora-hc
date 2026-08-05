import { motion } from 'framer-motion'
import { Quote, Lightbulb, AlertTriangle, CheckCircle2, MessageSquare } from 'lucide-react'
import { SourceBadge } from './SourceBadge'

export interface CalloutQuoteData {
  quote: string
  attribution?: string
  role?: string
  emphasis?: 'insight' | 'warning' | 'positive' | 'neutral'
}

type EmphasisTheme = {
  accentBar: string
  wash: string
  ring: string
  iconColor: string
  Icon: typeof Quote
  label: string
}

const THEMES: Record<NonNullable<CalloutQuoteData['emphasis']>, EmphasisTheme> = {
  insight: {
    accentBar: 'bg-blue-500',
    wash: 'bg-gradient-to-r from-blue-500/[0.08] via-blue-500/[0.03] to-transparent',
    ring: 'ring-1 ring-inset ring-blue-500/15',
    iconColor: 'text-blue-400',
    Icon: Lightbulb,
    label: 'Insight',
  },
  warning: {
    accentBar: 'bg-amber-500',
    wash: 'bg-gradient-to-r from-amber-500/[0.09] via-amber-500/[0.03] to-transparent',
    ring: 'ring-1 ring-inset ring-amber-500/15',
    iconColor: 'text-amber-400',
    Icon: AlertTriangle,
    label: 'Warning',
  },
  positive: {
    accentBar: 'bg-emerald-500',
    wash: 'bg-gradient-to-r from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent',
    ring: 'ring-1 ring-inset ring-emerald-500/15',
    iconColor: 'text-emerald-400',
    Icon: CheckCircle2,
    label: 'Positive',
  },
  neutral: {
    accentBar: 'bg-slate-500',
    wash: 'bg-gradient-to-r from-slate-500/[0.06] via-slate-500/[0.02] to-transparent',
    ring: 'ring-1 ring-inset ring-slate-500/10',
    iconColor: 'text-slate-400',
    Icon: MessageSquare,
    label: 'Note',
  },
}

export function calloutquote({
  title,
  data,
  footnote,
}: {
  title: string
  data: CalloutQuoteData & { source?: string; text?: string; author?: string; body?: string }
  footnote?: string
}) {
  const quote = data?.quote ?? data?.text ?? data?.body ?? ''
  const attribution = data?.attribution ?? data?.author
  const emphasis = data?.emphasis ?? 'insight'
  const theme = THEMES[emphasis]
  const { Icon } = theme
  if (!quote) {
    return (
      <div className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-5 text-sm text-slate-400">
        {title}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-5 sm:p-6"
    >
      {/* Title row */}
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-4 h-4 ${theme.iconColor}`} />
        {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
        <SourceBadge source={(data as any)?.source} footnote={footnote} />
        <span
          className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${theme.iconColor} bg-white/[0.02] border border-white/[0.04]`}
        >
          {theme.label}
        </span>
      </div>

      {/* Quote body — accent bar + wash */}
      <div
        className={`relative overflow-hidden rounded-xl ${theme.wash} ${theme.ring}`}
      >
        {/* Vertical accent bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${theme.accentBar}`}
          aria-hidden
        />

        <div className="pl-5 pr-4 sm:pl-6 sm:pr-5 py-5 sm:py-6">
          <Quote
            className={`w-5 h-5 ${theme.iconColor} opacity-50 mb-3`}
            aria-hidden
          />
          <blockquote
            className="text-lg sm:text-xl leading-relaxed italic font-serif text-slate-100"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            “{quote}”
          </blockquote>

          {(attribution || data.role) && (
            <figcaption className="mt-4 flex items-center gap-2 text-xs">
              {attribution && (
                <span className="font-semibold text-slate-300 not-italic">
                  {attribution}
                </span>
              )}
              {attribution && data.role && (
                <span className="text-slate-600">·</span>
              )}
              {data.role && (
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-medium">
                  {data.role}
                </span>
              )}
            </figcaption>
          )}
        </div>
      </div>

      {footnote && (
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

export default calloutquote
