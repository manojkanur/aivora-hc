import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, RotateCcw, ArrowRight, FileText, Target, Plus, LayoutGrid,
  MessageSquare, Loader2, Send, ClipboardList, Paperclip, X, Pencil,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QuestionCard } from '../components/advisory/QuestionCard'
import { useAdvisoryStore } from '../store/advisory'
import { getDiagnosticQuestions } from '../lib/advisory/questionRouter'
import { getTier, getDimension } from '../lib/advisory/scoring'
import { topRecommendations, getStudio } from '../lib/advisory/recommendations'
import chatPersona from '../lib/seeds/chatPersona.json'
import type { AnswerValue, Question } from '../lib/advisory/types'
import StudioOutput, { type StudioOutputDocument, type StudioOutputSection } from '../components/studio/renderer/StudioRenderer'
import { hcAiAdvisoryAPI, type AdvisoryProfile } from '../lib/hcPlatformApi'
import { useBriefStore, type WorkspaceBrief } from '../store/briefStore'

const DELIVERABLE_TOPICS: Array<{ key: string; label: string }> = [
  { key: 'hipo_program', label: 'HIPO Program' },
  { key: 'succession_framework', label: 'Succession Framework' },
  { key: 'leadership_development', label: 'Leadership Development' },
  { key: 'performance_management', label: 'Performance Management' },
  { key: 'culture_program', label: 'Culture Program' },
  { key: 'talent_review', label: 'Talent Review' },
  { key: 'engagement_program', label: 'Engagement Program' },
  { key: 'diversity_program', label: 'Diversity Program' },
  { key: 'comp_framework', label: 'Compensation Framework' },
  { key: 'learning_strategy', label: 'Learning Strategy' },
  { key: 'org_design', label: 'Org Design' },
  { key: 'evp_strategy', label: 'EVP Strategy' },
  { key: 'total_rewards', label: 'Total Rewards' },
  { key: 'change_management', label: 'Change Management' },
  { key: 'dei_strategy', label: 'DEI Strategy' },
  { key: 'workforce_planning', label: 'Workforce Planning' },
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

function readActiveReviewId(): string | null {
  try {
    const raw = localStorage.getItem('aivora-active-review-id')
    if (raw) return raw
  } catch { /* ignore */ }
  return null
}

// ---------------------------------------------------------------------------
// Advisory profile (first-run intake)
// ---------------------------------------------------------------------------

const PROFILE_STORAGE_KEY = 'aivora-advisory-profile-v1'

const PERSONAS = [
  'CHRO', 'HRBP', 'Consultant', 'Talent Management', 'Organization Development',
  'Learning', 'Workforce Planning', 'HR Operations', 'Business Leader',
] as const

function loadStoredProfile(): AdvisoryProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.persona === 'string') return parsed as AdvisoryProfile
  } catch { /* ignore */ }
  return null
}

function saveStoredProfile(profile: AdvisoryProfile): void {
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)) } catch { /* ignore */ }
}

function IntakeCard({ initial, onStart }: { initial: AdvisoryProfile | null; onStart: (p: AdvisoryProfile) => void }) {
  const [persona, setPersona] = useState<string>(initial?.persona ?? '')
  const [org, setOrg] = useState(initial?.organization_name ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [companySize, setCompanySize] = useState(initial?.company_size ?? '')
  const [objective, setObjective] = useState(initial?.objective ?? '')

  const start = () => {
    if (!persona) return
    onStart({
      persona,
      organization_name: org.trim() || undefined,
      industry: industry.trim() || undefined,
      region: region.trim() || undefined,
      company_size: companySize.trim() || undefined,
      objective: objective.trim() || undefined,
    })
  }

  const inputCls = 'w-full rounded-xl bg-[#0c0e14] border border-[#1e2433] text-sm text-white placeholder:text-slate-600 px-3.5 py-2.5 focus:outline-none focus:border-blue-500/50 transition-colors'

  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl rounded-2xl border border-[#1e2433] bg-[#131720] p-7 sm:p-8 space-y-6"
      >
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Set up your advisory session</h1>
            <p className="text-sm text-slate-400 mt-1.5">Thirty seconds. It shapes every answer you get.</p>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500 block mb-2">I work as a <span className="text-blue-400">*</span></label>
          <div className="flex flex-wrap gap-2">
            {PERSONAS.map(p => (
              <button
                key={p}
                onClick={() => setPersona(p)}
                className={
                  persona === p
                    ? 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors'
                    : 'px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 border border-[#1e2433] bg-[#0c0e14] hover:border-blue-500/40 hover:text-white transition-colors'
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={org} onChange={e => setOrg(e.target.value)} placeholder="Organization (optional)" className={inputCls} />
          <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Industry (optional)" className={inputCls} />
          <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Region (optional)" className={inputCls} />
          <input value={companySize} onChange={e => setCompanySize(e.target.value)} placeholder="Company size (optional)" className={inputCls} />
        </div>
        <input value={objective} onChange={e => setObjective(e.target.value)} placeholder="What are you trying to achieve? (optional)" className={inputCls} />

        <button
          onClick={start}
          disabled={!persona}
          className={
            persona
              ? 'w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] ring-1 ring-blue-500/40 transition-colors'
              : 'w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-500 px-5 py-3 text-sm font-semibold cursor-not-allowed'
          }
        >
          Start advisory session <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown rendering for assistant replies
// ---------------------------------------------------------------------------

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-slate-200 leading-relaxed space-y-3 [&_strong]:text-white [&_code]:text-blue-300 [&_code]:bg-[#0c0e14] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.85em]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-base font-semibold text-white mt-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold text-white mt-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-sm font-semibold text-white mt-1">{children}</h4>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">{children}</a>,
          table: ({ children }) => (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="text-slate-300">{children}</thead>,
          th: ({ children }) => <th className="text-left font-semibold border border-[#1e2433] bg-[#0c0e14] px-2.5 py-1.5">{children}</th>,
          td: ({ children }) => <td className="border border-[#1e2433] px-2.5 py-1.5 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-blue-500/40 pl-3 text-slate-400 italic">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Real conversational chat — the primary tab
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'user' | 'assistant'; content: string; id: string }
type Attachment = { evidence_id: string; filename: string }

const CHAT_STORAGE_KEY = 'aivora-advisor-chat-v2'

const ADVISORY_PATHS: string[] = [
  'Assess our HC maturity',
  'Build a talent mobility strategy',
  'Design a HIPO program',
  'Draft a workforce plan',
]

const FORMAT_HINTS: string[] = ['Framework', 'Roadmap', 'RACI', 'KPI scorecard', 'Executive brief', 'SWOT']

const EVIDENCE_ACCEPT = '.pdf,.docx,.txt,.md,.pptx'

function loadStoredChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.slice(-40)
  } catch { /* ignore */ }
  return []
}

function saveStoredChat(messages: ChatMessage[]): void {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40))) } catch { /* ignore */ }
}

function ConversationPanel({ profile }: { profile: AdvisoryProfile }) {
  const briefs = useBriefStore(s => s.briefs)
  const brief = pickLatestBrief(briefs)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredChat())
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { saveStoredChat(messages) }, [messages])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    // Autosize textarea
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [draft])

  const sendMessage = async (content: string) => {
    const clean = content.trim()
    if (!clean || sending) return
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: clean, id: `u-${Date.now()}` }
    const next = [...messages, userMsg]
    setMessages(next)
    setDraft('')
    setSending(true)
    try {
      const payload = {
        messages: next.map(m => ({ role: m.role, content: m.content })),
        brief: brief ? (brief as unknown as Record<string, unknown>) : null,
        profile,
        evidence_ids: attachments.length > 0 ? attachments.map(a => a.evidence_id) : undefined,
      }
      const res = await hcAiAdvisoryAPI.chat(payload)
      const reply = res.data.reply
      setMessages(prev => [...prev, { role: 'assistant', content: reply, id: `a-${Date.now()}` }])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The advisor is unavailable right now.'
      setError(msg)
      // Rollback the user message stays; user can retry.
    } finally {
      setSending(false)
    }
  }

  const clear = () => {
    setMessages([])
    setAttachments([])
    localStorage.removeItem(CHAT_STORAGE_KEY)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(draft)
    }
  }

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || uploading) return
    setError(null)
    setUploading(true)
    try {
      const res = await hcAiAdvisoryAPI.uploadEvidence(file)
      setAttachments(prev => [...prev, { evidence_id: res.data.evidence_id, filename: res.data.filename }])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not read that file. Try a pdf, docx, txt, md or pptx.')
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.evidence_id !== id))
  }

  const appendFormatHint = (fmt: string) => {
    setDraft(prev => {
      const base = prev.trimEnd()
      const hint = `Format the answer as a ${fmt}.`
      return base ? `${base}\n${hint}` : hint
    })
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] rounded-2xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden">
      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto text-center space-y-6 py-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Talk to your HC advisor</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Twenty years of consulting experience, on demand. Ask anything about your workforce, capability, leadership pipeline, or strategy. I will ask clarifying questions and give you a real point of view.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-2">Where do you want to start?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {ADVISORY_PATHS.map(p => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="rounded-full border border-[#1e2433] bg-[#0f1117] hover:border-blue-500/40 hover:bg-[#111420] px-4 py-2 text-sm text-slate-200 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map(m => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {m.role === 'assistant' ? (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3">
                    <AssistantMarkdown content={m.content} />
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] px-4 py-2.5 text-sm max-w-[75%] whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[#1e2433] bg-[#0f1117] px-4 sm:px-6 py-4">
        {/* Output-format hints */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5">
          <span className="text-[11px] text-slate-600 flex-shrink-0">Format as</span>
          {FORMAT_HINTS.map(f => (
            <button
              key={f}
              onClick={() => appendFormatHint(f)}
              className="flex-shrink-0 rounded-full border border-[#1e2433] bg-[#0c0e14] hover:border-blue-500/40 hover:text-white px-3 py-1 text-[11px] text-slate-400 transition-colors"
            >
              {f}
            </button>
          ))}
        </div>

        {/* Attached evidence pills */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map(a => (
              <span key={a.evidence_id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-[11px] px-2.5 py-1">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-[180px] truncate">{a.filename}</span>
                <button onClick={() => removeAttachment(a.evidence_id)} className="hover:text-white transition-colors" aria-label={`Remove ${a.filename}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <input ref={fileInputRef} type="file" accept={EVIDENCE_ACCEPT} className="hidden" onChange={handleFilePicked} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
            title="Attach evidence (pdf, docx, txt, md, pptx)"
            className="flex-shrink-0 w-11 h-11 rounded-xl border border-[#1e2433] bg-[#0c0e14] hover:border-blue-500/40 text-slate-400 hover:text-blue-400 flex items-center justify-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <div className="flex-1 rounded-xl border border-[#1e2433] bg-[#0c0e14] focus-within:border-blue-500/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={sending}
              placeholder={
                brief
                  ? `Ask about ${brief.organizationName || 'your organisation'} — press Enter to send, Shift + Enter for a new line`
                  : 'Ask anything about your HC challenge — press Enter to send'
              }
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none px-3.5 py-3 resize-none leading-relaxed"
            />
          </div>
          <button
            onClick={() => sendMessage(draft)}
            disabled={!draft.trim() || sending}
            className={
              draft.trim() && !sending
                ? 'inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] transition-colors'
                : 'inline-flex items-center gap-2 rounded-xl bg-slate-800 text-slate-500 px-4 py-2.5 text-sm font-semibold cursor-not-allowed'
            }
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
        {messages.length > 0 && (
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[11px] text-slate-600">
              {brief ? `Grounded in your ${brief.industry || 'organisation'} brief` : 'No brief connected yet. The advisor will ask grounding questions if needed.'}
            </div>
            <button
              onClick={clear}
              className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Clear conversation
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Structured deliverable panel (kept as a tab)
// ---------------------------------------------------------------------------

function DeliverablePanel() {
  const [topic, setTopic] = useState<string>(DELIVERABLE_TOPICS[0].key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<StudioOutputDocument | null>(null)
  const briefs = useBriefStore(s => s.briefs)
  const currentBrief = pickLatestBrief(briefs)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setDoc(null)
    try {
      const reviewId = readActiveReviewId()
      const res = await hcAiAdvisoryAPI.deliverable({
        topic,
        review_id: reviewId,
        brief: currentBrief ? (currentBrief as unknown as Record<string, unknown>) : null,
      })
      setDoc(res.data.document as StudioOutputDocument)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate deliverable'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateSection = async (sectionId: string, hint: string | null) => {
    if (!doc) return
    try {
      const reviewId = readActiveReviewId()
      const res = await hcAiAdvisoryAPI.regenerateSection({
        topic,
        section_id: sectionId,
        review_id: reviewId,
        brief: currentBrief ? (currentBrief as unknown as Record<string, unknown>) : null,
        hint,
      })
      const updated = res.data.section as StudioOutputSection
      setDoc(prev => prev ? { ...prev, sections: prev.sections.map(s => s.id === updated.id ? updated : s) } : prev)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate section'
      setError(msg)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-5">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Generate Framework / Program</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Produces a multi-section deliverable grounded in the recommendation library and your latest review data.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#0c0e14] border border-[#1e2433] text-sm text-slate-100 px-3 py-2.5 focus:outline-none focus:border-blue-500/50"
          >
            {DELIVERABLE_TOPICS.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] ring-1 ring-blue-500/40"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>
        )}
      </div>

      {doc && (
        <div className="rounded-2xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden">
          <StudioOutput document={doc} onRegenerateSection={handleRegenerateSection} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guided diagnostic (the old wizard, kept as a tab)
// ---------------------------------------------------------------------------

type Bubble =
  | { role: 'advisor'; text: string; id: string }
  | { role: 'user';    text: string; id: string }
  | { role: 'question'; question: Question; id: string }
  | { role: 'report'; id: string }

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function formatAnswerLabel(q: Question, v: AnswerValue): string {
  if (q.type === 'likert' && typeof v === 'number') {
    return ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'][v - 1] ?? `${v}`
  }
  if (q.type === 'single' && typeof v === 'string') {
    return q.options?.find(o => o.value === v)?.label ?? v
  }
  if (q.type === 'multi' && Array.isArray(v)) {
    if (v.length === 0) return '(none selected)'
    return v.map(val => q.options?.find(o => o.value === val)?.label ?? val).join(', ')
  }
  return String(v)
}

function ackForAnswer(q: Question, v: AnswerValue): string {
  if (q.dimensions.length === 0) return pickRandom(chatPersona.acknowledgments.mid)
  if (q.type === 'likert' && typeof v === 'number') {
    if (v <= 2) return pickRandom(chatPersona.acknowledgments.low)
    if (v === 3) return pickRandom(chatPersona.acknowledgments.mid)
    return pickRandom(chatPersona.acknowledgments.high)
  }
  if (q.type === 'single' && typeof v === 'string' && q.options) {
    const idx = q.options.findIndex(o => o.value === v)
    const rel = idx / Math.max(1, q.options.length - 1)
    if (rel < 0.34) return pickRandom(chatPersona.acknowledgments.low)
    if (rel < 0.67) return pickRandom(chatPersona.acknowledgments.mid)
    return pickRandom(chatPersona.acknowledgments.high)
  }
  return pickRandom(chatPersona.acknowledgments.mid)
}

function GuidedDiagnostic() {
  const { answers, setAnswer, report, diagnosticComplete, markDiagnosticComplete, resetDiagnostic } = useAdvisoryStore()
  const allQuestions = useMemo(() => getDiagnosticQuestions(), [])
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showReport, setShowReport] = useState(diagnosticComplete)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showReport) return
    if (bubbles.length === 0) {
      const opening = pickRandom(chatPersona.openings)
      const firstQ = allQuestions[0]
      setBubbles([
        { role: 'advisor', text: opening, id: 'opening' },
        { role: 'question', question: firstQ, id: `q-${firstQ.id}` },
      ])
    }
  }, [bubbles.length, allQuestions, showReport])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, showReport])

  const handleAnswer = (q: Question, v: AnswerValue) => {
    setAnswer(q.id, v)
    const ack = ackForAnswer(q, v)
    const nextIdx = currentIdx + 1
    const next = allQuestions[nextIdx]
    const userLabel = formatAnswerLabel(q, v)
    const lastDim = q.dimensions[0]
    const nextDim = next?.dimensions[0]
    const showTransition = next && nextDim && nextDim !== lastDim
    const transition = showTransition
      ? pickRandom(chatPersona.transitions).replace('{dimension}', getDimension(nextDim)?.name.toLowerCase() ?? '')
      : null

    setBubbles(prev => {
      const replaced = prev.map(b => (b.role === 'question' && b.question.id === q.id ? { role: 'user' as const, text: userLabel, id: `u-${q.id}` } : b))
      const additions: Bubble[] = [{ role: 'advisor', text: ack, id: `a-${q.id}` }]
      if (transition) additions.push({ role: 'advisor', text: transition, id: `t-${q.id}` })
      if (next) additions.push({ role: 'question', question: next, id: `q-${next.id}` })
      else additions.push({ role: 'report', id: 'final-report' })
      return [...replaced, ...additions]
    })
    setCurrentIdx(nextIdx)
    if (!next) {
      markDiagnosticComplete()
      setShowReport(true)
    }
  }

  const restart = () => {
    resetDiagnostic()
    setBubbles([])
    setCurrentIdx(0)
    setShowReport(false)
  }

  return (
    <div>
      {(bubbles.length > 0 || showReport) && (
        <div className="flex justify-end mb-3">
          <button onClick={restart} className="text-xs text-slate-400 hover:text-white flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1e2433] hover:border-blue-500/40">
            <RotateCcw className="w-3.5 h-3.5" /> Restart diagnostic
          </button>
        </div>
      )}

      {!showReport && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Guided assessment progress</span>
            <span>{currentIdx} of {allQuestions.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
            <motion.div
              className="h-full bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${(currentIdx / allQuestions.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="space-y-4 max-h-[calc(100vh-18rem)] overflow-y-auto pr-2">
        <AnimatePresence initial={false}>
          {bubbles.map(b => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {b.role === 'advisor' && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-[#131720] border border-[#1e2433] px-4 py-3 text-sm text-slate-200 leading-relaxed">
                    {b.text}
                  </div>
                </div>
              )}
              {b.role === 'user' && (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] px-4 py-2.5 text-sm max-w-[70%]">
                    {b.text}
                  </div>
                </div>
              )}
              {b.role === 'question' && (
                <div className="pl-11">
                  <QuestionCard
                    question={b.question}
                    value={answers[b.question.id]}
                    onChange={v => handleAnswer(b.question, v)}
                    index={currentIdx}
                    total={allQuestions.length}
                  />
                </div>
              )}
              {b.role === 'report' && report && <ReportPanel />}
            </motion.div>
          ))}
        </AnimatePresence>
        {showReport && report && bubbles.length === 0 && <ReportPanel standalone />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page shell with tabs
// ---------------------------------------------------------------------------

type Tab = 'chat' | 'deliverable' | 'assessment'

export default function AdvisorChat() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [profile, setProfile] = useState<AdvisoryProfile | null>(() => loadStoredProfile())
  const [editingProfile, setEditingProfile] = useState(false)

  const handleStart = (p: AdvisoryProfile) => {
    saveStoredProfile(p)
    setProfile(p)
    setEditingProfile(false)
  }

  if (!profile || editingProfile) {
    return <IntakeCard initial={profile} onStart={handleStart} />
  }

  const orgLine = [profile.organization_name, profile.industry].filter(Boolean).join(' · ')

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-5">
      {/* Slim profile strip */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-white">Advisory Command Centre</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full px-2.5 py-0.5">
                {profile.persona}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {orgLine && <span className="text-xs text-slate-400 truncate">{orgLine}</span>}
              <button
                onClick={() => setEditingProfile(true)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-400 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[#0c0e14] border border-[#1e2433] w-fit">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={MessageSquare} label="Conversation" />
          <TabButton active={activeTab === 'deliverable'} onClick={() => setActiveTab('deliverable')} icon={LayoutGrid} label="Deliverables" />
          <TabButton active={activeTab === 'assessment'} onClick={() => setActiveTab('assessment')} icon={ClipboardList} label="Guided assessment" />
        </div>
      </div>

      {activeTab === 'chat' && <ConversationPanel profile={profile} />}
      {activeTab === 'deliverable' && <DeliverablePanel />}
      {activeTab === 'assessment' && <GuidedDiagnostic />}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors'
          : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors'
      }
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Report panel (assessment result)
// ---------------------------------------------------------------------------

function ReportPanel({ standalone = false }: { standalone?: boolean }) {
  const report = useAdvisoryStore(s => s.report)
  if (!report) return null
  const tier = getTier(report.overallTier)
  const recs = topRecommendations(report, 3)
  const closing = chatPersona.closingNarratives[report.overallTier as keyof typeof chatPersona.closingNarratives]

  return (
    <div className={standalone ? '' : 'pl-11'}>
      <div className="rounded-2xl border border-[#1e2433] bg-gradient-to-br from-[#131720] to-[#0c0e14] p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">Assessment complete</div>
            <h2 className="text-2xl font-semibold text-white">Overall maturity: <span style={{ color: tier.color }}>{tier.label}</span></h2>
            <p className="text-sm text-slate-400 mt-1">Score: <span className="text-white font-medium">{report.overallScore}</span> / 100</p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold" style={{ color: tier.color }}>{report.overallScore}</div>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-blue-500/40 pl-4 italic">{closing}</p>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-blue-400" /> Dimension scores</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.dimensions.map(d => {
              const dim = getDimension(d.dimensionId)!
              const t = getTier(d.tier)
              return (
                <div key={d.dimensionId} className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">{dim.name}</span>
                    <span className="text-xs font-semibold" style={{ color: t.color }}>{d.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: t.color }} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1.5">{t.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Top recommendations</h3>
          <div className="space-y-3">
            {recs.map(r => {
              const dim = getDimension(r.dimensionId)
              return (
                <div key={r.id} className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-blue-400 mb-1">{dim?.name} · {r.horizon}</div>
                      <div className="text-sm font-medium text-white">{r.title}</div>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${r.priority === 'high' ? 'bg-red-500/15 text-red-400' : r.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{r.priority}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{r.rationale}</p>
                  {r.suggestedStudios.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.suggestedStudios.map(sid => {
                        const studio = getStudio(sid)
                        if (!studio) return null
                        return (
                          <Link key={sid} to="/skills" className="text-[11px] text-blue-300 hover:text-blue-200 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-lg">
                            {studio.name} →
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/workspaces" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-[0_2px_12px_rgba(37,99,235,0.35)] ring-1 ring-blue-500/40">
            <Plus className="w-4 h-4" /> Add workspace
          </Link>
          <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e2433] hover:border-blue-500/40 text-slate-200 text-sm">
            Open dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/skills" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e2433] hover:border-blue-500/40 text-slate-200 text-sm">
            Browse studios
          </Link>
        </div>
      </div>
    </div>
  )
}
