import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingCompletionsState {
  completions: Record<string, boolean> // workspaceId → completed
  markCompleted: (workspaceId: string) => void
  isCompleted: (workspaceId: string) => boolean
}

export const useOnboardingCompletions = create<OnboardingCompletionsState>()(
  persist(
    (set, get) => ({
      completions: {},

      markCompleted: (workspaceId) =>
        set(s => ({ completions: { ...s.completions, [workspaceId]: true } })),

      isCompleted: (workspaceId) => !!get().completions[workspaceId],
    }),
    { name: 'aivora-onboarding-completions' }
  )
)
