import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Zap, FileEdit, Clock, Play } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { challengeBriefsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp, staggerContainer } from '../lib/animations'
import { formatRelativeTime } from '../lib/utils'
import { cn } from '../lib/utils'

const challenges = [
  'Talent Retention', 'Leadership Pipeline', 'Culture Transformation', 'Workforce Planning',
  'Org Restructuring', 'Succession Planning', 'Performance Management', 'Diversity & Inclusion',
  'Learning & Development', 'Compensation Strategy', 'Employee Experience', 'HR Technology',
]

const skillOptions = [
  { id: 'strategy-charter', name: 'HC Strategy Charter', credits: 5 },
  { id: 'org-design', name: 'Org Design Blueprint', credits: 8 },
  { id: 'career-framework', name: 'Career Framework', credits: 6 },
  { id: 'workforce-plan', name: 'Workforce Plan', credits: 7 },
  { id: 'leadership-pipeline', name: 'Leadership Pipeline', credits: 10 },
]

interface Brief {
  id: string
  title: string
  status: 'draft' | 'running' | 'complete'
  created_at: string
  skills_count: number
}

export default function ChallengeBrief() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    org_context: '',
    challenges: [] as string[],
    target_outcomes: '',
    timeline: '',
    skills: [] as string[],
  })

  useEffect(() => {
    challengeBriefsAPI.list().then(res => setBriefs(res.data.briefs || [])).catch(() => {})
  }, [])

  const toggleChallenge = (c: string) => {
    setForm(prev => ({
      ...prev,
      challenges: prev.challenges.includes(c)
        ? prev.challenges.filter(x => x !== c)
        : [...prev.challenges, c],
    }))
  }

  const toggleSkill = (skillId: string) => {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skillId)
        ? prev.skills.filter(x => x !== skillId)
        : [...prev.skills, skillId],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title) { toast.error('Title is required'); return }
    setIsLoading(true)
    try {
      const res = await challengeBriefsAPI.create(form)
      setBriefs(prev => [res.data.brief, ...prev])
      setShowForm(false)
      toast.success('Challenge brief created!')
    } catch { toast.error('Failed to create brief') }
    finally { setIsLoading(false) }
  }

  const handleRun = async (briefId: string) => {
    try {
      await challengeBriefsAPI.run(briefId)
      setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, status: 'running' as const } : b))
      toast.success('AI analysis started on your brief')
    } catch { toast.error('Failed to run brief') }
  }

  const totalCredits = form.skills.reduce((sum, id) => {
    const s = skillOptions.find(o => o.id === id)
    return sum + (s?.credits || 0)
  }, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Challenge Briefs</h1>
          <p className="text-text-secondary mt-1">Brief the AI to run multiple skills at once</p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(!showForm)}>
          New Brief
        </Button>
      </motion.div>

      {/* Create Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6">
            <h2 className="font-semibold text-text-primary mb-5 flex items-center gap-2">
              <FileEdit className="w-5 h-5" />
              New Challenge Brief
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Brief Title"
                placeholder="Q1 HC Strategy Brief for Acme Corp"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              <Textarea
                label="Organization Context"
                placeholder="Describe the organization, industry, size, and current HC situation..."
                value={form.org_context}
                onChange={e => setForm(f => ({ ...f, org_context: e.target.value }))}
                rows={4}
              />

              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Key Challenges</label>
                <div className="flex flex-wrap gap-2">
                  {challenges.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleChallenge(c)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        form.challenges.includes(c)
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white text-text-secondary border-border hover:border-border-dark'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Textarea
                  label="Target Outcomes"
                  placeholder="What outcomes do you want to achieve?"
                  value={form.target_outcomes}
                  onChange={e => setForm(f => ({ ...f, target_outcomes: e.target.value }))}
                  rows={3}
                />
                <Input
                  label="Timeline"
                  placeholder="e.g. Q1 2026, 3 months"
                  value={form.timeline}
                  onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary block mb-2">Select Skills to Run</label>
                <div className="grid grid-cols-2 gap-2">
                  {skillOptions.map(skill => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors',
                        form.skills.includes(skill.id)
                          ? 'border-accent bg-accent-light'
                          : 'border-border bg-white hover:border-border-dark'
                      )}
                    >
                      <span className={cn('text-sm font-medium', form.skills.includes(skill.id) ? 'text-text-primary' : 'text-text-secondary')}>
                        {skill.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-text-muted" />
                        <span className="text-xs text-text-muted">{skill.credits}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {totalCredits > 0 && (
                  <p className="text-sm text-text-secondary mt-2">
                    Total: <span className="font-semibold text-text-primary">{totalCredits} credits</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" isLoading={isLoading} leftIcon={<Play className="w-4 h-4" />}>
                  Create Brief
                </Button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Brief History */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Brief History</h2>
        {briefs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-border">
            <FileEdit className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-primary font-medium">No briefs yet</p>
            <p className="text-text-muted text-sm mt-1">Create a challenge brief to run AI across multiple skills</p>
          </div>
        ) : (
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-3">
            {briefs.map((brief, i) => (
              <motion.div key={brief.id} variants={fadeUp} custom={i}>
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{brief.title}</h3>
                        <Badge variant={
                          brief.status === 'complete' ? 'success' :
                          brief.status === 'running' ? 'default' : 'muted'
                        }>
                          {brief.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Zap className="w-3 h-3" />
                          <span>{brief.skills_count} skills</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock className="w-3 h-3" />
                          <span>{formatRelativeTime(brief.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    {brief.status === 'draft' && (
                      <Button size="sm" leftIcon={<Play className="w-3.5 h-3.5" />} onClick={() => handleRun(brief.id)}>
                        Run Analysis
                      </Button>
                    )}
                    {brief.status === 'running' && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        Running...
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
