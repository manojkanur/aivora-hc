import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Maps a category key (e.g. "strategy") to a list of skill IDs assigned to it.
// Acts as an admin override on top of the default skill→category mapping.
interface CategorySkillsState {
  assignments: Record<string, string[]> // categoryKey → skillId[]
  assign: (categoryKey: string, skillId: string) => void
  unassign: (categoryKey: string, skillId: string) => void
  setAssignments: (categoryKey: string, skillIds: string[]) => void
  getAssignments: (categoryKey: string) => string[]
}

export const useCategorySkills = create<CategorySkillsState>()(
  persist(
    (set, get) => ({
      assignments: {},

      assign: (categoryKey, skillId) =>
        set(s => {
          const existing = s.assignments[categoryKey] ?? []
          if (existing.includes(skillId)) return s
          return { assignments: { ...s.assignments, [categoryKey]: [...existing, skillId] } }
        }),

      unassign: (categoryKey, skillId) =>
        set(s => {
          const existing = s.assignments[categoryKey] ?? []
          return { assignments: { ...s.assignments, [categoryKey]: existing.filter(id => id !== skillId) } }
        }),

      setAssignments: (categoryKey, skillIds) =>
        set(s => ({ assignments: { ...s.assignments, [categoryKey]: skillIds } })),

      getAssignments: (categoryKey) => get().assignments[categoryKey] ?? [],
    }),
    { name: 'aivora-category-skills' }
  )
)
