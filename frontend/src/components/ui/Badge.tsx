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
  default: 'bg-accent text-white',
  success: 'bg-zinc-900 text-white',
  warning: 'bg-zinc-100 text-amber-700 border border-amber-200',
  error: 'bg-red-50 text-red-700 border border-red-200',
  muted: 'bg-surface-tertiary text-text-muted border border-border',
}

const tierStyles: Record<SkillTier, string> = {
  starter: 'bg-surface-tertiary text-text-secondary border border-border',
  professional: 'bg-accent text-white',
  enterprise: 'bg-black text-white',
  advisory: 'bg-black text-white ring-1 ring-zinc-400 ring-offset-1',
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
