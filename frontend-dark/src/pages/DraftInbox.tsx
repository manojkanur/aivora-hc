import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, CheckSquare, Download, Inbox, Trash2, CheckCircle, Clock, Layout, Pencil, X as XIcon, Check } from 'lucide-react'
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
  if (!draft) return ' - '
  const content = draft.content
  if (!content) return ' - '
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
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const beginEdit = (d: Draft) => {
    setEditingId(d.id)
    const current = (d.content?.text as string | undefined) ?? ''
    setEditText(current || JSON.stringify(d.content ?? {}, null, 2))
  }
  const cancelEdit = () => { setEditingId(null); setEditText('') }
  const saveEdit = async (d: Draft) => {
    setSavingEdit(true)
    try {
      const nextContent = { ...(d.content ?? {}), text: editText }
      await draftsAPI.updateContent(d.id, nextContent)
      setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, content: nextContent } : x))
      toast.success('Draft updated')
      cancelEdit()
    } catch { toast.error('Failed to save changes') }
    finally { setSavingEdit(false) }
  }

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
      const blob = new Blob([res.data], { type: String(res.headers['content-type'] || 'application/octet-stream') })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = String(res.headers['content-disposition'] || '')
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
        <h1 className="text-2xl font-bold text-white">Draft Inbox</h1>
        <p className="text-slate-300 mt-1">Review, approve and manage AI-generated drafts</p>
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
        <div className="flex gap-1 border border-[#1e2433] rounded-lg p-1 bg-[#131720]">
          {statusOptions.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                statusFilter === s ? 'bg-[#3b82f6] text-white' : 'text-slate-300 hover:bg-[#1a1e2e]'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-slate-600">{selected.length} selected</span>
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
          <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white">
            {search || statusFilter !== 'all' ? 'No matching drafts' : 'Your inbox is empty'}
          </h3>
          <p className="text-slate-600 text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Run a studio to generate your first draft'}
          </p>
        </div>
      ) : (
        <div className="bg-[#131720] rounded-xl border border-[#1e2433] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2433] bg-[#0E0E0E]">
            <input
              type="checkbox"
              className="rounded border-[#1e2433] accent-[#3b82f6]"
              checked={selected.length === filtered.length && filtered.length > 0}
              onChange={e => setSelected(e.target.checked ? filtered.map(d => d.id) : [])}
            />
            <span className="text-xs font-semibold text-slate-600 flex-1">Studio / Content</span>
            <span className="text-xs font-semibold text-slate-600 w-24 hidden sm:block">Date</span>
            <span className="text-xs font-semibold text-slate-600 w-24">Status</span>
            <span className="text-xs font-semibold text-slate-600 w-48 text-right">Actions</span>
          </div>

          {filtered.map((draft, i) => (
            <React.Fragment key={draft.id}>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-4 py-4 border-b border-[#1e2433] last:border-0 hover:bg-[#0E0E0E] transition-colors"
            >
              <input
                type="checkbox"
                className="rounded border-[#1e2433] accent-[#3b82f6] flex-shrink-0"
                checked={selected.includes(draft.id)}
                onChange={() => toggleSelect(draft.id)}
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{getDraftTitle(draft)}</p>
                <p className="text-xs text-slate-600 truncate mt-0.5">{getPreview(draft)}</p>
              </div>

              <div className="w-24 hidden sm:flex items-center gap-1 text-xs text-slate-600 flex-shrink-0">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(draft.created_at)}
              </div>

              <div className="w-24 flex-shrink-0">
                <Badge variant={statusVariants[draft.approval_status]}>{draft.approval_status}</Badge>
              </div>

              <div className="w-48 flex items-center justify-end gap-1.5 flex-shrink-0">
                <button
                  onClick={() => editingId === draft.id ? cancelEdit() : beginEdit(draft)}
                  title="Edit inline"
                  className="p-1.5 rounded-lg text-slate-600 hover:bg-[#1a1e2e] hover:text-white transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate(`/canvas/${draft.id}?title=${encodeURIComponent(getDraftTitle(draft))}`)}
                  title="Open in Canvas"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#3b82f6] text-[#3b82f6] hover:bg-[#3b82f6]/10 text-xs font-semibold transition-colors"
                >
                  <Layout className="w-3.5 h-3.5" /> Canvas
                </button>
                {draft.approval_status !== 'approved' && (
                  <button
                    onClick={() => handleApprove(draft.id)}
                    title="Approve"
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-[#1a1e2e] hover:text-white transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                {draft.approval_status === 'approved' && (
                  <button
                    onClick={() => handleExport(draft.id)}
                    disabled={exportingId === draft.id}
                    title="Export"
                    className="p-1.5 rounded-lg text-slate-600 hover:bg-[#1a1e2e] hover:text-white transition-colors disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(draft)}
                  title="Delete"
                  className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
            {editingId === draft.id && (
              <div className="px-4 pb-4 pt-1 border-b border-[#1e2433] bg-[#0a0c12]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">Inline editor</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={cancelEdit} className="px-2.5 py-1 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white text-xs flex items-center gap-1">
                      <XIcon className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={() => saveEdit(draft)} disabled={savingEdit} className="px-2.5 py-1 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-60">
                      <Check className="w-3 h-3" /> {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={8}
                  className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-lg px-3 py-2.5 text-sm text-slate-200 font-mono leading-relaxed focus:border-blue-500/50 focus:outline-none resize-y"
                  placeholder="Edit the draft body here…"
                />
                <p className="text-[11px] text-slate-600 mt-1.5">For richer editing (sections, formatting, exports) use Canvas.</p>
              </div>
            )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Draft" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Delete <strong className="text-white">"{getDraftTitle(deleteTarget)}"</strong>? This cannot be undone.
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
