import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  ChevronDown,
  ShieldCheck,
  User,
} from 'lucide-react'

export interface RiskFlagItem {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  likelihood?: 'rare' | 'possible' | 'likely' | 'certain'
  mitigation?: string
  owner?: string
}

export interface RiskFlagsListData {
  items: RiskFlagItem[]
}

type SeverityVisual = {
  Icon: typeof AlertOctagon
  iconColor: string
  barColor: string
  label: string
  labelColor: string
  wash: string
}

const SEVERITY_VISUALS: Record<RiskFlagItem['severity'], SeverityVisual> = {
  critical: {
    Icon: AlertOctagon,
    iconColor: 'text-rose-400',
    barColor: 'bg-rose-500',
    label: 'Critical',
    labelColor: 'text-rose-300 bg-rose-500/15 border-rose-500/40',
    wash: 'bg-rose-500/[0.06]',
  },
  high: {
    Icon: AlertTriangle,
    iconColor: 'text-rose-400',
    barColor: 'bg-rose-500',
    label: 'High',
    labelColor: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    wash: '',
  },
  medium: {
    Icon: AlertTriangle,
    iconColor: 'text-amber-400',
    barColor: 'bg-amber-500',
    label: 'Medium',
    labelColor: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    wash: '',
  },
  low: {
    Icon: Info,
    iconColor: 'text-slate-400',
    barColor: 'bg-slate-500',
    label: 'Low',
    labelColor: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
    wash: '',
  },
}

const LIKELIHOOD_VISUALS: Record<
  NonNullable<RiskFlagItem['likelihood']>,
  { label: string; classes: string }
> = {
  rare: {
    label: 'Rare',
    classes: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  },
  possible: {
    label: 'Possible',
    classes: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  },
  likely: {
    label: 'Likely',
    classes: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  },
  certain: {
    label: 'Certain',
    classes: 'text-rose-300 bg-rose-500/15 border-rose-500/40',
  },
}

function RiskRow({ item, index }: { item: RiskFlagItem; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const visual = SEVERITY_VISUALS[item.severity]
  const { Icon } = visual
  const likelihood = item.likelihood ? LIKELIHOOD_VISUALS[item.likelihood] : null
  const descPreviewLimit = 140
  const needsTruncate = item.description.length > descPreviewLimit
  const preview = needsTruncate
    ? `${item.description.slice(0, descPreviewLimit).trimEnd()}…`
    : item.description

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-xl border border-[#1e2433] ${visual.wash} bg-[#0f1117]/40`}
    >
      {/* Severity bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${visual.barColor}`} />

      <button
        type="button"
        onClick={() => needsTruncate && setExpanded((v) => !v)}
        className={`w-full text-left pl-5 pr-4 py-4 sm:py-5 flex items-start gap-3 sm:gap-4 ${
          needsTruncate ? 'cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={expanded}
      >
        <div className={`shrink-0 mt-0.5 ${visual.iconColor}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white leading-snug">
                {item.title}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${visual.labelColor}`}
              >
                {visual.label}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {likelihood && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider tabular-nums ${likelihood.classes}`}
                >
                  {likelihood.label}
                </span>
              )}
              {needsTruncate && (
                <ChevronDown
                  className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              )}
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed mt-1.5">
            {expanded || !needsTruncate ? item.description : preview}
          </p>

          <AnimatePresence initial={false}>
            {(item.mitigation || item.owner) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-[#1e2433] space-y-2">
                  {item.mitigation && (
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs italic text-blue-200/90 leading-relaxed">
                        {item.mitigation}
                      </p>
                    </div>
                  )}
                  {item.owner && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-[11px] uppercase tracking-wider text-slate-500">
                        Owner
                      </span>
                      <span className="text-xs text-slate-300">
                        {item.owner}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </button>
    </motion.div>
  )
}

export function riskflagslist({
  title,
  data,
  footnote,
}: {
  title: string
  data: RiskFlagsListData & { source?: string }
  footnote?: string
}) {
  // Tolerant adapter: accept canonical {items} OR
  //   - HIPO shape:    {risks:[{name,risk_level,signals[],recommended_action}]}
  //   - Advisor shape: {risks:[{risk,mitigation,severity}]}
  const rawRisks: any[] = Array.isArray((data as any)?.risks) ? (data as any).risks : []
  const items: RiskFlagItem[] = Array.isArray(data?.items) && data.items.length > 0
    ? data.items
    : rawRisks.map((r, i) => {
        const lvlRaw = String(r.severity ?? r.risk_level ?? 'medium').toLowerCase()
        const sev: RiskFlagItem['severity'] =
          lvlRaw === 'critical' ? 'critical' : lvlRaw === 'high' ? 'high' : lvlRaw === 'low' ? 'low' : 'medium'
        const sigs = Array.isArray(r.signals) ? r.signals : []
        const title = r.risk ?? r.name ?? r.title ?? `Risk #${i + 1}`
        return {
          id: r.profile_id ?? r.id ?? `risk-${i}`,
          severity: sev,
          title,
          description: sigs.length ? `Signals: ${sigs.join(', ')}` : (r.description ?? ''),
          mitigation: r.recommended_action
            ? String(r.recommended_action).replace(/_/g, ' ')
            : r.mitigation,
        }
      })
  const criticalCount = items.filter((i) => i.severity === 'critical').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={`w-5 h-5 ${
              criticalCount > 0 ? 'text-rose-400' : 'text-amber-400'
            }`}
          />
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {items.length > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">
              ({items.length})
            </span>
          )}
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-help"
            title={`Source: ${(data as any)?.source || footnote || 'not specified'}`}
          >
            ⓘ source
          </span>
        </div>
        {criticalCount > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-rose-500/40 bg-rose-500/15 text-rose-300 text-[10px] font-semibold uppercase tracking-wider tabular-nums">
            {criticalCount} critical
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mb-2" />
          <p className="text-sm text-slate-300 font-medium">
            No risks flagged
          </p>
          <p className="text-xs text-slate-500 mt-1">
            All clear on the current assessment.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <RiskRow key={item.id} item={item} index={i} />
          ))}
        </div>
      )}

      {footnote && (
        <p className="text-[11px] text-slate-500 leading-relaxed mt-5 pt-4 border-t border-[#1e2433]">
          {footnote}
        </p>
      )}
    </motion.div>
  )
}

export default riskflagslist
