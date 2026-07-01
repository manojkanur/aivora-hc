import { AlertTriangle, Info, CheckCircle2, AlertCircle } from 'lucide-react'

interface CalloutData {
  tone?: 'info' | 'warn' | 'success' | 'danger'
  title?: string
  body?: string
}

const toneCls: Record<string, { bg: string; border: string; text: string; Icon: typeof Info }> = {
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    Icon: Info,
  },
  success: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
    Icon: CheckCircle2,
  },
  warn: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-300',
    Icon: AlertTriangle,
  },
  danger: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-300',
    Icon: AlertCircle,
  },
}

export default function CalloutSection({ data }: { data: CalloutData }) {
  const tone = toneCls[data.tone || 'info'] || toneCls.info
  const { Icon } = tone
  return (
    <div className={`rounded-2xl border p-5 ${tone.bg} ${tone.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${tone.text}`} />
        <div className="flex-1">
          {data.title && <div className={`font-semibold text-sm ${tone.text}`}>{data.title}</div>}
          {data.body && (
            <p className="text-sm text-slate-200 mt-1 leading-relaxed">{data.body}</p>
          )}
        </div>
      </div>
    </div>
  )
}
