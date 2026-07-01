import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Linkedin, Loader2, ExternalLink, Check, Sparkles } from 'lucide-react'
import { linkedinAPI, type LinkedInStatus } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

type Visibility = 'PUBLIC' | 'CONNECTIONS'

export default function AdminPublish() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC')
  const [posting, setPosting] = useState(false)
  const [last, setLast] = useState<{ url: string; caption?: string } | null>(null)

  const refreshStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await linkedinAPI.getStatus()
      setStatus(res.data)
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    refreshStatus()
    const params = new URLSearchParams(window.location.search)
    if (params.get('linkedin') === 'connected') {
      toast.success('LinkedIn connected')
      params.delete('linkedin')
      const q = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
    } else if (params.get('linkedin') === 'error') {
      toast.error('LinkedIn connection failed')
      params.delete('linkedin')
      const q = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
    }
  }, [])

  const handleConnect = async () => {
    try {
      const res = await linkedinAPI.getConnectUrl()
      window.location.href = res.data.url
    } catch {
      toast.error('Could not start LinkedIn connection')
    }
  }

  const handleDisconnect = async () => {
    try {
      await linkedinAPI.disconnect()
      toast.success('LinkedIn disconnected')
      await refreshStatus()
    } catch {
      toast.error('Failed to disconnect LinkedIn')
    }
  }

  const canPost = !!status?.connected && prompt.trim().length >= 3 && !posting

  const submit = async () => {
    if (!canPost) return
    setPosting(true)
    setLast(null)
    try {
      const res = await linkedinAPI.sharePrompt({
        prompt: prompt.trim(),
        visibility,
      })
      toast.success('Posted to LinkedIn')
      setLast({ url: res.data.share_url, caption: res.data.caption })
      setPrompt('')
    } catch (err: any) {
      const st = err?.response?.status
      const detail = err?.response?.data?.detail
      if (st === 403) toast.error('Only admins can publish')
      else if (st === 412) toast.error('Connect LinkedIn first')
      else if (st === 502) toast.error(typeof detail === 'string' ? detail : 'LinkedIn rejected the post')
      else if (st === 503) toast.error(typeof detail === 'string' ? detail : 'LinkedIn integration unavailable')
      else toast.error('Could not reach LinkedIn')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="px-5 sm:px-8 py-6 sm:py-7 max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#0a66c2]/15 border border-[#0a66c2]/30 flex items-center justify-center flex-shrink-0">
          <Linkedin className="w-5 h-5 text-[#0a66c2]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Publish</h1>
          <p className="text-sm text-slate-400 mt-0.5">Prompt in. Post out. The Aivora brand card is added automatically.</p>
        </div>
      </header>

      {/* Connection strip */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] px-4 py-3 flex items-center gap-3">
        <div className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          status?.connected ? 'bg-emerald-400' : 'bg-slate-600'
        )} />
        <p className="text-sm text-slate-300 flex-1 truncate">
          {loadingStatus ? 'Checking…' : status?.connected ? 'LinkedIn connected' : 'Not connected'}
        </p>
        {status?.connected ? (
          <button onClick={handleDisconnect} className="text-xs text-slate-500 hover:text-rose-400 transition-colors">
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a66c2] hover:bg-[#0958a8] text-white px-3 py-1.5 text-xs font-semibold"
          >
            <Linkedin className="w-3.5 h-3.5" /> Connect
          </button>
        )}
      </div>

      {/* Prompt composer */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 space-y-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          What do you want to post about?
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={5}
          autoFocus
          disabled={posting}
          placeholder="e.g. Why succession planning fails when boards focus only on the CEO seat, and the three levels below they always forget."
          className="w-full bg-transparent text-[15px] text-white placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed"
        />

        <div className="flex items-center justify-between pt-3 border-t border-[#1e2433]">
          <div className="flex gap-2">
            {(['PUBLIC', 'CONNECTIONS'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors',
                  visibility === v
                    ? 'bg-blue-500/15 text-blue-200 border-blue-500/40'
                    : 'bg-transparent text-slate-500 border-[#1e2433] hover:text-slate-300'
                )}
              >
                {v === 'PUBLIC' ? 'Public' : 'Connections'}
              </button>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={!canPost}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
              canPost
                ? 'bg-[#0a66c2] hover:bg-[#0958a8] text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            )}
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {last && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <Check className="w-4 h-4" /> Published
          </div>
          {last.caption && (
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap border-l-2 border-emerald-500/40 pl-3">
              {last.caption}
            </p>
          )}
          <a
            href={last.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-100"
          >
            View on LinkedIn <ExternalLink className="w-3 h-3" />
          </a>
        </motion.div>
      )}
    </div>
  )
}
