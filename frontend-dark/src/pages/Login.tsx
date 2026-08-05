import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { authAPI } from '../lib/api'
import { fadeUp } from '../lib/animations'
import { AivoraLogo } from '../components/brand/AivoraLogo'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser, setToken, setTenant } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const rawFrom = (location.state as { from?: { pathname: string } })?.from?.pathname
  // Never redirect back to /onboarding on login — onboarding is a one-time post-signup flow
  // Default landing after login is the Advisory Command Centre
  const from = (!rawFrom || rawFrom === '/onboarding') ? '/advisor' : rawFrom

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      let msg: string | null = null
      if (typeof detail === 'string') msg = detail
      else if (Array.isArray(detail)) msg = detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join('; ') || null
      else if (detail && typeof detail === 'object') msg = (detail as { msg?: string }).msg ?? null
      setError(msg || 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
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
    <div className="min-h-screen bg-[#0B1220] flex items-center justify-center p-4">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <AivoraLogo size="md" />
        </div>

        <div className="bg-[#1B2431] rounded-2xl border border-[#222E3E] shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white">Welcome back</h1>
            <p className="text-sm text-slate-600 mt-1">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="secondary"
            className="w-full mb-4"
            isLoading={isGoogleLoading}
            onClick={handleGoogleLogin}
            leftIcon={
              !isGoogleLoading ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              ) : undefined
            }
          >
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[#222E3E]" />
            <span className="text-xs text-slate-600">or sign in with email</span>
            <div className="flex-1 h-px bg-[#222E3E]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              rightElement={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-600 hover:text-[#2E7DFA] transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Button type="submit" isLoading={isLoading} className="w-full">
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-5">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#2E7DFA] font-medium hover:text-[#5B96F5] transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
