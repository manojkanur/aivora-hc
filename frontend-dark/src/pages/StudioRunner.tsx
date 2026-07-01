import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, AlertTriangle, RefreshCw, Download, ChevronDown, FileText, Presentation,
  Image as ImageIcon, Sheet,
} from 'lucide-react'
import html2canvas from 'html2canvas'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { toast } from '../components/ui/Toast'
import { useBriefStore, type WorkspaceBrief } from '../store/briefStore'
import { getStudioById } from '../lib/advisory/questionRouter'
import StudioOutput, { type StudioOutputDocument } from '../components/studio/renderer/StudioRenderer'

interface RunResponse {
  document: StudioOutputDocument
  generated_document_id?: string | null
}

interface ExportRecord {
  id: string
  status: string
  format: string
}

// Pick the most recent brief saved in the store. Falls back to null if none.
function findLatestBrief(briefs: Record<string, WorkspaceBrief>): { workspaceId: string; brief: WorkspaceBrief } | null {
  const entries = Object.entries(briefs)
  if (entries.length === 0) return null
  let latest: { workspaceId: string; brief: WorkspaceBrief } | null = null
  for (const [workspaceId, brief] of entries) {
    if (!latest || new Date(brief.completedAt).getTime() > new Date(latest.brief.completedAt).getTime()) {
      latest = { workspaceId, brief }
    }
  }
  return latest
}

function StudioSkeleton({ studioName }: { studioName: string }) {
  return (
    <div className="min-h-full bg-[#0c0e14]">
      <div className="px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-8">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-semibold">
            {studioName}
          </div>
          <div className="h-9 w-2/3 rounded-lg bg-[#131720] border border-[#1a1e2e] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-[#131720] border border-[#1a1e2e] animate-pulse" />
        </div>

        <div className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400">Synthesising your {studioName.toLowerCase()}…</span>
          </div>
          <div className="space-y-3 pt-2">
            <div className="h-4 w-full rounded bg-[#0c0e14] animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-[#0c0e14] animate-pulse" />
            <div className="h-4 w-4/6 rounded bg-[#0c0e14] animate-pulse" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-[#1a1e2e] bg-[#131720] p-5 space-y-3">
              <div className="h-4 w-2/3 rounded bg-[#0c0e14] animate-pulse" />
              <div className="h-8 w-1/3 rounded bg-[#0c0e14] animate-pulse" />
              <div className="h-2 w-full rounded bg-[#0c0e14] animate-pulse" />
              <div className="h-3 w-full rounded bg-[#0c0e14] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function StudioRunner() {
  const { studioId = '' } = useParams<{ studioId: string }>()
  const navigate = useNavigate()

  const studio = useMemo(() => getStudioById(studioId), [studioId])
  const studioName = studio?.name ?? studioId

  const briefs = useBriefStore(s => s.briefs)
  const latest = useMemo(() => findLatestBrief(briefs), [briefs])
  const brief = latest?.brief ?? null

  const [doc, setDoc] = useState<StudioOutputDocument | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const runStudio = useCallback(async () => {
    if (!studioId) return
    setLoading(true)
    setError(null)
    setDoc(null)
    try {
      const res = await api.post<RunResponse>(
        `/hc-platform/studios/${studioId}/run`,
        { brief, params: {} },
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
  }, [studioId, brief])

  useEffect(() => {
    runStudio()
  }, [runStudio])

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
        backgroundColor: '#0c0e14',
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

  if (!studio) {
    return (
      <div className="min-h-full bg-[#0c0e14] flex items-center justify-center px-4">
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
      <div className="min-h-full bg-[#0c0e14] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <p className="text-white font-semibold">{error || 'No output generated'}</p>
          <p className="text-sm text-slate-400">
            Something went wrong while running <span className="text-slate-200">{studioName}</span>. Try again, or head back to the studios marketplace.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate('/skills')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back to studios
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
    <div className="min-h-full bg-[#0c0e14]">
      {/* Action bar */}
      <div className="border-b border-[#1a1e2e] bg-[#0c0e14]/95 backdrop-blur sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/skills')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to studios
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
                  className="absolute right-0 mt-2 w-44 rounded-xl border border-[#1a1e2e] bg-[#131720] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden z-20"
                >
                  <button
                    onClick={() => handleExport('pdf')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#1a1e2e]"
                  >
                    <FileText className="w-4 h-4 text-rose-400" />
                    Export as PDF
                  </button>
                  <button
                    onClick={() => handleExport('pptx')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#1a1e2e] border-t border-[#1a1e2e]"
                  >
                    <Presentation className="w-4 h-4 text-amber-400" />
                    Export as PPTX
                  </button>
                  <button
                    onClick={() => handleExport('xlsx')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#1a1e2e] border-t border-[#1a1e2e]"
                  >
                    <Sheet className="w-4 h-4 text-emerald-400" />
                    Export as XLSX
                  </button>
                  <button
                    onClick={() => handleExport('png')}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-slate-200 hover:bg-[#1a1e2e] border-t border-[#1a1e2e]"
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
