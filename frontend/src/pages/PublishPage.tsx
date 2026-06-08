import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Linkedin, Send, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Textarea } from '../components/ui/Input'
import { LinkedInQueueItem } from '../components/publish/LinkedInQueueItem'
import { publishAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp } from '../lib/animations'
import type { QueueItem } from '../components/publish/LinkedInQueueItem'
import { Badge } from '../components/ui/Badge'
import { formatDate } from '../lib/utils'

interface LogItem {
  id: string
  content_preview: string
  published_at: string
  status: 'success' | 'failed'
  platform: string
}

export default function PublishPage() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [log, setLog] = useState<LogItem[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    publishAPI.getQueue().then(res => {
      setQueue(res.data.queue || [])
      setIsConnected(res.data.linkedin_connected || false)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
    publishAPI.getLog().then(res => setLog(res.data.log || [])).catch(() => {})
  }, [])

  const handleSchedule = async (_itemId: string) => {
    toast.info('Enter a date/time to schedule this post')
  }

  const handlePublishNow = async (itemId: string) => {
    try {
      await publishAPI.publishNow(itemId)
      setQueue(prev => prev.map(i => i.id === itemId ? { ...i, status: 'published' as const } : i))
      toast.success('Post published to LinkedIn!')
    } catch { toast.error('Failed to publish') }
  }

  const handleCancel = async (itemId: string) => {
    try {
      await publishAPI.cancel(itemId)
      setQueue(prev => prev.filter(i => i.id !== itemId))
      toast.success('Post removed from queue')
    } catch { toast.error('Failed to cancel') }
  }

  const handleConnectLinkedIn = async () => {
    try {
      const res = await publishAPI.connectLinkedIn()
      window.location.href = res.data.auth_url
    } catch { toast.error('Failed to connect LinkedIn') }
  }

  const handleCreate = async () => {
    if (!newContent) { toast.error('Content is required'); return }
    setIsPublishing(true)
    try {
      const res = await publishAPI.schedule({
        content: newContent,
        scheduled_at: scheduledAt || new Date().toISOString(),
      })
      setQueue(prev => [res.data.item, ...prev])
      setShowNewModal(false)
      setNewContent('')
      setScheduledAt('')
      toast.success('Post added to queue!')
    } catch { toast.error('Failed to create post') }
    finally { setIsPublishing(false) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">LinkedIn Publish</h1>
          <p className="text-text-secondary mt-1">Schedule and publish your HC insights</p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
          New Post
        </Button>
      </motion.div>

      {/* LinkedIn Connection Status */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1}>
        {isConnected ? (
          <div className="flex items-center gap-3 p-4 bg-zinc-900 text-white rounded-xl">
            <Linkedin className="w-5 h-5 text-white flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">LinkedIn Connected</p>
              <p className="text-xs text-white/70">Posts will be published to your LinkedIn profile</p>
            </div>
            <Badge variant="success">Active</Badge>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-white border border-border rounded-xl">
            <Linkedin className="w-5 h-5 text-text-muted flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">Connect LinkedIn</p>
              <p className="text-xs text-text-muted">Connect your account to publish directly</p>
            </div>
            <Button size="sm" onClick={handleConnectLinkedIn}>
              Connect
            </Button>
          </div>
        )}
      </motion.div>

      {/* Queue */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Publish Queue ({queue.length})
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white rounded-xl border border-border shimmer" />)}
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-border">
            <Send className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-primary font-medium">Queue is empty</p>
            <p className="text-text-muted text-sm mt-1">Add posts to schedule and publish</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map(item => (
              <LinkedInQueueItem
                key={item.id}
                item={item}
                onSchedule={handleSchedule}
                onPublishNow={handlePublishNow}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Publish Log */}
      {log.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Publish Log</h2>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Content</th>
                  <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 hidden sm:table-cell">Date</th>
                  <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-sm text-text-secondary truncate max-w-xs">{item.content_preview}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-text-muted">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(item.published_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={item.status === 'success' ? 'success' : 'error'}>
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Post Modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="New Post" size="md">
        <div className="p-5 space-y-4">
          <Textarea
            label="Post Content"
            placeholder="Share your HC insights, thought leadership, key findings..."
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={6}
          />
          <div>
            <label className="text-sm font-medium text-text-primary block mb-1.5">
              Schedule Time (optional)
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button className="flex-1" isLoading={isPublishing} leftIcon={<Send className="w-4 h-4" />} onClick={handleCreate}>
              {scheduledAt ? 'Schedule' : 'Add to Queue'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
