import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { aiAPI } from '../../lib/api'

interface Section {
  title: string
  content: string
  complete: boolean
}

interface StreamingDraftProps {
  jobId: string
  onComplete?: (sections: Section[]) => void
  onCancel?: () => void
}

export function StreamingDraft({ jobId, onComplete, onCancel }: StreamingDraftProps) {
  const [sections, setSections] = useState<Section[]>([])
  const [isStreaming, setIsStreaming] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    const url = `/api/v1/ai/stream/${jobId}${token ? `?token=${token}` : ''}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'section_start') {
          setSections(prev => [...prev, { title: data.title, content: '', complete: false }])
          setCurrentSectionIndex(data.index)
        } else if (data.type === 'content') {
          setSections(prev =>
            prev.map((s, i) => i === currentSectionIndex ? { ...s, content: s.content + data.text } : s)
          )
        } else if (data.type === 'section_end') {
          setSections(prev =>
            prev.map((s, i) => i === data.index ? { ...s, complete: true } : s)
          )
        } else if (data.type === 'complete') {
          setIsStreaming(false)
          es.close()
          if (onComplete) {
            setSections(prev => {
              onComplete(prev)
              return prev
            })
          }
        } else if (data.type === 'error') {
          setError(data.message || 'Streaming error occurred')
          setIsStreaming(false)
          es.close()
        }
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      setError('Connection lost. The draft may still be processing.')
      setIsStreaming(false)
      es.close()
    }

    return () => {
      es.close()
    }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [sections])

  const handleCancel = async () => {
    eventSourceRef.current?.close()
    try {
      await aiAPI.cancelJob(jobId)
    } catch {
      // ignore
    }
    setIsStreaming(false)
    if (onCancel) onCancel()
  }

  const totalSections = sections.length || 1
  const completedSections = sections.filter(s => s.complete).length
  const progress = isStreaming
    ? Math.round((completedSections / Math.max(totalSections, 1)) * 100)
    : 100

  return (
    <div className="flex flex-col h-full border border-[#1e2433] rounded-xl bg-[#131720] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2433] bg-[#0E0E0E]">
        <div className="flex items-center gap-3">
          {isStreaming ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-white">Generating...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">Error</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-white">Complete</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#3b82f6] rounded-full"
                style={{ width: '0%' }}
                animate={{ width: `${Math.max(0, progress)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-slate-600">
              {completedSections}/{totalSections}
            </span>
          </div>
          {isStreaming && (
            <Button variant="ghost" size="sm" onClick={handleCancel} leftIcon={<X className="w-3.5 h-3.5" />}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <AnimatePresence>
          {sections.map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  section.complete ? 'bg-[#3b82f6] text-white' : 'bg-border text-slate-600'
                )}>
                  {section.complete ? '✓' : i + 1}
                </div>
                <h4 className="text-sm font-semibold text-white">{section.title}</h4>
              </div>
              <div className="pl-7 text-sm text-slate-300 leading-relaxed">
                {section.content}
                {!section.complete && i === currentSectionIndex && isStreaming && (
                  <span className="cursor-blink" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sections.length === 0 && isStreaming && (
          <div className="flex items-center gap-3 py-8 justify-center text-slate-600">
            <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Initializing AI generation...</span>
          </div>
        )}
      </div>
    </div>
  )
}
