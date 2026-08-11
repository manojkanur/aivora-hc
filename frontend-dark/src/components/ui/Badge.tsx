import { cn } from '../../lib/utils'
import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'muted'
type SkillTier = 'starter' | 'professional' | 'enterprise' | 'advisory'

interface BadgeProps {
  variant?: BadgeVariant
  tier?: SkillTier
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  error:   'bg-red-500/10 text-red-400 border border-red-500/25',
  muted:   'bg-[#1B2431] text-slate-500 border border-[#2A3648]',
}

const tierStyles: Record<SkillTier, string> = {
  starter:      'bg-[#1B2431] text-slate-400 border border-[#2A3648]',
  professional: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  enterprise:   'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
  advisory:     'bg-blue-600 text-white font-semibold border border-blue-600',
}

export function Badge({ variant = 'default', tier, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        tier ? tierStyles[tier] : variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
