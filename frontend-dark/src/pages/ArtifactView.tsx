import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import StudioOutput, { type StudioOutputDocument } from '../components/studio/renderer/StudioRenderer'
import { AivoraLogo } from '../components/brand/AivoraLogo'

/**
 * Public, unauthenticated view of a shared advisory report (client #5).
 *
 * Reached at /a/:token. Fetches the report via the PUBLIC endpoint with a
 * plain fetch (NOT the app's axios instance, which would 401-redirect a
 * logged-out viewer). Renders the live report with the same StudioRenderer
 * the in-app pane uses, so charts/heatmaps/tables are fully interactive.
 */

interface ArtifactPayload {
  report_document: StudioOutputDocument | Record<string, unknown>
  report_kind: 'detailed' | 'summary'
  meta: {
    studio_name?: string | null
    subtitle?: string | null
    report_kind?: string
    generated_at?: string | null
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function ArtifactView() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ArtifactPayload | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'gone'>('loading')

  useEffect(() => {
    let cancelled = false
    if (!token) { setStatus('gone'); return }
    fetch(`/api/v1/hc-platform/ai-advisory/public/artifact/${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((payload: ArtifactPayload) => {
        if (cancelled) return
        setData(payload)
        setStatus('ok')
        const name = payload.meta?.studio_name
        if (name) document.title = `${name} · Aivora HC`
      })
      .catch(() => { if (!cancelled) setStatus('gone') })
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col">
      {/* ── Aivora header ── */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-14 flex items-center">
          <AivoraLogo size="sm" />
        </div>
      </header>

      <main className="flex-1 w-full">
        {status === 'loading' && (
          <div className="flex items-center justify-center py-32 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading report…
          </div>
        )}

        {status === 'gone' && (
          <div className="max-w-md mx-auto text-center py-32 px-6">
            <h1 className="text-lg font-bold text-slate-800">This report isn't available</h1>
            <p className="text-sm text-slate-500 mt-2">
              The link may have been disabled by its owner, or it may be incorrect. Please ask the sender for an updated link.
            </p>
          </div>
        )}

        {status === 'ok' && data && (
          <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
            {(data.meta?.studio_name || data.meta?.subtitle) && (
              <div className="mb-6">
                {data.meta.studio_name && (
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{data.meta.studio_name}</h1>
                )}
                {data.meta.subtitle && (
                  <p className="text-sm text-slate-500 mt-1">{data.meta.subtitle}</p>
                )}
              </div>
            )}
            {/* report-paper theme lives inside StudioRenderer's own css, remapping
                the dark component classes to the light "paper" look. */}
            <StudioOutput document={data.report_document as StudioOutputDocument} />
          </div>
        )}
      </main>

      {/* ── Aivora footer ── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Generated with Aivora HC</span>
          {status === 'ok' && data?.meta?.generated_at && (
            <span>{formatDate(data.meta.generated_at)}</span>
          )}
        </div>
      </footer>
    </div>
  )
}
