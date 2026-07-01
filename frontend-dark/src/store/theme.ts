import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  mode: 'dark' | 'light'
  toggle: () => void
  setMode: (m: 'dark' | 'light') => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'aivora-theme' }
  )
)
