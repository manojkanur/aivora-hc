import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
  variant?: 'line' | 'card' | 'avatar'
  lines?: number
}

export function Skeleton({ className, variant = 'line', lines = 1 }: SkeletonProps) {
  if (variant === 'avatar') {
    return (
      <div className={cn('rounded-full shimmer', className || 'w-10 h-10')} />
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('rounded-xl border border-[#1e2433] bg-[#131720] p-5', className)}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 shimmer rounded" />
            <div className="h-3 w-1/2 shimmer rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 shimmer rounded" />
          <div className="h-3 shimmer rounded w-5/6" />
          <div className="h-3 shimmer rounded w-4/6" />
        </div>
      </div>
    )
  }

  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 shimmer rounded',
              i === lines - 1 ? 'w-3/4' : 'w-full',
              className
            )}
          />
        ))}
      </div>
    )
  }

  return <div className={cn('h-4 shimmer rounded', className)} />
}

export function SkeletonPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
    </div>
  )
}
