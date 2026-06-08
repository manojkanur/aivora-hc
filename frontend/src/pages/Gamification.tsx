import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Trophy, Star, Flame, Medal } from 'lucide-react'
import { useGamificationStore } from '../store/gamification'
import { gamificationAPI } from '../lib/api'
import { BadgeShelf } from '../components/gamification/BadgeShelf'
import { Button } from '../components/ui/Button'
import { fadeUp } from '../lib/animations'
import { cn } from '../lib/utils'
import { getInitials } from '../lib/utils'

type TabId = 'progress' | 'quests' | 'badges' | 'leaderboard'
type LeaderboardPeriod = 'weekly' | 'monthly' | 'all'

interface LeaderboardEntry {
  rank: number
  user_id: string
  name: string
  level: number
  xp_this_period: number
  badge_count: number
  is_current_user: boolean
}

export default function Gamification() {
  const [activeTab, setActiveTab] = useState<TabId>('progress')
  const { xp, level, activeBadges, activeQuests, streaks, fetchStats, fetchQuests, fetchBadges, claimQuest } = useGamificationStore()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>('weekly')
  const [xpHistory] = useState([120, 340, 80, 500, 220, 450, xp])

  useEffect(() => {
    fetchStats()
    fetchQuests()
    fetchBadges()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      gamificationAPI.getLeaderboard(leaderboardPeriod)
        .then(res => setLeaderboard(res.data.entries || []))
        .catch(() => {})
    }
  }, [activeTab, leaderboardPeriod])

  const xpForLevel = level * 500
  const tabs: { id: TabId; label: string; icon: typeof Trophy }[] = [
    { id: 'progress', label: 'My Progress', icon: Zap },
    { id: 'quests', label: 'Quests', icon: Star },
    { id: 'badges', label: 'Badges', icon: Medal },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  ]

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const maxXp = Math.max(...xpHistory, 1)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-text-primary">Gamification</h1>
        <p className="text-text-secondary mt-1">Track your progress, quests, and achievements</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Progress Tab */}
      {activeTab === 'progress' && (
        <div className="space-y-6">
          {/* Level Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-white rounded-2xl border border-border p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center text-2xl font-bold">
                  {level}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Level {level}</h2>
                  <p className="text-text-secondary">
                    {['', 'Novice', 'Analyst', 'Associate', 'Consultant', 'Senior', 'Manager', 'Director', 'VP', 'Principal', 'Partner'][level] || `Expert`}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-2xl font-bold text-text-primary">{xp}</div>
                  <div className="text-sm text-text-muted">/ {xpForLevel} XP</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Progress to Level {level + 1}</span>
                  <span>{Math.round((xp / xpForLevel) * 100)}%</span>
                </div>
                <div className="h-3 bg-surface-tertiary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-accent rounded-full"
                    style={{ width: '0%' }}
                    animate={{ width: `${Math.min((xp / xpForLevel) * 100, 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text-secondary mb-3">Skill Streaks</h3>
              {streaks.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">No active streaks</p>
              ) : (
                <div className="space-y-3">
                  {streaks.map(streak => (
                    <div key={streak.skill_id} className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary truncate flex-1">{streak.skill_name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-bold text-orange-600">{streak.days}d</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* XP History Chart */}
          <div className="bg-white rounded-2xl border border-border p-6">
            <h3 className="text-sm font-semibold text-text-secondary mb-4">XP This Week</h3>
            <div className="flex items-end gap-2 h-24">
              {xpHistory.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-accent transition-all"
                    style={{ height: `${Math.round((val / maxXp) * 80)}px`, minHeight: val > 0 ? '4px' : '0' }}
                  />
                  <span className="text-xs text-text-muted">{days[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quests Tab */}
      {activeTab === 'quests' && (
        <div className="space-y-3">
          {activeQuests.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-border">
              <Star className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No quests available</p>
              <p className="text-text-muted text-sm mt-1">Check back soon for new challenges</p>
            </div>
          ) : (
            activeQuests.map(quest => (
              <div key={quest.id} className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-text-primary">{quest.title}</h3>
                    <p className="text-sm text-text-muted mt-0.5">{quest.description}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-accent-light rounded-full px-2.5 py-1 flex-shrink-0">
                    <Zap className="w-3.5 h-3.5 text-text-primary" />
                    <span className="text-sm font-bold text-text-primary">+{quest.xp_reward}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Progress</span>
                    <span className="font-medium text-text-primary">{quest.progress}/{quest.target}</span>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${Math.min((quest.progress / quest.target) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                {quest.completed && !quest.claimed && (
                  <Button size="sm" className="mt-3" onClick={() => claimQuest(quest.id)}>
                    Claim Reward
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Badges Tab */}
      {activeTab === 'badges' && (
        <div className="space-y-4">
          {/* Rarity Legend */}
          <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-border">
            <span className="text-xs font-semibold text-text-muted">Rarity:</span>
            {[
              { label: 'Common', color: 'border-border' },
              { label: 'Rare', color: 'border-zinc-400' },
              { label: 'Epic', color: 'border-zinc-600' },
              { label: 'Legendary', color: 'border-zinc-800' },
            ].map(r => (
              <div key={r.label} className="flex items-center gap-1.5">
                <div className={`w-4 h-4 rounded border-2 ${r.color}`} />
                <span className="text-xs text-text-secondary">{r.label}</span>
              </div>
            ))}
          </div>
          <BadgeShelf badges={activeBadges} showLocked />
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['weekly', 'monthly', 'all'] as LeaderboardPeriod[]).map(period => (
              <button
                key={period}
                onClick={() => setLeaderboardPeriod(period)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors border',
                  leaderboardPeriod === period
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white text-text-secondary border-border hover:border-border-dark'
                )}
              >
                {period === 'all' ? 'All Time' : period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>

          {leaderboard.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-border">
              <Trophy className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No leaderboard data</p>
              <p className="text-text-muted text-sm mt-1">Earn XP to appear on the leaderboard</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="w-16 text-center text-xs font-semibold text-text-muted px-4 py-3">Rank</th>
                    <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">User</th>
                    <th className="text-center text-xs font-semibold text-text-muted px-4 py-3">Level</th>
                    <th className="text-right text-xs font-semibold text-text-muted px-4 py-3">XP</th>
                    <th className="text-right text-xs font-semibold text-text-muted px-4 py-3 hidden sm:table-cell">Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(entry => (
                    <tr
                      key={entry.user_id}
                      className={cn(
                        'border-b border-border last:border-0 transition-colors',
                        entry.is_current_user ? 'bg-accent-light' : 'hover:bg-surface-secondary'
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'text-sm font-bold',
                          entry.rank === 1 ? 'text-yellow-600' :
                          entry.rank === 2 ? 'text-zinc-500' :
                          entry.rank === 3 ? 'text-amber-600' : 'text-text-muted'
                        )}>
                          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">
                            {getInitials(entry.name)}
                          </div>
                          <span className={cn('text-sm font-medium', entry.is_current_user ? 'text-text-primary' : 'text-text-secondary')}>
                            {entry.name}
                            {entry.is_current_user && <span className="ml-1 text-xs text-text-muted">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-text-primary">L{entry.level}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-text-primary">{entry.xp_this_period.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-text-secondary">{entry.badge_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
