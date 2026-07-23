import { Coins } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useCreditsStore } from '../../store/credits'
import { cn } from '../../lib/utils'
import { CreditTopupModal } from './CreditTopupModal'

export function CreditMeter() {
  const { balance, isLoading, fetchBalance } = useCreditsStore()
  const [topupOpen, setTopupOpen] = useState(false)

  // Load the balance on mount and poll periodically so the meter stays current.
  useEffect(() => {
    void fetchBalance()
    const t = setInterval(() => void fetchBalance(true), 30000)
    return () => clearInterval(t)
  }, [fetchBalance])

  // When the top-up modal closes, force a refresh (in case a purchase completed).
  useEffect(() => {
    if (!topupOpen) void fetchBalance(true)
  }, [topupOpen, fetchBalance])

  const isEmpty = balance === 0
  const isLow = balance > 0 && balance < 20

  return (
    <>
      <button
        onClick={() => setTopupOpen(true)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200',
          isEmpty
            ? 'border-red-800 bg-red-950/30 hover:bg-red-950/50'
            : isLow
            ? 'border-[rgba(59,130,246,0.4)] bg-[rgba(59,130,246,0.08)] hover:bg-[rgba(59,130,246,0.12)]'
            : 'border-[#1e2433] bg-[#131720] hover:border-[#252d3f]'
        )}
      >
        <Coins
          className={cn(
            'w-4 h-4',
            isEmpty ? 'text-red-400' : isLow ? 'text-[#3b82f6]' : 'text-slate-600'
          )}
        />
        {isLoading ? (
          <div className="w-6 h-3 shimmer rounded" />
        ) : (
          <span
            className={cn(
              'text-sm font-semibold',
              isEmpty ? 'text-red-400' : isLow ? 'text-[#3b82f6]' : 'text-white'
            )}
          >
            {balance}
          </span>
        )}
        {isLow && !isEmpty && (
          <span className="text-xs text-[#3b82f6] font-medium">Low</span>
        )}
        {isEmpty && (
          <span className="text-xs text-red-400 font-medium">Empty</span>
        )}
      </button>

      <CreditTopupModal isOpen={topupOpen} onClose={() => setTopupOpen(false)} />
    </>
  )
}
