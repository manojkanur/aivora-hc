import { motion } from 'framer-motion'
import { Lock, Flame, Clock, Zap, Compass, Users, TrendingUp, Package } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { formatRelativeTime } from '../../lib/utils'
import type { Skill } from '../../store/workspace'

interface SkillCardProps {
  skill: Skill
  onClick?: () => void
  showUpgradeCTA?: boolean
}

const categoryIcons: Record<string, typeof Compass> = {
  strategy:     Compass,
  talent:       Users,
  career:       TrendingUp,
  deliverables: Package,
  Strategy:     Compass,
  Talent:       Users,
  Career:       TrendingUp,
  Foundation:   Package,
  Assessment:   TrendingUp,
  Analytics:    TrendingUp,
  Performance:  TrendingUp,
  OD:           Users,
  Operations:   Package,
  Culture:      Users,
  Rewards:      Zap,
  Learning:     Compass,
  Leadership:   Users,
  Advisory:     Compass,
}

const tierLabels: Record<Skill['tier'], string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  advisory: 'Advisory',
}

export function SkillCard({ skill, onClick, showUpgradeCTA = true }: SkillCardProps) {
  const isLocked = skill.status === 'locked'
  const isRunning = skill.status === 'running'

  return (
    <motion.div
      whileHover={isLocked ? undefined : { y: -4, transition: { duration: 0.2 } }}
      onClick={isLocked ? undefined : onClick}
      className={cn(
        'relative rounded-xl border bg-[#1B2431] p-5 transition-shadow',
        isLocked
          ? 'border-[#2A3648] opacity-75 cursor-default'
          : 'border-[#2A3648] shadow-[0_1px_3px_rgba(0,0,0,0.4)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_0_1px_rgba(46,125,250,0.15)] cursor-pointer',
        isRunning && 'border-[#2E7DFA]'
      )}
    >
      {isRunning && (
        <div className="absolute inset-0 rounded-xl border-2 border-[#2E7DFA] animate-pulse pointer-events-none" />
      )}

      {isLocked && (
        <div className="absolute inset-0 rounded-xl bg-[#1B2431]/60 flex items-center justify-center z-10">
          <div className="text-center">
            <Lock className="w-5 h-5 text-slate-600 mx-auto mb-1" />
            {showUpgradeCTA && (
              <span className="text-xs text-slate-600 font-medium">Upgrade to unlock</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#222E3E] flex items-center justify-center flex-shrink-0">
          {(() => { const Icon = categoryIcons[skill.category] ?? Compass; return <Icon className="w-5 h-5 text-slate-300" /> })()}
        </div>
        <Badge tier={skill.tier}>{tierLabels[skill.tier]}</Badge>
      </div>

      <div className="mb-3">
        <h3 className="font-semibold text-white text-sm leading-tight mb-1">
          {skill.name}
        </h3>
        <p className="text-xs text-slate-600 line-clamp-2">{skill.description}</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-slate-600" />
            <span className="text-xs text-slate-300 font-medium">{skill.credit_cost} credits</span>
          </div>
          {skill.streak_days && skill.streak_days > 0 && (
            <div className="flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-500" />
              <span className="text-xs font-medium text-orange-600">{skill.streak_days}d</span>
            </div>
          )}
        </div>
        {skill.last_run && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-600" />
            <span className="text-xs text-slate-600">{formatRelativeTime(skill.last_run)}</span>
          </div>
        )}
      </div>

      {isRunning && (
        <div className="mt-3 pt-3 border-t border-[#2A3648]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#2E7DFA] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-slate-300 font-medium">Running...</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}
