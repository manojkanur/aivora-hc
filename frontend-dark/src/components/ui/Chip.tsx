import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  variant?: 'filter' | 'tag'
  className?: string
}

/**
 * Single chip primitive used for filter pills, category tags, dimension tags.
 * Keeps shape (rounded-full), padding and active styling consistent everywhere.
 */
export function Chip({ active = false, onClick, children, variant = 'filter', className }: ChipProps) {
  const isButton = !!onClick
  const Comp = isButton ? 'button' : 'span'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-all',
        active
          ? 'border-blue-500 bg-blue-500/15 text-blue-200'
          : variant === 'tag'
            ? 'border-[#2A3648] bg-[#0f1117] text-slate-400'
            : 'border-[#2A3648] bg-[#0f1117] text-slate-400 hover:border-blue-500/40 hover:text-slate-200',
        className,
      )}
    >
      {children}
    </Comp>
  )
}

interface SectionHeaderProps {
  children: ReactNode
  right?: ReactNode
  className?: string
}

/** "QUICK ACTIONS" style small-caps banner used at the top of every section. */
export function SectionHeader({ children, right, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{children}</h2>
      {right}
    </div>
  )
}
