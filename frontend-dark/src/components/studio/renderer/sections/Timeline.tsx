import { motion } from 'framer-motion'
import { AlertTriangle, Flag, CircleDot } from 'lucide-react'
import { SourceBadge } from './SourceBadge'

type Kind = 'milestone' | 'event' | 'risk'
type Status = 'past' | 'now' | 'future'

interface TimelineEvent {
  date: string
  title: string
  description?: string
  kind?: Kind
  status?: Status
}

interface TimelineData {
  orientation?: 'vertical' | 'horizontal'
  events: TimelineEvent[]
  // Accept builder-style "phases": [{label, items: string[]}] (HIPO)
  // and advisor "horizons": [{label, actions:[{title,owner}]}]
  phases?: Array<{ label: string; items?: string[] }>
  horizons?: Array<{ label: string; key?: string; actions?: Array<{ title: string; owner?: string }> }>
}

function phasesToEvents(phases: Array<{ label: string; items?: string[] }>): TimelineEvent[] {
  const events: TimelineEvent[] = []
  phases.forEach((p, pi) => {
    events.push({
      date: p.label,
      title: p.label,
      kind: 'milestone',
      status: pi === 0 ? 'now' : 'future',
    })
    ;(p.items ?? []).forEach((it) => {
      events.push({
        date: p.label,
        title: it,
        kind: 'event',
        status: pi === 0 ? 'now' : 'future',
      })
    })
  })
  return events
}

function horizonsToEvents(horizons: Array<{ label: string; actions?: Array<{ title: string; owner?: string }> }>): TimelineEvent[] {
  const events: TimelineEvent[] = []
  horizons.forEach((h, hi) => {
    events.push({
      date: h.label,
      title: h.label,
      kind: 'milestone',
      status: hi === 0 ? 'now' : 'future',
    })
    ;(h.actions ?? []).forEach((a) => {
      events.push({
        date: h.label,
        title: a.title,
        description: a.owner ? `Owner: ${a.owner}` : undefined,
        kind: 'event',
        status: hi === 0 ? 'now' : 'future',
      })
    })
  })
  return events
}

interface TimelineProps {
  title: string
  data: TimelineData & { source?: string }
  footnote?: string
}

const KIND_STYLES: Record<
  Kind,
  { fill: string; ring: string; text: string; bg: string; border: string }
> = {
  milestone: {
    fill: 'bg-blue-500',
    ring: 'ring-blue-500/40',
    text: 'text-blue-300',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  event: {
    fill: 'bg-slate-400',
    ring: 'ring-slate-500/40',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
  },
  risk: {
    fill: 'bg-rose-500',
    ring: 'ring-rose-500/40',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
  },
}

const KIND_LABEL: Record<Kind, string> = {
  milestone: 'Milestone',
  event: 'Event',
  risk: 'Risk',
}

function kindIcon(kind: Kind) {
  if (kind === 'risk') return <AlertTriangle className="w-3 h-3" />
  if (kind === 'milestone') return <Flag className="w-3 h-3" />
  return <CircleDot className="w-3 h-3" />
}

function formatDate(d: string): string {
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Dot({
  kind,
  status,
  size = 'md',
}: {
  kind: Kind
  status: Status
  size?: 'sm' | 'md'
}) {
  const style = KIND_STYLES[kind]
  const dim = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  const outerDim = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'

  if (status === 'now') {
    return (
      <span
        className={`relative inline-flex items-center justify-center ${outerDim}`}
      >
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${style.fill} opacity-40 animate-ping`}
        />
        <span
          className={`relative inline-flex ${dim} rounded-full ${style.fill} ring-2 ring-offset-2 ring-offset-[#131720] ${style.ring}`}
        />
      </span>
    )
  }

  if (status === 'future') {
    // hollow / ringed
    return (
      <span
        className={`inline-flex items-center justify-center ${outerDim}`}
      >
        <span
          className={`${dim} rounded-full border-2 ${
            kind === 'risk'
              ? 'border-rose-500/60'
              : kind === 'milestone'
                ? 'border-blue-500/60'
                : 'border-slate-500/60'
          } bg-[#131720]`}
        />
      </span>
    )
  }

  // past — filled
  return (
    <span className={`inline-flex items-center justify-center ${outerDim}`}>
      <span className={`${dim} rounded-full ${style.fill}`} />
    </span>
  )
}

function EventCard({
  event,
  delay,
}: {
  event: TimelineEvent
  delay: number
}) {
  const kind: Kind = event.kind ?? 'event'
  const status: Status = event.status ?? 'past'
  const style = KIND_STYLES[kind]

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
      className="min-w-0 flex-1"
    >
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold tabular-nums">
          {formatDate(event.date)}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-semibold uppercase tracking-wider ${style.text} ${style.bg} ${style.border}`}
        >
          {kindIcon(kind)}
          {KIND_LABEL[kind]}
        </span>
        {status === 'now' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 text-[9px] font-semibold uppercase tracking-wider">
            Now
          </span>
        )}
      </div>
      <div
        className={`text-sm font-semibold leading-snug ${
          status === 'future' ? 'text-slate-300' : 'text-white'
        }`}
      >
        {event.title}
      </div>
      {event.description && (
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          {event.description}
        </p>
      )}
    </motion.div>
  )
}

function VerticalTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative">
      {/* Rail line */}
      <span
        aria-hidden
        className="absolute left-[11px] top-1 bottom-1 w-px bg-gradient-to-b from-[#1e2433] via-[#1e2433] to-transparent"
      />
      {events.map((event, i) => (
        <li
          key={`${event.date}-${i}`}
          className="relative flex gap-4 pb-5 last:pb-0"
        >
          <div className="relative z-10 shrink-0">
            <Dot
              kind={event.kind ?? 'event'}
              status={event.status ?? 'past'}
            />
          </div>
          <EventCard event={event} delay={0.05 + i * 0.04} />
        </li>
      ))}
    </ol>
  )
}

function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const count = events.length
  return (
    <div className="overflow-x-auto">
      <div
        className="relative pt-1 pb-2"
        style={{ minWidth: `${Math.max(count * 180, 480)}px` }}
      >
        {/* Rail */}
        <svg
          aria-hidden
          className="absolute left-0 right-0 top-[14px] w-full h-px"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1="0.5"
            x2="100%"
            y2="0.5"
            stroke="#1e2433"
            strokeWidth="1"
          />
        </svg>

        <div
          className="grid gap-4 relative"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        >
          {events.map((event, i) => (
            <div key={`${event.date}-${i}`} className="flex flex-col min-w-0">
              <div className="flex justify-start -ml-[2px]">
                <Dot
                  kind={event.kind ?? 'event'}
                  status={event.status ?? 'past'}
                />
              </div>
              <div className="mt-2">
                <EventCard event={event} delay={0.05 + i * 0.04} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function timeline({ title, data, footnote }: TimelineProps) {
  const orientation: 'vertical' | 'horizontal' =
    data.orientation ?? 'vertical'
  const events: TimelineEvent[] = Array.isArray(data?.events) && data.events.length > 0
    ? data.events
    : Array.isArray(data?.phases) && data.phases.length > 0
      ? phasesToEvents(data.phases)
      : Array.isArray(data?.horizons) && data.horizons.length > 0
        ? horizonsToEvents(data.horizons)
        : []

  // Stats
  const counts: Record<Kind, number> = { milestone: 0, event: 0, risk: 0 }
  let nowCount = 0
  for (const e of events) {
    counts[e.kind ?? 'event'] += 1
    if (e.status === 'now') nowCount += 1
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2">
          {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
          <SourceBadge source={data?.source} footnote={footnote} />
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
          {(Object.keys(KIND_STYLES) as Kind[]).map(k => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${KIND_STYLES[k].fill}`}
              />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1e2433] bg-[#0f1117] px-5 py-8 text-center text-sm text-slate-500">
          No timeline events available.
        </div>
      ) : orientation === 'horizontal' ? (
        <HorizontalTimeline events={events} />
      ) : (
        <VerticalTimeline events={events} />
      )}

      {/* Stats + footnote */}
      {events.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[#1e2433] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            {(Object.keys(counts) as Kind[]).map(k =>
              counts[k] > 0 ? (
                <span key={k} className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${KIND_STYLES[k].fill}`}
                  />
                  <span className="text-slate-500">{KIND_LABEL[k]}</span>
                  <span className="text-white font-semibold tabular-nums">
                    {counts[k]}
                  </span>
                </span>
              ) : null,
            )}
            {nowCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-slate-500">Now</span>
                <span className="text-white font-semibold tabular-nums">
                  {nowCount}
                </span>
              </span>
            )}
          </div>
          {footnote && (
            <p className="text-[11px] text-slate-500 leading-relaxed max-w-md text-right">
              {footnote}
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default timeline
