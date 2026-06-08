import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authAPI } from '../lib/api'
import { AivoraLogo } from '../components/brand/AivoraLogo'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, setToken, setTenant } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('Authentication failed. No token received.')
      return
    }

    // Store token then fetch user profile
    setToken(token)
    authAPI.me()
      .then(res => {
        setUser(res.data)
        if (res.data.tenant) setTenant(res.data.tenant)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        setError('Failed to load your profile. Please try again.')
      })
  }, []) // eslint-disable-line

  if (error) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AivoraLogo size="md" className="justify-center" />
          <p className="text-red-600 text-sm">{error}</p>
          <a href="/login" className="text-sm text-white underline">Back to sign in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <AivoraLogo size="md" />
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-4 h-4 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
          Signing you in...
        </div>
      </div>
    </div>
  )
}
