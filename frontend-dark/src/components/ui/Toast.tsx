import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Info, Zap, X } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '../../lib/utils'
import { useEffect, forwardRef } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info' | 'xp-award'

export interface Toast {
  id: string
  type: ToastType
  message: string
  xpAmount?: number
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set(state => ({ toasts: [...state.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, toast.duration || 4000)
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}))

export const toast = {
  success: (message: string) => useToastStore.getState().addToast({ type: 'success', message }),
  error: (message: string) => useToastStore.getState().addToast({ type: 'error', message }),
  info: (message: string) => useToastStore.getState().addToast({ type: 'info', message }),
  xp: (message: string, xpAmount: number) =>
    useToastStore.getState().addToast({ type: 'xp-award', message, xpAmount }),
}

const toastConfig: Record<ToastType, { icon: typeof CheckCircle; className: string; iconClass: string }> = {
  success: {
    icon: CheckCircle,
    className: 'bg-[#131720] text-white border-[rgba(34,197,94,0.25)] shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
    iconClass: 'text-emerald-400',
  },
  error: {
    icon: XCircle,
    className: 'bg-[#131720] text-white border-[rgba(239,68,68,0.25)] shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
    iconClass: 'text-red-400',
  },
  info: {
    icon: Info,
    className: 'bg-[#131720] text-white border-[#1e2433] shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
    iconClass: 'text-[#3b82f6]',
  },
  'xp-award': {
    icon: Zap,
    className: 'bg-[#131720] text-white border-[rgba(59,130,246,0.3)] shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
    iconClass: 'text-[#3b82f6]',
  },
}

const ToastItem = forwardRef<HTMLDivElement, { toast: Toast }>(({ toast }, ref) => {
  const { removeToast } = useToastStore()
  const config = toastConfig[toast.type]
  const Icon = config.icon

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border min-w-[280px] max-w-[380px]',
        config.className
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', config.iconClass)} />
      <div className="flex-1 text-sm">
        <span>{toast.message}</span>
        {toast.type === 'xp-award' && toast.xpAmount && (
          <span className="ml-1 font-bold text-yellow-400">+{toast.xpAmount} XP</span>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
})

export function ToastContainer() {
  const { toasts } = useToastStore()

  const content = (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )

  return createPortal(content, document.body)
}

export function useInsufficientCreditsHandler() {
  const { addToast } = useToastStore()
  useEffect(() => {
    const handler = () => addToast({ type: 'error', message: 'Insufficient credits. Please top up to continue.' })
    window.addEventListener('insufficient-credits', handler)
    return () => window.removeEventListener('insufficient-credits', handler)
  }, [addToast])
}
