import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  xp_points: number
  level: number
  avatar_url?: string
}

export interface Tenant {
  id: string
  name: string
  plan: 'starter' | 'professional' | 'enterprise'
  brand_kit?: {
    logo_url?: string
    primary_color?: string
    secondary_color?: string
    font?: string
  }
}

interface AuthState {
  user: User | null
  tenant: Tenant | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  setUser: (user: User) => void
  setTenant: (tenant: Tenant) => void
  setToken: (token: string) => void
  logout: () => void
  loadFromStorage: () => void
  updateUser: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setTenant: (tenant) => set({ tenant }),
      setToken: (token) => {
        localStorage.setItem('auth_token_dark', token)
        set({ token, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('auth_token_dark')
        localStorage.removeItem('auth_user')
        set({ user: null, tenant: null, token: null, isAuthenticated: false })
      },
      loadFromStorage: () => {
        const token = localStorage.getItem('auth_token_dark')
        if (token) {
          set({ token, isAuthenticated: true })
        }
      },
      updateUser: (updates) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...updates } })
        }
      },
    }),
    {
      name: 'aivora-auth-dark',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        tenant: state.tenant,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
