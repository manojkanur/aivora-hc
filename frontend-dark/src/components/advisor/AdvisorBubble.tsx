import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Send, Loader2, RotateCcw, MessageSquare } from 'lucide-react'
import { hcAiAdvisoryAPI } from '../../lib/hcPlatformApi'
import { useBriefStore, type WorkspaceBrief } from '../../store/briefStore'
import { getStudioById } from '../../lib/advisory/questionRouter'

type ChatMessage = { role: 'user' | 'assistant'; content: string; id: string }

const CHAT_STORAGE_KEY = 'aivora-advisor-bubble-v1'
const OPEN_STORAGE_KEY = 'aivora-advisor-bubble-open'

const SUGGESTIONS: string[] = [
  "Which studio should I run first?",
  "Explain what this output means",
  "What does the Talent Mobility studio do?",
  "Help me pick the right studio for succession",
  "Summarise my last brief",
]

function pickLatestBrief(briefs: Record<string, WorkspaceBrief>): WorkspaceBrief | null {
  const entries = Object.values(briefs)
  if (entries.length === 0) return null
  let latest = entries[0]
  for (const b of entries) {
    if (new Date(b.completedAt).getTime() > new Date(latest.completedAt).getTime()) {
      latest = b
    }
  }
  return latest
}

function loadStoredChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.slice(-40)
  } catch { /* ignore */ }
  return []
}

function saveStoredChat(m: ChatMessage[]): void {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(m.slice(-40))) } catch { /* ignore */ }
}

export function AdvisorBubble() {
  const location = useLocation()
  const params = useParams<{ studioId?: string; id?: string }>()
  const briefs = useBriefStore(s => s.briefs)
  const brief = pickLatestBrief(briefs)

  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(OPEN_STORAGE_KEY) === '1' } catch { return false }
  })
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredChat())
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unread, setUnread] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { saveStoredChat(messages) }, [messages])
  useEffect(() => {
    try { localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0') } catch { /* ignore */ }
    if (open) setUnread(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [draft])

  // Derive current context from route
  const ctx = useMemo(() => {
    const path = location.pathname
    let studioId: string | undefined
    let studioName: string | undefined
    let workspaceId: string | undefined
    if (path.startsWith('/studio/') && params.studioId) {
      studioId = params.studioId
      const s = getStudioById(studioId)
      if (s) studioName = s.name
    }
    if (path.startsWith('/workspaces/') && params.id) {
      workspaceId = params.id
    }
    return { path, studio_id: studioId, studio_name: studioName, workspace_id: workspaceId }
  }, [location.pathname, params.studioId, params.id])

  // Contextual placeholder + suggestions
  const contextHint = useMemo(() => {
    if (ctx.studio_name) return `Ask about the ${ctx.studio_name} output`
    if (ctx.path?.startsWith('/skills')) return "Not sure which studio to run? Ask me"
    if (ctx.path?.startsWith('/workspaces')) return "Ask about this workspace"
    if (ctx.path?.startsWith('/inbox')) return "Ask about your drafts"
    return "Ask anything about HC or the platform"
  }, [ctx])

  const suggestions = useMemo(() => {
    if (ctx.studio_name) return [
      `Walk me through the ${ctx.studio_name} output`,
      `What should I do with these findings?`,
      `Which studio should I run next after this one?`,
    ]
    if (ctx.path?.startsWith('/skills')) return [
      "Which studio fits my brief best?",
      "I want to fix succession - which studio?",
      "Help me pick between two studios",
    ]
    return SUGGESTIONS
  }, [ctx])

  const sendMessage = async (content: string) => {
    const text = content.trim()
    if (!text || sending) return
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: text, id: `u-${Date.now()}` }
    const next = [...messages, userMsg]
    setMessages(next)
    setDraft('')
    setSending(true)
    try {
      const res = await hcAiAdvisoryAPI.chat({
        messages: next.map(m => ({ role: m.role, content: m.content })),
        brief: brief ? (brief as unknown as Record<string, unknown>) : null,
        context: ctx,
      })
      const reply = res.data.reply
      setMessages(prev => [...prev, { role: 'assistant', content: reply, id: `a-${Date.now()}` }])
      if (!open) setUnread(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The advisor is unavailable right now.'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  const clear = () => {
    setMessages([])
    try { localStorage.removeItem(CHAT_STORAGE_KEY) } catch { /* ignore */ }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(draft)
    }
  }

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="bubble-fab"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-5 right-5 z-40 group"
            aria-label="Open AI Advisor"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-blue-500/40 blur-xl group-hover:bg-blue-500/60 transition-colors" />
              <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400/40 shadow-[0_10px_30px_rgba(37,99,235,0.35)] flex items-center justify-center hover:scale-105 transition-transform">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              {unread && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-[#0c0e14]" />
              )}
              {/* Hover tooltip */}
              <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                <div className="bg-[#131720] border border-[#1e2433] text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                  <p className="font-semibold text-blue-300">Ask your HC advisor</p>
                  <p className="text-slate-500 mt-0.5">Studios · Brief · Anything HC</p>
                </div>
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="bubble-panel"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-5 right-5 z-40 w-[calc(100vw-2.5rem)] sm:w-[420px] max-w-[420px] h-[600px] max-h-[calc(100vh-3rem)] rounded-2xl border border-[#1e2433] bg-[#0c0e14] shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1a1e2e] bg-[#0f1117]">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">HC Advisor</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {ctx.studio_name ? `on ${ctx.studio_name}` : 'senior consultant, on demand'}
                </p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={clear}
                  className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                  title="Clear conversation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-white transition-colors p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                      <MessageSquare className="w-3.5 h-3.5" />
                      How can I help?
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {ctx.studio_name
                        ? `You are on the ${ctx.studio_name} studio. Ask me to walk you through the output, pick what to focus on, or point you at what to run next.`
                        : brief
                          ? `I have your ${brief.industry || 'brief'} context loaded. Ask me anything about your HC challenge, or which studio to run.`
                          : `I can help you pick the right studio, explain any output, or advise on your HC challenge. What are you working on?`}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-600">Try one of these</p>
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left rounded-xl border border-[#1e2433] bg-[#0f1117] hover:border-blue-500/40 hover:bg-[#111420] px-3 py-2.5 text-xs text-slate-200 leading-relaxed transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map(m => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {m.role === 'assistant' ? (
                      <div className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Sparkles className="w-3 h-3 text-blue-400" />
                        </div>
                        <div className="rounded-xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-3 py-2.5 text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap max-w-[calc(100%-2rem)]">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <div className="rounded-xl rounded-tr-sm bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] px-3 py-2 text-[13px] max-w-[85%] whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {sending && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                  </div>
                  <div className="rounded-xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-3 py-2.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-[11px] px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-[#1a1e2e] bg-[#0f1117] px-3 py-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 rounded-xl border border-[#1e2433] bg-[#0c0e14] focus-within:border-blue-500/40 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    disabled={sending}
                    placeholder={contextHint}
                    className="w-full bg-transparent text-[13px] text-white placeholder:text-slate-600 focus:outline-none px-3 py-2.5 resize-none leading-relaxed max-h-40"
                  />
                </div>
                <button
                  onClick={() => sendMessage(draft)}
                  disabled={!draft.trim() || sending}
                  className={
                    draft.trim() && !sending
                      ? 'inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white w-9 h-9 shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors flex-shrink-0'
                      : 'inline-flex items-center justify-center rounded-xl bg-slate-800 text-slate-500 w-9 h-9 cursor-not-allowed flex-shrink-0'
                  }
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
