import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Coins, ArrowUpRight, Check, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { useCreditsStore } from '../store/credits'
import { billingAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp } from '../lib/animations'
import { formatDate } from '../lib/utils'

interface BillingStatus {
  plan: string
  credits_used: number
  credits_total: number
  next_billing_date?: string
  payment_method?: { last4: string; brand: string }
}

interface Transaction {
  id: string
  type: 'topup' | 'deduction'
  amount: number
  description: string
  created_at: string
}

const plans = [
  { id: 'starter', name: 'Starter', price: '$49/mo', credits: 50, features: ['5 skills', 'PDF & DOCX'] },
  { id: 'professional', name: 'Professional', price: '$149/mo', credits: 200, features: ['15 skills', 'All exports', 'LinkedIn'] },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', credits: null, features: ['All 27 skills', 'White-label', 'Team'] },
]

export default function Billing() {
  const { balance, fetchBalance } = useCreditsStore()
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    billingAPI.getStatus().then(res => {
      setBillingStatus(res.data)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
    billingAPI.getTransactions().then(res => setTransactions(res.data.transactions || [])).catch(() => {})
    fetchBalance()
  }, []) // eslint-disable-line

  const handleUpgrade = async (planId: string) => {
    try {
      const res = await billingAPI.changePlan(planId)
      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url
      } else {
        toast.success('Plan updated successfully')
      }
    } catch { toast.error('Failed to change plan') }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await billingAPI.cancelSubscription()
      toast.success('Subscription cancelled. You can continue using your current plan until the billing period ends.')
      setShowCancelModal(false)
    } catch { toast.error('Failed to cancel subscription') }
    finally { setIsCancelling(false) }
  }

  const creditsPercent = billingStatus
    ? Math.round((billingStatus.credits_used / billingStatus.credits_total) * 100)
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-slate-300 mt-1">Manage your plan, credits, and payment</p>
      </motion.div>

      {/* Current Plan */}
      <div className="bg-[#2E7DFA] text-white rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-medium">Current Plan</p>
            <h2 className="text-2xl font-bold mt-0.5 capitalize">
              {billingStatus?.plan || 'Starter'}
            </h2>
            {billingStatus?.next_billing_date && (
              <p className="text-white/70 text-sm mt-1">
                Next billing: {formatDate(billingStatus.next_billing_date)}
              </p>
            )}
          </div>
          <Badge variant="success">Active</Badge>
        </div>
      </div>

      {/* Credits Usage */}
      <div className="bg-[#1B2431] rounded-xl border border-[#2A3648] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-slate-300" />
            <h3 className="font-semibold text-white">Credits</h3>
          </div>
          <span className="text-sm text-slate-300">
            <span className="font-bold text-white">{balance}</span> remaining
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-600">
            <span>{billingStatus?.credits_used || 0} used</span>
            <span>{billingStatus?.credits_total || 50} total</span>
          </div>
          <div className="h-2.5 bg-[#222E3E] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2E7DFA] rounded-full transition-all"
              style={{ width: `${creditsPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Plan Options */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Available Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map(plan => {
            const isCurrent = billingStatus?.plan === plan.id
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 ${isCurrent ? 'border-[#2E7DFA] bg-[#2E7DFA]-light' : 'border-[#2A3648] bg-[#1B2431]'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">{plan.name}</p>
                    <p className="text-lg font-bold text-white mt-0.5">{plan.price}</p>
                    <p className="text-xs text-slate-600">{plan.credits ? `${plan.credits} credits/mo` : 'Unlimited'}</p>
                  </div>
                  {isCurrent && <Badge variant="default">Current</Badge>}
                </div>
                <ul className="space-y-1 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Check className="w-3.5 h-3.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {plan.id === 'enterprise' ? 'Talk to Sales' : 'Switch'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment Method */}
      {billingStatus?.payment_method && (
        <div className="bg-[#1B2431] rounded-xl border border-[#2A3648] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-slate-300" />
              <div>
                <p className="text-sm font-medium text-white capitalize">
                  {billingStatus.payment_method.brand} ending in {billingStatus.payment_method.last4}
                </p>
                <p className="text-xs text-slate-600">Payment method</p>
              </div>
            </div>
            <Button variant="secondary" size="sm">Update</Button>
          </div>
        </div>
      )}

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Transaction History</h3>
          <div className="bg-[#1B2431] rounded-xl border border-[#2A3648] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A3648] bg-[#0E0E0E]">
                  <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3">Description</th>
                  <th className="text-left text-xs font-semibold text-slate-600 px-4 py-3 hidden sm:table-cell">Date</th>
                  <th className="text-right text-xs font-semibold text-slate-600 px-4 py-3">Credits</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-[#2A3648] last:border-0">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300">{tx.description}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-slate-600">{formatDate(tx.created_at)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${tx.type === 'topup' ? 'text-white' : 'text-red-600'}`}>
                        {tx.type === 'topup' ? '+' : '-'}{tx.amount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel */}
      <div className="pt-4 border-t border-[#2A3648]">
        <Button
          variant="danger"
          leftIcon={<AlertTriangle className="w-4 h-4" />}
          onClick={() => setShowCancelModal(true)}
        >
          Cancel Subscription
        </Button>
      </div>

      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Subscription" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Are you sure you want to cancel your subscription? You'll continue to have access until the end of your current billing period.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCancelModal(false)}>
              Keep Subscription
            </Button>
            <Button variant="danger" className="flex-1" isLoading={isCancelling} onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
