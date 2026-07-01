import { useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Menu, ChevronRight, LogOut, User, CreditCard, Bell, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useGamificationStore } from '../../store/gamification'
import { useThemeStore } from '../../store/theme'
import { useWorkspaceStore } from '../../store/workspace'
import { CreditMeter } from '../billing/CreditMeter'
import { QuestPanel } from '../gamification/QuestPanel'
import { getInitials } from '../../lib/utils'
import { authAPI } from '../../lib/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface TopBarProps {
  onMenuClick: () => void
}

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  workspaces: 'Workspaces',
  skills: 'Skills Marketplace',
  'challenge-brief': 'Challenge Brief',
  inbox: 'Draft Inbox',
  exports: 'Exports',
  publish: 'Publish',
  gamification: 'Gamification',
  billing: 'Billing',
  settings: 'Settings',
  admin: 'Admin Dashboard',
  'hipo-studio': 'HiPo Studio',
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { activeQuests } = useGamificationStore()
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore()
  const { workspaces, skills } = useWorkspaceStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [questPanelOpen, setQuestPanelOpen] = useState(false)

  const pendingQuests = activeQuests.filter(q => !q.completed).length

  const segments = location.pathname.split('/').filter(Boolean)
  // Resolve UUIDs into human names by looking them up in the workspace / skill
  // stores. Falls back to a short id snippet so the breadcrumb is never just
  // a 36-char hex blob.
  const breadcrumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/')
    let label = routeLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1)

    if (UUID_RE.test(seg)) {
      const prev = segments[i - 1]
      if (prev === 'workspaces') {
        const ws = workspaces.find(w => w.id === seg)
        label = ws?.name || ws?.client_name || `Workspace ${seg.slice(0, 6)}`
      } else if (prev === 'skills') {
        const sk = skills.find(s => s.id === seg)
        label = sk?.name || `Studio ${seg.slice(0, 6)}`
      } else if (prev === 'canvas') {
        label = `Draft ${seg.slice(0, 6)}`
      } else {
        label = seg.slice(0, 6)
      }
    }
    return { label, href }
  })

  const handleLogout = async () => {
    try { await authAPI.logout() } catch {}
    logout()
    navigate('/login')
  }

  return (
    <>
      <header className="flex items-center justify-between h-16 px-5 bg-[#0c0e14] border-b border-[#1a1e2e] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onMenuClick}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white lg:hidden flex-shrink-0 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <nav className="flex items-center gap-1.5 min-w-0">
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />}
                {i === breadcrumbs.length - 1 ? (
                  <span className="text-sm font-semibold text-white truncate">{crumb.label}</span>
                ) : (
                  <Link to={crumb.href} className="text-sm text-slate-500 hover:text-blue-400 transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <CreditMeter />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-testid="theme-toggle"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1e2433] bg-[#131720] hover:bg-[#1a1e2e] hover:border-blue-500/40 transition-all"
          >
            {themeMode === 'dark'
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4 text-blue-400" />
            }
            <span className="text-xs font-semibold text-slate-300 hidden sm:inline">
              {themeMode === 'dark' ? 'Light' : 'Dark'}
            </span>
          </button>

          <button onClick={() => setQuestPanelOpen(true)}
            className="relative p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-blue-400 transition-colors">
            <Bell className="w-5 h-5" />
            {pendingQuests > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>

          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center text-xs font-bold hover:opacity-90 transition-opacity shadow-[0_0_12px_rgba(59,130,246,0.3)]">
              {user ? getInitials(user.name) : '?'}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-[#131720] border border-[#1e2433] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] z-40 py-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#1e2433]">
                    <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <Link to="/settings"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    onClick={() => setUserMenuOpen(false)}>
                    <User className="w-4 h-4" /> Profile
                  </Link>
                  <Link to="/billing"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    onClick={() => setUserMenuOpen(false)}>
                    <CreditCard className="w-4 h-4" /> Billing
                  </Link>
                  <div className="border-t border-[#1e2433] mt-1 pt-1">
                    <button onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-950/30 transition-colors">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <QuestPanel isOpen={questPanelOpen} onClose={() => setQuestPanelOpen(false)} />
    </>
  )
}
