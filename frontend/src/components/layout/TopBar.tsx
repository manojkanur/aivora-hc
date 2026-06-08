import { useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Menu, ChevronRight, LogOut, User, CreditCard, Bell } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useGamificationStore } from '../../store/gamification'
import { CreditMeter } from '../billing/CreditMeter'
import { QuestPanel } from '../gamification/QuestPanel'
import { getInitials, cn } from '../../lib/utils'
import { authAPI } from '../../lib/api'

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
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { activeQuests } = useGamificationStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [questPanelOpen, setQuestPanelOpen] = useState(false)

  const pendingQuests = activeQuests.filter(q => !q.completed).length

  const segments = location.pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map((seg, i) => ({
    label: routeLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1),
    href: '/' + segments.slice(0, i + 1).join('/'),
  }))

  const handleLogout = async () => {
    try { await authAPI.logout() } catch {}
    logout()
    navigate('/login')
  }

  return (
    <>
      <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-border flex-shrink-0">
        {/* Left: hamburger + breadcrumbs */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-muted lg:hidden flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <nav className="flex items-center gap-1 text-sm min-w-0">
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.href} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
                {i === breadcrumbs.length - 1 ? (
                  <span className="font-semibold text-text-primary truncate">{crumb.label}</span>
                ) : (
                  <Link
                    to={crumb.href}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Right: credit meter + notifications + avatar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CreditMeter />

          <button
            onClick={() => setQuestPanelOpen(true)}
            className="relative p-2 rounded-lg hover:bg-surface-tertiary text-text-muted hover:text-text-primary transition-colors"
          >
            <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
            {pendingQuests > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full" />
            )}
          </button>

          {/* Avatar dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold hover:bg-accent-hover transition-colors"
            >
              {user ? getInitials(user.name) : '?'}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-border rounded-xl shadow-elevated z-40 py-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-semibold text-text-primary truncate">{user?.name}</p>
                    <p className="text-xs text-text-muted truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                  <Link
                    to="/billing"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing
                  </Link>
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
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
