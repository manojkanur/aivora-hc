import { motion } from 'framer-motion'
import { useGamificationStore } from '../../store/gamification'

function xpForLevel(level: number): number {
  return level * 500
}

const levelTitles: Record<number, string> = {
  1: 'Novice',
  2: 'Analyst',
  3: 'Associate',
  4: 'Consultant',
  5: 'Senior',
  6: 'Manager',
  7: 'Director',
  8: 'VP',
  9: 'Principal',
  10: 'Partner',
}

export function XpBar({ compact = false }: { compact?: boolean }) {
  const { xp, level } = useGamificationStore()
  const xpNeeded = xpForLevel(level)
  const progress = xpNeeded > 0 ? Math.min((xp / xpNeeded) * 100, 100) : 0
  const title = levelTitles[level] || `Level ${level}`

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-[#3b82f6] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {level}
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 bg-[#1a1e2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#3b82f6] rounded-full"
              style={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 bg-[#0E0E0E] rounded-xl border border-[#1e2433]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#3b82f6] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            {level}
          </div>
          <div>
            <div className="text-xs font-semibold text-white leading-none">{title}</div>
            <div className="text-xs text-slate-600 mt-0.5">Level {level}</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-medium text-white">{xp}</span>
          <span className="text-xs text-slate-600">/{xpNeeded}</span>
        </div>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#3b82f6] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
