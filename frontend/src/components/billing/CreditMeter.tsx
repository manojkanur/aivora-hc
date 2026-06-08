import { Coins } from 'lucide-react'
import { useState } from 'react'
import { useCreditsStore } from '../../store/credits'
import { cn } from '../../lib/utils'
import { CreditTopupModal } from './CreditTopupModal'

export function CreditMeter() {
  const { balance, isLoading } = useCreditsStore()
  const [topupOpen, setTopupOpen] = useState(false)

  const isEmpty = balance === 0
  const isLow = balance > 0 && balance < 20

  return (
    <>
      <button
        onClick={() => setTopupOpen(true)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors hover:bg-surface-tertiary',
          isEmpty
            ? 'border-red-200 bg-red-50 hover:bg-red-100'
            : isLow
            ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
            : 'border-border bg-white'
        )}
      >
        <Coins
          className={cn(
            'w-4 h-4',
            isEmpty ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-text-muted'
          )}
        />
        {isLoading ? (
          <div className="w-6 h-3 shimmer rounded" />
        ) : (
          <span
            className={cn(
              'text-sm font-semibold',
              isEmpty ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-text-primary'
            )}
          >
            {balance}
          </span>
        )}
        {isLow && !isEmpty && (
          <span className="text-xs text-amber-600 font-medium">Low</span>
        )}
        {isEmpty && (
          <span className="text-xs text-red-600 font-medium">Empty</span>
        )}
      </button>

      <CreditTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
    </>
  )
}
