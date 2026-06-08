import { create } from 'zustand'
import { gamificationAPI } from '../lib/api'

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  earned: boolean
  earned_at?: string
}

export interface Quest {
  id: string
  title: string
  description: string
  xp_reward: number
  progress: number
  target: number
  completed: boolean
  claimed: boolean
  badge_id?: string
  expires_at?: string
}

export interface Streak {
  skill_id: string
  skill_name: string
  days: number
  last_run: string
}

interface GamificationState {
  xp: number
  level: number
  activeBadges: Badge[]
  activeQuests: Quest[]
  streaks: Streak[]
  pendingLevelUp: boolean
  previousLevel: number
  isLoading: boolean
  awardXp: (amount: number) => void
  levelUp: () => void
  completeQuest: (questId: string) => void
  claimQuest: (questId: string) => Promise<void>
  dismissLevelUp: () => void
  fetchStats: () => Promise<void>
  fetchQuests: () => Promise<void>
  fetchBadges: () => Promise<void>
}

function xpForLevel(level: number): number {
  return level * 500
}

export const useGamificationStore = create<GamificationState>((set, get) => ({
  xp: 0,
  level: 1,
  activeBadges: [],
  activeQuests: [],
  streaks: [],
  pendingLevelUp: false,
  previousLevel: 1,
  isLoading: false,

  awardXp: (amount) => {
    const { xp, level } = get()
    const newXp = xp + amount
    const xpNeeded = xpForLevel(level)
    if (newXp >= xpNeeded) {
      set({ xp: newXp - xpNeeded, level: level + 1, pendingLevelUp: true, previousLevel: level })
    } else {
      set({ xp: newXp })
    }
  },

  levelUp: () => {
    const { level } = get()
    set({ level: level + 1, pendingLevelUp: true, previousLevel: level })
  },

  completeQuest: (questId) => {
    set(state => ({
      activeQuests: state.activeQuests.map(q =>
        q.id === questId ? { ...q, completed: true } : q
      ),
    }))
  },

  claimQuest: async (questId) => {
    try {
      await gamificationAPI.claimQuest(questId)
      set(state => ({
        activeQuests: state.activeQuests.map(q =>
          q.id === questId ? { ...q, claimed: true } : q
        ),
      }))
    } catch {
      // ignore
    }
  },

  dismissLevelUp: () => set({ pendingLevelUp: false }),

  fetchStats: async () => {
    set({ isLoading: true })
    try {
      const res = await gamificationAPI.getStats()
      set({
        xp: res.data.xp,
        level: res.data.level,
        streaks: res.data.streaks || [],
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchQuests: async () => {
    try {
      const res = await gamificationAPI.getQuests()
      set({ activeQuests: res.data.quests || [] })
    } catch {
      // ignore
    }
  },

  fetchBadges: async () => {
    try {
      const res = await gamificationAPI.getBadges()
      set({ activeBadges: res.data.badges || [] })
    } catch {
      // ignore
    }
  },
}))
