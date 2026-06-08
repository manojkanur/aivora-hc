import { useState, useEffect } from 'react'
import { NavLink, useLocation, Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Briefcase, FileEdit, Inbox, Download,
  Share2, Settings, CreditCard, X, ShieldCheck, Sparkles,
  Menu, Workflow, HelpCircle, ChevronRight, ChevronLeft, ArrowRight,
} from 'lucide-react'
import { AivoraLogo } from '../brand/AivoraLogo'
import { useAuthStore } from '../../store/auth'
import { getInitials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { TopBar } from './TopBar'
import { ToastContainer, useInsufficientCreditsHandler } from '../ui/Toast'

// ─── Nav config with descriptions ────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  desc: string
}

const platformNav: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard',  icon: LayoutDashboard, desc: 'Overview of your workspaces, credits and activity'   },
  { label: 'New Brief',   href: '/engage',     icon: Workflow,        desc: 'Run a 5-step guided HC advisory workflow'             },
  { label: 'Workspaces',  href: '/workspaces', icon: Briefcase,       desc: 'Client projects — each holds studios and drafts'      },
  { label: 'Studios',     href: '/skills',     icon: Sparkles,        desc: '27 specialised HC advisory studios powered by AI'     },
]

const toolsNav: NavItem[] = [
  { label: 'Challenge Brief', href: '/challenge-brief', icon: FileEdit, desc: 'Run multiple studios at once against a single brief' },
  { label: 'Draft Inbox',     href: '/inbox',            icon: Inbox,    desc: 'Review and approve AI-generated drafts'             },
  { label: 'Exports',         href: '/exports',          icon: Download, desc: 'Download approved drafts as PPTX, PDF or Word'      },
  { label: 'Publish',         href: '/publish',          icon: Share2,   desc: 'Schedule LinkedIn posts from your deliverables'     },
]

const accountNav: NavItem[] = [
  { label: 'Billing',  href: '/billing',  icon: CreditCard, desc: 'Manage your plan and credit balance'     },
  { label: 'Settings', href: '/settings', icon: Settings,   desc: 'Profile, brand kit and team members'    },
]

// ─── Product tour steps ───────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    href: '/dashboard',
    title: 'Dashboard',
    body: 'Your home base. See active workspaces, credits remaining, and recent activity at a glance.',
  },
  {
    href: '/engage',
    title: 'New Brief',
    body: 'The fastest way to get a deliverable. Fill a brief, pick one HC studio, let AI generate the output, approve it, and export — all in one flow.',
  },
  {
    href: '/workspaces',
    title: 'Workspaces',
    body: 'Create one workspace per client. Inside each workspace you can run any of the 27 HC studios, review drafts, and download exports.',
  },
  {
    href: '/skills',
    title: 'Studios',
    body: '27 specialised advisory modules — from HC Strategy Charter to Leadership Pipeline. Each studio takes your context and generates a structured, client-ready output.',
  },
  {
    href: '/challenge-brief',
    title: 'Challenge Brief',
    body: 'Need to run several studios at once? Create a brief here and queue multiple studios in a single job.',
  },
  {
    href: '/inbox',
    title: 'Draft Inbox',
    body: 'Every AI-generated draft lands here for your review. Approve to unlock export, or edit before approving.',
  },
  {
    href: '/exports',
    title: 'Exports',
    body: 'Download approved drafts as PowerPoint, PDF, or Word — ready to hand to the client.',
  },
]

// ─── Nav item with tooltip ────────────────────────────────────────────────────

function NavItemRow({ item, onLinkClick, tourStep }: { item: NavItem; onLinkClick?: () => void; tourStep?: number }) {
  const [showTip, setShowTip] = useState(false)

  return (
    <div className="relative group/nav">
      <NavLink
        to={item.href}
        onClick={onLinkClick}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            isActive
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
          )
        }
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
      </NavLink>

      {/* Description tooltip on hover */}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none
                      opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 hidden lg:block">
        <div className="bg-zinc-950 text-white text-xs rounded-lg px-3 py-2 w-52 shadow-xl leading-relaxed">
          <p className="font-semibold mb-0.5">{item.label}</p>
          <p className="text-zinc-400">{item.desc}</p>
        </div>
      </div>
    </div>
  )
}

function NavSection({ title, items, onLinkClick }: { title: string; items: NavItem[]; onLinkClick?: () => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider px-3 mb-1">{title}</p>
      {items.map(item => (
        <NavItemRow key={item.href} item={item} onLinkClick={onLinkClick} />
      ))}
    </div>
  )
}

// ─── Product tour overlay ─────────────────────────────────────────────────────

function ProductTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = TOUR_STEPS[step]

  useEffect(() => {
    navigate(current.href)
  }, [step]) // eslint-disable-line

  const next = () => { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else onClose() }
  const prev = () => { if (step > 0) setStep(s => s - 1) }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="fixed bottom-20 left-4 z-50 w-72 bg-zinc-950 text-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Step {step + 1} of {TOUR_STEPS.length}</p>
              <h3 className="font-bold text-white">{current.title}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-zinc-400 leading-relaxed">{current.body}</p>

          <div className="flex items-center justify-between mt-5">
            <button
              onClick={prev}
              disabled={step === 0}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-100 transition-colors"
            >
              {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
              {step < TOUR_STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ onClose, onStartTour }: { onClose?: () => void; onStartTour: () => void }) {
  const { user, tenant } = useAuthStore()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex flex-col gap-0.5 min-w-0">
          <AivoraLogo size="sm" />
          {tenant && (
            <span className="text-xs text-text-muted leading-none truncate pl-9">{tenant.name}</span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-tertiary text-text-muted lg:hidden">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <NavSection title="Platform" items={platformNav} onLinkClick={onClose} />
        <NavSection title="Tools"    items={toolsNav}    onLinkClick={onClose} />
        <NavSection title="Account"  items={accountNav}  onLinkClick={onClose} />

        {(user?.role === 'admin' || user?.role === 'owner') && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider px-3 mb-1">Admin</p>
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                )
              }
            >
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              Admin Dashboard
            </NavLink>
          </div>
        )}
      </nav>

      {/* Bottom: Tour + User */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {/* Product tour button */}
        <button
          onClick={onStartTour}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-tertiary hover:text-text-primary transition-colors"
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">Product Tour</span>
          <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user ? getInitials(user.name) : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourActive, setTourActive] = useState(false)
  useInsufficientCreditsHandler()

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div className="flex h-screen bg-surface-secondary overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0 border-r border-border bg-white">
        <Sidebar onStartTour={() => setTourActive(true)} />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-64 bg-white border-r border-border z-50 lg:hidden"
            >
              <Sidebar onClose={() => setSidebarOpen(false)} onStartTour={() => { setSidebarOpen(false); setTourActive(true) }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Product Tour */}
      {tourActive && <ProductTour onClose={() => setTourActive(false)} />}

      <ToastContainer />
    </div>
  )
}
