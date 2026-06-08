import { motion } from 'framer-motion'
import { Lock, Award } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Badge } from '../../store/gamification'

interface BadgeShelfProps {
  badges: Badge[]
  showLocked?: boolean
}

const rarityStyles: Record<Badge['rarity'], string> = {
  common: 'border-border',
  rare: 'border-zinc-400 shadow-sm',
  epic: 'border-zinc-600 shadow-md',
  legendary: 'border-zinc-800 shadow-lg ring-1 ring-zinc-300',
}

const rarityLabel: Record<Badge['rarity'], string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export function BadgeShelf({ badges, showLocked = true }: BadgeShelfProps) {
  const earned = badges.filter(b => b.earned)
  const locked = showLocked ? badges.filter(b => !b.earned) : []

  return (
    <div className="space-y-4">
      {earned.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-3">Earned ({earned.length})</h3>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {earned.map((badge, i) => (
              <BadgeItem key={badge.id} badge={badge} index={i} />
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-3">Locked ({locked.length})</h3>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {locked.map((badge, i) => (
              <BadgeItem key={badge.id} badge={badge} index={i} locked />
            ))}
          </div>
        </div>
      )}

      {earned.length === 0 && (
        <div className="text-center py-10">
          <Award className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium">No badges yet</p>
          <p className="text-text-muted text-sm mt-1">Complete quests and actions to earn badges</p>
        </div>
      )}
    </div>
  )
}

function BadgeItem({ badge, index, locked = false }: { badge: Badge; index: number; locked?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group relative"
    >
      <div
        className={cn(
          'aspect-square rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all',
          locked
            ? 'border-border bg-surface-secondary grayscale opacity-50'
            : rarityStyles[badge.rarity],
          !locked && 'hover:shadow-card-hover cursor-pointer'
        )}
        title={badge.name}
      >
        {locked ? (
          <Lock className="w-5 h-5 text-text-muted" />
        ) : (
          <span className="text-2xl">{badge.icon}</span>
        )}
      </div>
      <div className="mt-1.5 text-center">
        <p className={cn('text-xs font-medium truncate', locked ? 'text-text-muted' : 'text-text-primary')}>
          {badge.name}
        </p>
        <p className="text-xs text-text-muted capitalize">{rarityLabel[badge.rarity]}</p>
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {locked ? 'Locked' : badge.description}
      </div>
    </motion.div>
  )
}
