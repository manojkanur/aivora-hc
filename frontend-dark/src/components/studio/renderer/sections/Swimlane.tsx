import { motion } from 'framer-motion'

type Status = 'done' | 'in_progress' | 'planned' | 'blocked'

interface SwimlaneData {
  lanes: Array<{ id: string; label: string }>
  phases: Array<{ id: string; label: string }>
  items: Array<{
    laneId: string
    phaseId: string
    title: string
    status?: Status
    owner?: string
  }>
}

interface SwimlaneProps {
  title: string
  data: SwimlaneData & { source?: string }
  footnote?: string
}

const STATUS_STYLES: Record<
  Status,
  { border: string; tint: string; label: string; dot: string }
> = {
  done: {
    border: 'border-l-emerald-500',
    tint: 'bg-emerald-500/5',
    label: 'text-emerald-300',
    dot: 'bg-emerald-500',
  },
  in_progress: {
    border: 'border-l-blue-500',
    tint: 'bg-blue-500/5',
    label: 'text-blue-300',
    dot: 'bg-blue-500',
  },
  planned: {
    border: 'border-l-slate-500',
    tint: 'bg-slate-500/5',
    label: 'text-slate-300',
    dot: 'bg-slate-500',
  },
  blocked: {
    border: 'border-l-rose-500',
    tint: 'bg-rose-500/5',
    label: 'text-rose-300',
    dot: 'bg-rose-500',
  },
}

const STATUS_LABEL: Record<Status, string> = {
  done: 'Done',
  in_progress: 'In progress',
  planned: 'Planned',
  blocked: 'Blocked',
}

function ownerInitial(owner?: string): string {
  if (!owner) return '?'
  const trimmed = owner.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return trimmed[0]!.toUpperCase()
}

export function swimlane({ title, data, footnote }: SwimlaneProps) {
  // Tolerant adapter: accept canonical {lanes,phases,items} OR HIPO builder shape
  // {plans:[{name,stops:[{role,status,duration_months,gates[]}]}]}
  const rawPlans: any[] = Array.isArray((data as any)?.plans) ? (data as any).plans : []
  let lanes = data?.lanes ?? []
  let phases = data?.phases ?? []
  let items = data?.items ?? []
  if ((!lanes.length || !phases.length || !items.length) && rawPlans.length) {
    lanes = rawPlans.map((p, i) => ({ id: p.profile_id ?? `lane-${i}`, label: p.name ?? `Plan ${i + 1}` }))
    const maxStops = Math.max(...rawPlans.map((p: any) => Array.isArray(p.stops) ? p.stops.length : 0), 0)
    phases = Array.from({ length: maxStops }, (_, i) => ({ id: `stop-${i}`, label: `Stop ${i + 1}` }))
    items = []
    rawPlans.forEach((p, li) => {
      const stops = Array.isArray(p.stops) ? p.stops : []
      stops.forEach((s: any, si: number) => {
        const status: Status = s.status === 'current' ? 'in_progress' : s.status === 'next' ? 'planned' : 'planned'
        items.push({
          laneId: lanes[li].id,
          phaseId: `stop-${si}`,
          title: s.role ?? `Stop ${si + 1}`,
          status,
          owner: s.duration_months ? `${s.duration_months}m` : undefined,
        })
      })
    })
  }

  // Group items by (laneId, phaseId)
  const grouped = new Map<string, typeof items>()
  for (const item of items) {
    const key = `${item.laneId}::${item.phaseId}`
    const arr = grouped.get(key)
    if (arr) arr.push(item)
    else grouped.set(key, [item])
  }

  // Stats footer
  const totals: Record<Status, number> = {
    done: 0,
    in_progress: 0,
    planned: 0,
    blocked: 0,
  }
  for (const item of items) {
    const s = item.status ?? 'planned'
    totals[s] += 1
  }

  // Grid template: first column = lane label, remaining = phases (equal share)
  const gridCols = `minmax(140px, 180px) repeat(${phases.length}, minmax(0, 1fr))`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-help"
            title={`Source: ${data?.source || footnote || 'not specified'}`}
          >
            ⓘ source
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
          {(Object.keys(STATUS_STYLES) as Status[]).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {phases.length === 0 || lanes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1e2433] bg-[#0f1117] px-5 py-8 text-center text-sm text-slate-500">
          No workstream data available.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Header row */}
            <div
              className="grid items-stretch border-b border-[#1e2433]"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Lane
              </div>
              {phases.map((phase, idx) => (
                <div
                  key={phase.id}
                  className={`px-3 py-2.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold ${
                    idx > 0 ? 'border-l border-[#1e2433]' : ''
                  }`}
                >
                  {phase.label}
                </div>
              ))}
            </div>

            {/* Lane rows */}
            {lanes.map((lane, laneIdx) => (
              <div
                key={lane.id}
                className="grid items-stretch border-b border-[#1a1e2e] last:border-b-0"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="px-3 py-3 flex items-center">
                  <div className="text-sm font-medium text-white leading-tight">
                    {lane.label}
                  </div>
                </div>
                {phases.map((phase, phaseIdx) => {
                  const cellItems =
                    grouped.get(`${lane.id}::${phase.id}`) ?? []
                  return (
                    <div
                      key={phase.id}
                      className={`px-2 py-2.5 space-y-2 min-h-[68px] ${
                        phaseIdx > 0 ? 'border-l border-[#1e2433]' : ''
                      } ${laneIdx % 2 === 1 ? 'bg-[#0f1117]/40' : ''}`}
                    >
                      {cellItems.length === 0 ? (
                        <div className="h-full" />
                      ) : (
                        cellItems.map((item, i) => {
                          const status: Status = item.status ?? 'planned'
                          const style = STATUS_STYLES[status]
                          return (
                            <motion.div
                              key={`${item.title}-${i}`}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                delay: 0.05 + (laneIdx * phases.length + phaseIdx) * 0.02,
                                duration: 0.25,
                              }}
                              className={`group rounded-md border border-[#1e2433] border-l-2 ${style.border} ${style.tint} px-2.5 py-2 transition-colors hover:border-[#2a3145]`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-white leading-snug break-words">
                                    {item.title}
                                  </div>
                                  <div
                                    className={`mt-1 text-[9px] uppercase tracking-wider font-semibold ${style.label}`}
                                  >
                                    {STATUS_LABEL[status]}
                                  </div>
                                </div>
                                {item.owner && (
                                  <div
                                    title={item.owner}
                                    className="shrink-0 w-6 h-6 rounded-full bg-[#1e2433] border border-[#2a3145] flex items-center justify-center text-[10px] font-semibold text-slate-200 tabular-nums"
                                  >
                                    {ownerInitial(item.owner)}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats + footnote */}
      <div className="mt-4 pt-4 border-t border-[#1e2433] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
          {(Object.keys(totals) as Status[]).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
              <span className="text-slate-500">{STATUS_LABEL[s]}</span>
              <span className="text-white font-semibold tabular-nums">
                {totals[s]}
              </span>
            </span>
          ))}
        </div>
        {footnote && (
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-md text-right">
            {footnote}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default swimlane
