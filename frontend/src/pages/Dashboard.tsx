import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Briefcase, Coins, FileText, Zap, Plus, FileEdit, Sparkles, Inbox,
  TrendingUp, Clock, CheckCircle, Workflow, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useCreditsStore } from '../store/credits'
import { useGamificationStore } from '../store/gamification'
import { useWorkspaceStore } from '../store/workspace'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { fadeUp, staggerContainer } from '../lib/animations'
import { formatRelativeTime } from '../lib/utils'

const quickActions = [
  { label: 'New Workspace', icon: Briefcase, href: '/workspaces', color: 'bg-surface-tertiary' },
  { label: 'Challenge Brief', icon: FileEdit, href: '/challenge-brief', color: 'bg-surface-tertiary' },
  { label: 'Browse Studios', icon: Sparkles, href: '/skills', color: 'bg-surface-tertiary' },
  { label: 'Draft Inbox', icon: Inbox, href: '/inbox', color: 'bg-surface-tertiary' },
]

export default function Dashboard() {
  const { user } = useAuthStore()
  const { balance, fetchBalance } = useCreditsStore()
  const { xp, level, activeQuests } = useGamificationStore()
  const { workspaces, fetchWorkspaces, isLoading: wsLoading } = useWorkspaceStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchWorkspaces()
    fetchBalance()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const recentWorkspaces = workspaces.slice(0, 3)
  const topQuests = activeQuests.slice(0, 3)
  const activeWorkspaces = workspaces.filter(w => w?.status === 'active').length

  const statCards = [
    { label: 'Active Workspaces', value: activeWorkspaces, icon: Briefcase, sub: 'Ongoing engagements' },
    { label: 'Credits Remaining', value: balance, icon: Coins, sub: 'Available to spend' },
    { label: 'Pending Drafts', value: 0, icon: FileText, sub: 'Awaiting review' },
    { label: 'Level', value: `L${level}`, icon: Zap, sub: `${xp} XP total` },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Welcome */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-text-primary">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-text-secondary mt-1">Here's what's happening in your HC platform.</p>
      </motion.div>

      {/* Primary CTA */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-zinc-950 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Workflow className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">New Brief</span>
            </div>
            <h2 className="text-lg font-bold text-white">Run a full HC advisory workflow</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Brief → Skill → AI Generate → Review → Export</p>
          </div>
          <Link to="/engage">
            <Button rightIcon={<ArrowRight className="w-4 h-4" />} className="bg-white text-zinc-950 hover:bg-zinc-100 flex-shrink-0">
              Start New Brief
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} variants={fadeUp} custom={i}>
            <Card className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-surface-tertiary flex items-center justify-center">
                  <stat.icon className="w-4.5 h-4.5 w-[18px] h-[18px] text-text-secondary" />
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
              <div className="text-sm font-medium text-text-secondary mt-0.5">{stat.label}</div>
              <div className="text-xs text-text-muted mt-0.5">{stat.sub}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action, i) => (
            <motion.div key={action.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                to={action.href}
                className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-border shadow-card hover:shadow-card-hover hover:border-border-dark transition-all text-center group"
              >
                <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">{action.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Workspaces */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Recent Workspaces</h2>
            <Link to="/workspaces" className="text-xs text-text-muted hover:text-text-primary transition-colors">
              View all →
            </Link>
          </div>
          {wsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} variant="card" />)}
            </div>
          ) : recentWorkspaces.length === 0 ? (
            <Card className="p-8 text-center">
              <Briefcase className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary font-medium">No workspaces yet</p>
              <p className="text-text-muted text-sm mt-1">Create your first client workspace to get started</p>
              <Button className="mt-4" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/workspaces')}>
                New Workspace
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentWorkspaces.map(ws => (
                <Link key={ws.id} to={`/workspaces/${ws.id}`}>
                  <Card variant="interactive" className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-text-primary">{ws.name}</h3>
                        <p className="text-sm text-text-muted mt-0.5">{ws.client_name}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock className="w-3 h-3" />
                          <span>{ws.last_activity ? formatRelativeTime(ws.last_activity) : 'No activity'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-text-muted mt-1">
                          <Sparkles className="w-3 h-3" />
                          <span>{ws.skill_count} skills</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Quests + Activity */}
        <div className="space-y-6">
          {/* Active Quests */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Active Quests</h2>
              <Link to="/gamification" className="text-xs text-text-muted hover:text-text-primary transition-colors">
                View all →
              </Link>
            </div>
            {topQuests.length === 0 ? (
              <Card className="p-5 text-center">
                <TrendingUp className="w-6 h-6 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">No active quests</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {topQuests.map(quest => (
                  <Card key={quest.id} className="p-4">
                    <p className="text-sm font-medium text-text-primary truncate">{quest.title}</p>
                    <div className="mt-2">
                      <div className="h-1.5 bg-border rounded-full">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${Math.min((quest.progress / quest.target) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-text-muted">{quest.progress}/{quest.target}</span>
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-text-muted" />
                          <span className="text-xs font-medium text-text-primary">+{quest.xp_reward}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Recent Activity</h2>
            <Card className="p-5 text-center">
              <p className="text-sm text-text-muted">Activity will appear here as you run studios</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
