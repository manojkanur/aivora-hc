import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface JourneyLaunchesState {
  // workspaceId → Set of journeyIds that have been launched
  launches: Record<string, string[]>
  hasLaunched: (workspaceId: string, journeyId: string) => boolean
  markLaunched: (workspaceId: string, journeyId: string) => void
}

export const useJourneyLaunches = create<JourneyLaunchesState>()(
  persist(
    (set, get) => ({
      launches: {},

      hasLaunched: (workspaceId, journeyId) =>
        (get().launches[workspaceId] ?? []).includes(journeyId),

      markLaunched: (workspaceId, journeyId) =>
        set(s => {
          const existing = s.launches[workspaceId] ?? []
          if (existing.includes(journeyId)) return s
          return { launches: { ...s.launches, [workspaceId]: [...existing, journeyId] } }
        }),
    }),
    { name: 'aivora-journey-launches' }
  )
)
