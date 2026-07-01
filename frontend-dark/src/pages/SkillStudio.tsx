import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, Sparkles, CheckCircle, Clock,
  RefreshCw, ChevronDown, ChevronUp, Zap, Trash2,
  BookOpen, Paperclip, Link2, X, Plus, FileText, Loader2, Layout,
} from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { Button } from '../components/ui/Button'
import { ExportToolbar } from '../components/exports/ExportToolbar'
import { SkillCreditBadge } from '../components/skills/SkillCreditBadge'
import { ManualWizard } from '../components/skills/ManualWizard'
import { useCreditsStore } from '../store/credits'
import { aiAPI, draftsAPI, skillsAPI, kbAPI, workspaceSkillsAPI } from '../lib/api'
import { useAutosave } from '../hooks/useAutosave'
import { SaveIndicator } from '../components/ui/SaveIndicator'
import { StudioOutputDashboard } from '../components/studio/StudioOutputDashboard'
import { useClientProfileStore } from '../store/clientProfile'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import { formatRelativeTime } from '../lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: 'assistant' | 'user'
  content: string
  sectionKey?: string
}

interface Draft {
  id: string
  created_at: string
  approval_status: string
  content?: Record<string, unknown>
}

// ─── Per-skill intake questions ───────────────────────────────────────────────

interface IntakeQuestion { key: string; label: string; prompt: string; choices?: { value: string; desc: string }[] }
interface IntakeConfig { intro: string; questions: IntakeQuestion[] }

const SKILL_INTAKE: Record<string, IntakeConfig> = {
  'hc-framework': {
    intro: "Hi! I'm going to help you build a comprehensive **HC Framework** for your client. I'll ask you a few quick questions to tailor the output. Let's go.",
    questions: [
      { key: 'org_name',            label: 'Organisation name',       prompt: "What is the **name of the organisation** we're building this HC framework for?" },
      { key: 'industry',            label: 'Industry',                prompt: "What **industry or sector** does the organisation operate in? (e.g. Financial Services, Retail, Manufacturing)" },
      { key: 'headcount',           label: 'Headcount',               prompt: "What is the **approximate headcount** of the organisation?" },
      { key: 'strategic_priorities',label: 'Strategic priorities',    prompt: "What are the **top 3-5 strategic priorities** for the business right now? (e.g. geographic expansion, cost reduction, digital transformation)" },
      { key: 'maturity_level', label: 'HC maturity level', prompt: "How would you describe the **current HC maturity**?", choices: [
        { value: 'nascent',     desc: 'Just starting: minimal HC processes in place' },
        { value: 'developing',  desc: 'Some processes, inconsistent but improving' },
        { value: 'advanced',    desc: 'Strong capability: structured and measurable' },
        { value: 'leading',     desc: 'Best-in-class: innovative and data-driven' },
      ]},
    ],
  },
  'strategy': {
    intro: "Let's build a **HC Strategy** document for your client. A few questions to shape the content.",
    questions: [
      { key: 'org_name',      label: 'Organisation name',   prompt: "What is the **name of the organisation**?" },
      { key: 'horizon_years', label: 'Strategy horizon',    prompt: "What is the **strategy horizon** in years? (e.g. 3 years, 5 years)" },
      { key: 'focus_areas',   label: 'HC focus areas',      prompt: "What are the **key HC focus areas**? (e.g. talent acquisition, L&D, culture, leadership development; list as many as relevant)" },
      { key: 'business_goals',label: 'Business goals',      prompt: "What are the **top business goals** this HC strategy must support? (e.g. grow revenue by 30%, enter 3 new markets, reduce attrition)" },
    ],
  },
  'maturity': {
    intro: "I'll help you conduct an **HC Maturity Assessment**. Let me gather some context first.",
    questions: [
      { key: 'org_name',       label: 'Organisation name', prompt: "What is the **name of the organisation**?" },
      { key: 'dimensions',     label: 'Assessment dimensions', prompt: "Which **HC dimensions** should we assess? (e.g. talent, leadership, culture, analytics, learning; list all relevant ones)" },
      { key: 'current_scores', label: 'Self-assessed scores', prompt: "Can you share any **self-assessed scores (1-5)** per dimension? If unsure, just say 'not sure' and I'll use industry baselines." },
    ],
  },
  'talent-acquisition': {
    intro: "Let's design a **Talent Acquisition Strategy** for your client.",
    questions: [
      { key: 'org_name',         label: 'Organisation name', prompt: "What is the **name of the organisation**?" },
      { key: 'open_roles',       label: 'Open roles',        prompt: "How many **open roles** are they looking to fill?" },
      { key: 'target_profile',   label: 'Target profile',    prompt: "Describe the **target talent profile**: what skills, experience level, or type of candidates are they hiring?" },
      { key: 'timeline_months',  label: 'Timeline',          prompt: "What is the **target timeline** for filling these roles? (in months)" },
    ],
  },
}

const DEFAULT_INTAKE: IntakeConfig = {
  intro: "I'll help you generate a professional HC deliverable. Let me ask a few questions to tailor the output for your client.",
  questions: [
    { key: 'org_name',    label: 'Organisation name', prompt: "What is the **name of the organisation** we're working with?" },
    { key: 'context',     label: 'Context',           prompt: "Give me a brief **overview of the engagement context**: what challenge or goal are we addressing?" },
    { key: 'priorities',  label: 'Key priorities',    prompt: "What are the **3-5 key priorities or outcomes** you want this deliverable to cover?" },
    { key: 'audience',    label: 'Audience',          prompt: "Who is the **primary audience** for this output? (e.g. C-suite, HR leadership, board)" },
  ],
}

// ─── Markdown-lite renderer ───────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold** first, then *italic* within plain segments
  const nodes: React.ReactNode[] = []
  let key = 0
  const boldParts = text.split(/\*\*(.*?)\*\*/g)
  boldParts.forEach((part, bi) => {
    if (bi % 2 === 1) {
      nodes.push(<strong key={key++}>{part}</strong>)
    } else {
      // handle *italic* within plain text
      const italicParts = part.split(/\*(.*?)\*/g)
      italicParts.forEach((ip, ii) => {
        if (ii % 2 === 1) nodes.push(<em key={key++}>{ip}</em>)
        else if (ip) nodes.push(<span key={key++}>{ip}</span>)
      })
    }
  })
  return nodes
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => (
    <p key={i} className={line === '' ? 'mt-2' : ''}>{renderInline(line)}</p>
  ))
}

// ─── Draft content helpers (module-level, no hooks) ──────────────────────────

const SKIP_KEYS = new Set(['skill_slug', 'generated_at', 'tool_name', 'tool_input', 'raw_text'])

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (typeof value === 'string') {
    return <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{value}</p>
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <p className="text-sm text-slate-300">{String(value)}</p>
  }
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'string')) {
      return (
        <ul className="space-y-1.5 mt-1">
          {(value as string[]).map((v, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="w-5 h-5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="space-y-3 mt-1">
        {(value as Record<string, unknown>[]).map((item, i) => (
          <div key={i} className={depth === 0 ? 'rounded-lg p-3 bg-[#0E0E0E] border border-[#1e2433]' : 'rounded-lg p-3 bg-[#131720] border border-[#1e2433]/50'}>
            {Object.entries(item).map(([k, v]) => (
              <div key={k} className="mb-2 last:mb-0">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-0.5">{k.replace(/_/g, ' ')}</p>
                {renderValue(v, depth + 1)}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <div className="space-y-2 mt-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-0.5">{k.replace(/_/g, ' ')}</p>
            {renderValue(v, depth + 1)}
          </div>
        ))}
      </div>
    )
  }
  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SkillStudio() {
  const { workspaceId, skillId } = useParams<{ workspaceId: string; skillId: string }>()
  const navigate = useNavigate()
  const { skills, fetchSkills } = useWorkspaceStore()
  const { deductOptimistic, refundOptimistic } = useCreditsStore()
  const setActiveProfileWorkspace = useClientProfileStore(s => s.setActiveWorkspace)

  // Switch the client-profile store to this workspace so the output dashboard
  // shows THIS engagement's org intel, never the previous one's.
  useEffect(() => {
    setActiveProfileWorkspace(workspaceId || null)
  }, [workspaceId, setActiveProfileWorkspace])

  // Ensure skills are loaded (in case user navigated directly to this page)
  useEffect(() => {
    if (workspaceId && skills.length === 0) fetchSkills(workspaceId)
  }, [workspaceId]) // eslint-disable-line

  const skill = skills.find(s => s.id === skillId)
  const activeIntake = (skill?.slug ? SKILL_INTAKE[skill.slug] : undefined) ?? DEFAULT_INTAKE

  const [mode, setMode] = useState<'ai' | 'manual'>('manual')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [collectedContext, setCollectedContext] = useState<Record<string, string>>({})
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<'intake' | 'generating' | 'output'>('intake')
  const [genProgress, setGenProgress] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null)
  const [outputExpanded, setOutputExpanded] = useState<Record<string, boolean>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Knowledge base
  const [kbOpen, setKbOpen] = useState(true)
  const [kbFiles, setKbFiles] = useState<{ name: string; content: string; status: 'loading' | 'done' | 'error' }[]>([])
  const [kbUrls, setKbUrls] = useState<{ url: string; status: 'idle' | 'loading' | 'done' | 'error'; text?: string }[]>([])
  const [urlInput, setUrlInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Init chat — runs when skill loads (may be delayed if skills weren't in store yet)
  useEffect(() => {
    if (skill) {
      setQuestionIndex(0)
      setCollectedContext({})
      setMessages([
        { role: 'assistant', content: activeIntake.intro },
        { role: 'assistant', content: activeIntake.questions[0].prompt },
      ])
    }
  }, [skill?.id]) // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (workspaceId && skillId) loadDrafts(true)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [workspaceId, skillId]) // eslint-disable-line

  // Resume studio intake state from server (workspace_skills.state)
  useEffect(() => {
    if (!workspaceId || !skillId) return
    workspaceSkillsAPI.getState(workspaceId, skillId).then(res => {
      const state = (res.data?.state ?? {}) as {
        questionIndex?: number
        collectedContext?: Record<string, string>
        manualInputs?: Record<string, string>
        mode?: 'ai' | 'manual'
      }
      if (state && typeof state === 'object') {
        if (state.collectedContext) setCollectedContext(state.collectedContext)
        if (state.manualInputs) setManualInputs(state.manualInputs)
        if (typeof state.questionIndex === 'number') setQuestionIndex(state.questionIndex)
        // AI mode disabled — always manual
        setMode('manual')
      }
    }).catch(() => {})
  }, [workspaceId, skillId])

  // Autosave intake state on change
  const intakePayload = useMemo(() => ({
    questionIndex,
    collectedContext,
    manualInputs,
    mode,
  }), [questionIndex, collectedContext, manualInputs, mode])
  const onSaveIntake = useCallback(async (v: typeof intakePayload) => {
    if (!workspaceId || !skillId) return
    await workspaceSkillsAPI.saveState(workspaceId, skillId, v)
  }, [workspaceId, skillId])
  const { status: intakeSaveStatus } = useAutosave({
    value: intakePayload,
    onSave: onSaveIntake,
    delay: 800,
    enabled: !!(workspaceId && skillId) && phase === 'intake',
  })

  const loadDrafts = async (selectLatest = false) => {
    try {
      const res = await draftsAPI.list({ workspace_id: workspaceId, skill_id: skillId })
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.drafts ?? [])
      const d = raw.map((x: unknown) => {
        const dr = x as Record<string, unknown>
        return {
          id: String(dr.id ?? ''),
          created_at: String(dr.created_at ?? ''),
          approval_status: String(dr.approval_status ?? 'pending'),
          content: dr.content as Record<string, unknown> | undefined,
        }
      })
      setDrafts(d)
      if (selectLatest && d.length > 0) { setSelectedDraft(d[0]); setPhase('output') }
    } catch { /* ignore */ }
  }

  const sendMessage = () => {
    const text = input.trim()
    if (!text || phase !== 'intake') return
    setInput('')

    const question = activeIntake.questions[questionIndex]
    const userMsg: Message = { role: 'user', content: text, sectionKey: question.key }
    setMessages(m => [...m, userMsg])

    const newContext = { ...collectedContext, [question.key]: text }
    setCollectedContext(newContext)

    const nextIndex = questionIndex + 1

    if (nextIndex < activeIntake.questions.length) {
      setQuestionIndex(nextIndex)
      setTimeout(() => {
        setMessages(m => [...m, {
          role: 'assistant',
          content: activeIntake.questions[nextIndex].prompt,
        }])
        inputRef.current?.focus()
      }, 300)
    } else {
      // All questions answered — confirm and offer to generate
      setQuestionIndex(nextIndex)
      setTimeout(() => {
        const summary = activeIntake.questions
          .map((q, i) => `**${q.label}:** ${Object.values(newContext)[i] ?? ' - '}`)
          .join('\n')
        setMessages(m => [...m, {
          role: 'assistant',
          content: `Great, here's what I have:\n\n${summary}\n\nReady to generate the full ${skill?.name ?? 'deliverable'}? Click **Generate** below, or type any corrections.`,
        }])
      }, 300)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleGenerate = async (contextOverride?: Record<string, string>) => {
    if (!workspaceId || !skillId) return
    const kbText = buildKbContext()
    const ctx = { ...(contextOverride ?? collectedContext), ...(kbText ? { knowledge_base: kbText } : {}) }
    const creditCost = skill?.credit_cost ?? 0
    console.log('[Generate] workspaceId:', workspaceId, 'skillId:', skillId, 'ctx:', ctx)
    setPhase('generating')
    setGenProgress('Starting AI generation...')
    if (creditCost > 0) deductOptimistic(creditCost)

    try {
      await skillsAPI.activate(workspaceId, skillId).catch(() => {})
      const res = await aiAPI.startJob(workspaceId, skillId, ctx)
      console.log('[Generate] job created:', res.data)
      const jobId = res.data.id
      setGenProgress('Queued. AI is working...')

      // Store interval ID locally — never read pollRef inside the callback
      let dots = 0
      let stopped = false
      const intervalId = setInterval(async () => {
        if (stopped) return
        dots = (dots + 1) % 4
        setGenProgress('Generating' + '.'.repeat(dots + 1))
        try {
          const jr = await aiAPI.getJob(jobId)
          const status = jr.data.status
          console.log('[Poll] job status:', status)
          if (status === 'completed' || status === 'failed') {
            stopped = true
            clearInterval(intervalId)
            pollRef.current = null
            if (status === 'completed') {
              await loadDrafts(true)
              setPhase('output')
              toast.success('Draft generated successfully!')
            } else {
              if (creditCost > 0) refundOptimistic(creditCost)
              setPhase('intake')
              toast.error('AI generation failed. Please try again.')
            }
          }
        } catch { /* keep polling on network error */ }
      }, 2000)
      pollRef.current = intervalId
    } catch (err: unknown) {
      console.error('[Generate] error:', err)
      if (creditCost > 0) refundOptimistic(creditCost)
      setPhase('intake')
      setGenProgress('')
      const msg = (err as {response?: {data?: {detail?: string}}})?.response?.data?.detail
      toast.error(msg ?? 'Failed to start generation. Please try again.')
    }
  }

  const handleApprove = async (draftId: string) => {
    try {
      await draftsAPI.approve(draftId)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, approval_status: 'approved' } : d))
      if (selectedDraft?.id === draftId) setSelectedDraft(d => d ? { ...d, approval_status: 'approved' } : d)
      toast.success('Draft approved, ready to export!')
    } catch { toast.error('Failed to approve') }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      // Optimistically add as loading
      setKbFiles(prev => [...prev, { name: file.name, content: '', status: 'loading' as const }])
      try {
        const res = await kbAPI.upload(file)
        const text: string = res.data.text
        setKbFiles(prev => prev.map(f =>
          f.name === file.name && f.status === 'loading'
            ? { ...f, content: text, status: 'done' as const }
            : f
        ))
      } catch {
        setKbFiles(prev => prev.map(f =>
          f.name === file.name && f.status === 'loading'
            ? { ...f, status: 'error' as const }
            : f
        ))
        toast.error(`Failed to extract text from ${file.name}`)
      }
    }
  }

  const handleAddUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setUrlInput('')
    const idx = kbUrls.length
    setKbUrls(prev => [...prev, { url, status: 'loading' }])
    try {
      const res = await kbAPI.scrape(url)
      const text: string = res.data.text
      setKbUrls(prev => prev.map((u, i) => i === idx ? { ...u, status: 'done', text } : u))
    } catch {
      setKbUrls(prev => prev.map((u, i) => i === idx ? { ...u, status: 'error' } : u))
      toast.error('Failed to scrape URL')
    }
  }

  const buildKbContext = () => {
    const parts: string[] = []
    kbFiles.filter(f => f.status === 'done').forEach(f => parts.push(`[File: ${f.name}]\n${f.content.slice(0, 8000)}`))
    kbUrls.filter(u => u.status === 'done' && u.text).forEach(u => parts.push(`[URL: ${u.url}]\n${u.text}`))
    return parts.length ? parts.join('\n\n---\n\n') : ''
  }

  const handleRestart = () => {
    setPhase('intake')
    setQuestionIndex(0)
    setCollectedContext({})
    setInput('')
    setMessages([
      { role: 'assistant', content: activeIntake.intro },
      { role: 'assistant', content: activeIntake.questions[0].prompt },
    ])
  }

  // ── Draft content renderer ─────────────────────────────────────────────────

  const renderDraftContent = (content?: Record<string, unknown>) => {
    if (!content) return <p className="text-slate-600 text-sm italic">No content available.</p>

    // Handle legacy tool_input format
    const toolInput = content.tool_input as Record<string, unknown> | undefined
    const source = toolInput ?? content

    const entries = Object.entries(source).filter(([k]) => !SKIP_KEYS.has(k))

    if (entries.length === 0) {
      return <pre className="text-xs text-slate-600 bg-[#0E0E0E] p-4 rounded-xl overflow-auto">{JSON.stringify(content, null, 2)}</pre>
    }

    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const isExpanded = outputExpanded[key] !== false
          return (
            <div key={key} className="border border-[#1e2433] rounded-xl overflow-hidden">
              <button
                onClick={() => setOutputExpanded(s => ({ ...s, [key]: !isExpanded }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0E0E0E] hover:bg-[#1a1e2e] transition-colors"
              >
                <span className="text-xs font-semibold text-white uppercase tracking-wider">{label}</span>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
              </button>
              {isExpanded && (
                <div className="px-4 py-4">
                  {renderValue(value)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const allQuestionsAnswered = questionIndex >= activeIntake.questions.length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[#0E0E0E]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e2433] bg-[#131720] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/workspaces/${workspaceId}`)}
            className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-semibold text-white">{skill?.name ?? 'Studio'}</h1>
            <p className="text-xs text-slate-600 capitalize">{skill?.category} Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {phase === 'intake' && <SaveIndicator status={intakeSaveStatus} className="mr-2" />}
          {skill && <SkillCreditBadge credits={skill.credit_cost} />}

          {selectedDraft && phase !== 'generating' && (
            <>
              <button
                onClick={() => navigate(`/canvas/${selectedDraft.id}?title=${encodeURIComponent(skill?.name ?? 'Deliverable')}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-xs font-semibold transition-colors"
              >
                <Layout className="w-3.5 h-3.5" />
                Open in Canvas
              </button>
              {selectedDraft.approval_status !== 'approved' && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<CheckCircle className="w-4 h-4" />}
                  onClick={() => handleApprove(selectedDraft.id)}
                >
                  Approve Draft
                </Button>
              )}
              {selectedDraft.approval_status === 'approved' && (
                <ExportToolbar draftId={selectedDraft.id} />
              )}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleRestart}
              >
                New Run
              </Button>
            </>
          )}

          {phase === 'intake' && allQuestionsAnswered && (
            <Button
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={() => handleGenerate()}
            >
              Generate
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Knowledge Base sidebar — removed per product call. Kept the state above
            so AI context assembly that consumed kbFiles/kbUrls still compiles. */}
        <div className="hidden">
          <div className="px-4 py-3 border-b border-[#1e2433] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#3b82f6]" />
            <span className="text-sm font-semibold text-white">Knowledge Base</span>
            {(kbFiles.filter(f => f.status === 'done').length + kbUrls.filter(u => u.status === 'done').length) > 0 && (
              <span className="ml-auto text-xs bg-[#3b82f6]/20 text-[#60a5fa] px-1.5 py-0.5 rounded-full font-medium">
                {kbFiles.filter(f => f.status === 'done').length + kbUrls.filter(u => u.status === 'done').length} loaded
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* File upload */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Upload files</p>
              <p className="text-[11px] text-slate-600 mb-2">PDF, DOCX, TXT, CSV. Content is extracted and added to the AI context.</p>
              <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,.docx,.csv" className="hidden" onChange={handleFileUpload} />
              {kbFiles.length > 0 && (
                <div className="space-y-1 mb-2">
                  {kbFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#131720] rounded-lg border border-[#1e2433]">
                      {f.status === 'loading' && <Loader2 className="w-3 h-3 text-[#3b82f6] animate-spin flex-shrink-0" />}
                      {f.status === 'done' && <FileText className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                      {f.status === 'error' && <FileText className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      <span className="text-xs text-slate-300 flex-1 truncate">{f.name}</span>
                      {f.status === 'error' && <span className="text-[10px] text-red-400">Failed</span>}
                      {f.status === 'loading' && <span className="text-[10px] text-slate-500">Extracting...</span>}
                      <button onClick={() => setKbFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors border border-dashed border-[#1e2433] hover:border-[#3b82f6] rounded-lg px-3 py-2 w-full justify-center"
              >
                <Paperclip className="w-3 h-3" /> Upload files
              </button>
            </div>

            {/* URL scrape */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Scrape URLs</p>
              <p className="text-[11px] text-slate-600 mb-2">Paste a webpage URL. Text is extracted and added to context.</p>
              {kbUrls.length > 0 && (
                <div className="space-y-1 mb-2">
                  {kbUrls.map((u, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#131720] rounded-lg border border-[#1e2433]">
                      {u.status === 'loading' && <Loader2 className="w-3 h-3 text-[#3b82f6] animate-spin flex-shrink-0" />}
                      {u.status === 'done' && <Link2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                      {u.status === 'error' && <Link2 className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      {u.status === 'idle' && <Link2 className="w-3 h-3 text-slate-500 flex-shrink-0" />}
                      <span className="text-xs text-slate-300 flex-1 truncate">{u.url}</span>
                      {u.status === 'error' && <span className="text-[10px] text-red-400">Failed</span>}
                      <button onClick={() => setKbUrls(prev => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl() } }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 text-xs border border-[#1e2433] rounded-lg bg-[#131720] text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6]"
                />
                <button
                  onClick={handleAddUrl}
                  disabled={!urlInput.trim()}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#3b82f6] text-white disabled:opacity-40 hover:bg-[#60a5fa] transition-colors flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Left: Manual wizard */}
        {mode === 'manual' && phase === 'intake' && (
          <div className="flex-shrink-0 flex flex-col border-r border-[#1e2433] bg-[#131720]" style={{ width: '480px' }}>
            <ManualWizard
              skillSlug={skill?.slug ?? ''}
              skillName={skill?.name ?? 'Deliverable'}
              onGenerate={ctx => { setCollectedContext(ctx as Record<string, string>); handleGenerate(ctx as Record<string, string>) }}
              isGenerating={false}
            />
          </div>
        )}

        {/* Left: Chat intake */}
        {mode === 'ai' && (
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-[#1e2433] bg-[#131720]">

          {/* Progress pills */}
          <div className="px-4 py-3 border-b border-[#1e2433] flex gap-1.5 flex-wrap">
            {activeIntake.questions.map((q, i) => (
              <span
                key={q.key}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                  i < questionIndex
                    ? 'bg-[#131720] text-white'
                    : i === questionIndex && phase === 'intake'
                      ? 'bg-[#3b82f6] text-white'
                      : 'bg-[#1a1e2e] text-slate-600'
                )}
              >
                {q.label}
              </span>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'assistant'
                    ? 'bg-[#0E0E0E] text-white rounded-tl-sm self-start mr-auto'
                    : 'bg-[#131720] text-white rounded-tr-sm ml-auto'
                )}
              >
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </div>
            ))}

            {phase === 'generating' && (
              <div className="bg-[#0E0E0E] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-600 flex items-center gap-2 max-w-[90%]">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </div>
                {genProgress}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {phase === 'intake' && !allQuestionsAnswered && (() => {
            const currentQ = activeIntake.questions[questionIndex]
            if (currentQ?.choices) {
              return (
                <div className="px-4 py-3 border-t border-[#1e2433] space-y-2">
                  {currentQ.choices.map(c => (
                    <button
                      key={c.value}
                      onClick={() => {
                        setInput(c.value)
                        setTimeout(() => {
                          setInput('')
                          const userMsg: Message = { role: 'user', content: c.value, sectionKey: currentQ.key }
                          setMessages(m => [...m, userMsg])
                          const newContext = { ...collectedContext, [currentQ.key]: c.value }
                          setCollectedContext(newContext)
                          const nextIndex = questionIndex + 1
                          if (nextIndex < activeIntake.questions.length) {
                            setQuestionIndex(nextIndex)
                            setMessages(m => [...m, { role: 'assistant', content: activeIntake.questions[nextIndex].prompt }])
                          } else {
                            setQuestionIndex(nextIndex)
                            const summary = activeIntake.questions
                              .map((q, i) => `**${q.label}:** ${Object.values(newContext)[i] ?? ' - '}`)
                              .join('\n')
                            setMessages(m => [...m, {
                              role: 'assistant',
                              content: `Great, here's what I have:\n\n${summary}\n\nReady to generate the full ${skill?.name ?? 'deliverable'}? Click **Generate** below, or type any corrections.`,
                            }])
                          }
                        }, 0)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-[#1e2433] bg-[#131720] hover:border-[#3b82f6] hover:bg-[#3b82f6]/5 transition-colors"
                    >
                      <span className="text-sm font-semibold text-white capitalize">{c.value}</span>
                      <span className="text-xs text-slate-600 ml-2">{c.desc}</span>
                    </button>
                  ))}
                </div>
              )
            }
            return (
              <div className="px-4 py-3 border-t border-[#1e2433]">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer..."
                    className="flex-1 px-3 py-2 text-sm border border-[#1e2433] rounded-xl bg-[#131720] text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-[#3b82f6]"
                    autoFocus
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#3b82f6] text-white disabled:opacity-40 hover:bg-[#60a5fa] transition-colors flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })()}

          {phase === 'intake' && allQuestionsAnswered && (
            <div className="px-4 py-3 border-t border-[#1e2433]">
              <Button className="w-full" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => handleGenerate()}>
                Generate {skill?.name}
              </Button>
            </div>
          )}
        </div>
        )} {/* end mode === 'ai' */}

        {/* Right: Output */}
        <div className="flex-1 flex flex-col min-w-0">
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
              <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-base font-semibold text-white">{genProgress}</p>
                <p className="text-sm text-slate-600 mt-1">The AI is generating your {skill?.name} deliverable.<br />This usually takes 20-60 seconds.</p>
              </div>
            </div>
          )}

          {phase === 'intake' && !selectedDraft && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#1a1e2e] flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-slate-600" />
              </div>
              <div>
                <p className="font-semibold text-white">Answer the questions on the left</p>
                <p className="text-sm text-slate-600 mt-1">Once you've filled in the context, click <strong>Generate</strong> to produce your {skill?.name} deliverable.</p>
              </div>
              {drafts.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => { setSelectedDraft(drafts[0]); setPhase('output') }}>
                  View previous draft
                </Button>
              )}
            </div>
          )}

          {(phase === 'output' || (phase === 'intake' && selectedDraft)) && selectedDraft && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-6xl mx-auto">
                <StudioOutputView
                  skillName={skill?.name ?? 'Studio'}
                  skillCategory={skill?.category}
                  draft={selectedDraft}
                  onApprove={() => handleApprove(selectedDraft.id)}
                  onOpenCanvas={() => navigate(`/canvas/${selectedDraft.id}?title=${encodeURIComponent(skill?.name ?? 'Deliverable')}`)}
                  onNewRun={() => { setSelectedDraft(null); setPhase('intake') }}
                  exportToolbar={selectedDraft.approval_status === 'approved' ? <ExportToolbar draftId={selectedDraft.id} /> : null}
                  onContentPatched={(content) => {
                    setSelectedDraft(prev => prev ? { ...prev, content } : prev)
                    setDrafts(prev => prev.map(d => d.id === selectedDraft.id ? { ...d, content } : d))
                  }}
                />
              </div>
            </div>
          )}

          {/* Draft history — bottom strip */}
          {drafts.length > 0 && (
            <div className="flex-shrink-0 border-t border-[#1e2433] bg-[#131720] px-4 py-2 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-slate-600 mr-1 flex-shrink-0">History:</span>
              {drafts.map((d, i) => (
                <div key={d.id} className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => { setSelectedDraft(d); setPhase('output') }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-l-full text-xs font-medium border transition-colors',
                      selectedDraft?.id === d.id
                        ? 'bg-[#131720] text-white border-[#1A1A1A]'
                        : 'bg-[#131720] text-slate-300 border-[#1e2433] hover:border-[#3b82f6]'
                    )}
                  >
                    Draft {drafts.length - i}
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      d.approval_status === 'approved' ? 'bg-green-400' : 'bg-amber-400'
                    )} />
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await draftsAPI.delete(d.id)
                        const remaining = drafts.filter(x => x.id !== d.id)
                        setDrafts(remaining)
                        if (selectedDraft?.id === d.id) {
                          setSelectedDraft(remaining[0] ?? null)
                          setPhase(remaining.length ? 'output' : 'intake')
                        }
                        toast.success('Draft deleted')
                      } catch { toast.error('Failed to delete') }
                    }}
                    title="Delete draft"
                    className={cn(
                      'px-1.5 py-1 rounded-r-full border-t border-b border-r text-xs transition-colors',
                      selectedDraft?.id === d.id
                        ? 'border-[#1A1A1A] bg-[#131720] text-slate-500 hover:text-red-300'
                        : 'border-[#1e2433] bg-[#131720] text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                    )}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HiPo-style output view adapter ─────────────────────────────────────────
// Maps the generic draft.content shape into the StudioOutputDashboard inputs.
function StudioOutputView({
  skillName, skillCategory, draft, onApprove, onOpenCanvas, onNewRun, exportToolbar, onContentPatched,
}: {
  skillName: string
  skillCategory?: string
  draft: Draft
  onApprove: () => void
  onOpenCanvas: () => void
  onNewRun: () => void
  exportToolbar: React.ReactNode
  onContentPatched?: (content: Record<string, unknown>) => void
}) {
  const { profile } = useClientProfileStore()
  const content = (draft.content ?? {}) as Record<string, unknown>

  // Pull org intel from the profile store if onboarding has been done
  const orgIntel = {
    industry: profile?.organization?.industry ? humanise(profile.organization.industry) : undefined,
    region:   profile?.organization?.region   ? humanise(profile.organization.region)   : undefined,
    size:     profile?.organization?.organizationSize ? humanise(profile.organization.organizationSize) : undefined,
    maturity: profile?.organization?.maturityStage ? humanise(profile.organization.maturityStage) : undefined,
    model:    profile?.organization?.operatingModel ? humanise(profile.organization.operatingModel) : undefined,
  }

  // Map well-known content keys onto the dashboard sections if present.
  const recommendationsRaw = (content.recommendations ?? content.actions ?? []) as unknown
  const recommendations = Array.isArray(recommendationsRaw)
    ? recommendationsRaw.slice(0, 8).map((r: unknown) => {
        if (typeof r === 'string') return { title: r }
        const obj = r as { title?: string; recommendation?: string; rationale?: string; tone?: 'high' | 'medium' | 'low' }
        return { title: obj.title ?? obj.recommendation ?? '', rationale: obj.rationale, tone: obj.tone }
      }).filter(r => r.title)
    : []

  const notes = typeof content.advisory_notes === 'string' ? content.advisory_notes
              : typeof content.notes === 'string' ? content.notes
              : ''

  // Maturity heatmap — synthetic if not provided, so the dashboard always feels populated.
  const maturity: Array<{ label: string; level: 'High' | 'Medium' | 'Low' }> =
    (Array.isArray(content.maturity_heatmap) ? content.maturity_heatmap : []) as Array<{ label: string; level: 'High' | 'Medium' | 'Low' }>

  return (
    <StudioOutputDashboard
      studioName={skillName}
      studioCategory={skillCategory}
      orgName={profile?.organization?.name}
      status={draft.approval_status}
      generatedAt={formatRelativeTime(draft.created_at)}
      orgIntel={orgIntel}
      maturity={maturity}
      recommendations={recommendations}
      notes={notes}
      rawContent={content}
      onApprove={onApprove}
      onOpenCanvas={onOpenCanvas}
      onNewRun={onNewRun}
      exportToolbar={exportToolbar}
      draftId={draft.id}
      onContentPatched={onContentPatched}
    />
  )
}

function humanise(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
