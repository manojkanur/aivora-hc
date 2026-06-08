import { lazy, Suspense, Component, useEffect, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { AdminRoute } from './routes/AdminRoute'
import { AppLayout } from './components/layout/AppLayout'
import { SkeletonPage } from './components/ui/SkeletonLoader'
import { ToastContainer } from './components/ui/Toast'
import { useXpEvents } from './hooks/useXpEvents'
import { useAuthStore } from './store/auth'

// Chunk error boundary
interface EBState { hasError: boolean }
class ChunkErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(): EBState { return { hasError: true } }
  componentDidCatch(error: Error) {
    if (error.message.includes('Loading chunk') ||
        error.message.includes('Failed to fetch dynamically imported module')) {
      window.location.reload()
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h1>
            <button onClick={() => window.location.reload()}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
              Reload Page
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
const DraftInbox        = lazyPage(() => import('./pages/DraftInbox'))
const ExportsPage       = lazyPage(() => import('./pages/ExportsPage'))
const PublishPage       = lazyPage(() => import('./pages/PublishPage'))
const SkillsMarketplace = lazyPage(() => import('./pages/SkillsMarketplace'))
const Gamification      = lazyPage(() => import('./pages/Gamification'))
const Billing           = lazyPage(() => import('./pages/Billing'))
const Settings          = lazyPage(() => import('./pages/Settings'))
const Engage            = lazyPage(() => import('./pages/Engage'))
const AdminDashboard    = lazyPage(() => import('./pages/AdminDashboard'))
const AuthCallback      = lazyPage(() => import('./pages/AuthCallback'))
const NotFound          = lazyPage(() => import('./pages/NotFound'))

function AppRoutes() {
  const loadFromStorage = useAuthStore(s => s.loadFromStorage)
  useEffect(() => { loadFromStorage() }, [loadFromStorage])
  useXpEvents()

  return (
    <Suspense fallback={<SkeletonPage />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Protected — rendered inside AppLayout (which uses <Outlet>) */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workspaces" element={<Workspaces />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
          <Route path="/workspaces/:workspaceId/skills/:skillId" element={<SkillStudio />} />
          <Route path="/challenge-brief" element={<ChallengeBrief />} />
          <Route path="/inbox" element={<DraftInbox />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/skills" element={<SkillsMarketplace />} />
          <Route path="/gamification" element={<Gamification />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/engage" element={<Engage />} />
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
