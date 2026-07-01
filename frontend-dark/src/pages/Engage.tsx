import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, ChevronRight, ChevronLeft,
  Zap, Brain, Download, Share2, ArrowRight,
  Target, Users, TrendingUp, Award, BarChart3,
  Clock, AlertCircle, PlayCircle, FileSearch, BadgeCheck, FolderDown
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { cn } from '../lib/utils'
import { toast } from '../components/ui/Toast'

// ─── Static data ──────────────────────────────────────────────────────────────

const HC_CHALLENGES = [
  'Talent Retention', 'Leadership Pipeline', 'Culture Transformation',
  'Workforce Planning', 'Org Restructuring', 'Succession Planning',
  'Performance Management', 'Diversity & Inclusion',
  'Learning & Development', 'Compensation Strategy',
]

const HC_SKILLS = [
  { id: 'strategy-charter',    name: 'HC Strategy Charter',   credits: 5,  icon: Target,     desc: 'Define the north star for your HC function' },
  { id: 'org-design',          name: 'Org Design Blueprint',  credits: 8,  icon: Users,      desc: 'Structure roles, spans, and reporting lines' },
  { id: 'career-framework',    name: 'Career Framework',      credits: 6,  icon: TrendingUp, desc: 'Ladders, bands, and progression criteria' },
  { id: 'workforce-plan',      name: 'Workforce Plan',        credits: 7,  icon: BarChart3,  desc: 'Supply-demand analysis and hiring roadmap' },
  { id: 'leadership-pipeline', name: 'Leadership Pipeline',   credits: 10, icon: Award,      desc: 'Identify and develop future leaders' },
]

const EXPORT_FORMATS = [
  { id: 'pptx', label: 'PowerPoint',    ext: '.pptx', desc: 'Client-ready presentation deck' },
  { id: 'pdf',  label: 'PDF Report',    ext: '.pdf',  desc: 'Printable formatted report'     },
  { id: 'docx', label: 'Word Document', ext: '.docx', desc: 'Fully editable document'        },
]

const STEPS = [
  { id: 1, label: 'Client Brief'      },
  { id: 2, label: 'Select Skill'      },
  { id: 3, label: 'AI Generation'     },
  { id: 4, label: 'Review & Approve'  },
  { id: 5, label: 'Export & Deliver'  },
]

const HOW_IT_WORKS = [
  { icon: FileSearch,  title: 'Capture the Brief',  desc: 'Describe the client, their challenges, and desired outcomes.' },
  { icon: Zap,         title: 'Pick a Skill',        desc: 'Choose one of 27 HC advisory studios to run.' },
  { icon: Brain,       title: 'AI Generates Output', desc: 'Aivora AI produces a structured, client-ready deliverable.' },
  { icon: BadgeCheck,  title: 'Review & Approve',    desc: 'Read through the output and approve before exporting.' },
  { icon: FolderDown,  title: 'Export & Deliver',    desc: 'Download as PowerPoint, PDF, or Word and share with your client.' },
]

// ─── Step progress indicator ──────────────────────────────────────────────────

function StepProgress({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="mb-8">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done   = completed.includes(step.id)
          const active = current === step.id
          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                  done   ? 'bg-[#0c0e14] border-[#111111] text-white' :
                  active ? 'bg-[#131720] border-[#111111] text-white' :
                           'bg-[#131720] border-[#1e2433] text-slate-500'
                )}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : step.id}
                </div>
                <span className={cn(
                  'text-xs font-medium whitespace-nowrap hidden sm:block',
                  active ? 'text-white' : done ? 'text-[#666666]' : 'text-slate-500'
                )}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  'flex-1 h-px mx-3 mb-5 transition-colors duration-300',
                  completed.includes(step.id) ? 'bg-[#0c0e14]' : 'bg-[#1a1e2e]'
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── How it works panel ───────────────────────────────────────────────────────

function HowItWorks({ onStart }: { onStart: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">New Client Brief</h1>
        <p className="text-sm text-[#666666] mt-1">
          Go from a client brief to a polished deliverable in five steps. Powered by Aivora AI.
        </p>
      </div>

      <div className="bg-[#131720] border border-[#1e2433] rounded-2xl overflow-hidden shadow-sm mb-6">
        <div className="px-6 py-5 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-semibold text-white">How it works</h2>
        </div>
        <div className="divide-y divide-[#1A1A1A]">
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex items-start gap-4 px-6 py-4">
                <div className="w-8 h-8 rounded-lg bg-[#1a1e2e] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    <span className="text-slate-500 font-normal mr-2">{i + 1}.</span>
                    {item.title}
                  </p>
                  <p className="text-xs text-[#666666] mt-0.5">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between p-5 bg-[#0c0e14] rounded-2xl">
        <div>
          <p className="font-semibold text-white text-sm">Ready to start?</p>
          <p className="text-xs text-slate-500 mt-0.5">Typical run takes 10-15 minutes end to end</p>
        </div>
        <Button
          onClick={onStart}
          rightIcon={<PlayCircle className="w-4 h-4" />}
          className="bg-[#131720] text-white hover:bg-[#1a1e2e]"
        >
          Begin
        </Button>
      </div>
    </motion.div>
  )
}

// ─── Step 1: Client Brief ─────────────────────────────────────────────────────

interface BriefForm {
  title: string
  org_context: string
  challenges: string[]
  target_outcomes: string
  timeline: string
}

function StepBrief({ onNext }: { onNext: (f: BriefForm) => void }) {
  const [form, setForm] = useState<BriefForm>({
    title: '', org_context: '', challenges: [],
    target_outcomes: '', timeline: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof BriefForm, string>>>({})

  const toggle = (c: string) =>
    setForm(f => ({
      ...f,
      challenges: f.challenges.includes(c)
        ? f.challenges.filter(x => x !== c)
        : [...f.challenges, c],
    }))

  const validate = () => {
    const e: typeof errors = {}
    if (!form.title.trim()) e.title = 'Client brief title is required'
    if (form.org_context.trim().length < 20) e.org_context = 'Please provide a brief description of the organisation'
    if (form.challenges.length === 0) e.challenges = 'Select at least one challenge area'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <div className="space-y-6">
      <Input
        label="Brief Title"
        placeholder="e.g. Q3 HC Advisory: Acme Corporation"
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        error={errors.title}
      />

      <Textarea
        label="Organisation Context"
        placeholder="Describe the organisation: industry, headcount, current structure, and what is driving this advisory..."
        value={form.org_context}
        onChange={e => setForm(f => ({ ...f, org_context: e.target.value }))}
        rows={4}
        error={errors.org_context}
      />

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Key Challenge Areas
          <span className="ml-1 font-normal text-slate-500">Select all that apply</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {HC_CHALLENGES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                form.challenges.includes(c)
                  ? 'bg-[#0c0e14] text-white border-[#111111]'
                  : 'bg-[#131720] text-slate-500 border-[#1e2433] hover:border-[#3b82f6] hover:text-white'
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {errors.challenges && (
          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />{errors.challenges}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Textarea
          label="Target Outcomes"
          placeholder="What does success look like for the client?"
          value={form.target_outcomes}
          onChange={e => setForm(f => ({ ...f, target_outcomes: e.target.value }))}
          rows={3}
        />
        <Input
          label="Timeline"
          placeholder="e.g. Q1 2026, 90 days"
          value={form.timeline}
          onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => { if (validate()) onNext(form) }} rightIcon={<ChevronRight className="w-4 h-4" />}>
          Continue to Skill Selection
        </Button>
      </div>
    </div>
  )
}

// ─── Step 2: Select Skill ─────────────────────────────────────────────────────

function StepSkill({
  onNext,
  onBack,
}: {
  onNext: (skill: typeof HC_SKILLS[number]) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState('')

  const chosen = HC_SKILLS.find(s => s.id === selected)

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#666666]">
        Select one HC skill. Each skill runs a dedicated AI agent and produces a structured, client-ready deliverable.
      </p>

      <div className="divide-y divide-[#1A1A1A] border border-[#1e2433] rounded-xl overflow-hidden">
        {HC_SKILLS.map(skill => {
          const Icon = skill.icon
          const on   = selected === skill.id
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => { setSelected(skill.id); setError('') }}
              className={cn(
                'w-full flex items-center gap-4 px-5 py-4 text-left transition-colors',
                on ? 'bg-[#0c0e14]' : 'bg-[#131720] hover:bg-[#131720]'
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', on ? 'bg-[#131720]/10' : 'bg-[#1a1e2e]')}>
                <Icon className={cn('w-4 h-4', on ? 'text-white' : 'text-[#666666]')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold text-sm', on ? 'text-white' : 'text-white')}>{skill.name}</p>
                <p className={cn('text-xs mt-0.5', on ? 'text-slate-500' : 'text-slate-500')}>{skill.desc}</p>
              </div>
              <div className={cn('flex items-center gap-1.5 text-xs font-medium flex-shrink-0', on ? 'text-slate-500' : 'text-slate-500')}>
                <Zap className="w-3.5 h-3.5" />{skill.credits} credits
              </div>
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                on ? 'bg-[#131720] border-white' : 'border-[#333333]'
              )}>
                {on && <div className="w-2.5 h-2.5 rounded-full bg-[#0c0e14]" />}
              </div>
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />{error}
        </p>
      )}

      {chosen && (
        <div className="flex items-center gap-3 py-3 px-4 bg-[#131720] border border-[#1e2433] rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className="text-slate-300">
            <strong className="text-white">{chosen.name}</strong> selected. {chosen.credits} credits will be used.
          </span>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} leftIcon={<ChevronLeft className="w-4 h-4" />}>Back</Button>
        <Button
          onClick={() => { if (!chosen) { setError('Select a skill to continue'); return } onNext(chosen) }}
          leftIcon={<Brain className="w-4 h-4" />}
        >
          Run AI Analysis
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3: AI Generation ────────────────────────────────────────────────────

function StepGenerate({
  brief,
  skill,
  onNext,
  onBack,
}: {
  brief: BriefForm
  skill: typeof HC_SKILLS[number]
  onNext: (output: string) => void
  onBack: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const logLines = [
    `Initialising ${skill.name} agent...`,
    `Reading client brief: "${brief.title}"`,
    `Identifying challenge priorities: ${brief.challenges.slice(0, 2).join(', ')}...`,
    `Loading HC frameworks and industry benchmarks...`,
    `Analysing organisational context...`,
    `Structuring deliverable framework...`,
    `Drafting executive summary...`,
    `Generating strategic recommendations...`,
    `Building phased implementation roadmap...`,
    `Formatting client-ready output...`,
    `Quality check complete.`,
  ]

  const run = async () => {
    setPhase('running')
    setLog([])
    setProgress(0)
    for (let i = 0; i < logLines.length; i++) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 250))
      setLog(l => [...l, logLines[i]])
      setProgress(Math.round(((i + 1) / logLines.length) * 100))
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    setPhase('done')
    setProgress(100)
  }

  const output =
    `## ${skill.name}\n\n` +
    `**Client:** ${brief.title}\n` +
    `**Challenges:** ${brief.challenges.join(', ')}\n` +
    `**Timeline:** ${brief.timeline || 'Not specified'}\n\n` +
    `---\n\n` +
    `### Executive Summary\n\n` +
    `This deliverable provides a structured advisory framework to address the identified HC priorities. ` +
    `It is designed to be implemented over ${brief.timeline || '90 days'} with clear ownership, phased milestones, and measurable outcomes.\n\n` +
    `### Strategic Recommendations\n\n` +
    `1. **Governance & Ownership**: Establish a dedicated HC steering group with senior sponsorship and clear terms of reference\n` +
    `2. **Diagnostic Phase**: Conduct a rapid 2-week diagnostic to baseline current-state capability gaps across the identified challenge areas\n` +
    `3. **Prioritisation Framework**: Apply a 2x2 impact vs. effort matrix to sequence initiatives and secure early wins within 30 days\n` +
    `4. **Stakeholder Alignment**: Run structured working sessions with business unit heads to align on outcomes and resourcing\n` +
    `5. **KPI Framework**: Define 5-7 leading and lagging indicators tied directly to business outcomes\n\n` +
    `### Implementation Roadmap\n\n` +
    `**Phase 1, Weeks 1-4: Foundation**\n` +
    `Stakeholder mapping, current-state assessment, governance setup, baseline KPI collection\n\n` +
    `**Phase 2, Weeks 5-8: Design & Pilot**\n` +
    `Framework design, pilot cohort selection, change communication, initial rollout\n\n` +
    `**Phase 3, Weeks 9-12: Scale & Embed**\n` +
    `Full deployment, adoption tracking, 90-day impact review, lessons learned\n\n` +
    `### Risk & Mitigation\n\n` +
    `| Risk | Likelihood | Mitigation |\n` +
    `|---|---|---|\n` +
    `| Low executive sponsorship | Medium | Early C-suite engagement in Week 1 |\n` +
    `| Scope creep | High | Strict change-control process with sign-off gates |\n` +
    `| Capability gaps in HC team | Low | Targeted upskilling plan in Phase 2 |`

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-[#131720] border border-[#1e2433] rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-[#1a1e2e] flex items-center justify-center flex-shrink-0">
          <skill.icon className="w-4 h-4 text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{skill.name}</p>
          <p className="text-xs text-[#666666]">Running against: {brief.title}</p>
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <Zap className="w-3.5 h-3.5" />{skill.credits} credits
        </div>
      </div>

      {phase !== 'idle' && (
        <div>
          <div className="flex justify-between text-xs text-[#666666] mb-2">
            <span>{phase === 'done' ? 'Generation complete' : 'Generating output...'}</span>
            <span className="font-medium text-slate-300">{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#1a1e2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#131720] rounded-full"
              style={{ width: '0%' }}
              animate={{ width: `${Math.max(0, progress)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div ref={scrollRef} className="bg-[#0c0e14] rounded-xl p-4 h-52 overflow-y-auto">
          {log.map((line, i) => (
            <p key={i} className="text-xs text-slate-500 leading-5">
              <span className="text-slate-500 mr-2 select-none tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              {line}
            </p>
          ))}
          {phase === 'done' && (
            <p className="text-xs text-slate-500 font-medium mt-2">Output generated successfully.</p>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <p className="text-sm text-[#666666]">
          Aivora AI will process your brief and generate a full structured output for <strong className="text-white">{skill.name}</strong>. This typically takes under a minute.
        </p>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} disabled={phase === 'running'} leftIcon={<ChevronLeft className="w-4 h-4" />}>Back</Button>
        {phase === 'idle' && (
          <Button onClick={run} leftIcon={<Brain className="w-4 h-4" />}>Start Generation</Button>
        )}
        {phase === 'running' && (
          <Button disabled leftIcon={<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}>
            Generating...
          </Button>
        )}
        {phase === 'done' && (
          <Button onClick={() => onNext(output)} rightIcon={<ChevronRight className="w-4 h-4" />}>Review Output</Button>
        )}
      </div>
    </div>
  )
}

// ─── Step 4: Review & Approve ─────────────────────────────────────────────────

function StepReview({
  skill,
  output,
  onNext,
  onBack,
}: {
  skill: typeof HC_SKILLS[number]
  output: string
  onNext: () => void
  onBack: () => void
}) {
  const [approved, setApproved] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-[#131720] border border-[#1e2433] rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-[#1a1e2e] flex items-center justify-center flex-shrink-0">
          <skill.icon className="w-4 h-4 text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{skill.name}</p>
          <p className="text-xs text-[#666666]">Review the generated output below before approving</p>
        </div>
      </div>

      <div className="border border-[#1e2433] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-center justify-between bg-[#131720]">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Generated Output</span>
          {approved && (
            <span className="flex items-center gap-1 text-xs font-medium text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
            </span>
          )}
        </div>
        <div className="p-5 h-72 overflow-y-auto">
          <pre className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap font-sans">{output}</pre>
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-[#131720] border border-[#1e2433] rounded-xl">
        <p className="text-sm text-slate-500">
          {approved
            ? 'Output approved. You can now proceed to export.'
            : 'Read through the output and approve it to continue.'}
        </p>
        <button
          onClick={() => setApproved(a => !a)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all',
            approved
              ? 'bg-[#0c0e14] text-white border-[#111111]'
              : 'bg-[#131720] text-white border-[#333333] hover:border-[#3b82f6]'
          )}
        >
          <CheckCircle2 className="w-4 h-4" />
          {approved ? 'Approved' : 'Approve Output'}
        </button>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} leftIcon={<ChevronLeft className="w-4 h-4" />}>Back</Button>
        <Button disabled={!approved} onClick={onNext} rightIcon={<ChevronRight className="w-4 h-4" />}>
          Proceed to Export
        </Button>
      </div>
    </div>
  )
}

// ─── Step 5: Export & Deliver ─────────────────────────────────────────────────

function StepDeliver({
  brief,
  skill,
  onBack,
}: {
  brief: BriefForm
  skill: typeof HC_SKILLS[number]
  onBack: () => void
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<string[]>([])
  const [linkedIn, setLinkedIn] = useState(false)

  const handleDownload = (fmt: typeof EXPORT_FORMATS[number]) => {
    if (downloaded.includes(fmt.id) || downloading) return
    setDownloading(fmt.id)
    setTimeout(() => {
      setDownloading(null)
      setDownloaded(d => [...d, fmt.id])
      toast.success(`${fmt.label} exported successfully`)
    }, 1600)
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="border border-[#1e2433] rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Brief Summary</p>
        <p className="text-base font-bold text-white mb-4">{brief.title}</p>
        <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-[#1A1A1A]">
          <div>
            <div className="text-xl font-bold text-white">1</div>
            <div className="text-xs text-[#666666] mt-0.5">Skill run</div>
          </div>
          <div>
            <div className="text-xl font-bold text-white">{brief.challenges.length}</div>
            <div className="text-xs text-[#666666] mt-0.5">Challenges addressed</div>
          </div>
          <div>
            <div className="text-xl font-bold text-white">{skill.credits}</div>
            <div className="text-xs text-[#666666] mt-0.5">Credits used</div>
          </div>
        </div>
      </div>

      {/* Skill badge */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#131720] border border-[#1e2433] rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-[#1a1e2e] flex items-center justify-center flex-shrink-0">
          <skill.icon className="w-4 h-4 text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{skill.name}</p>
          <p className="text-xs text-[#666666]">Ready to download in all formats</p>
        </div>
        <CheckCircle2 className="w-4 h-4 text-slate-300 ml-auto flex-shrink-0" />
      </div>

      {/* Export formats */}
      <div>
        <p className="text-sm font-semibold text-white mb-3">Download Deliverable</p>
        <div className="divide-y divide-[#1A1A1A] border border-[#1e2433] rounded-xl overflow-hidden">
          {EXPORT_FORMATS.map(fmt => {
            const done    = downloaded.includes(fmt.id)
            const loading = downloading === fmt.id
            return (
              <div key={fmt.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{fmt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{fmt.desc}</p>
                </div>
                <span className="text-xs text-slate-500 font-mono">{fmt.ext}</span>
                <button
                  onClick={() => handleDownload(fmt)}
                  disabled={!!downloading || done}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border transition-all min-w-[110px] justify-center',
                    done    ? 'bg-[#1a1e2e] text-[#666666] border-[#1e2433] cursor-default' :
                    loading ? 'bg-[#131720] text-white border-[#1A1A1A] cursor-wait' :
                              'bg-[#131720] text-white border-[#333333] hover:border-[#3b82f6] hover:bg-[#131720]'
                  )}
                >
                  {loading ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Exporting...</>
                  ) : done ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Downloaded</>
                  ) : (
                    <><Download className="w-3.5 h-3.5" /> Download</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* LinkedIn */}
      <div>
        <p className="text-sm font-semibold text-white mb-3">Publish Insight</p>
        <div className="border border-[#1e2433] rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#0077B5] flex items-center justify-center flex-shrink-0">
            <Share2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">LinkedIn</p>
            <p className="text-xs text-slate-500 mt-0.5">Schedule a thought-leadership post from this client brief</p>
          </div>
          <Button
            size="sm"
            variant={linkedIn ? 'secondary' : 'primary'}
            onClick={() => { setLinkedIn(true); toast.success('LinkedIn post scheduled') }}
            disabled={linkedIn}
            leftIcon={linkedIn ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          >
            {linkedIn ? 'Scheduled' : 'Schedule Post'}
          </Button>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack} leftIcon={<ChevronLeft className="w-4 h-4" />}>Back</Button>
        <Button onClick={() => window.location.href = '/dashboard'} rightIcon={<ArrowRight className="w-4 h-4" />}>
          Return to Dashboard
        </Button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Engage() {
  const [view, setView]         = useState<'intro' | 'flow'>('intro')
  const [step, setStep]         = useState(1)
  const [completed, setCompleted] = useState<number[]>([])
  const [brief, setBrief]       = useState<BriefForm | null>(null)
  const [skill, setSkill]       = useState<typeof HC_SKILLS[number] | null>(null)
  const [output, setOutput]     = useState('')

  const advance = (toStep: number, completedStep: number) => {
    setCompleted(c => c.includes(completedStep) ? c : [...c, completedStep])
    setStep(toStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (view === 'intro') {
    return (
      <div className="min-h-full bg-[#131720]">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <HowItWorks onStart={() => setView('flow')} />
        </div>
      </div>
    )
  }

  const stepMeta = STEPS.find(s => s.id === step)

  return (
    <div className="min-h-full bg-[#131720]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <button
            onClick={() => setView('intro')}
            className="text-xs text-slate-500 hover:text-slate-300 mb-3 flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" /> How it works
          </button>
          <h1 className="text-2xl font-bold text-white">{stepMeta?.label}</h1>
          <p className="text-sm text-[#666666] mt-1">Step {step} of {STEPS.length}</p>
        </div>

        <StepProgress current={step} completed={completed} />

        <div className="bg-[#131720] border border-[#1e2433] rounded-2xl p-6 shadow-sm">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StepBrief onNext={f => { setBrief(f); advance(2, 1) }} />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="skill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StepSkill
                  onNext={s => { setSkill(s); advance(3, 2) }}
                  onBack={() => setStep(1)}
                />
              </motion.div>
            )}
            {step === 3 && brief && skill && (
              <motion.div key="generate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StepGenerate
                  brief={brief}
                  skill={skill}
                  onNext={o => { setOutput(o); advance(4, 3) }}
                  onBack={() => setStep(2)}
                />
              </motion.div>
            )}
            {step === 4 && skill && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StepReview
                  skill={skill}
                  output={output}
                  onNext={() => advance(5, 4)}
                  onBack={() => setStep(3)}
                />
              </motion.div>
            )}
            {step === 5 && brief && skill && (
              <motion.div key="deliver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StepDeliver
                  brief={brief}
                  skill={skill}
                  onBack={() => setStep(4)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 justify-center">
          <Clock className="w-3 h-3" />
          Typical run: 10-15 minutes end to end
        </div>
      </div>
    </div>
  )
}
