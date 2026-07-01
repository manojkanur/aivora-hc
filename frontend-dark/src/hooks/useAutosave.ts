import { useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutosaveOptions<T> {
  value: T
  onSave: (value: T) => Promise<unknown>
  delay?: number
  enabled?: boolean
}

/**
 * Debounced autosave hook. Watches `value`, calls `onSave` after `delay` ms of
 * inactivity. Returns the current status and the last error.
 */
export function useAutosave<T>({ value, onSave, delay = 800, enabled = true }: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<unknown>(null)
  const firstRunRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const pendingRef = useRef<T | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (inFlightRef.current) {
        pendingRef.current = value
        return
      }
      try {
        inFlightRef.current = true
        setStatus('saving')
        await onSave(value)
        if (pendingRef.current !== null) {
          const queued = pendingRef.current
          pendingRef.current = null
          await onSave(queued)
        }
        setStatus('saved')
        setError(null)
      } catch (e) {
        setStatus('error')
        setError(e)
      } finally {
        inFlightRef.current = false
      }
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay, enabled, onSave])

  return { status, error }
}
