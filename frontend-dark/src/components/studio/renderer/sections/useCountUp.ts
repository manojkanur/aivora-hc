import { useEffect, useRef, useState } from 'react'

/**
 * Count a number up from 0 to `target` on mount, easeOutCubic.
 * Returns the current animated value. Reduced-motion users get the target immediately.
 */
export function useCountUp(target: number, duration = 750): number {
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!Number.isFinite(target)) { setVal(target); return }
    const reduce = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || target === 0) { setVal(target); return }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else setVal(target)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return val
}
