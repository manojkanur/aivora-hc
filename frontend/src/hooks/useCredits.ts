import { useEffect } from 'react'
import { useCreditsStore } from '../store/credits'
import { useAuthStore } from '../store/auth'

export function useCredits() {
  const { balance, isLoading, fetchBalance } = useCreditsStore()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchBalance()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLow = balance > 0 && balance < 20
  const isEmpty = balance === 0

  return {
    balance,
    isLoading,
    isLow,
    isEmpty,
    fetchBalance,
  }
}
