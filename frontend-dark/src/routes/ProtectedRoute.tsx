import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '../store/auth'
import { useCreditsStore } from '../store/credits'
import { useGamificationStore } from '../store/gamification'
import { SkeletonPage } from '../components/ui/SkeletonLoader'

interface ProtectedRouteProps {
  children?: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore()
  const { fetchBalance } = useCreditsStore()
  const { fetchStats, fetchQuests } = useGamificationStore()
  const location = useLocation()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  useEffect(() => {
    if (isAuthenticated) {
      fetchBalance()
      fetchStats()
      fetchQuests()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return <SkeletonPage />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children ? <>{children}</> : <Outlet />
}
