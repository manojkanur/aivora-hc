import { useState, useEffect } from 'react'
import { NavLink, useLocation, Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Briefcase, Inbox, Download,
  Share2, Settings, CreditCard, X, ShieldCheck, Sparkles,
  HelpCircle, ChevronRight, ChevronLeft, ArrowRight,
  PanelLeftClose, PanelLeftOpen, Brain, Sun, Moon, BookOpen,
} from 'lucide-react'
import { AivoraLogo } from '../brand/AivoraLogo'
import { useAuthStore } from '../../store/auth'
import { isAdminUser } from '../../lib/adminAccess'
import { getInitials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { TopBar } from './TopBar'
import { ToastContainer, useInsufficientCreditsHandler } from '../ui/Toast'
import { useConversationInsights } from '../../store/conversationInsights'
import { useThemeStore } from '../../store/theme'

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  desc: string
}

const platformNav: NavItem[] = [
  { label: 'Dashboard',     href: '/dashboard',      icon: LayoutDashboard,   desc: 'Overview of your workspaces, credits and activity'        },
  { label: 'Workspaces',    href: '/workspaces',     icon: Briefcase,         desc: 'Client projects, each holds studios and drafts'          },
  { label: 'Studios',       href: '/skills',         icon: Sparkles,          desc: '27 specialised HC advisory studios powered by AI'         },
]

const toolsNav: NavItem[] = [
  { label: 'Draft Inbox', href: '/inbox',    icon: Inbox,    desc: 'Review and approve AI-generated drafts'         },
  { label: 'Exports',     href: '/exports',  icon: Download, desc: 'Download approved drafts as PPTX, PDF or Word'  },
]

const adminNav: NavItem[] = [
  { label: 'Admin Dashboard', href: '/admin',     icon: ShieldCheck, desc: 'Users, tenants, LLM config, audit log' },
  { label: 'Knowledge',       href: '/knowledge', icon: BookOpen,    desc: 'Frameworks, playbooks, research and case studies' },
  { label: 'Publish',         href: '/publish',   icon: Share2,      desc: 'Prompt-driven LinkedIn posts with the Aivora brand card' },
]

const accountNav: NavItem[] = [
  { label: 'Billing',  href: '/billing',  icon: CreditCard, desc: 'Manage your plan and credit balance'     },
  { label: 'Settings', href: '/settings', icon: Settings,   desc: 'Profile, brand kit and team members'    },
]

const TOUR_STEPS = [
  { href: '/dashboard',  title: 'Dashboard',  body: 'Your home base. See active workspaces, credits remaining, and recent activity at a glance.' },
  { href: '/workspaces', title: 'Workspaces', body: 'Create a workspace per client. After creating one, use "Start Onboarding" to fill the 5-step client profile. It unlocks Challenge Brief and all 27 studios.' },
  { href: '/skills',     title: 'Studios',    body: '27 specialised advisory modules, from HC Strategy Charter to Leadership Pipeline.' },
  { href: '/inbox',      title: 'Draft Inbox',body: 'Every AI-generated draft lands here for your review. Approve to unlock export.' },
  { href: '/exports',    title: 'Exports',    body: 'Download approved drafts as PowerPoint, PDF, or Word, ready to hand to the client.' },
]

function NavItemRow({ item, onLinkClick, collapsed }: { item: NavItem; onLinkClick?: () => void; collapsed?: boolean }) {
  return (
    <div className="relative group/nav">
      <NavLink
        to={item.href}
        onClick={onLinkClick}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-150 border',
            collapsed ? 'px-2.5 py-2.5 justify-center' : 'px-3.5 py-2.5',
            isActive
              ? 'bg-blue-600/15 text-blue-400 border-blue-500/30 shadow-[0_0_0_1px_rgba(46,125,250,0.1)]'
              : 'text-slate-400 hover:bg-white/5 hover:text-white border-transparent'
          )
        }
      >
        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      </NavLink>
      {/* Tooltip — always shown when collapsed, hover-only when expanded */}
      <div className={cn(
        'absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none transition-opacity duration-150 hidden lg:block',
        collapsed ? 'opacity-0 group-hover/nav:opacity-100' : 'opacity-0 group-hover/nav:opacity-100'
      )}>
        <div className="bg-[#1B2431] border border-[#2A3648] text-white text-xs rounded-lg px-3 py-2 w-52 shadow-xl leading-relaxed whitespace-nowrap">
          <p className="font-semibold mb-0.5 text-blue-400">{item.label}</p>
          <p className="text-slate-500">{item.desc}</p>
        </div>
      </div>
    </div>
  )
}

function NavSection({ title, items, onLinkClick, collapsed }: { title: string; items: NavItem[]; onLinkClick?: () => void; collapsed?: boolean }) {
  return (
    <div>
      {!collapsed && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3.5 mb-2">{title}</p>}
      {collapsed && <div className="w-full h-px bg-[#222E3E] my-2.5" />}
      <div className="space-y-1">
        {items.map(item => (
          <NavItemRow key={item.href} item={item} onLinkClick={onLinkClick} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

// ─── Learning Center Panel (fixed overlay in main area) ──────────────────────
function LearningCenterPanel({ onClose }: { onClose: () => void }) {
  const allInsights = useConversationInsights(s => s.insights ?? [])
  const totalKnown = allInsights.length
  const typeColors: Record<string, string> = {
    pain_point: 'bg-red-500', goal: 'bg-emerald-500', priority: 'bg-blue-500',
    risk: 'bg-amber-500', context: 'bg-slate-400', challenge: 'bg-orange-500', preference: 'bg-violet-500',
  }
  const typeLabels: Record<string, string> = {
    pain_point: 'Pain Point', goal: 'Goal', priority: 'Priority',
    risk: 'Risk Signal', context: 'Context', challenge: 'Challenge', preference: 'Preference',
  }
  const grouped = allInsights.reduce<Record<string, typeof allInsights>>((acc, ins) => {
    if (!acc[ins.type]) acc[ins.type] = []
    acc[ins.type].push(ins)
    return acc
  }, {})

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="bg-[#0B1220] border border-[#2A3648] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-[0_40px_80px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A3648] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Learning Journey</h2>
              <p className="text-[10px] text-slate-500">{totalKnown} insight{totalKnown !== 1 ? 's' : ''} captured across all sessions</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {totalKnown === 0 ? (
            <div className="text-center py-16">
              <Brain className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No insights yet</p>
              <p className="text-slate-600 text-xs mt-1">Start a conversation in HiPo Studio. The agent will learn from what you share.</p>
            </div>
          ) : (
            <>
              {/* Knowledge bar */}
              <div className="bg-[#1B2431] border border-[#2A3648] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">Agent Knowledge Level</span>
                  <span className="text-sm font-bold text-violet-400">{Math.min(100, totalKnown * 8)}%</span>
                </div>
                <div className="w-full h-2 bg-[#2A3648] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${Math.min(100, totalKnown * 8)}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-violet-600 to-blue-500 rounded-full"
                  />
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">{totalKnown} insight{totalKnown !== 1 ? 's' : ''} learned · the more you share, the smarter the agent gets</p>
              </div>

              {/* Grouped insights */}
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${typeColors[type] ?? 'bg-slate-500'}`} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{typeLabels[type] ?? type} · {items.length}</h3>
                  </div>
                  <div className="space-y-2">
                    {items.map(ins => (
                      <div key={ins.id} className="flex items-start justify-between gap-3 bg-[#1B2431] border border-[#2A3648] rounded-xl px-4 py-3 hover:border-[#2a3045] transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 leading-snug">{ins.value}</p>
                          {ins.source && <p className="text-[10px] text-slate-600 mt-0.5 italic truncate">"{ins.source.slice(0, 80)}{ins.source.length > 80 ? '…' : ''}"</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${ins.confidence === 'high' ? 'text-green-400 bg-green-500/10 border-green-500/25' : ins.confidence === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/25' : 'text-slate-500 bg-slate-500/10 border-slate-500/25'}`}>
                            {ins.confidence}
                          </span>
                          {ins.applied && <span className="text-[9px] text-violet-400 font-semibold">✓ applied</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ProductTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = TOUR_STEPS[step]

  useEffect(() => { navigate(current.href) }, [step]) // eslint-disable-line

  const next = () => { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else onClose() }
  const prev = () => { if (step > 0) setStep(s => s - 1) }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="fixed bottom-20 left-4 z-50 w-72 bg-[#1B2431] border border-blue-500/20 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        <div className="h-0.5 bg-[#2A3648]">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }} />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Step {step + 1} of {TOUR_STEPS.length}</p>
              <h3 className="font-bold text-white">{current.title}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">{current.body}</p>
          <div className="flex items-center justify-between mt-5">
            <button onClick={prev} disabled={step === 0} className="flex items-center gap-1 text-xs text-slate-500 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button onClick={next} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors">
              {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
              {step < TOUR_STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function Sidebar({ onClose, onStartTour, collapsed, pinned, onToggleCollapse, onLearningClick }: {
  onClose?: () => void
  onStartTour: () => void
  collapsed?: boolean
  pinned?: boolean
  onToggleCollapse?: () => void
  onLearningClick?: () => void
}) {
  const { user, tenant } = useAuthStore()
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore()
  const location = useLocation()
  const isHiPo = location.pathname.startsWith('/hipo-studio') || location.pathname.startsWith('/hipo-studio-v2')
  const totalInsights = useConversationInsights(s => (s.insights ?? []).length)

  return (
    <div className="flex flex-col h-full bg-[#0B1220]">
      {/* Header */}
      <div className={cn('border-b border-[#222E3E] flex-shrink-0', collapsed ? 'px-2 py-3' : 'h-16 px-4 flex items-center')}>
        {collapsed ? (
          // Collapsed: stack icons vertically, all centered
          <div className="flex flex-col items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#0060FF] flex items-center justify-center flex-shrink-0 shadow-[0_0_14px_rgba(0,96,255,0.35)]">
              <AivoraLogo variant="mark" size="xs" color="#FFFFFF" />
            </div>
            <button
              onClick={toggleTheme}
              title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              {themeMode === 'dark'
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-blue-400" />
              }
            </button>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="hidden lg:flex p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          // Expanded: logo on left, action buttons on right
          <div className="flex items-center justify-between w-full">
            <div className="flex flex-col gap-1 min-w-0">
              <AivoraLogo size="md" />
              {tenant && (
                <span className="text-[10px] text-slate-500 leading-none truncate uppercase tracking-wider">{tenant.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {themeMode === 'dark'
                  ? <Sun className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4 text-blue-400" />
                }
              </button>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title={pinned ? 'Unpin sidebar (collapse to a hover rail)' : 'Pin sidebar open'}
                  aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                  className="hidden lg:flex p-1.5 rounded-lg hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                >
                  {pinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                </button>
              )}
              {onClose && (
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white lg:hidden transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-5 space-y-6', collapsed ? 'px-2' : 'px-3')}>
        <NavSection
          title="Platform"
          items={platformNav}
          onLinkClick={onClose}
          collapsed={collapsed}
        />
        <AnimatePresence>
          {isHiPo && (
            <motion.div key="learning-btn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              <div className="relative group/nav">
                <button
                  onClick={() => { onLearningClick?.(); onClose?.() }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-150 border relative',
                    collapsed ? 'px-2.5 py-2.5 justify-center' : 'px-3.5 py-2.5',
                    'text-violet-400 bg-violet-500/8 border-violet-500/20 hover:bg-violet-500/15 hover:border-violet-500/40'
                  )}
                >
                  <Brain className="w-[18px] h-[18px] flex-shrink-0" />
                  {!collapsed && <span className="flex-1 text-left">Learning</span>}
                  {totalInsights > 0 && !collapsed && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded-full font-bold">{totalInsights}</span>
                  )}
                  {totalInsights > 0 && collapsed && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-500 rounded-full text-[8px] text-white font-bold flex items-center justify-center">{totalInsights > 9 ? '9+' : totalInsights}</span>
                  )}
                </button>
                {collapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity hidden lg:block">
                    <div className="bg-[#1B2431] border border-[#2A3648] text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                      <p className="font-semibold text-violet-400">Learning Journey</p>
                      <p className="text-slate-500">{totalInsights} insights captured</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <NavSection title="Tools"    items={toolsNav}    onLinkClick={onClose} collapsed={collapsed} />
        <NavSection title="Account"  items={accountNav}  onLinkClick={onClose} collapsed={collapsed} />

        {isAdminUser(user) && (
          <NavSection title="Admin" items={adminNav} onLinkClick={onClose} collapsed={collapsed} />
        )}
      </nav>

      <div className={cn('py-4 border-t border-[#222E3E] space-y-2', collapsed ? 'px-2' : 'px-3')}>
        {/* Product tour */}
        <div className="relative group/nav">
          <button
            onClick={onStartTour}
            className={cn(
              'w-full flex items-center rounded-xl text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors',
              collapsed ? 'px-2.5 py-2.5 justify-center' : 'gap-3 px-3.5 py-2.5'
            )}
          >
            <HelpCircle className="w-4 h-4 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Product Tour</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
              </>
            )}
          </button>
          {collapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none opacity-0 group-hover/nav:opacity-100 transition-opacity hidden lg:block">
              <div className="bg-[#1B2431] border border-[#2A3648] text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap text-blue-400 font-semibold">
                Product Tour
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className={cn('flex items-center pt-1', collapsed ? 'justify-center px-1' : 'gap-3 px-1.5')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-[0_0_12px_rgba(46,125,250,0.3)]">
            {user ? getInitials(user.name) : '?'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Pinned-open vs collapsed rail. Persisted; defaults to collapsed so the
  // workspace (chat, canvas) gets full width - Claude-style. The collapsed rail
  // expands on hover without pushing content.
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(() => {
    try { return localStorage.getItem('aivora-sidebar-pinned') === '1' } catch { return false }
  })
  const [hovering, setHovering] = useState(false)
  const [tourActive, setTourActive] = useState(false)
  const [learningOpen, setLearningOpen] = useState(false)
  useInsufficientCreditsHandler()

  const togglePinned = () => setSidebarPinned(v => {
    const next = !v
    try { localStorage.setItem('aivora-sidebar-pinned', next ? '1' : '0') } catch { /* ignore */ }
    return next
  })

  // Expanded when pinned open, OR while hovering the collapsed rail.
  const expanded = sidebarPinned || hovering
  const railCollapsed = !expanded

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div className="flex h-screen bg-[#0B1220] overflow-hidden">
      {/* Desktop sidebar - the LAYOUT column reserves only the rail width (60px)
          when not pinned, so content keeps full width; the sidebar itself
          expands as a floating overlay on hover. */}
      <div
        className="hidden lg:block flex-shrink-0 relative z-30"
        style={{ width: sidebarPinned ? 264 : 60 }}
        onMouseEnter={() => !sidebarPinned && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <motion.div
          animate={{ width: expanded ? 264 : 60 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className={cn(
            'absolute left-0 top-0 h-full flex flex-col border-r border-[#222E3E] overflow-hidden bg-[#0B1220]',
            !sidebarPinned && expanded && 'shadow-[8px_0_32px_rgba(0,0,0,0.55)]',
          )}
        >
          <Sidebar
            onStartTour={() => setTourActive(true)}
            collapsed={railCollapsed}
            pinned={sidebarPinned}
            onToggleCollapse={togglePinned}
            onLearningClick={() => setLearningOpen(true)}
          />
        </motion.div>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -264 }} animate={{ x: 0 }} exit={{ x: -264 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-[264px] border-r border-[#222E3E] z-50 lg:hidden"
            >
              <Sidebar onClose={() => setSidebarOpen(false)} onStartTour={() => { setSidebarOpen(false); setTourActive(true) }} onLearningClick={() => setLearningOpen(true)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto bg-[#0B1220]">
          <Outlet />
        </main>
      </div>

      {tourActive && <ProductTour onClose={() => setTourActive(false)} />}

      <AnimatePresence>
        {learningOpen && <LearningCenterPanel onClose={() => setLearningOpen(false)} />}
      </AnimatePresence>

      <ToastContainer />
    </div>
  )
}
