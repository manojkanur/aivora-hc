import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, Zap, Target, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useGamificationStore } from '../../store/gamification'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

interface QuestPanelProps {
  isOpen: boolean
  onClose: () => void
}

type QuestFilter = 'all' | 'active' | 'completed'

export function QuestPanel({ isOpen, onClose }: QuestPanelProps) {
  const [filter, setFilter] = useState<QuestFilter>('active')
  const { activeQuests, claimQuest } = useGamificationStore()

  const filteredQuests = activeQuests.filter(q => {
    if (filter === 'active') return !q.completed
    if (filter === 'completed') return q.completed
    return true
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-96 bg-[#131720] border-l border-[#1e2433] shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2433]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-white" />
                <h2 className="font-semibold text-white">Active Quests</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1 px-5 py-3 border-b border-[#1e2433]">
              {(['all', 'active', 'completed'] as QuestFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                    filter === f
                      ? 'bg-[#3b82f6] text-white'
                      : 'text-slate-300 hover:bg-[#1a1e2e]'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {filteredQuests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Trophy className="w-10 h-10 text-slate-600 mb-3" />
                  <p className="text-white font-medium">
                    {filter === 'completed' ? 'No completed quests yet' : 'No active quests'}
                  </p>
                  <p className="text-slate-600 text-sm mt-1">
                    {filter === 'completed'
                      ? 'Complete quests to see them here'
                      : 'Check back soon for new challenges'}
                  </p>
                </div>
              ) : (
                filteredQuests.map(quest => (
                  <div
                    key={quest.id}
                    className={cn(
                      'p-4 rounded-xl border',
                      quest.completed
                        ? 'border-[#1e2433] bg-[#0E0E0E]'
                        : 'border-[#1e2433] bg-[#131720]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {quest.completed && (
                            <CheckCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          )}
                          <h3 className={cn(
                            'text-sm font-semibold',
                            quest.completed ? 'text-slate-300 line-through' : 'text-white'
                          )}>
                            {quest.title}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{quest.description}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 bg-[#3b82f6]-light rounded-full px-2 py-0.5">
                        <Zap className="w-3 h-3 text-white" />
                        <span className="text-xs font-bold text-white">+{quest.xp_reward}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">Progress</span>
                        <span className="font-medium text-white">{quest.progress}/{quest.target}</span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((quest.progress / quest.target) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    {quest.completed && !quest.claimed && (
                      <Button
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => claimQuest(quest.id)}
                      >
                        Claim Reward
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
