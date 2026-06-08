import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'
import { useGamificationStore } from '../store/gamification'
import { gamificationAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'

export function useXpEvents() {
  const { isAuthenticated } = useAuthStore()
  const { xp, level } = useGamificationStore()
  const prevXpRef = useRef(xp)
  const prevLevelRef = useRef(level)

  useEffect(() => {
    if (!isAuthenticated) return

    const poll = async () => {
      try {
        const res = await gamificationAPI.getStats()
        const { xp: newXp, level: newLevel } = res.data

        if (newXp > prevXpRef.current) {
          const gained = newXp - prevXpRef.current
          toast.xp(`You earned XP!`, gained)
        }

        if (newLevel > prevLevelRef.current) {
          // Level up is handled by the store
        }

        prevXpRef.current = newXp
        prevLevelRef.current = newLevel

        // Sync to store
        const store = useGamificationStore.getState()
        if (newXp !== store.xp || newLevel !== store.level) {
          useGamificationStore.setState({ xp: newXp, level: newLevel })
        }
      } catch {
        // ignore polling errors
      }
    }

    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps
}
