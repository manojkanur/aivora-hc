import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, EyeOff, Target, Sparkles, BarChart3, Building2, Check,
} from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { authAPI } from '../lib/api'
import { fadeUp } from '../lib/animations'
import { AivoraLogo } from '../components/brand/AivoraLogo'

type Mode = 'login' | 'signup'

const pillars = [
  {
    icon: Building2,
    title: 'Smart client onboarding',
    desc: 'Capture industry, region, priorities and workforce challenges in five structured steps.',
  },
  {
    icon: Target,
    title: 'Challenge Brief',
    desc: 'Frame the advisory problem, HC domains and constraints — pre-filled from your client profile.',
  },
  {
    icon: Sparkles,
    title: '27 HC studios',
    desc: 'Every studio inherits your client context and returns board-ready output in minutes.',
  },
  {
    icon: BarChart3,
    title: 'Export & publish',
    desc: 'Ship as PPTX, PDF or DOCX under your brand kit, or publish straight to LinkedIn.',
  },
]

const proofPoints = ['AI-drafted, consultant-reviewed', 'Your brand kit on every export', 'Evidence trail on every claim']

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

/** Normalise a FastAPI `detail` payload (string | array | object) into one message. */
function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join('; ') || fallback
  }
  if (detail && typeof detail === 'object') return (detail as { msg?: string }).msg ?? fallback
  return fallback
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser, setToken, setTenant, isAuthenticated } = useAuthStore()

  // The URL picks the opening tab; the in-page toggle then switches it without navigating,
  // so a half-filled form survives the swap.
  const [mode, setMode] = useState<Mode>(location.pathname === '/signup' ? 'signup' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const rawFrom = (location.state as { from?: { pathname: string } })?.from?.pathname
  // Never redirect back to /onboarding on login — onboarding is a one-time post-signup flow.
  const from = (!rawFrom || rawFrom === '/onboarding') ? '/advisor' : rawFrom

  if (isAuthenticated) return <Navigate to={from} replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return }
    setError('')
    setIsLoading(true)
    try {
      const res = await authAPI.login(email, password)
      setToken(res.data.token)
      setUser(res.data.user)
      if (res.data.tenant) setTenant(res.data.tenant)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(errorMessage(err, 'Invalid email or password'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!name || !email || !password || !confirm) { setError('Please fill in all fields'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!agreedToTerms) { setError('Please agree to the terms of service'); return }
    setError('')
    setIsLoading(true)
    try {
      const res = await authAPI.signup(name, email, password)
      setToken(res.data.token)
      setUser(res.data.user)
      if (res.data.tenant) setTenant(res.data.tenant)
      // Only send to onboarding if not already completed (guards against stale state)
      try {
        const stored = localStorage.getItem('aivora-client-profile')
        const parsed = stored ? JSON.parse(stored) : null
        const alreadyCompleted = parsed?.state?.isCompleted === true
        navigate(alreadyCompleted ? '/advisor' : '/onboarding', { replace: true })
      } catch {
        navigate('/onboarding', { replace: true })
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create account. Please try again.'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'login') handleLogin()
    else handleSignup()
  }

  const handleGoogle = async () => {
    setIsGoogleLoading(true)
    try {
      const res = await authAPI.googleAuthUrl()
      window.location.href = res.data.url
    } catch {
      setError('Failed to initiate Google sign-in')
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1220] lg:grid lg:grid-cols-2">
      {/* ── Left: product story on a white surface (desktop only; a compact header stands in on mobile) ── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-white border-r border-[#E7ECF2] p-12 xl:p-16">
        {/* Ambient brand wash — kept faint so the surface still reads as white */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[#0060FF]/10 blur-[120px]" />
          <div className="absolute bottom-0 -right-20 h-80 w-80 rounded-full bg-[#0F9C82]/10 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(to right, #E7ECF2 1px, transparent 1px), linear-gradient(to bottom, #E7ECF2 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse at 30% 20%, black, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse at 30% 20%, black, transparent 75%)',
            }}
          />
        </div>

        <div className="relative">
          {/* `inverted` forces the blue wordmark — the white logo would vanish on this surface. */}
          <AivoraLogo size="md" inverted />
        </div>

        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative max-w-lg py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#0F9C82]/25 bg-[#0F9C82]/10 px-3 py-1 text-xs font-semibold text-[#0F9C82]">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered HC advisory
          </span>

          <h1 className="mt-6 text-4xl xl:text-[2.75rem] font-bold leading-[1.12] text-[#0B1220]">
            Turn client context into
            <span className="block text-[#175FCC]">board-ready HC advisory.</span>
          </h1>

          <p className="mt-5 text-base leading-relaxed text-[#5F6B7A]">
            Aivora carries one client profile through onboarding, brief, and delivery — so every studio
            you run is grounded in the same evidence, and every export ships under your brand.
          </p>

          <ul className="mt-10 space-y-6">
            {pillars.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E7ECF2] bg-[#FAFBFC]">
                  <Icon className="h-[18px] w-[18px] text-[#175FCC]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0B1220]">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#5F6B7A]">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>

        <div className="relative flex flex-wrap gap-x-6 gap-y-2">
          {proofPoints.map(p => (
            <span key={p} className="inline-flex items-center gap-2 text-xs font-medium text-[#5F6B7A]">
              <Check className="h-3.5 w-3.5 text-[#0F9C82]" />
              {p}
            </span>
          ))}
        </div>
      </aside>

      {/* ── Right: auth cards ── */}
      <main className="flex min-h-screen items-center justify-center p-6 sm:p-10">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="w-full max-w-sm">
          {/* Mobile-only brand + one-liner, replacing the left panel */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <AivoraLogo size="md" />
            <p className="text-center text-sm text-slate-500">
              AI-powered HC advisory — from client context to board-ready output.
            </p>
          </div>

          {/* Mode toggle */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/60 bg-[#131C29] p-1">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`relative rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  mode === m ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-lg bg-[#1B2431] border border-white/40"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{m === 'login' ? 'Sign in' : 'Create account'}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white bg-[#1B2431] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-white">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-1 text-sm text-white">
                {mode === 'login'
                  ? 'Sign in to your advisory workspace'
                  : 'Start your HC advisory platform today'}
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              className="mb-4 w-full"
              isLoading={isGoogleLoading}
              onClick={handleGoogle}
              leftIcon={!isGoogleLoading ? <GoogleIcon /> : undefined}
            >
              Continue with Google
            </Button>

            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#222E3E]" />
              <span className="text-xs text-white">
                or {mode === 'login' ? 'sign in' : 'sign up'} with email
              </span>
              <div className="h-px flex-1 bg-[#222E3E]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 [&_label]:text-white">
              <AnimatePresence initial={false}>
                {mode === 'signup' && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <Input
                      className="border-white hover:border-white"
                      label="Full Name"
                      type="text"
                      placeholder="Alex Johnson"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <Input
                className="border-white hover:border-white"
                label={mode === 'login' ? 'Email' : 'Work Email'}
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />

              <Input
                className="border-white hover:border-white"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                helperText={mode === 'signup' ? 'Must be at least 8 characters' : undefined}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="text-slate-600 transition-colors hover:text-[#2E7DFA]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <AnimatePresence initial={false}>
                {mode === 'signup' && (
                  <motion.div
                    key="signup-extras"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <Input
                      className="border-white hover:border-white"
                      label="Confirm Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={e => setAgreedToTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#2A3648] bg-[#1B2431] accent-[#2E7DFA]"
                      />
                      <span className="text-sm text-slate-500">
                        I agree to the{' '}
                        <a href="#" className="font-medium text-[#2E7DFA] transition-colors hover:text-[#5B96F5]">Terms of Service</a>
                        {' '}and{' '}
                        <a href="#" className="font-medium text-[#2E7DFA] transition-colors hover:text-[#5B96F5]">Privacy Policy</a>
                      </span>
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" isLoading={isLoading} className="w-full">
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-white">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="font-medium text-[#2E7DFA] transition-colors hover:text-[#5B96F5]"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
