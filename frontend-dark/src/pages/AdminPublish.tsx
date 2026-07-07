import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Linkedin, Loader2, ExternalLink, Check, Sparkles, ImageIcon, Layers,
  Type, RefreshCw, ArrowLeft, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { linkedinAPI, type LinkedInStatus, type LinkedInFormat } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

type Visibility = 'PUBLIC' | 'CONNECTIONS'
type Step = 'compose' | 'preview'

const FORMAT_TABS: { id: LinkedInFormat; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: 'single',   label: 'Infographic',  icon: ImageIcon, hint: 'One branded card with headline, bullets and a stat' },
  { id: 'carousel', label: 'Carousel',     icon: Layers,    hint: '5-slide storyboard, one idea per slide' },
  { id: 'text',     label: 'Text only',    icon: Type,      hint: 'Long-form copy, no attached image' },
]

export default function AdminPublish() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null)
  const [step, setStep] = useState<Step>('compose')
  const [format, setFormat] = useState<LinkedInFormat>('single')
  const [prompt, setPrompt] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC')
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [draft, setDraft] = useState<{ caption: string; images: string[]; format: LinkedInFormat } | null>(null)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [last, setLast] = useState<{ url: string } | null>(null)

  const refreshStatus = async () => {
    try {
      const res = await linkedinAPI.getStatus()
      setStatus(res.data)
    } catch {
      setStatus({ connected: false })
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

  const generate = async () => {
    if (prompt.trim().length < 3) return
    setGenerating(true)
    setLast(null)
    try {
      const res = await linkedinAPI.generate({ prompt: prompt.trim(), format })
      setDraft({ caption: res.data.caption, images: res.data.images_base64, format: res.data.format })
      setCarouselIdx(0)
      setStep('preview')
    } catch (err: any) {
      const st = err?.response?.status
      if (st === 403) toast.error('Only admins can generate')
      else toast.error('Could not generate post')
    } finally {
      setGenerating(false)
    }
  }

  const publish = async () => {
    if (!draft || !status?.connected) return
    setPublishing(true)
    try {
      const res = await linkedinAPI.publish({
        caption: draft.caption,
        images_base64: draft.images,
        visibility,
        title: draft.format === 'carousel' ? 'Aivora HC Carousel' : 'Aivora HC Insight',
      })
      toast.success('Posted to LinkedIn')
      setLast({ url: res.data.share_url })
      setDraft(null)
      setPrompt('')
      setStep('compose')
    } catch (err: any) {
      const st = err?.response?.status
      const detail = err?.response?.data?.detail
      if (st === 403) toast.error('Only admins can publish')
      else if (st === 412) toast.error('Connect LinkedIn first')
      else if (st === 502) toast.error(typeof detail === 'string' ? detail : 'LinkedIn rejected the post')
      else toast.error('Could not reach LinkedIn')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="px-5 sm:px-8 py-6 sm:py-7 max-w-4xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#0a66c2]/15 border border-[#0a66c2]/30 flex items-center justify-center flex-shrink-0">
          <Linkedin className="w-5 h-5 text-[#0a66c2]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Publish</h1>
          <p className="text-sm text-slate-400 mt-0.5">Generate a draft, tweak the caption, then post to LinkedIn.</p>
        </div>
      </header>

      {/* Connection strip */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] px-4 py-3 flex items-center gap-3">
        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', status?.connected ? 'bg-emerald-400' : 'bg-slate-600')} />
        <p className="text-sm text-slate-300 flex-1 truncate">
          {status?.connected ? 'LinkedIn connected' : 'Not connected'}
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

      {step === 'compose' && (
        <ComposeStep
          prompt={prompt}
          setPrompt={setPrompt}
          format={format}
          setFormat={setFormat}
          generating={generating}
          onGenerate={generate}
        />
      )}

      {step === 'preview' && draft && (
        <PreviewStep
          draft={draft}
          visibility={visibility}
          setVisibility={setVisibility}
          onCaptionChange={(next) => setDraft({ ...draft, caption: next })}
          carouselIdx={carouselIdx}
          setCarouselIdx={setCarouselIdx}
          onBack={() => setStep('compose')}
          onRegenerate={generate}
          regenerating={generating}
          onPublish={publish}
          publishing={publishing}
          canPublish={!!status?.connected}
        />
      )}

      {last && step === 'compose' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3"
        >
          <Check className="w-4 h-4 text-emerald-300" />
          <p className="text-sm text-emerald-200 flex-1">Published to LinkedIn</p>
          <a
            href={last.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-100"
          >
            View <ExternalLink className="w-3 h-3" />
          </a>
        </motion.div>
      )}
    </div>
  )
}

function ComposeStep({
  prompt, setPrompt, format, setFormat, generating, onGenerate,
}: {
  prompt: string
  setPrompt: (v: string) => void
  format: LinkedInFormat
  setFormat: (f: LinkedInFormat) => void
  generating: boolean
  onGenerate: () => void
}) {
  const canGenerate = prompt.trim().length >= 3 && !generating
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">
          Format
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {FORMAT_TABS.map(t => {
            const active = format === t.id
            return (
              <button
                key={t.id}
                onClick={() => setFormat(t.id)}
                className={cn(
                  'text-left rounded-xl border px-3.5 py-3 transition-colors',
                  active
                    ? 'border-blue-500/40 bg-blue-500/10'
                    : 'border-[#1e2433] bg-[#0c0e14] hover:border-[#2a3048]'
                )}
              >
                <div className="flex items-center gap-2">
                  <t.icon className={cn('w-4 h-4', active ? 'text-blue-300' : 'text-slate-400')} />
                  <span className={cn('text-sm font-semibold', active ? 'text-blue-100' : 'text-slate-200')}>{t.label}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{t.hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          What do you want to post about?
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={6}
          autoFocus
          disabled={generating}
          placeholder={
            format === 'carousel'
              ? 'e.g. Five leadership pipeline mistakes we see at Series B companies, and what to do instead.'
              : format === 'text'
                ? 'e.g. Why annual performance reviews are the wrong ritual for a hybrid workforce.'
                : 'e.g. Why succession planning fails when boards focus only on the CEO seat.'
          }
          className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3.5 py-3 text-[15px] text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 resize-y leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-[#1e2433]">
        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors',
            canGenerate
              ? 'bg-blue-500 hover:bg-blue-400 text-white'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          )}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating…' : 'Generate draft'}
        </button>
      </div>
    </div>
  )
}

function PreviewStep({
  draft, visibility, setVisibility, onCaptionChange, carouselIdx, setCarouselIdx,
  onBack, onRegenerate, regenerating, onPublish, publishing, canPublish,
}: {
  draft: { caption: string; images: string[]; format: LinkedInFormat }
  visibility: Visibility
  setVisibility: (v: Visibility) => void
  onCaptionChange: (v: string) => void
  carouselIdx: number
  setCarouselIdx: (i: number) => void
  onBack: () => void
  onRegenerate: () => void
  regenerating: boolean
  onPublish: () => void
  publishing: boolean
  canPublish: boolean
}) {
  const hasImages = draft.images.length > 0
  const total = draft.images.length
  const showCarousel = draft.format === 'carousel' && total > 1

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Preview panel */}
      <div className="lg:col-span-2 rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Preview</p>
          <button
            onClick={onRegenerate}
            disabled={regenerating || publishing}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs transition-colors',
              regenerating || publishing
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-400 hover:text-blue-300'
            )}
          >
            {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>

        {hasImages ? (
          <div className={cn(
            'relative rounded-xl overflow-hidden border border-[#1e2433] bg-[#0c0e14] transition-opacity',
            regenerating && 'opacity-40'
          )}>
            <img src={draft.images[carouselIdx]} alt="preview" className="w-full h-auto" />
            {regenerating && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            )}
            {showCarousel && (
              <>
                <button
                  onClick={() => setCarouselIdx(Math.max(0, carouselIdx - 1))}
                  disabled={carouselIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg bg-black/60 hover:bg-black/80 disabled:opacity-30 text-white p-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCarouselIdx(Math.min(total - 1, carouselIdx + 1))}
                  disabled={carouselIdx === total - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-black/60 hover:bg-black/80 disabled:opacity-30 text-white p-1.5"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  {draft.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIdx(i)}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-colors',
                        i === carouselIdx ? 'bg-white' : 'bg-white/40 hover:bg-white/60'
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#1e2433] bg-[#0c0e14] py-10 text-center">
            <Type className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Text-only post - no attached image</p>
          </div>
        )}

        {showCarousel && (
          <p className="text-[11px] text-slate-500 text-center">Slide {carouselIdx + 1} of {total}</p>
        )}
      </div>

      {/* Caption + publish panel */}
      <div className="lg:col-span-3 rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Caption · edit before publishing</p>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
        <textarea
          value={draft.caption}
          onChange={e => onCaptionChange(e.target.value)}
          rows={12}
          className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3.5 py-3 text-[14px] text-white focus:outline-none focus:border-blue-500/40 resize-y leading-relaxed"
        />

        <div className="flex items-center justify-between pt-2 border-t border-[#1e2433]">
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
            onClick={onPublish}
            disabled={publishing || !canPublish}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
              publishing || !canPublish
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-[#0a66c2] hover:bg-[#0958a8] text-white'
            )}
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
            {publishing ? 'Publishing…' : 'Publish to LinkedIn'}
          </button>
        </div>
      </div>
    </div>
  )
}
