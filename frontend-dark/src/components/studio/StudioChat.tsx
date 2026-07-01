/**
 * Floating AI chat panel for a draft / studio output dashboard.
 *
 * Discuss the report or instruct the AI to edit it. Edits are applied as a
 * partial content patch to the draft via POST /ai/drafts/{id}/chat. The caller
 * is notified via onContentPatched so the parent dashboard re-renders.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, X, MessageSquareText, Loader2, Wand2 } from 'lucide-react'
import { draftsAPI } from '../../lib/api'
import { toast } from '../ui/Toast'
import { cn } from '../../lib/utils'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  applied?: boolean
  appliedKeys?: string[]
}

interface Props {
  draftId: string
  studioName: string
  /** Suggested quick prompts shown above the input. */
  quickPrompts?: string[]
  /** Called when the AI returns a content patch — gives back the merged content. */
  onContentPatched?: (content: Record<string, unknown>) => void
}

const DEFAULT_PROMPTS = [
  'Tighten the executive summary',
  'Add a recommendation on succession planning',
  'Strengthen the rationales',
  'Make the tone board-level',
]

export function StudioChat({ draftId, studioName, quickPrompts, onContentPatched }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // Seed with a friendly intro the first time the panel opens
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        text: `Hi, I'm the ${studioName} advisor. Ask me anything about this report, or tell me what to change. I can rewrite sections, add recommendations, or tighten the tone.`,
      }])
    }
  }, [open, messages.length, studioName])

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || busy) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setBusy(true)
    try {
      // Send only the last 6 messages so the prompt stays small
      const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text }))
      const res = await draftsAPI.chat(draftId, text, history)
      const reply: string = res.data?.reply ?? 'Done.'
      const applied: boolean = !!res.data?.patch_applied
      const appliedKeys: string[] = Array.isArray(res.data?.applied_keys) ? res.data.applied_keys : []
      const newContent = res.data?.content as Record<string, unknown> | null | undefined
      setMessages(prev => [...prev, { role: 'assistant', text: reply, applied, appliedKeys }])
      if (applied && newContent && onContentPatched) {
        onContentPatched(newContent)
        toast.success(appliedKeys.length > 0
          ? `Updated: ${appliedKeys.map(k => k.replace(/_/g, ' ')).join(', ')}`
          : 'Report updated')
      }
    } catch {
      toast.error('Chat failed. Try a more specific prompt.')
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I could not process that. Try a more specific prompt.' }])
    } finally {
      setBusy(false)
    }
  }

  const prompts = quickPrompts && quickPrompts.length > 0 ? quickPrompts : DEFAULT_PROMPTS

  return (
    <>
      {/* Floating launcher button (bottom-right) */}
      {!open && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 group flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-[0_8px_28px_rgba(37,99,235,0.45)] hover:shadow-[0_8px_36px_rgba(37,99,235,0.55)]"
        >
          <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold">Ask AI</span>
        </motion.button>
      )}

      {/* Slide-in panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 z-40 w-[min(420px,calc(100vw-32px))] h-[min(640px,calc(100vh-100px))] rounded-2xl border border-[#1e2433] bg-[#0c0e14] shadow-[0_24px_64px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#1e2433] bg-gradient-to-r from-blue-500/10 to-violet-500/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-[0_0_0_2px_rgba(59,130,246,0.15)]">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    AI Advisory
                    <span className="text-[10px] uppercase tracking-widest text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">Live</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{studioName}</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg border border-[#1e2433] text-slate-400 hover:text-white hover:border-blue-500/40 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {m.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm shadow-[0_2px_8px_rgba(37,99,235,0.25)]'
                      : 'bg-blue-500/5 border border-blue-500/15 text-slate-200 rounded-tl-sm',
                  )}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.applied && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          <Wand2 className="w-3 h-3" /> Updated
                        </span>
                        {(m.appliedKeys ?? []).map(k => (
                          <span key={k} className="text-[10px] uppercase tracking-widest font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                            {k.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            {/* Quick prompts */}
            {messages.length <= 2 && (
              <div className="px-4 py-2 border-t border-[#1e2433] flex flex-wrap gap-1.5">
                {prompts.map(p => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={busy}
                    className="text-[11px] text-slate-300 bg-[#131720] border border-[#1e2433] hover:border-blue-500/40 hover:text-white px-2.5 py-1 rounded-full disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-3 border-t border-[#1e2433] bg-[#0a0c12]">
              <div className="flex items-center gap-2 rounded-xl border border-[#1e2433] bg-[#131720] focus-within:border-blue-500/40 px-3 py-2">
                <MessageSquareText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !busy) send() }}
                  placeholder="Ask or instruct…"
                  disabled={busy}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 text-center">AI replies and edits update the draft in place. Validate before approving.</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
