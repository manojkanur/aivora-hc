import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Question, AnswerValue } from '../../lib/advisory/types'

interface QuestionCardProps {
  question: Question
  value: AnswerValue | undefined
  onChange: (v: AnswerValue) => void
  index?: number
  total?: number
}

const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']

export function QuestionCard({ question, value, onChange, index, total }: QuestionCardProps) {
  return (
    <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-6">
      {typeof index === 'number' && typeof total === 'number' && (
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">
          Question {index + 1} of {total}
        </div>
      )}
      <h3 className="text-lg font-medium text-white leading-relaxed mb-5">{question.text}</h3>

      {question.type === 'likert' && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {LIKERT_LABELS.map((label, i) => {
            const v = i + 1
            const selected = value === v
            return (
              <button
                key={v}
                onClick={() => onChange(v)}
                className={cn(
                  'rounded-xl border px-3 py-3 text-xs font-medium transition-all',
                  selected
                    ? 'border-blue-500 bg-blue-500/15 text-blue-200 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]'
                    : 'border-[#1e2433] bg-[#0c0e14] text-slate-400 hover:border-blue-500/40 hover:text-slate-200',
                )}
              >
                <div className="text-lg font-semibold text-white mb-1">{v}</div>
                <div className="leading-snug">{label}</div>
              </button>
            )
          })}
        </div>
      )}

      {question.type === 'single' && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const selected = value === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={cn(
                  'w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  selected
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-[#1e2433] bg-[#0c0e14] text-slate-300 hover:border-blue-500/40 hover:text-white',
                )}
              >
                <span className="text-sm">{opt.label}</span>
                {selected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}

      {question.type === 'multi' && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const arr = Array.isArray(value) ? (value as string[]) : []
            const selected = arr.includes(opt.value)
            const toggle = () => {
              const next = selected ? arr.filter((v) => v !== opt.value) : [...arr, opt.value]
              onChange(next)
            }
            return (
              <button
                key={opt.value}
                onClick={toggle}
                className={cn(
                  'w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  selected
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-[#1e2433] bg-[#0c0e14] text-slate-300 hover:border-blue-500/40 hover:text-white',
                )}
              >
                <span className="text-sm">{opt.label}</span>
                <span
                  className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                    selected ? 'border-blue-400 bg-blue-500' : 'border-slate-600',
                  )}
                >
                  {selected && <Check className="w-3 h-3 text-white" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
