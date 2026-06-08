import { useState, useRef, useCallback } from 'react'
import { aiAPI } from '../lib/api'

export interface StreamSection {
  title: string
  content: string
  complete: boolean
  index: number
}

interface UseSkillStreamReturn {
  sections: StreamSection[]
  isStreaming: boolean
  progress: number
  error: string | null
  startStream: (jobId: string) => void
  cancel: () => void
}

export function useSkillStream(): UseSkillStreamReturn {
  const [sections, setSections] = useState<StreamSection[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const cancel = useCallback(async () => {
    if (eventSourceRef.current) {
      const jobId = eventSourceRef.current.url.split('/stream/')[1]?.split('?')[0]
      eventSourceRef.current.close()
      eventSourceRef.current = null
      if (jobId) {
        try { await aiAPI.cancelJob(jobId) } catch {}
      }
    }
    setIsStreaming(false)
  }, [])

  const startStream = useCallback((jobId: string) => {
    setSections([])
    setError(null)
    setIsStreaming(true)
    const token = localStorage.getItem('auth_token')
    const url = `/api/v1/ai/stream/${jobId}${token ? `?token=${token}` : ''}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    let localIndex = 0

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'section_start') {
          localIndex = data.index
          setSections(prev => [
            ...prev,
            { title: data.title, content: '', complete: false, index: localIndex },
          ])
        } else if (data.type === 'content') {
          setSections(prev =>
            prev.map(s =>
              s.index === localIndex ? { ...s, content: s.content + data.text } : s
            )
          )
        } else if (data.type === 'section_end') {
          setSections(prev =>
            prev.map(s => s.index === data.index ? { ...s, complete: true } : s)
          )
        } else if (data.type === 'complete') {
          setIsStreaming(false)
          es.close()
        } else if (data.type === 'error') {
          setError(data.message || 'Streaming error')
          setIsStreaming(false)
          es.close()
        }
      } catch {
        // ignore
      }
    }

    es.onerror = () => {
      setError('Connection lost.')
      setIsStreaming(false)
      es.close()
    }
  }, [])

  const completedSections = sections.filter(s => s.complete).length
  const progress = sections.length > 0
    ? Math.round((completedSections / sections.length) * 100)
    : isStreaming ? 5 : 100

  return { sections, isStreaming, progress, error, startStream, cancel }
}
