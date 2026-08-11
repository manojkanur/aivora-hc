import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, AlertTriangle, RefreshCw, Download, ChevronDown, FileText, Presentation,
  Image as ImageIcon, Sheet, Sparkles, Building2, Loader2, Play, Plus,
} from 'lucide-react'
import html2canvas from 'html2canvas'
import { api, workspacesAPI } from '../lib/api'
import { Button } from '../components/ui/Button'
import { toast } from '../components/ui/Toast'
import { useBriefStore, type WorkspaceBrief } from '../store/briefStore'
import { getStudioById } from '../lib/advisory/questionRouter'
import type { Studio } from '../lib/advisory/types'
import StudioOutput, { type StudioOutputDocument } from '../components/studio/renderer/StudioRenderer'

interface WorkspaceRow { id: string; name: string; status?: string }

/** Marketplace entry with no workspace: pick which workspace to run the studio in. */
function StudioWorkspacePicker({ studioId, studioName }: { studioId: string; studioName: string }) {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    workspacesAPI.list()
      .then(res => {
        if (cancelled) return
        const raw: WorkspaceRow[] = res.data?.items ?? res.data ?? []
        // Always let the user pick the workspace explicitly - even with one
        // workspace, we show it as a selectable card rather than auto-forwarding.
        setWorkspaces(raw.filter(w => !w.status || w.status === 'active'))
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [navigate, studioId])

  if (error) {
    return <div className="min-h-full bg-[#0B1220] flex items-center justify-center px-4"><p className="text-sm text-slate-400">Could not load your workspaces. Refresh to try again.</p></div>
  }
  if (!workspaces) {
    return <div className="min-h-full bg-[#0B1220] flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
  }
  return (
    <div className="min-h-full bg-[#0B1220] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-[#2A3648] bg-[#1B2431] p-7 sm:p-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Run {studioName} in a workspace</h1>
            <p className="text-sm text-slate-400 mt-1.5">The studio uses that workspace's onboarding and challenge brief to ground its analysis.</p>
          </div>
        </div>
        {workspaces.length === 0 ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-400">You do not have a workspace yet. Create one first.</p>
            <Link to="/workspaces" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
              <Plus className="w-4 h-4" /> Create workspace
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaces.map(w => (
              <button key={w.id} onClick={() => navigate(`/studio/${studioId}/${w.id}`)}
                className="w-full flex items-center gap-3 rounded-xl border border-[#2A3648] bg-[#0B1220] hover:border-blue-500/40 px-4 py-3 text-left transition-colors">
                <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-white flex-1 truncate">{w.name}</span>
                <ArrowLeft className="w-4 h-4 text-slate-500 rotate-180" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const slug = (v: string) => v.replace(/-/g, ' ')

/** Pre-run screen: prefilled workspace summary + analysis + one-click Run. */
function StudioRunIntro({ studioName, studio, brief, workspaceId, onRun }: {
  studioName: string
  studio: Studio
  brief: WorkspaceBrief | null
  workspaceId: string
  onRun: () => void
}) {
  const navigate = useNavigate()
  const [wsName, setWsName] = useState<string | null>(brief?.organizationName ?? null)

  useEffect(() => {
    if (wsName) return
    workspacesAPI.get(workspaceId).then(res => setWsName(res.data?.name ?? null)).catch(() => {})
  }, [workspaceId, wsName])

  const facts = brief ? [
    { label: 'Organization', value: brief.organizationName },
    { label: 'Industry', value: slug(brief.industry) },
    { label: 'Region', value: (brief.region || '').toUpperCase() },
    { label: 'Size', value: slug(brief.organizationSize) },
  ].filter(f => f.value) : []

  return (
    <div className="min-h-full bg-[#0B1220] px-4 sm:px-6 py-8 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <button onClick={() => navigate(`/advisor/${workspaceId}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to workspace
        </button>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-semibold">{studioName}</div>
          <h1 className="text-3xl font-bold text-white">{studioName}{wsName ? ` for ${wsName}` : ''}</h1>
          <p className="text-sm text-slate-400">{studio.deliverable}</p>
        </div>

        {!brief ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3">
            <p className="text-sm text-amber-200 font-semibold">This workspace has no challenge brief yet.</p>
            <p className="text-sm text-slate-400">Complete the brief so the studio can ground its analysis in your situation.</p>
            <Button size="sm" onClick={() => navigate(`/challenge-brief?workspaceId=${workspaceId}`)}>Complete the brief</Button>
          </div>
        ) : (
          <>
            {/* Prefilled workspace facts */}
            <div className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Using this workspace's data</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {facts.map(f => (
                  <div key={f.label}>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{f.label}</p>
                    <p className="text-sm font-semibold text-white mt-0.5 capitalize">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary + analysis */}
            <div className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-5 space-y-4">
              {brief.strategicDrivers.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Strategic drivers</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.strategicDrivers.map(d => (
                      <span key={d} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 capitalize">{slug(d)}</span>
                    ))}
                  </div>
                </div>
              )}
              {brief.hcAreas.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Focus areas the studio will address</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.hcAreas.map(a => (
                      <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 capitalize">{slug(a)}</span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-sm text-slate-400 leading-relaxed">
                {studioName} will analyse {wsName ?? 'this organization'}'s brief and produce a consultant-grade deliverable
                {brief.hcAreas.length > 0 ? `, focused on ${brief.hcAreas.slice(0, 3).map(slug).join(', ')}` : ''}. Review the inputs above, then run it.
              </p>
            </div>

            <div className="flex justify-end">
              <Button size="lg" leftIcon={<Play className="w-4 h-4" />} onClick={onRun}>Run studio</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface RunResponse {
  document: StudioOutputDocument
  generated_document_id?: string | null
}

interface ExportRecord {
  id: string
  status: string
  format: string
}

function StudioSkeleton({ studioName }: { studioName: string }) {
  return (
    <div className="min-h-full bg-[#0B1220]">
      <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-8">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-semibold">
            {studioName}
          </div>
          <div className="h-9 w-2/3 rounded-lg bg-[#1B2431] border border-[#222E3E] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-[#1B2431] border border-[#222E3E] animate-pulse" />
        </div>

        <div className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Synthesising your {studioName.toLowerCase()}…</span>
          </div>
          <div className="space-y-3 pt-2">
            <div className="h-4 w-full rounded bg-[#0B1220] animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-[#0B1220] animate-pulse" />
            <div className="h-4 w-4/6 rounded bg-[#0B1220] animate-pulse" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-[#222E3E] bg-[#1B2431] p-5 space-y-3">
              <div className="h-4 w-2/3 rounded bg-[#0B1220] animate-pulse" />
              <div className="h-8 w-1/3 rounded bg-[#0B1220] animate-pulse" />
              <div className="h-2 w-full rounded bg-[#0B1220] animate-pulse" />
              <div className="h-3 w-full rounded bg-[#0B1220] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function StudioRunner() {
  const { studioId = '', workspaceId } = useParams<{ studioId: string; workspaceId?: string }>()
  const navigate = useNavigate()

  const studio = useMemo(() => getStudioById(studioId), [studioId])
  const studioName = studio?.name ?? studioId

  const briefs = useBriefStore(s => s.briefs)
  // Scope the run to the chosen workspace's brief. No workspaceId means the
  // studio was opened from the marketplace and the user must pick a workspace.
  const brief = workspaceId ? (briefs[workspaceId] ?? null) : null

  const [doc, setDoc] = useState<StudioOutputDocument | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  // Starts on the pre-run screen, not auto-running.
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const runStudio = useCallback(async () => {
    if (!studioId) return
    setLoading(true)
    setHasRun(true)
    setError(null)
    setDoc(null)
    try {
      const res = await api.post<RunResponse>(
        `/hc-platform/studios/${studioId}/run`,
        { brief, workspace_id: workspaceId ?? null, params: {} },
        { timeout: 180000 },
      )
      // Backend may return either { document: {...} } or the document directly.
      const payload = res.data as RunResponse | StudioOutputDocument
      const document = (payload as RunResponse).document ?? (payload as StudioOutputDocument)
      const docId = (payload as RunResponse).generated_document_id ?? null
      setDoc(document)
      setDocumentId(docId)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        'Failed to run studio'
      setError(detail)
    } finally {
      setLoading(false)
    }
  }, [studioId, brief, workspaceId])

  const downloadExport = useCallback(async (exportId: string, format: string) => {
    // Use the authenticated axios instance so the Bearer token is sent, then
    // turn the blob into an object URL and trigger a download.
    const res = await api.get(`/hc-platform/exports/${exportId}/download`, {
      responseType: 'blob',
    })
    const blob = res.data as Blob
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(doc?.title ?? studioName).replace(/[^a-z0-9-_]+/gi, '_')}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }, [doc, studioName])

  const pollExport = useCallback(async (exportId: string): Promise<ExportRecord> => {
    const startedAt = Date.now()
    const TIMEOUT_MS = 60_000
    while (Date.now() - startedAt < TIMEOUT_MS) {
      const res = await api.get<ExportRecord>(`/hc-platform/exports/${exportId}`)
      const record = res.data
      if (record.status === 'completed') return record
      if (record.status === 'failed' || record.status === 'error') {
        throw new Error('Export failed')
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error('Export timed out')
  }, [])

  const exportPng = useCallback(async () => {
    // PNG is rendered entirely in the browser from the live infographic node.
    // No backend round-trip — just html2canvas + a synthetic anchor download.
    const node = document.getElementById('studio-output-capture')
    if (!node) {
      toast.error('Nothing to export yet')
      return
    }
    if (exporting) return
    setExporting(true)
    toast.info('Generating PNG…')
    try {
      const canvas = await html2canvas(node as HTMLElement, {
        backgroundColor: '#0B1220',
        scale: Math.min(2, window.devicePixelRatio || 1) * 2,
        useCORS: true,
        logging: false,
      })
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(doc?.title ?? studioName).replace(/[^a-z0-9-_]+/gi, '_')}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('Downloaded')
    } catch (_err) {
      toast.error('Export failed - try again')
    } finally {
      setExporting(false)
    }
  }, [doc, studioName, exporting])

  const handleExport = async (format: 'pdf' | 'pptx' | 'xlsx' | 'png') => {
    setExportOpen(false)
    if (format === 'png') {
      await exportPng()
      return
    }
    if (!documentId) {
      toast.error('Export failed - try again')
      return
    }
    if (exporting) return
    setExporting(true)
    toast.info(`Generating ${format.toUpperCase()}…`)
    try {
      const createRes = await api.post<ExportRecord>('/hc-platform/exports', {
        source_type: 'generated_document',
        source_id: documentId,
        format,
      })
      const exportId = createRes.data.id
      const record = await pollExport(exportId)
      await downloadExport(record.id, record.format)
      toast.success('Downloaded')
    } catch (_err) {
      toast.error('Export failed - try again')
    } finally {
      setExporting(false)
    }
  }

  // After a run, "back" returns to the originating workspace, not the marketplace.
  const backTarget = workspaceId ? `/advisor/${workspaceId}` : '/skills'
  const backLabel = workspaceId ? 'Back to workspace' : 'Back to studios'

  // Conditional screens live AFTER all hooks to keep hook order stable.
  // Marketplace entry with no workspace: let the user choose one.
  if (studio && !workspaceId) {
    return <StudioWorkspacePicker studioId={studioId} studioName={studioName} />
  }
  // Workspace chosen, studio not yet run: show the prefilled summary + analysis.
  if (studio && !hasRun) {
    return <StudioRunIntro studioName={studioName} studio={studio} brief={brief} workspaceId={workspaceId!} onRun={runStudio} />
  }

  if (!studio) {
    return (
      <div className="min-h-full bg-[#0B1220] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <p className="text-white font-semibold">Studio not found</p>
          <p className="text-sm text-slate-400">No studio matches the id <code className="text-slate-200">{studioId}</code>.</p>
          <Button onClick={() => navigate('/skills')}>Back to studios</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <StudioSkeleton studioName={studioName} />
  }

  if (error || !doc) {
    return (
      <div className="min-h-full bg-[#0B1220] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <p className="text-white font-semibold">{error || 'No output generated'}</p>
          <p className="text-sm text-slate-400">
            Something went wrong while running <span className="text-slate-200">{studioName}</span>. Try again, or head back to the studios marketplace.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate(backTarget)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              {backLabel}
            </Button>
            <Button onClick={runStudio} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#0B1220]">
      {/* Action bar */}
      <div className="border-b border-[#222E3E] bg-[#0B1220]/95 backdrop-blur sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(backTarget)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={runStudio}
            >
              Re-run
            </Button>

            <Button
              variant="primary"
              size="sm"
              leftIcon={<FileText className="w-4 h-4" />}
              onClick={() => handleExport('pdf')}
              disabled={exporting || !documentId}
            >
              {exporting ? 'Generating…' : 'Download PDF'}
            </Button>

            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={() => setExportOpen(v => !v)}
              >
                Export
                <ChevronDown className="w-3.5 h-3.5 ml-1 -mr-1" />
              </Button>
              {exportOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 mt-2 w-44 rounded-xl border border-[#222E3E] bg-[#1B2431] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden z-20"
                >
                  <button
                    onClick={() => handleExport('pdf')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#222E3E]"
                  >
                    <FileText className="w-4 h-4 text-rose-400" />
                    Export as PDF
                  </button>
                  <button
                    onClick={() => handleExport('pptx')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#222E3E] border-t border-[#222E3E]"
                  >
                    <Presentation className="w-4 h-4 text-amber-400" />
                    Export as PPTX
                  </button>
                  <button
                    onClick={() => handleExport('xlsx')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#222E3E] border-t border-[#222E3E]"
                  >
                    <Sheet className="w-4 h-4 text-emerald-400" />
                    Export as XLSX
                  </button>
                  <button
                    onClick={() => handleExport('png')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#222E3E] border-t border-[#222E3E]"
                  >
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    Export as PNG
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="studio-output-capture">
        <StudioOutput document={doc} />
      </div>

    </div>
  )
}
