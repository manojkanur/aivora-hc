import { motion } from 'framer-motion'
import { Download, CheckCircle, Share2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatRelativeTime, truncate } from '../../lib/utils'

export interface DraftData {
  id: string
  skill_name: string
  skill_icon?: string
  workspace_name?: string
  created_at: string
  status: 'pending' | 'submitted' | 'approved' | 'ready'
  content_preview: string
  export_count?: number
}

interface DraftCardProps {
  draft: DraftData
  onReview?: (id: string) => void
  onApprove?: (id: string) => void
  onExport?: (id: string) => void
  onPublish?: (id: string) => void
}

const statusConfig: Record<DraftData['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'muted' }> = {
  pending: { label: 'Pending Review', variant: 'warning' },
  submitted: { label: 'Submitted', variant: 'default' },
  approved: { label: 'Approved', variant: 'success' },
  ready: { label: 'Ready to Export', variant: 'success' },
}

export function DraftCard({ draft, onReview, onApprove, onExport, onPublish }: DraftCardProps) {
  const status = statusConfig[draft.status]

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="bg-white rounded-xl border border-border shadow-card hover:shadow-card-hover p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-tertiary flex items-center justify-center flex-shrink-0">
            <span className="text-base">{draft.skill_icon || '📄'}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{draft.skill_name}</h3>
            {draft.workspace_name && (
              <p className="text-xs text-text-muted">{draft.workspace_name}</p>
            )}
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-4 truncate-3">
        {truncate(draft.content_preview, 200)}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{formatRelativeTime(draft.created_at)}</span>

        <div className="flex items-center gap-2">
          {onReview && (
            <Button variant="ghost" size="sm" onClick={() => onReview(draft.id)}>
              Review
            </Button>
          )}
          {draft.status === 'pending' && onApprove && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
              onClick={() => onApprove(draft.id)}
            >
              Approve
            </Button>
          )}
          {(draft.status === 'approved' || draft.status === 'ready') && onExport && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => onExport(draft.id)}
            >
              Export
            </Button>
          )}
          {draft.status === 'ready' && onPublish && (
            <Button
              size="sm"
              leftIcon={<Share2 className="w-3.5 h-3.5" />}
              onClick={() => onPublish(draft.id)}
            >
              Publish
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
