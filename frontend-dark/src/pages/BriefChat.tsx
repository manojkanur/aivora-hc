import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Sparkles, Send, Loader2, Check, Circle, CircleDot, ArrowRight,
  Building2, BarChart2, AlertTriangle, FileSearch, RotateCcw,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'
import { api, challengeBriefsAPI, workspacesAPI } from '../lib/api'
import { hcBriefChatAPI, type BriefSectionKey, type BriefSectionStatus } from '../lib/hcPlatformApi'
import { useBriefStore } from '../store/briefStore'
import { useClientProfileStore } from '../store/clientProfile'
import { useOnboardingCompletions } from '../store/onboardingCompletions'
import { defaultBrief, type ChallengeBriefData } from './ChallengeBrief'

type ChatMsg = { role: 'user' | 'assistant'; content: string; id: string }

const STORAGE_KEY = 'aivora-brief-chat-v1'

interface StoredSession {
  messages: ChatMsg[]
  brief: ChallengeBriefData
  sections: Record<BriefSectionKey, BriefSectionStatus>
  done: boolean
}

const SECTION_META: { key: BriefSectionKey; label: string; icon: typeof Building2 }[] = [
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'situation', label: 'Business situation', icon: BarChart2 },
  { key: 'challenges', label: 'HC challenges', icon: AlertTriangle },
  { key: 'outputs', label: 'Desired outputs', icon: FileSearch },
]

const EMPTY_SECTIONS: Record<BriefSectionKey, BriefSectionStatus> = {
  organization: 'pending', situation: 'pending', challenges: 'pending', outputs: 'pending',
}

function prettySlug(v: unknown): string {
  return String(v ?? '').replace(/-/g, ' ')
}

/** Merge an LLM patch into the brief. Objects merge shallowly per section; arrays replace. */
function mergePatch(brief: ChallengeBriefData, patch: Record<string, unknown>): ChallengeBriefData {
  const next = { ...brief }
  const sections = ['organization', 'businessSituation', 'hcChallenges', 'desiredOutputs'] as const
  for (const key of sections) {
    const p = patch[key]
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      next[key] = { ...next[key], ...(p as object) } as never
    }
  }
  return next
}

function loadSession(workspaceId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${workspaceId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.messages) && parsed.brief) return parsed as StoredSession
  } catch { /* ignore */ }
  return null
}

function saveSession(workspaceId: string, s: StoredSession): void {
  try { localStorage.setItem(`${STORAGE_KEY}:${workspaceId}`, JSON.stringify({ ...s, messages: s.messages.slice(-40) })) } catch { /* ignore */ }
}

// ── Progress rail ───────────────────────────────────────────────────────────

function SectionRow({ label, icon: Icon, status, summary }: {
  label: string
  icon: typeof Building2
  status: BriefSectionStatus
  summary: string[]
}) {
  return (
    <div className={cn(
      'rounded-xl border px-3.5 py-3 transition-colors',
      status === 'complete' ? 'border-emerald-500/30 bg-emerald-500/5'
        : status === 'partial' ? 'border-blue-500/30 bg-blue-500/5'
        : 'border-[#1e2433] bg-[#0c0e14]'
    )}>
      <div className="flex items-center gap-2.5">
        {status === 'complete'
          ? <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-emerald-400" /></span>
          : status === 'partial'
            ? <CircleDot className="w-5 h-5 text-blue-400 flex-shrink-0" />
            : <Circle className="w-5 h-5 text-slate-700 flex-shrink-0" />}
        <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <span className={cn('text-sm font-semibold truncate', status === 'pending' ? 'text-slate-500' : 'text-white')}>{label}</span>
      </div>
      {summary.length > 0 && (
        <div className="mt-2 pl-7 space-y-0.5">
          {summary.map((line, i) => (
            <p key={i} className="text-[11px] text-slate-500 capitalize truncate">{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function briefSummaries(brief: ChallengeBriefData): Record<BriefSectionKey, string[]> {
  const org = brief.organization
  const sit = brief.businessSituation
  const ch = brief.hcChallenges
  const out = brief.desiredOutputs
  return {
    organization: [
      org.organizationName,
      [prettySlug(org.industry !== 'other' ? org.industry : ''), prettySlug(org.region)].filter(Boolean).join(' / '),
      [prettySlug(org.organizationSize), prettySlug(org.maturityStage)].filter(Boolean).join(' / '),
    ].filter(Boolean).slice(0, 3),
    situation: [
      sit.situationSummary,
      sit.strategicDrivers.length ? `Drivers: ${sit.strategicDrivers.map(prettySlug).join(', ')}` : '',
    ].filter(Boolean).slice(0, 2),
    challenges: ch.selectedAreas.slice(0, 4).map(a => `${prettySlug(a.area)} (${a.severity})`),
    outputs: [
      out.outputTypes.length ? out.outputTypes.map(prettySlug).join(', ') : '',
      out.primaryAudience ? `For: ${prettySlug(out.primaryAudience)}` : '',
    ].filter(Boolean).slice(0, 2),
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function BriefChat() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? ''

  const { saveBrief: saveToStore } = useBriefStore()
  const { isCompleted: isWsOnboardingDone } = useOnboardingCompletions()
  const setActiveWorkspace = useClientProfileStore(s => s.setActiveWorkspace)
  const getProfileFor = useClientProfileStore(s => s.getProfileFor)

  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [brief, setBrief] = useState<ChallengeBriefData>(defaultBrief)
  const [sections, setSections] = useState<Record<BriefSectionKey, BriefSectionStatus>>(EMPTY_SECTIONS)
  const [done, setDone] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  // Gate: brief chat is only meaningful after onboarding.
  useEffect(() => {
    if (workspaceId && !isWsOnboardingDone(workspaceId)) {
      navigate(`/onboarding?workspaceId=${workspaceId}`, { replace: true })
    }
  }, [workspaceId, isWsOnboardingDone, navigate])

  useEffect(() => {
    if (workspaceId) setActiveWorkspace(workspaceId)
    if (!workspaceId) return
    workspacesAPI.get(workspaceId)
      .then(res => setWorkspaceName(res.data?.name ?? null))
      .catch(() => {})
  }, [workspaceId, setActiveWorkspace])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const persist = useCallback((next: Partial<StoredSession>) => {
    if (!workspaceId) return
    saveSession(workspaceId, {
      messages: next.messages ?? messages,
      brief: next.brief ?? brief,
      sections: next.sections ?? sections,
      done: next.done ?? done,
    })
  }, [workspaceId, messages, brief, sections, done])

  const callApi = useCallback(async (history: ChatMsg[], currentBrief: ChallengeBriefData) => {
    const profile = workspaceId ? getProfileFor(workspaceId) : null
    const res = await hcBriefChatAPI.chat({
      messages: history.map(m => ({ role: m.role, content: m.content })),
      brief_state: currentBrief as unknown as Record<string, unknown>,
      onboarding_profile: profile ? (profile as unknown as Record<string, unknown>) : null,
      workspace_name: workspaceName,
    })
    const data = res.data
    const nextBrief = mergePatch(currentBrief, data.brief_patch ?? {})
    const nextMsgs = [...history, { role: 'assistant' as const, content: data.reply, id: `a-${Date.now()}` }]
    setMessages(nextMsgs)
    setBrief(nextBrief)
    setSections(data.sections ?? EMPTY_SECTIONS)
    setSuggestions(data.suggestions ?? [])
    setDone(data.done)
    saveSession(workspaceId, { messages: nextMsgs, brief: nextBrief, sections: data.sections ?? EMPTY_SECTIONS, done: data.done })
  }, [workspaceId, workspaceName, getProfileFor])

  // Resume a saved session, or open the conversation.
  useEffect(() => {
    if (!workspaceId || startedRef.current) return
    startedRef.current = true
    const stored = loadSession(workspaceId)
    if (stored && stored.messages.length > 0) {
      setMessages(stored.messages)
      setBrief({ ...defaultBrief(), ...stored.brief })
      setSections(stored.sections ?? EMPTY_SECTIONS)
      setDone(stored.done ?? false)
      return
    }
    setSending(true)
    callApi([], defaultBrief())
      .catch(() => setError('Could not start the AI intake. You can retry or fill the form manually.'))
      .finally(() => setSending(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const sendMessage = async (content: string) => {
    const clean = content.trim()
    if (!clean || sending) return
    setError(null)
    setSuggestions([])
    const next = [...messages, { role: 'user' as const, content: clean, id: `u-${Date.now()}` }]
    setMessages(next)
    setDraft('')
    setSending(true)
    try {
      await callApi(next, brief)
    } catch {
      setError('The intake assistant is unavailable right now. Try again.')
    } finally {
      setSending(false)
    }
  }

  const restart = () => {
    if (!workspaceId) return
    localStorage.removeItem(`${STORAGE_KEY}:${workspaceId}`)
    setMessages([]); setBrief(defaultBrief()); setSections(EMPTY_SECTIONS); setDone(false); setSuggestions([]); setError(null)
    setSending(true)
    callApi([], defaultBrief())
      .catch(() => setError('Could not start the AI intake. You can retry or fill the form manually.'))
      .finally(() => setSending(false))
  }

  const completeCount = SECTION_META.filter(s => sections[s.key] === 'complete').length
  const canGenerate = done || completeCount >= 3

  const generateDiagnosis = async () => {
    if (!workspaceId || launching) return
    setLaunching(true)
    setError(null)
    try {
      saveToStore(workspaceId, {
        organizationName: brief.organization.organizationName,
        industry: brief.organization.industry,
        region: brief.organization.region,
        organizationSize: brief.organization.organizationSize,
        maturityStage: brief.organization.maturityStage,
        operatingModel: brief.organization.operatingModel,
        strategicDrivers: brief.businessSituation.strategicDrivers,
        hcAreas: brief.hcChallenges.selectedAreas.map(a => a.area),
        outputTypes: brief.desiredOutputs.outputTypes,
        completedAt: new Date().toISOString(),
      })
      const content = JSON.parse(JSON.stringify(brief)) as Record<string, unknown>
      try {
        await challengeBriefsAPI.create({
          workspace_id: workspaceId,
          title: brief.organization.organizationName || 'AI intake brief',
          content,
        })
      } catch { /* draft persistence is best-effort */ }
      const res = await api.post('/hc-platform/diagnose-from-brief', {
        brief: content,
        workspace_id: workspaceId,
      })
      const diagnosis = res.data as { review_id: string }
      navigate(`/brief-results/${diagnosis.review_id}`, { state: { diagnosis } })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not generate the diagnosis. Try again.')
      setLaunching(false)
    }
  }

  const summaries = briefSummaries(brief)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">Challenge Brief with your AI consultant</h1>
            <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
              {workspaceName && <span className="text-xs text-slate-400">{workspaceName}</span>}
              <button onClick={restart} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-400 transition-colors">
                <RotateCcw className="w-3 h-3" /> Restart
              </button>
              <Link to={`/challenge-brief?workspaceId=${workspaceId}`} className="text-[11px] text-slate-500 hover:text-blue-400 transition-colors">
                Fill the form manually instead
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Chat column */}
        <div className="flex flex-col h-[calc(100vh-13rem)] rounded-2xl border border-[#1e2433] bg-[#0c0e14] overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
            {messages.map(m => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-[#131720] border border-[#1e2433] text-slate-200 rounded-bl-md'
                )}>
                  {m.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-li:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-[#131720] border border-[#1e2433] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && !sending && (
            <div className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-[#1e2433] p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft) } }}
                placeholder="Type your answer, or tap a suggestion above"
                rows={1}
                className="flex-1 resize-none rounded-xl bg-[#131720] border border-[#1e2433] text-sm text-white placeholder:text-slate-600 px-3.5 py-2.5 focus:outline-none focus:border-blue-500/50 transition-colors max-h-36"
              />
              <button
                onClick={() => sendMessage(draft)}
                disabled={!draft.trim() || sending}
                className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress rail */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-2xl border border-[#1e2433] bg-[#131720] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Brief progress</p>
              <span className="text-xs font-bold text-blue-400">{completeCount}/{SECTION_META.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                animate={{ width: `${(completeCount / SECTION_META.length) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
            <div className="space-y-2">
              {SECTION_META.map(s => (
                <SectionRow key={s.key} label={s.label} icon={s.icon} status={sections[s.key]} summary={summaries[s.key]} />
              ))}
            </div>
          </div>

          <button
            onClick={generateDiagnosis}
            disabled={!canGenerate || launching}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all',
              canGenerate && !launching
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_2px_12px_rgba(37,99,235,0.35)]'
                : 'bg-[#131720] border border-[#1e2433] text-slate-600 cursor-not-allowed'
            )}
          >
            {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {launching ? 'Generating diagnosis...' : 'Generate diagnosis'}
          </button>
          {!canGenerate && (
            <p className="text-[11px] text-slate-600 text-center">Keep chatting - the button unlocks once the brief is filled in.</p>
          )}
        </div>
      </div>
    </div>
  )
}
