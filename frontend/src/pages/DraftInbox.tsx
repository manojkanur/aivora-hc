import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, CheckSquare, Download, Inbox, Trash2, CheckCircle, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { Modal } from '../components/ui/Modal'
import { draftsAPI, exportsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp } from '../lib/animations'
import { formatRelativeTime } from '../lib/utils'
import { cn } from '../lib/utils'

interface Draft {
  id: string
  skill_id: string
  workspace_id: string
  approval_status: 'pending' | 'approved' | 'submitted'
  created_at: string
  content?: Record<string, unknown>
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'submitted'

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'muted'> = {
  pending:   'warning',
  submitted: 'default',
  approved:  'success',
}

function getDraftTitle(draft: Draft | null): string {
  if (!draft) return 'Draft'
  const content = draft.content
  if (!content) return 'Draft'
  const skillSlug = content.skill_slug as string | undefined
  if (skillSlug) return skillSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return 'Draft'
}

function getPreview(draft: Draft | null): string {
  if (!draft) return '—'
  const content = draft.content
  if (!content) return '—'
  const text = content.text as string | undefined
  if (text) return text.slice(0, 120) + (text.length > 120 ? '...' : '')
  const toolInput = content.tool_input as Record<string, unknown> | undefined
  if (toolInput) {
    const first = Object.entries(toolInput)[0]
    if (first) return `${first[0].replace(/_/g, ' ')}: ${String(first[1]).slice(0, 100)}`
  }
  return JSON.stringify(content).slice(0, 120)
}

export default function DraftInbox() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  useEffect(() => { loadDrafts() }, []) // eslint-disable-line

  const loadDrafts = async () => {
    setIsLoading(true)
    try {
      const res = await draftsAPI.list()
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.drafts ?? [])
      const d = raw.map((x: unknown) => {
        const dr = x as Record<string, unknown>
        return {
          id: String(dr.id ?? ''),
          skill_id: String(dr.skill_id ?? ''),
          workspace_id: String(dr.workspace_id ?? ''),
          approval_status: (dr.approval_status as Draft['approval_status']) ?? 'pending',
          created_at: String(dr.created_at ?? ''),
          content: dr.content as Record<string, unknown> | undefined,
        }
      }).filter(d => d.id)
      setDrafts(d)
    } catch {
      toast.error('Failed to load drafts')
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = drafts.filter(d => {
    const title = getDraftTitle(d).toLowerCase()
    const matchesSearch = !search || title.includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || d.approval_status === statusFilter
    return matchesSearch && matchesStatus
  })

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleApprove = async (id: string) => {
    try {
      await draftsAPI.approve(id)
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, approval_status: 'approved' as const } : d))
      toast.success('Draft approved')
    } catch { toast.error('Failed to approve') }
  }

  const handleBulkApprove = async () => {
    if (!selected.length) return
    try {
      await draftsAPI.bulkApprove(selected)
      setDrafts(prev => prev.map(d => selected.includes(d.id) ? { ...d, approval_status: 'approved' as const } : d))
      setSelected([])
      toast.success(`${selected.length} draft(s) approved`)
    } catch { toast.error('Failed to approve drafts') }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await draftsAPI.delete(deleteTarget.id)
      setDrafts(prev => prev.filter(d => d.id !== deleteTarget.id))
      setSelected(prev => prev.filter(id => id !== deleteTarget.id))
      toast.success('Draft deleted')
      setDeleteTarget(null)
    } catch { toast.error('Failed to delete draft') }
    finally { setDeleting(false) }
  }

  const handleBulkDelete = async () => {
    if (!selected.length) return
    try {
      await draftsAPI.bulkDelete(selected)
      setDrafts(prev => prev.filter(d => !selected.includes(d.id)))
      toast.success(`${selected.length} draft(s) deleted`)
      setSelected([])
    } catch { toast.error('Failed to delete drafts') }
  }

  const handleExport = async (id: string) => {
    setExportingId(id)
    try {
      const res = await exportsAPI.create(id, 'pdf')
      const blob = new Blob([res.data], { type: res.headers['content-type'] })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename="(.+)"/)
      a.href = url
      a.download = match ? match[1] : 'export.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded successfully')
    } catch { toast.error('Export failed') }
    finally { setExportingId(null) }
  }

  const statusOptions: StatusFilter[] = ['all', 'pending', 'submitted', 'approved']

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-text-primary">Draft Inbox</h1>
        <p className="text-text-secondary mt-1">Review, approve and manage AI-generated drafts</p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search drafts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-1 bg-white">
          {statusOptions.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                statusFilter === s ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-tertiary'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-text-muted">{selected.length} selected</span>
            <Button size="sm" variant="secondary" leftIcon={<CheckSquare className="w-4 h-4" />} onClick={handleBulkApprove}>
              Approve
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handleBulkDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </motion.div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Inbox className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">
            {search || statusFilter !== 'all' ? 'No matching drafts' : 'Your inbox is empty'}
          </h3>
          <p className="text-text-muted text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Run a studio to generate your first draft'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-secondary">
            <input
              type="checkbox"
              className="rounded border-border accent-accent"
              checked={selected.length === filtered.length && filtered.length > 0}
              onChange={e => setSelected(e.target.checked ? filtered.map(d => d.id) : [])}
            />
            <span className="text-xs font-semibold text-text-muted flex-1">Studio / Content</span>
            <span className="text-xs font-semibold text-text-muted w-24 hidden sm:block">Date</span>
            <span className="text-xs font-semibold text-text-muted w-24">Status</span>
            <span className="text-xs font-semibold text-text-muted w-36 text-right">Actions</span>
          </div>

          {filtered.map((draft, i) => (
            <motion.div
              key={draft.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-4 py-4 border-b border-border last:border-0 hover:bg-surface-secondary transition-colors"
            >
              <input
                type="checkbox"
                className="rounded border-border accent-accent flex-shrink-0"
                checked={selected.includes(draft.id)}
                onChange={() => toggleSelect(draft.id)}
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{getDraftTitle(draft)}</p>
                <p className="text-xs text-text-muted truncate mt-0.5">{getPreview(draft)}</p>
              </div>

              <div className="w-24 hidden sm:flex items-center gap-1 text-xs text-text-muted flex-shrink-0">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(draft.created_at)}
              </div>

              <div className="w-24 flex-shrink-0">
                <Badge variant={statusVariants[draft.approval_status]}>{draft.approval_status}</Badge>
              </div>

              <div className="w-36 flex items-center justify-end gap-1.5 flex-shrink-0">
                {draft.approval_status !== 'approved' && (
                  <button
                    onClick={() => handleApprove(draft.id)}
                    title="Approve"
                    className="p-1.5 rounded-lg text-text-muted hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                {draft.approval_status === 'approved' && (
                  <button
                    onClick={() => handleExport(draft.id)}
                    disabled={exportingId === draft.id}
                    title="Export"
                    className="p-1.5 rounded-lg text-text-muted hover:bg-zinc-100 hover:text-zinc-900 transition-colors disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(draft)}
                  title="Delete"
                  className="p-1.5 rounded-lg text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Draft" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary">
            Delete <strong className="text-text-primary">"{getDraftTitle(deleteTarget)}"</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
              isLoading={deleting}
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
