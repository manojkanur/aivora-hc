import { create } from 'zustand'
import { creditsAPI } from '../lib/api'

interface CreditsState {
  balance: number
  plan: string
  isLoading: boolean
  lastFetched: number | null
  fetchBalance: (force?: boolean) => Promise<void>
  deductOptimistic: (amount: number) => void
  refundOptimistic: (amount: number) => void
  setBalance: (balance: number) => void
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: 0,
  plan: 'starter',
  isLoading: false,
  lastFetched: null,

  fetchBalance: async (force = false) => {
    const { lastFetched } = get()
    // Cache for 20 seconds unless a force refresh is requested (after an action).
    if (!force && lastFetched && Date.now() - lastFetched < 20000) return

    set({ isLoading: true })
    try {
      const res = await creditsAPI.getBalance()
      set({
        balance: res.data.balance,
        plan: res.data.plan,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch {
      set({ isLoading: false })
    }
  },

  deductOptimistic: (amount) => {
    set(state => ({ balance: Math.max(0, state.balance - amount) }))
  },

  refundOptimistic: (amount) => {
    set(state => ({ balance: state.balance + amount }))
  },

  setBalance: (balance) => set({ balance }),
}))
