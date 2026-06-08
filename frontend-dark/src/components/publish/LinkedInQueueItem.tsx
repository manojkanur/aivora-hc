import { motion } from 'framer-motion'
import { Clock, Send, Trash2, Edit2, Play } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatDate, truncate } from '../../lib/utils'
import { cn } from '../../lib/utils'

export interface QueueItem {
  id: string
  content: string
  scheduled_at?: string
  status: string
  export_url?: string
}

interface LinkedInQueueItemProps {
  item: QueueItem
  onEdit?: (id: string) => void
  onSchedule?: (id: string) => void
  onPublishNow?: (id: string) => void
  onCancel?: (id: string) => void
}

const statusConfig: Record<QueueItem['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'muted' }> = {
  draft: { label: 'Draft', variant: 'muted' },
  scheduled: { label: 'Scheduled', variant: 'default' },
  published: { label: 'Published', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
}

export function LinkedInQueueItem({ item, onEdit, onSchedule, onPublishNow, onCancel }: LinkedInQueueItemProps) {
  const status = statusConfig[item.status]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'bg-[#131720] rounded-xl border p-5',
        item.status === 'failed' ? 'border-red-200' : 'border-[#1e2433]',
        'shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={status.variant}>{status.label}</Badge>
          {item.scheduled_at && item.status === 'scheduled' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDate(item.scheduled_at)}</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed mb-4 truncate-3">
        {truncate(item.content, 250)}
      </p>

      {item.export_url && (
        <div className="mb-4 p-3 bg-[#0E0E0E] rounded-lg border border-[#1e2433] flex items-center gap-2">
          <div className="w-8 h-8 bg-border rounded flex-shrink-0" />
          <span className="text-xs text-slate-600">Attached export</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {item.status !== 'published' && (
          <>
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                onClick={() => onEdit(item.id)}
              >
                Edit
              </Button>
            )}
            {item.status === 'draft' && onSchedule && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Clock className="w-3.5 h-3.5" />}
                onClick={() => onSchedule(item.id)}
              >
                Schedule
              </Button>
            )}
            {onPublishNow && (
              <Button
                size="sm"
                leftIcon={<Play className="w-3.5 h-3.5" />}
                onClick={() => onPublishNow(item.id)}
              >
                Publish Now
              </Button>
            )}
            {onCancel && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => onCancel(item.id)}
                className="text-slate-600 hover:text-red-600 ml-auto"
              >
                Cancel
              </Button>
            )}
          </>
        )}
        {item.status === 'published' && (
          <Button variant="ghost" size="sm" leftIcon={<Send className="w-3.5 h-3.5" />} className="text-slate-600">
            View on LinkedIn
          </Button>
        )}
      </div>
    </motion.div>
  )
}
