import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Linkedin, Image as ImageIcon, Layers, FileText, X, Upload, Loader2, ExternalLink, Check } from 'lucide-react'
import { linkedinAPI, type LinkedInStatus } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

type Mode = 'image' | 'carousel' | 'pdf'
type Visibility = 'PUBLIC' | 'CONNECTIONS'

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(file)
  })
}

export default function AdminPublish() {
  const [mode, setMode] = useState<Mode>('image')
  const [status, setStatus] = useState<LinkedInStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC')
  const [title, setTitle] = useState('Aivora HC deliverable')
  const [singleImage, setSingleImage] = useState<string | null>(null)
  const [carousel, setCarousel] = useState<string[]>([])
  const [pdfData, setPdfData] = useState<{ name: string; dataUrl: string } | null>(null)
  const [posting, setPosting] = useState(false)
  const [lastPostUrl, setLastPostUrl] = useState<string | null>(null)
  const singleRef = useRef<HTMLInputElement | null>(null)
  const carouselRef = useRef<HTMLInputElement | null>(null)
  const pdfRef = useRef<HTMLInputElement | null>(null)

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

  const onSingleFile = async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file')
    setSingleImage(await fileToDataUrl(file))
  }

  const onCarouselFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: string[] = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      next.push(await fileToDataUrl(f))
    }
    setCarousel(prev => [...prev, ...next].slice(0, 20))
  }

  const onPdfFile = async (file: File | null | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return toast.error('Choose a PDF file')
    }
    setPdfData({ name: file.name, dataUrl: await fileToDataUrl(file) })
  }

  const readyToPost = () => {
    if (!status?.connected) return false
    if (!caption.trim()) return false
    if (mode === 'image') return !!singleImage
    if (mode === 'carousel') return carousel.length >= 2
    if (mode === 'pdf') return !!pdfData
    return false
  }

  const submit = async () => {
    if (!readyToPost()) {
      toast.error('Fill caption and add media')
      return
    }
    setPosting(true)
    setLastPostUrl(null)
    try {
      let res
      if (mode === 'image') {
        res = await linkedinAPI.share({
          caption: caption.trim(),
          image_base64: singleImage!,
          visibility,
        })
      } else if (mode === 'carousel') {
        res = await linkedinAPI.shareCarousel({
          caption: caption.trim(),
          images_base64: carousel,
          visibility,
          title: title.trim() || undefined,
        })
      } else {
        res = await linkedinAPI.sharePdf({
          caption: caption.trim(),
          pdf_base64: pdfData!.dataUrl,
          visibility,
          title: title.trim() || undefined,
        })
      }
      toast.success('Posted to LinkedIn')
      setLastPostUrl(res.data.share_url)
      // Reset media, keep caption for iteration
      setSingleImage(null)
      setCarousel([])
      setPdfData(null)
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
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#0a66c2]/15 border border-[#0a66c2]/30 flex items-center justify-center flex-shrink-0">
          <Linkedin className="w-5 h-5 text-[#0a66c2]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Publish to LinkedIn</h1>
          <p className="text-sm text-slate-400 mt-1">Admin-only. Post images, carousels, or PDF carousels directly.</p>
        </div>
      </header>

      {/* Connection strip */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] px-5 py-4 flex items-center gap-4">
        <div className={cn(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          status?.connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'
        )} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {loadingStatus ? 'Checking…' : status?.connected ? 'LinkedIn connected' : 'Not connected'}
          </p>
          {status?.connected && status.expires_at && (
            <p className="text-[11px] text-slate-500 mt-0.5">Token expires {new Date(status.expires_at).toLocaleDateString()}</p>
          )}
        </div>
        {status?.connected ? (
          <button onClick={handleDisconnect} className="text-sm text-slate-400 hover:text-rose-400 transition-colors">
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0a66c2] hover:bg-[#0958a8] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <Linkedin className="w-4 h-4" /> Connect LinkedIn
          </button>
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-2">
        {([
          { id: 'image', label: 'Single image', icon: ImageIcon },
          { id: 'carousel', label: 'Carousel', icon: Layers },
          { id: 'pdf', label: 'PDF carousel', icon: FileText },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
              mode === t.id
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                : 'bg-[#0f1117] border-[#1e2433] text-slate-400 hover:text-white'
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Media picker */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 sm:p-6 space-y-4">
        {mode === 'image' && (
          <>
            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Image</p>
            {singleImage ? (
              <div className="relative rounded-xl overflow-hidden border border-[#1e2433] max-w-lg">
                <img src={singleImage} alt="preview" className="w-full h-auto" />
                <button
                  onClick={() => setSingleImage(null)}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-black/70 hover:bg-black text-white px-2 py-1 text-xs"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            ) : (
              <UploadDrop
                accept="image/*"
                onFiles={files => onSingleFile(files?.[0])}
                onClick={() => singleRef.current?.click()}
                hint="PNG or JPG, 1080×1080 recommended"
              />
            )}
            <input ref={singleRef} type="file" accept="image/*" className="hidden" onChange={e => onSingleFile(e.target.files?.[0])} />
          </>
        )}

        {mode === 'carousel' && (
          <>
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Carousel</p>
              <span className="text-xs text-slate-500">· {carousel.length}/20 · min 2</span>
            </div>
            {carousel.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {carousel.map((src, i) => (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-[#1e2433] aspect-square bg-[#0c0e14]">
                    <img src={src} alt={`slide ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1.5 left-1.5 rounded-md bg-black/70 text-white text-[10px] px-1.5 py-0.5 font-semibold">{i + 1}</div>
                    <button
                      onClick={() => setCarousel(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1.5 right-1.5 rounded-md bg-black/70 hover:bg-black text-white p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <UploadDrop
              accept="image/*"
              multiple
              onFiles={files => onCarouselFiles(files)}
              onClick={() => carouselRef.current?.click()}
              hint="Add multiple images. Order = slide order."
            />
            <input ref={carouselRef} type="file" accept="image/*" multiple className="hidden" onChange={e => onCarouselFiles(e.target.files)} />
          </>
        )}

        {mode === 'pdf' && (
          <>
            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">PDF (each page becomes a carousel slide, max 20)</p>
            {pdfData ? (
              <div className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-rose-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{pdfData.name}</p>
                  <p className="text-[11px] text-slate-500">Ready to publish</p>
                </div>
                <button onClick={() => setPdfData(null)} className="text-slate-500 hover:text-rose-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <UploadDrop
                accept="application/pdf"
                onFiles={files => onPdfFile(files?.[0])}
                onClick={() => pdfRef.current?.click()}
                hint="We rasterize each page at 150 DPI before posting."
              />
            )}
            <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={e => onPdfFile(e.target.files?.[0])} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 sm:p-6 space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Caption</label>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={5}
            placeholder="Write the post body. Line breaks are preserved on LinkedIn."
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none resize-y"
          />
        </div>

        {(mode === 'carousel' || mode === 'pdf') && (
          <div>
            <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Media title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Aivora HC deliverable"
              className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-1.5">Visibility</label>
          <div className="flex gap-2">
            {(['PUBLIC', 'CONNECTIONS'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs border font-semibold transition-colors',
                  visibility === v
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-[#0c0e14] text-slate-300 border-[#1e2433] hover:border-[#2a3048]'
                )}
              >
                {v === 'PUBLIC' ? 'Public' : 'Connections only'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#1e2433]">
          <div className="text-xs text-slate-500">
            {status?.connected ? (
              <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> Ready to post as <span className="text-slate-300 font-medium">{status.linkedin_user_id}</span></span>
            ) : (
              <span>Connect LinkedIn first</span>
            )}
          </div>
          <button
            onClick={submit}
            disabled={posting || !readyToPost()}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors',
              posting || !readyToPost()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-[#0a66c2] hover:bg-[#0958a8] text-white'
            )}
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Linkedin className="w-4 h-4" />}
            {posting ? 'Posting…' : 'Publish now'}
          </button>
        </div>
      </div>

      {lastPostUrl && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200 flex items-center gap-3">
          <Check className="w-4 h-4" />
          <span className="flex-1">Published successfully.</span>
          <a href={lastPostUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-semibold">
            View on LinkedIn <ExternalLink className="w-3 h-3" />
          </a>
        </motion.div>
      )}
    </div>
  )
}

function UploadDrop({
  accept, multiple, onFiles, onClick, hint,
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: FileList | null) => void
  onClick: () => void
  hint: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={e => { e.preventDefault(); setHover(true) }}
      onDragLeave={() => setHover(false)}
      onDrop={e => { e.preventDefault(); setHover(false); onFiles(e.dataTransfer.files) }}
      className={cn(
        'w-full rounded-xl border-2 border-dashed py-10 flex flex-col items-center justify-center gap-2 transition-colors',
        hover
          ? 'border-blue-500/60 bg-blue-500/5'
          : 'border-[#1e2433] bg-[#0c0e14] hover:border-[#2a3048]'
      )}
    >
      <Upload className="w-6 h-6 text-slate-500" />
      <div className="text-sm text-slate-300 font-semibold">Click to select {multiple ? 'files' : 'a file'} or drop here</div>
      <div className="text-xs text-slate-500">{hint}</div>
      <input type="hidden" data-accept={accept} />
    </button>
  )
}
