import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, Sparkles, CheckCircle, Clock,
  RefreshCw, ChevronDown, ChevronUp, Zap, Trash2,
} from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { Button } from '../components/ui/Button'
import { ExportToolbar } from '../components/exports/ExportToolbar'
import { SkillCreditBadge } from '../components/skills/SkillCreditBadge'
import { useCreditsStore } from '../store/credits'
import { aiAPI, draftsAPI, skillsAPI } from '../lib/api'
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
    intro: "Hi! I'm going to help you build a comprehensive **HC Framework** for your client. I'll ask you a few quick questions to tailor the output — let's go.",
    questions: [
      { key: 'org_name',            label: 'Organisation name',       prompt: "What is the **name of the organisation** we're building this HC framework for?" },
      { key: 'industry',            label: 'Industry',                prompt: "What **industry or sector** does the organisation operate in? (e.g. Financial Services, Retail, Manufacturing)" },
      { key: 'headcount',           label: 'Headcount',               prompt: "What is the **approximate headcount** of the organisation?" },
      { key: 'strategic_priorities',label: 'Strategic priorities',    prompt: "What are the **top 3–5 strategic priorities** for the business right now? (e.g. geographic expansion, cost reduction, digital transformation)" },
      { key: 'maturity_level', label: 'HC maturity level', prompt: "How would you describe the **current HC maturity**?", choices: [
        { value: 'nascent',     desc: 'Just starting — minimal HC processes in place' },
        { value: 'developing',  desc: 'Some processes — inconsistent but improving' },
        { value: 'advanced',    desc: 'Strong capability — structured and measurable' },
        { value: 'leading',     desc: 'Best-in-class — innovative and data-driven' },
      ]},
    ],
  },
  'strategy': {
    intro: "Let's build a **HC Strategy** document for your client. A few questions to shape the content.",
    questions: [
      { key: 'org_name',      label: 'Organisation name',   prompt: "What is the **name of the organisation**?" },
      { key: 'horizon_years', label: 'Strategy horizon',    prompt: "What is the **strategy horizon** in years? (e.g. 3 years, 5 years)" },
      { key: 'focus_areas',   label: 'HC focus areas',      prompt: "What are the **key HC focus areas**? (e.g. talent acquisition, L&D, culture, leadership development — list as many as relevant)" },
      { key: 'business_goals',label: 'Business goals',      prompt: "What are the **top business goals** this HC strategy must support? (e.g. grow revenue by 30%, enter 3 new markets, reduce attrition)" },
    ],
  },
  'maturity': {
    intro: "I'll help you conduct an **HC Maturity Assessment**. Let me gather some context first.",
    questions: [
      { key: 'org_name',       label: 'Organisation name', prompt: "What is the **name of the organisation**?" },
      { key: 'dimensions',     label: 'Assessment dimensions', prompt: "Which **HC dimensions** should we assess? (e.g. talent, leadership, culture, analytics, learning — list all relevant ones)" },
      { key: 'current_scores', label: 'Self-assessed scores', prompt: "Can you share any **self-assessed scores (1–5)** per dimension? If unsure, just say 'not sure' and I'll use industry baselines." },
    ],
  },
  'talent-acquisition': {
    intro: "Let's design a **Talent Acquisition Strategy** for your client.",
    questions: [
      { key: 'org_name',         label: 'Organisation name', prompt: "What is the **name of the organisation**?" },
      { key: 'open_roles',       label: 'Open roles',        prompt: "How many **open roles** are they looking to fill?" },
      { key: 'target_profile',   label: 'Target profile',    prompt: "Describe the **target talent profile** — what skills, experience level, or type of candidates are they hiring?" },
      { key: 'timeline_months',  label: 'Timeline',          prompt: "What is the **target timeline** for filling these roles? (in months)" },
    ],
  },
}

const DEFAULT_INTAKE: IntakeConfig = {
  intro: "I'll help you generate a professional HC deliverable. Let me ask a few questions to tailor the output for your client.",
  questions: [
    { key: 'org_name',    label: 'Organisation name', prompt: "What is the **name of the organisation** we're working with?" },
    { key: 'context',     label: 'Context',           prompt: "Give me a brief **overview of the engagement context** — what challenge or goal are we addressing?" },
    { key: 'priorities',  label: 'Key priorities',    prompt: "What are the **3–5 key priorities or outcomes** you want this deliverable to cover?" },
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
    return <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{value}</p>
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <p className="text-sm text-text-secondary">{String(value)}</p>
  }
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'string')) {
      return (
        <ul className="space-y-1.5 mt-1">
          {(value as string[]).map((v, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="space-y-3 mt-1">
        {(value as Record<string, unknown>[]).map((item, i) => (
          <div key={i} className={depth === 0 ? 'rounded-lg p-3 bg-surface-secondary border border-border' : 'rounded-lg p-3 bg-white border border-border/50'}>
            {Object.entries(item).map(([k, v]) => (
              <div key={k} className="mb-2 last:mb-0">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">{k.replace(/_/g, ' ')}</p>
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
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-0.5">{k.replace(/_/g, ' ')}</p>
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

  // Ensure skills are loaded (in case user navigated directly to this page)
  useEffect(() => {
    if (workspaceId && skills.length === 0) fetchSkills(workspaceId)
  }, [workspaceId]) // eslint-disable-line

  const skill = skills.find(s => s.id === skillId)
  const activeIntake = (skill?.slug ? SKILL_INTAKE[skill.slug] : undefined) ?? DEFAULT_INTAKE

  const [mode, setMode] = useState<'ai' | 'manual'>('ai')
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
      if (selectLatest && d.length > 0) setSelectedDraft(d[0])
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
          .map((q, i) => `**${q.label}:** ${Object.values(newContext)[i] ?? '—'}`)
          .join('\n')
        setMessages(m => [...m, {
          role: 'assistant',
          content: `Great — here's what I have:\n\n${summary}\n\nReady to generate the full ${skill?.name ?? 'deliverable'}? Click **Generate** below, or type any corrections.`,
        }])
      }, 300)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleGenerate = async (contextOverride?: Record<string, string>) => {
    if (!workspaceId || !skillId) return
    const ctx = contextOverride ?? collectedContext
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
      setGenProgress('Queued — AI is working...')

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
      toast.success('Draft approved — ready to export!')
    } catch { toast.error('Failed to approve') }
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
    if (!content) return <p className="text-text-muted text-sm italic">No content available.</p>

    // Handle legacy tool_input format
    const toolInput = content.tool_input as Record<string, unknown> | undefined
    const source = toolInput ?? content

    const entries = Object.entries(source).filter(([k]) => !SKIP_KEYS.has(k))

    if (entries.length === 0) {
      return <pre className="text-xs text-text-muted bg-surface-secondary p-4 rounded-xl overflow-auto">{JSON.stringify(content, null, 2)}</pre>
    }

    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const isExpanded = outputExpanded[key] !== false
          return (
            <div key={key} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOutputExpanded(s => ({ ...s, [key]: !isExpanded }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-surface-secondary hover:bg-surface-tertiary transition-colors"
              >
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">{label}</span>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
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
    <div className="flex h-full flex-col bg-surface-secondary">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/workspaces/${workspaceId}`)}
            className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-semibold text-text-primary">{skill?.name ?? 'Studio'}</h1>
            <p className="text-xs text-text-muted capitalize">{skill?.category} Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI / Manual toggle */}
          {phase !== 'generating' && (
            <div className="flex items-center border border-border rounded-lg p-0.5 bg-surface-secondary">
              <button
                onClick={() => setMode('ai')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                  mode === 'ai' ? 'bg-zinc-900 text-white' : 'text-text-muted hover:text-text-primary'
                )}
              >
                <Sparkles className="w-3 h-3" /> AI
              </button>
              <button
                onClick={() => setMode('manual')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                  mode === 'manual' ? 'bg-zinc-900 text-white' : 'text-text-muted hover:text-text-primary'
                )}
              >
                Manual
              </button>
            </div>
          )}
          {skill && <SkillCreditBadge credits={skill.credit_cost} />}

          {phase === 'output' && selectedDraft && (
            <>
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

        {/* Left: Manual mode */}
        {mode === 'manual' && (
          <div className="w-96 flex-shrink-0 flex flex-col border-r border-border bg-white">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold text-text-primary">Fill in context manually</p>
              <p className="text-xs text-text-muted mt-0.5">Complete any fields then click Generate</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {activeIntake.questions.map(q => (
                <div key={q.key}>
                  <label className="text-xs font-semibold text-text-primary block mb-1 capitalize">{q.label}</label>
                  {q.choices ? (
                    <div className="space-y-1.5">
                      {q.choices.map(c => (
                        <button
                          key={c.value}
                          onClick={() => setManualInputs(s => ({ ...s, [q.key]: c.value }))}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                            manualInputs[q.key] === c.value
                              ? 'border-accent bg-accent/5 text-text-primary'
                              : 'border-border bg-white text-text-secondary hover:border-zinc-400'
                          )}
                        >
                          <span className="font-medium capitalize">{c.value}</span>
                          <span className="text-xs text-text-muted ml-1.5">{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={manualInputs[q.key] || ''}
                      onChange={e => setManualInputs(s => ({ ...s, [q.key]: e.target.value }))}
                      placeholder={`Enter ${q.label.toLowerCase()}...`}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <Button
                className="w-full"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={() => { setCollectedContext(manualInputs); handleGenerate(manualInputs) }}
                disabled={phase === 'generating'}
              >
                Generate {skill?.name}
              </Button>
            </div>
          </div>
        )}

        {/* Left: Chat intake */}
        {mode === 'ai' && (
        <div className="w-96 flex-shrink-0 flex flex-col border-r border-border bg-white">
          {/* Progress pills */}
          <div className="px-4 py-3 border-b border-border flex gap-1.5 flex-wrap">
            {activeIntake.questions.map((q, i) => (
              <span
                key={q.key}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                  i < questionIndex
                    ? 'bg-zinc-900 text-white'
                    : i === questionIndex && phase === 'intake'
                      ? 'bg-accent text-white'
                      : 'bg-surface-tertiary text-text-muted'
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
                    ? 'bg-surface-secondary text-text-primary rounded-tl-sm self-start mr-auto'
                    : 'bg-zinc-900 text-white rounded-tr-sm ml-auto'
                )}
              >
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </div>
            ))}

            {phase === 'generating' && (
              <div className="bg-surface-secondary rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-text-muted flex items-center gap-2 max-w-[90%]">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
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
                <div className="px-4 py-3 border-t border-border space-y-2">
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
                              .map((q, i) => `**${q.label}:** ${Object.values(newContext)[i] ?? '—'}`)
                              .join('\n')
                            setMessages(m => [...m, {
                              role: 'assistant',
                              content: `Great — here's what I have:\n\n${summary}\n\nReady to generate the full ${skill?.name ?? 'deliverable'}? Click **Generate** below, or type any corrections.`,
                            }])
                          }
                        }, 0)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-border bg-white hover:border-accent hover:bg-accent/5 transition-colors"
                    >
                      <span className="text-sm font-semibold text-text-primary capitalize">{c.value}</span>
                      <span className="text-xs text-text-muted ml-2">{c.desc}</span>
                    </button>
                  ))}
                </div>
              )
            }
            return (
              <div className="px-4 py-3 border-t border-border">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer..."
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-xl bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                    autoFocus
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40 hover:bg-accent-hover transition-colors flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })()}

          {phase === 'intake' && allQuestionsAnswered && (
            <div className="px-4 py-3 border-t border-border">
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
              <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-base font-semibold text-text-primary">{genProgress}</p>
                <p className="text-sm text-text-muted mt-1">The AI is generating your {skill?.name} deliverable.<br />This usually takes 20–60 seconds.</p>
              </div>
            </div>
          )}

          {phase === 'intake' && !selectedDraft && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-surface-tertiary flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-text-muted" />
              </div>
              <div>
                <p className="font-semibold text-text-primary">Answer the questions on the left</p>
                <p className="text-sm text-text-muted mt-1">Once you've filled in the context, click <strong>Generate</strong> to produce your {skill?.name} deliverable.</p>
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
              <div className="max-w-3xl mx-auto space-y-4">
                {/* Draft header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-text-primary">{skill?.name} — Output</h2>
                    <span className={cn(
                      'text-xs px-2.5 py-0.5 rounded-full font-semibold',
                      selectedDraft.approval_status === 'approved'
                        ? 'bg-zinc-900 text-white'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    )}>
                      {selectedDraft.approval_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Clock className="w-3.5 h-3.5" />
                    {formatRelativeTime(selectedDraft.created_at)}
                  </div>
                </div>

                {/* Content */}
                <div className="bg-white border border-border rounded-2xl p-6 shadow-card">
                  {renderDraftContent(selectedDraft.content)}
                </div>

                {/* Approve CTA if pending */}
                {selectedDraft.approval_status === 'pending' && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <Zap className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm text-amber-800 flex-1">Review the output above. Approve to unlock export.</p>
                    <Button size="sm" leftIcon={<CheckCircle className="w-4 h-4" />} onClick={() => handleApprove(selectedDraft.id)}>
                      Approve
                    </Button>
                  </div>
                )}

                {selectedDraft.approval_status === 'approved' && (
                  <div className="flex items-center gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-zinc-600 flex-shrink-0" />
                    <p className="text-sm text-zinc-700 flex-1">Draft approved. Download below or run again for a revised version.</p>
                    <ExportToolbar draftId={selectedDraft.id} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Draft history — bottom strip */}
          {drafts.length > 0 && (
            <div className="flex-shrink-0 border-t border-border bg-white px-4 py-2 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-text-muted mr-1 flex-shrink-0">History:</span>
              {drafts.map((d, i) => (
                <div key={d.id} className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => { setSelectedDraft(d); setPhase('output') }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-l-full text-xs font-medium border transition-colors',
                      selectedDraft?.id === d.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-text-secondary border-border hover:border-zinc-400'
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
                        ? 'border-zinc-900 bg-zinc-900 text-zinc-400 hover:text-red-300'
                        : 'border-border bg-white text-text-muted hover:bg-red-50 hover:text-red-600 hover:border-red-200'
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
