import { Navigate, Outlet } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuthStore } from '../store/auth'
import { ProtectedRoute } from './ProtectedRoute'
import { isAdminUser } from '../lib/adminAccess'

interface AdminRouteProps {
  children?: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user } = useAuthStore()

  return (
    <ProtectedRoute>
      {isAdminUser(user) ? (
        children ? <>{children}</> : <Outlet />
      ) : (
        <Navigate to="/dashboard" replace />
      )}
    </ProtectedRoute>
  )
}
