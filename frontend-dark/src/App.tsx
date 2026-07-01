import { lazy, Suspense, Component, useEffect, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { AdminRoute } from './routes/AdminRoute'
import { AppLayout } from './components/layout/AppLayout'
import { SkeletonPage } from './components/ui/SkeletonLoader'
import { ToastContainer } from './components/ui/Toast'
import { useXpEvents } from './hooks/useXpEvents'
import { useAuthStore } from './store/auth'
import { useThemeStore } from './store/theme'

// Chunk error boundary
interface EBState { hasError: boolean; isChunkError: boolean }
class ChunkErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  private reloadTimer: ReturnType<typeof setTimeout> | null = null

  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, isChunkError: false }
  }
  static getDerivedStateFromError(error: Error): EBState {
    const isChunk = error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('dynamically imported module')
    return { hasError: true, isChunkError: isChunk }
  }
  componentDidCatch(error: Error) {
    const isChunk = error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('dynamically imported module')
    if (isChunk) {
      // auto-reload after a short delay so the spinner shows briefly
      this.reloadTimer = setTimeout(() => window.location.reload(), 1200)
    }
  }
  componentWillUnmount() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
  }
  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        // Show a loading spinner — auto-reload is coming
        return (
          <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-[#1e2433] border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Loading…</p>
            </div>
          </div>
        )
      }
      // Non-chunk error — show a minimal recovery UI
      return (
        <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-red-400 text-xl">!</span>
            </div>
            <div>
              <p className="text-white font-semibold">Something went wrong</p>
              <p className="text-sm text-slate-500 mt-1">An unexpected error occurred.</p>
            </div>
            <button onClick={() => window.location.reload()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazy pages
function lazyPage(importer: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() => importer().catch(e => {
    if (e.message?.includes('Failed to fetch dynamically imported module')) window.location.reload()
    throw e
  }))
}

const Landing           = lazyPage(() => import('./pages/Landing'))
const Login             = lazyPage(() => import('./pages/Login'))
const Signup            = lazyPage(() => import('./pages/Signup'))
const Onboarding        = lazyPage(() => import('./pages/Onboarding'))
const Dashboard         = lazyPage(() => import('./pages/Dashboard'))
const Workspaces        = lazyPage(() => import('./pages/Workspaces'))
const WorkspaceDetail   = lazyPage(() => import('./pages/WorkspaceDetail'))
const SkillStudio       = lazyPage(() => import('./pages/SkillStudio'))
const ChallengeBrief    = lazyPage(() => import('./pages/ChallengeBrief'))
const BriefResults      = lazyPage(() => import('./pages/BriefResults'))
const Engage            = lazyPage(() => import('./pages/Engage'))
const HipoStudioV2      = lazyPage(() => import('./pages/HipoStudio').then(m => ({ default: m.HipoStudioV2 })))
const DraftInbox        = lazyPage(() => import('./pages/DraftInbox'))
const ExportsPage       = lazyPage(() => import('./pages/ExportsPage'))
const AdminPublish      = lazyPage(() => import('./pages/AdminPublish'))
const SkillsMarketplace = lazyPage(() => import('./pages/SkillsMarketplace'))
const Gamification      = lazyPage(() => import('./pages/Gamification'))
const Billing           = lazyPage(() => import('./pages/Billing'))
const Settings          = lazyPage(() => import('./pages/Settings'))
const AdminDashboard    = lazyPage(() => import('./pages/AdminDashboard'))
const AuthCallback      = lazyPage(() => import('./pages/AuthCallback'))
const NotFound          = lazyPage(() => import('./pages/NotFound'))
const CanvasPage        = lazyPage(() => import('./pages/CanvasPage'))
const AdvisorChat       = lazyPage(() => import('./pages/AdvisorChat'))
const KnowledgeBase     = lazyPage(() => import('./pages/KnowledgeBase'))
const StudioRunner      = lazyPage(() => import('./pages/StudioRunner'))

function AppRoutes() {
  const loadFromStorage = useAuthStore(s => s.loadFromStorage)
  const themeMode = useThemeStore(s => s.mode)
  useEffect(() => { loadFromStorage() }, [loadFromStorage])
  useXpEvents()

  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('dark', themeMode === 'dark')
    html.classList.toggle('light', themeMode === 'light')
  }, [themeMode])

  return (
    <Suspense fallback={<SkeletonPage />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected — rendered inside AppLayout (which uses <Outlet>) */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workspaces" element={<Workspaces />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
          <Route path="/workspaces/:workspaceId/skills/:skillId" element={<SkillStudio />} />
          <Route path="/canvas" element={<CanvasPage />} />
          <Route path="/canvas/:draftId" element={<CanvasPage />} />
          <Route path="/workspaces/:id/hipo" element={<HipoStudioV2 />} />
          <Route path="/hipo-studio" element={<HipoStudioV2 />} />
          <Route path="/hipo-studio-v2" element={<HipoStudioV2 />} />
          <Route path="/challenge-brief" element={<ChallengeBrief />} />
          <Route path="/brief-results/:reviewId" element={<BriefResults />} />
          <Route path="/inbox" element={<DraftInbox />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/publish" element={<AdminRoute><AdminPublish /></AdminRoute>} />
          <Route path="/skills" element={<SkillsMarketplace />} />
          <Route path="/gamification" element={<Gamification />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/engage" element={<Engage />} />
          <Route path="/advisor" element={<AdvisorChat />} />
          <Route path="/knowledge" element={<AdminRoute><KnowledgeBase /></AdminRoute>} />
          <Route path="/studio/:studioId" element={<StudioRunner />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AppLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ChunkErrorBoundary>
      <AppRoutes />
      <ToastContainer />
    </ChunkErrorBoundary>
  )
}
