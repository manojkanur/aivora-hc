import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Briefcase, Coins, FileText, Plus, Sparkles, Inbox,
  Clock, ChevronRight, ArrowRight, Rocket,
  Target, BarChart3, TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useCreditsStore } from '../store/credits'
import { useWorkspaceStore } from '../store/workspace'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { formatRelativeTime } from '../lib/utils'
import { cn } from '../lib/utils'

const quickActions = [
  { label: 'New Workspace',  desc: 'Start a client project', icon: Briefcase, href: '/workspaces',  color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',    hover: 'group-hover:bg-blue-500/20 group-hover:border-blue-400/40'   },
  { label: 'Browse Studios', desc: '27 HC advisory modules', icon: Sparkles,  href: '/skills',      color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20',    hover: 'group-hover:bg-cyan-500/20 group-hover:border-cyan-400/40'   },
  { label: 'Draft Inbox',    desc: 'Review AI-generated drafts', icon: Inbox, href: '/inbox',       color: 'text-violet-400',  bg: 'bg-violet-500/10 border-violet-500/20', hover: 'group-hover:bg-violet-500/20 group-hover:border-violet-400/40'},
  { label: 'HiPo Studio',   desc: 'Live talent advisory',  icon: Rocket,    href: '/hipo-studio', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', hover: 'group-hover:bg-emerald-500/20 group-hover:border-emerald-400/40' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const { balance, fetchBalance } = useCreditsStore()
  const { workspaces, fetchWorkspaces, isLoading: wsLoading } = useWorkspaceStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchWorkspaces()
    fetchBalance()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const recentWorkspaces = workspaces.slice(0, 4)
  const activeWsCount = workspaces.filter(w => w?.status === 'active').length

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-7">

      {/* ── Welcome hero ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[#1a2035] bg-gradient-to-br from-[#101525] via-[#0e1420] to-[#0c0e14] p-7 sm:p-9"
      >
        {/* decorative glows */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-600/12 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-20 w-40 h-40 rounded-full bg-indigo-600/8 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="text-sm text-slate-500 font-medium tracking-wide">{greeting()},</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">
              {user?.name?.split(' ')[0] || 'there'} 👋
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-md leading-relaxed">
              Your HC advisory platform is ready. Start a new brief or pick up where you left off.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link to="/challenge-brief">
              <Button variant="secondary" size="lg">
                New Brief
              </Button>
            </Link>
            <Link to="/workspaces">
              <Button rightIcon={<ArrowRight className="w-4 h-4" />} size="lg">
                New Workspace
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Workspaces', value: activeWsCount, icon: Briefcase,  color: 'text-blue-400',    iconBg: 'bg-blue-500/10 border-blue-500/20',    sub: 'Ongoing engagements', trend: null },
          { label: 'Credits',           value: balance ?? 0,  icon: Coins,      color: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border-emerald-500/20', sub: 'Available to spend', trend: null  },
          { label: 'Pending Drafts',    value: 0,             icon: FileText,   color: 'text-amber-400',   iconBg: 'bg-amber-500/10 border-amber-500/20',   sub: 'Awaiting review',    trend: null },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 sm:p-5 hover:border-[#2a3048] transition-all hover:bg-[#111420] group cursor-default"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0', stat.iconBg)}>
                <stat.icon className={cn('w-5 h-5', stat.color)} />
              </div>
              <TrendingUp className="w-4 h-4 text-slate-700 group-hover:text-slate-600 transition-colors" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{stat.value}</div>
            <div className="text-sm font-medium text-slate-300 mt-1">{stat.label}</div>
            <div className="text-xs text-slate-600 mt-0.5 hidden sm:block">{stat.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {quickActions.map((action, i) => (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + i * 0.06 }}
            >
              <Link
                to={action.href}
                className="group flex flex-col gap-4 p-4 sm:p-5 rounded-2xl border border-[#1e2433] bg-[#0f1117] hover:border-[#2a3048] hover:bg-[#111420] transition-all"
              >
                <div className={cn('w-11 h-11 rounded-xl border flex items-center justify-center transition-all', action.bg, action.hover)}>
                  <action.icon className={cn('w-5 h-5 transition-colors', action.color)} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{action.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5 hidden sm:block">{action.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Workspaces */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent workspaces</h2>
            <Link to="/workspaces" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors font-medium">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {wsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} variant="card" />)}
            </div>
          ) : recentWorkspaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#1e2433] bg-[#0f1117] p-10 sm:p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1a1e2e] flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-7 h-7 text-slate-600" />
              </div>
              <p className="text-base font-semibold text-slate-300">No workspaces yet</p>
              <p className="text-sm text-slate-600 mt-1.5 mb-5">Create your first client workspace to get started</p>
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/workspaces')}>
                Create workspace
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentWorkspaces.map((ws, i) => (
                <motion.div
                  key={ws.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.28 + i * 0.07 }}
                >
                  <Link
                    to={`/workspaces/${ws.id}`}
                    className="group flex items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-[#1e2433] bg-[#0f1117] hover:border-blue-500/30 hover:bg-[#111420] transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{ws.name}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{ws.client_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 text-xs text-slate-500">
                      {ws.skill_count > 0 && (
                        <span className="hidden sm:flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          {ws.skill_count} studios
                        </span>
                      )}
                      {ws.last_activity && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{formatRelativeTime(ws.last_activity)}</span>
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-blue-400 group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">

          {/* Draft inbox shortcut */}
          <Link to="/inbox"
            className="group flex items-center gap-4 p-5 rounded-2xl border border-[#1e2433] bg-[#0f1117] hover:border-amber-500/20 hover:bg-[#131220] transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/15 transition-colors">
              <Inbox className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">Draft Inbox</p>
              <p className="text-xs text-slate-500 mt-0.5">Review & approve AI drafts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors flex-shrink-0" />
          </Link>

          {/* Flow reminder */}
          <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/5 to-transparent p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-blue-500" />
              <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">Advisory Flow</p>
            </div>
            {[
              { icon: Briefcase, label: 'Create Workspace',  color: 'text-blue-400',    bg: 'bg-blue-600/20 border-blue-500/20' },
              { icon: Target,    label: 'Client Onboarding', color: 'text-violet-400',  bg: 'bg-violet-600/20 border-violet-500/20' },
              { icon: Sparkles,  label: '27 HC Studios',     color: 'text-cyan-400',    bg: 'bg-cyan-600/20 border-cyan-500/20' },
              { icon: BarChart3, label: 'Export & Publish',  color: 'text-emerald-400', bg: 'bg-emerald-600/20 border-emerald-500/20' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                <div className={cn('w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0', step.bg)}>
                  <step.icon className={cn('w-4 h-4', step.color)} />
                </div>
                <span className="text-sm text-slate-400">{step.label}</span>
                {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-slate-700 ml-auto" />}
              </div>
            ))}
            <Link to="/workspaces" className="flex items-center justify-center gap-1.5 mt-2 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-sm font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-600/15 hover:border-blue-500/30 transition-all">
              Get started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
