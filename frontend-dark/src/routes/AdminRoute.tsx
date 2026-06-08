import { Navigate, Outlet } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuthStore } from '../store/auth'
import { ProtectedRoute } from './ProtectedRoute'

interface AdminRouteProps {
  children?: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user } = useAuthStore()

  return (
    <ProtectedRoute>
      {user && (user.role === 'admin' || user.role === 'owner') ? (
        children ? <>{children}</> : <Outlet />
      ) : (
        <Navigate to="/dashboard" replace />
      )}
    </ProtectedRoute>
  )
}
