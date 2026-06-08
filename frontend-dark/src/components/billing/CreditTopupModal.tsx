import { useState } from 'react'
import { Check, Zap } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { billingAPI } from '../../lib/api'
import { toast } from '../ui/Toast'
import { cn } from '../../lib/utils'

const bundles = [
  { id: 'credits_50', credits: 50, price: 9, perCredit: '0.18' },
  { id: 'credits_150', credits: 150, price: 24, perCredit: '0.16', bestValue: true },
  { id: 'credits_500', credits: 500, price: 69, perCredit: '0.14' },
]

interface CreditTopupModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreditTopupModal({ isOpen, onClose }: CreditTopupModalProps) {
  const [selected, setSelected] = useState<string>('credits_150')
  const [isLoading, setIsLoading] = useState(false)

  const handleBuy = async () => {
    setIsLoading(true)
    try {
      const res = await billingAPI.createCheckoutSession(selected)
      window.location.href = res.data.checkout_url
    } catch {
      toast.error('Failed to create checkout session. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Top Up Credits" size="md">
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-300">
          Credits are used to run AI skills. Select a bundle to top up your balance.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {bundles.map(bundle => (
            <button
              key={bundle.id}
              onClick={() => setSelected(bundle.id)}
              className={cn(
                'relative p-4 rounded-xl border text-left transition-all',
                selected === bundle.id
                  ? 'border-[#3b82f6] bg-[#3b82f6] text-white'
                  : 'border-[#1e2433] bg-[#131720] hover:border-[#252d3f] hover:bg-[#0E0E0E]'
              )}
            >
              {bundle.bestValue && (
                <span className={cn(
                  'absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-semibold',
                  selected === bundle.id ? 'bg-[#131720] text-[#3b82f6]' : 'bg-[#3b82f6] text-white'
                )}>
                  Best value
                </span>
              )}
              <div className={cn('text-2xl font-bold mb-1', selected === bundle.id ? 'text-white' : 'text-white')}>
                {bundle.credits}
              </div>
              <div className={cn('text-xs mb-2', selected === bundle.id ? 'text-white/80' : 'text-slate-600')}>
                credits
              </div>
              <div className={cn('text-lg font-semibold', selected === bundle.id ? 'text-white' : 'text-white')}>
                ${bundle.price}
              </div>
              <div className={cn('text-xs', selected === bundle.id ? 'text-white/70' : 'text-slate-600')}>
                ${bundle.perCredit}/credit
              </div>
              {selected === bundle.id && (
                <div className="absolute top-3 right-3">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 p-3 bg-[#0E0E0E] rounded-lg border border-[#1e2433]">
          <Zap className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <p className="text-xs text-slate-300">
            Credits never expire. Unused credits roll over to the next month.
          </p>
        </div>

        <Button onClick={handleBuy} isLoading={isLoading} className="w-full">
          Buy Credits for ${bundles.find(b => b.id === selected)?.price}
        </Button>
      </div>
    </Modal>
  )
}
