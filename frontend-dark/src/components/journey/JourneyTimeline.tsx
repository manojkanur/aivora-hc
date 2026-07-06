import { Link } from 'react-router-dom'
import { Check, ClipboardList, FileText, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'

export type JourneyStage = 'onboarding' | 'brief' | 'advisor'

const STAGES: Array<{ key: JourneyStage; label: string; icon: typeof ClipboardList }> = [
  { key: 'onboarding', label: 'Client Onboarding', icon: ClipboardList },
  { key: 'brief', label: 'Challenge Brief', icon: FileText },
  { key: 'advisor', label: 'AI Advisory', icon: Sparkles },
]

function stageHref(stage: JourneyStage, workspaceId: string): string {
  if (stage === 'onboarding') return `/onboarding?workspaceId=${workspaceId}&edit=1`
  if (stage === 'brief') return `/challenge-brief?workspaceId=${workspaceId}`
  return `/advisor/${workspaceId}`
}

/**
 * Slim engagement journey bar: Onboarding -> Brief -> Advisor.
 * Completed stages are clickable (when a workspace is attached) so users can
 * step back and edit; the current stage glows; upcoming stages are muted.
 */
export function JourneyTimeline({ current, workspaceId }: { current: JourneyStage; workspaceId?: string | null }) {
  const currentIdx = STAGES.findIndex(s => s.key === current)

  return (
    <div className="flex items-center justify-center" aria-label="Engagement journey">
      <div className="inline-flex items-center rounded-full border border-[#1e2433] bg-[#131720] px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
        {STAGES.map((stage, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming'
          const Icon = stage.icon
          const clickable = state === 'done' && !!workspaceId

          const node = (
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap',
                state === 'current' && 'bg-blue-600 text-white shadow-[0_0_14px_rgba(59,130,246,0.4)]',
                state === 'done' && 'text-blue-300',
                state === 'done' && clickable && 'hover:bg-blue-500/10',
                state === 'upcoming' && 'text-slate-600',
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border',
                  state === 'done' && 'bg-blue-500/15 border-blue-500/40',
                  state === 'current' && 'bg-white/15 border-white/30',
                  state === 'upcoming' && 'bg-[#0c0e14] border-[#1e2433]',
                )}
              >
                {state === 'done'
                  ? <Check className="w-3 h-3 text-blue-400" />
                  : <Icon className={cn('w-3 h-3', state === 'current' ? 'text-white' : 'text-slate-600')} />}
              </span>
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </span>
          )

          return (
            <span key={stage.key} className="flex items-center">
              {clickable
                ? <Link to={stageHref(stage.key, workspaceId!)} title={`Back to ${stage.label}`}>{node}</Link>
                : node}
              {i < STAGES.length - 1 && (
                <span
                  className={cn(
                    'h-px w-6 sm:w-9 mx-1 flex-shrink-0 rounded-full',
                    i < currentIdx ? 'bg-blue-500/60' : 'bg-[#1e2433]',
                  )}
                />
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
