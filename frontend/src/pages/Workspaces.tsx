import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Search, Briefcase, Sparkles, Clock, Archive, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { Badge } from '../components/ui/Badge'
import { toast } from '../components/ui/Toast'
import { fadeUp, staggerContainer } from '../lib/animations'
import { formatRelativeTime } from '../lib/utils'
import { cn } from '../lib/utils'
import { workspacesAPI } from '../lib/api'

export default function Workspaces() {
  const { workspaces, fetchWorkspaces, createWorkspace, isLoading } = useWorkspaceStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({ name: '', client_name: '', description: '' })
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchWorkspaces() }, []) // eslint-disable-line

  const filtered = workspaces.filter(ws => {
    if (!ws?.name) return false
    const matchesSearch = ws.name.toLowerCase().includes(search.toLowerCase()) ||
      (ws.client_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || ws.status === filter
    return matchesSearch && matchesFilter
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await workspacesAPI.archive(deleteTarget.id)
      await fetchWorkspaces()
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete workspace')
    } finally {
      setDeleting(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.client_name) {
      toast.error('Name and client name are required')
      return
    }
    setCreating(true)
    try {
      await createWorkspace(formData)
      setShowCreateModal(false)
      setFormData({ name: '', client_name: '', description: '' })
      toast.success('Workspace created!')
    } catch {
      toast.error('Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Workspaces</h1>
          <p className="text-text-secondary mt-1">Manage your client engagements</p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
          New Workspace
        </Button>
      </motion.div>

      {/* Search + Filter */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="flex items-center gap-3">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search workspaces..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-1 bg-white">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-tertiary'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} variant="card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="w-12 h-12 text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {search ? 'No matching workspaces' : 'No workspaces yet'}
          </h3>
          <p className="text-text-muted text-sm mb-5">
            {search ? 'Try a different search term' : 'Create your first client workspace to get started'}
          </p>
          {!search && (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
              New Workspace
            </Button>
          )}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((ws, i) => (
            <motion.div key={ws.id} variants={fadeUp} custom={i} className="relative">
              <Link to={`/workspaces/${ws.id}`}>
                <div className="bg-white rounded-xl border border-border shadow-card hover:shadow-card-hover hover:border-border-dark transition-all p-5 cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-text-secondary" />
                    </div>
                    {ws.status === 'archived' && (
                      <Badge variant="muted"><Archive className="w-3 h-3 mr-1 inline" />Archived</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors">{ws.name}</h3>
                  <p className="text-sm text-text-muted mt-0.5">{ws.client_name}</p>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-xs text-text-secondary">{ws.skill_count} studios</span>
                    </div>
                    {ws.last_activity && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Clock className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-xs text-text-muted">{formatRelativeTime(ws.last_activity)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>

              {/* Delete button — always visible, outside Link to avoid navigation */}
              <button
                onClick={e => { e.preventDefault(); setDeleteTarget({ id: ws.id, name: ws.name }) }}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Delete Confirm Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Workspace" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete <strong className="text-text-primary">"{deleteTarget?.name}"</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
              isLoading={deleting}
              onClick={handleDelete}
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Workspace" size="sm">
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <Input
            label="Workspace Name"
            placeholder="Q4 Org Transformation"
            value={formData.name}
            onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
          />
          <Input
            label="Client Name"
            placeholder="Acme Corp"
            value={formData.client_name}
            onChange={e => setFormData(d => ({ ...d, client_name: e.target.value }))}
          />
          <div>
            <label className="text-sm font-medium text-text-primary block mb-1.5">Description (optional)</label>
            <textarea
              placeholder="Brief description of this engagement..."
              value={formData.description}
              onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
