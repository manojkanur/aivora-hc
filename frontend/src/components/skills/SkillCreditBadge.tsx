import { Zap } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useState } from 'react'

interface SkillCreditBadgeProps {
  credits: number
  className?: string
}

export function SkillCreditBadge({ credits, className }: SkillCreditBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative inline-flex">
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-tertiary border border-border text-xs font-medium text-text-secondary cursor-default',
          className
        )}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Zap className="w-3 h-3" />
        <span>{credits} credits</span>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 bg-zinc-900 text-white text-xs rounded-lg whitespace-nowrap z-20 pointer-events-none shadow-modal">
          <div className="font-medium mb-0.5">Credit Deduction</div>
          <div className="text-white/70">{credits} credit{credits !== 1 ? 's' : ''} will be deducted when this skill runs.</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </div>
  )
}
