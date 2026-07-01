import { Check, Loader2, AlertCircle, CloudOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AutosaveStatus } from '../../hooks/useAutosave'
import { cn } from '../../lib/utils'

interface SaveIndicatorProps {
  status: AutosaveStatus
  className?: string
}

export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  return (
    <div className={cn('inline-flex items-center gap-1.5 text-[11px]', className)}>
      <AnimatePresence mode="wait">
        {status === 'saving' && (
          <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </motion.span>
        )}
        {status === 'saved' && (
          <motion.span key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-emerald-400">
            <Check className="w-3 h-3" /> Saved
          </motion.span>
        )}
        {status === 'error' && (
          <motion.span key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="w-3 h-3" /> Save failed, will retry
          </motion.span>
        )}
        {status === 'idle' && (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5 text-slate-600">
            <CloudOff className="w-3 h-3" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
