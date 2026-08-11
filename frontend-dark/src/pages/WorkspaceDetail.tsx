import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Sparkles, FileText, Download, Plug, FileEdit, Plus,
  Target, ChevronRight, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { useOnboardingCompletions } from '../store/onboardingCompletions'
import { useClientProfileStore, type ClientProfile } from '../store/clientProfile'
import { useBriefStore } from '../store/briefStore'
import { useJourneyLaunches } from '../store/journeyLaunches'
import { SkillCard } from '../components/skills/SkillCard'
import { DraftCard } from '../components/ai/DraftCard'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { challengeBriefsAPI, draftsAPI, exportsAPI } from '../lib/api'
import { recommendStudios, signalsFromBriefContent, type BriefSignals } from '../lib/briefRecommender'
import type { Skill } from '../store/workspace'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import type { DraftData } from '../components/ai/DraftCard'

// ── Journey recommendations (same logic as Onboarding step 5) ─────────────

interface JourneyRec {
  id: string
  title: string
  subtitle: string
  description: string
  modules: string[]
  href: string
  color: string
  icon: string
}

// Sort studios so the most relevant deliverables surface first:
//   1) Brief-driven recommendations (top 6) — by recommender score
//   2) Advisory tier (board decks / playbooks / infographics) — highest-value outputs
//   3) Enterprise · Professional · Starter
// Inside any group, alphabetical by name for stable order.
function sortStudios(skills: Skill[], briefSignals: BriefSignals): Skill[] {
  const recs = recommendStudios(briefSignals, 6)
  const recIndex = new Map(recs.map((r, i) => [r.id, i]))
  const TIER_RANK: Record<string, number> = { advisory: 0, enterprise: 1, professional: 2, starter: 3 }
  const slug = (s: Skill): string => (s as unknown as { slug?: string }).slug || s.id

  return [...skills].sort((a, b) => {
    const ra = recIndex.has(slug(a)) ? recIndex.get(slug(a))! : Infinity
    const rb = recIndex.has(slug(b)) ? recIndex.get(slug(b))! : Infinity
    if (ra !== rb) return ra - rb
    const ta = TIER_RANK[a.tier] ?? 99
    const tb = TIER_RANK[b.tier] ?? 99
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name)
  })
}

function computeRecommendations(profile: ClientProfile, briefSignals?: { drivers?: string[]; areas?: string[] }): JourneyRec[] {
  const hp = profile.agenda.hcPriorities
  const tc = profile.workforceContext.talentChallenges
  const lc = profile.workforceContext.leadershipChallenges
  const wc = profile.workforceContext.workforceChallenges

  const journeys: Array<JourneyRec & { triggers: string[] }> = [
    {
      id: 'hipo-pipeline', title: 'HiPo & Succession Pipeline',
      subtitle: 'Build the next generation of leaders',
      description: 'Identify high-potential talent, build succession depth, and create structured development plans for critical roles.',
      modules: ['HiPo Studio', 'Leadership Pipeline', 'Succession Planning'],
      href: '/hipo-studio', color: 'violet', icon: '',
      triggers: ['leadership-development', 'succession-planning', 'hipo-gap', 'succession-risk', 'limited-bench', 'leadership-bench-thin'],
    },
    {
      id: 'workforce-strategy', title: 'Workforce Strategy & Planning',
      subtitle: 'Align workforce to business strategy',
      description: 'Develop a forward-looking workforce plan that maps capabilities, gaps, and talent supply to your strategic objectives.',
      modules: ['HC Strategy Charter', 'Workforce Planning', 'Capability Assessment'],
      href: '/challenge-brief', color: 'blue', icon: '',
      triggers: ['workforce-planning', 'skills-capability', 'skill-mismatch', 'scarcity', 'talent-capability'],
    },
    {
      id: 'talent-acquisition', title: 'Talent Acquisition & Onboarding',
      subtitle: 'Build the right talent pipeline',
      description: 'Redesign your talent acquisition strategy with targeted sourcing, structured selection, and effective onboarding programs.',
      modules: ['Talent Acquisition Studio', 'Early Career', 'Graduate Pipeline'],
      href: '/challenge-brief', color: 'cyan', icon: '',
      triggers: ['talent-acquisition', 'graduate-pipeline', 'external-hire-dependency', 'scarcity'],
    },
    {
      id: 'employee-experience', title: 'Employee Experience & Rewards',
      subtitle: 'Create a compelling employee value proposition',
      description: 'Improve engagement, wellbeing, and retention through a redesigned EX journey and competitive rewards framework.',
      modules: ['Employee Experience', 'Total Rewards', 'Engagement Studio'],
      href: '/challenge-brief', color: 'emerald', icon: '',
      triggers: ['employee-experience', 'rewards-strategy', 'engagement-decline', 'pay-equity', 'benefits-competitiveness', 'high-attrition', 'retention-of-critical-talent'],
    },
    {
      id: 'org-design', title: 'Organization Design & Effectiveness',
      subtitle: 'Redesign for agility and performance',
      description: 'Assess and redesign your operating model, spans of control, and governance structures to enable strategic agility.',
      modules: ['Org Design Blueprint', 'Process Excellence', 'HR Operating Model'],
      href: '/challenge-brief', color: 'amber', icon: '',
      triggers: ['organization-design', 'hr-operating-model', 'change-management', 'operating-model'],
    },
    {
      id: 'performance-learning', title: 'Performance & Learning Ecosystem',
      subtitle: 'Drive capability and accountability',
      description: 'Build a connected performance management and learning system that closes skill gaps and drives high performance culture.',
      modules: ['Performance Management', 'Learning & Training', 'Skills Development'],
      href: '/challenge-brief', color: 'orange', icon: '',
      triggers: ['performance-management', 'learning-development', 'skills-capability', 'skill-mismatch', 'productivity-decline'],
    },
    {
      id: 'nationalization', title: 'Nationalization Acceleration',
      subtitle: 'Deliver on your nationalization commitments',
      description: 'Develop a structured program to meet nationalization targets through targeted recruitment, development, and retention.',
      modules: ['Nationalization Studio', 'Workforce Planning', 'Capability Assessment'],
      href: '/challenge-brief', color: 'rose', icon: '',
      triggers: ['nationalization'],
    },
  ]

  const all = [...hp, ...tc, ...lc, ...wc] as string[]
  // Brief signals also bump scores so the cards react to the saved brief, not just the onboarding profile.
  const briefAll = [...(briefSignals?.drivers ?? []), ...(briefSignals?.areas ?? [])] as string[]
  const scored = journeys.map(j => {
    const base = j.triggers.filter(t => all.includes(t)).length
    const briefBoost = j.triggers.filter(t => briefAll.includes(t)).length * 2  // brief signals worth more — they're recent + intentional
    return { journey: j, score: base + briefBoost }
  })
  scored.sort((a, b) => b.score - a.score)
  const filtered = scored.filter(x => x.score > 0)
  return (filtered.length === 0 ? scored.slice(0, 3) : filtered.slice(0, 5)).map(x => x.journey)
}

const colorMap: Record<string, { card: string; badge: string; dot: string }> = {
  violet:  { card: 'border-violet-500/20 bg-violet-500/5',  badge: 'bg-violet-500/15 text-violet-300',  dot: 'bg-violet-500' },
  blue:    { card: 'border-blue-500/20 bg-blue-500/5',      badge: 'bg-blue-500/15 text-blue-300',      dot: 'bg-blue-500'   },
  cyan:    { card: 'border-cyan-500/20 bg-cyan-500/5',      badge: 'bg-cyan-500/15 text-cyan-300',      dot: 'bg-cyan-500'   },
  emerald: { card: 'border-emerald-500/20 bg-emerald-500/5',badge: 'bg-emerald-500/15 text-emerald-300',dot: 'bg-emerald-500'},
  amber:   { card: 'border-amber-500/20 bg-amber-500/5',    badge: 'bg-amber-500/15 text-amber-300',    dot: 'bg-amber-500'  },
  orange:  { card: 'border-orange-500/20 bg-orange-500/5',  badge: 'bg-orange-500/15 text-orange-300',  dot: 'bg-orange-500' },
  rose:    { card: 'border-rose-500/20 bg-rose-500/5',      badge: 'bg-rose-500/15 text-rose-300',      dot: 'bg-rose-500'   },
}

// ── Tabs ──────────────────────────────────────────────────────────────────

type Tab = 'skills' | 'drafts' | 'exports' | 'connectors' | 'briefs'

const tabs: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'skills',     label: 'Studios',         icon: Sparkles  },
  { id: 'briefs',     label: 'Challenge Briefs', icon: FileEdit  },
  { id: 'drafts',     label: 'Drafts',           icon: FileText  },
  { id: 'exports',    label: 'Exports',          icon: Download  },
  { id: 'connectors', label: 'Connectors',       icon: Plug      },
]

// ── Page ──────────────────────────────────────────────────────────────────

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { workspaces, skills, fetchSkills, currentWorkspace } = useWorkspaceStore()
  const { isCompleted, markCompleted, unmarkCompleted } = useOnboardingCompletions()
  const { profile, isCompleted: profileCompleted, reset: resetProfile, setActiveWorkspace } = useClientProfileStore()
  const { hasBrief, getBrief } = useBriefStore()
  const { hasLaunched, markLaunched } = useJourneyLaunches()

  // Switch the per-workspace profile store record so {profile, isCompleted}
  // reflect THIS workspace, not the previous engagement.
  useEffect(() => {
    setActiveWorkspace(id || null)
  }, [id, setActiveWorkspace])

  const [activeTab, setActiveTab] = useState<Tab>('skills')
  const [drafts, setDrafts] = useState<DraftData[]>([])
  const [exports, setExports] = useState<{ id: string; skill_name: string; format: string; created_at: string; download_url: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const workspace = workspaces.find(w => w.id === id) || currentWorkspace
  // Onboarding is done if the workspace was marked, the global profile flag is set,
  // OR if the profile has a completedAt timestamp (handles cases where flag wasn't persisted correctly)
  const profileEverCompleted = profileCompleted || !!profile.completedAt
  const onboardingDone = id ? (isCompleted(id) || profileEverCompleted) : profileEverCompleted

  // Sync: if profile is completed but this workspace wasn't marked, mark it now
  useEffect(() => {
    if (id && profileEverCompleted && !isCompleted(id)) {
      markCompleted(id)
    }
  }, [id, profileEverCompleted]) // eslint-disable-line
  const briefDone = id ? hasBrief(id) : false
  const existingBrief = id ? getBrief(id) : null

  // Onboarding done but no brief yet: skip this page entirely and drop the
  // user into the AI brief intake (client does not want the interim page).
  useEffect(() => {
    if (id && onboardingDone && !briefDone) {
      navigate(`/challenge-brief?workspaceId=${id}`, { replace: true })
    }
  }, [id, onboardingDone, briefDone, navigate])

  const [serverBriefContent, setServerBriefContent] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    if (!id) return
    challengeBriefsAPI.list().then(res => {
      const raw = (Array.isArray(res.data) ? res.data : res.data?.briefs ?? []) as Array<Record<string, unknown>>
      const existing = raw.find(b => b.workspace_id === id)
      if (existing && existing.content) setServerBriefContent(existing.content as Record<string, unknown>)
    }).catch(() => {})
  }, [id])
  const briefSignals = signalsFromBriefContent(serverBriefContent)
  const recommendations = onboardingDone
    ? computeRecommendations(profile, { drivers: briefSignals.strategicDrivers, areas: briefSignals.hcChallengeAreas })
    : []

  useEffect(() => {
    if (id) fetchSkills(id).then(() => setIsLoading(false))
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (!onboardingDone) return
    if (activeTab === 'drafts' && id) {
      draftsAPI.list({ workspace_id: id }).then(res => setDrafts(res.data.drafts || [])).catch(() => {})
    }
    if (activeTab === 'exports' && id) {
      exportsAPI.list({ workspace_id: id }).then(res => setExports(res.data.exports || [])).catch(() => {})
    }
  }, [activeTab, id, onboardingDone])

  const handleSkillClick = (skillId: string) => navigate(`/workspaces/${id}/skills/${skillId}`)

  const handleDraftApprove = async (draftId: string) => {
    try {
      await draftsAPI.approve(draftId)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'approved' as const } : d))
      toast.success('Draft approved')
    } catch { toast.error('Failed to approve draft') }
  }

  const reRunOnboarding = () => {
    if (id) unmarkCompleted(id)
    resetProfile()
    navigate(`/onboarding?workspaceId=${id}`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6">

      {/* Back */}
      <button onClick={() => navigate('/workspaces')}
        className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Workspaces
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{workspace?.name || 'Workspace'}</h1>
          <p className="text-slate-400 mt-0.5 text-sm">{workspace?.client_name}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={() => navigate(`/advisor/${id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-[0_2px_12px_rgba(23,95,204,0.35)] transition-colors">
            <Sparkles className="w-4 h-4" />
            AI Advisory
          </button>
          {onboardingDone && (
            <button onClick={reRunOnboarding}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Onboarding complete · Re-run
            </button>
          )}
        </div>
      </div>

      {/* ── PRE-ONBOARDING: show only the banner ───────────────────── */}
      {!onboardingDone && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-600/10 to-blue-500/5 p-5 sm:p-6"
        >
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-blue-600/10 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">Start Client Onboarding</p>
                <p className="text-sm text-slate-400 mt-0.5 max-w-lg">
                  Complete the 5-step Smart Client Profile to unlock the Challenge Brief, studio recommendations, and all 27 HC Studios for this workspace.
                </p>
                <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-slate-500 flex-wrap">
                  <span className="text-blue-400 font-semibold">Step 1</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>Client Profile</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>Challenge Brief</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>Studio Recommendations</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>27 HC Studios</span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => navigate(`/onboarding?workspaceId=${id}`)}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              className="flex-shrink-0 w-full sm:w-auto"
              size="lg"
            >
              Start Onboarding
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── POST-ONBOARDING, BRIEF NOT YET DONE: recommended journeys → go to brief first ── */}
      {onboardingDone && !briefDone && (
        <>
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileEdit className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-white">Complete the Challenge Brief</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  Build your advisory brief to unlock the suggested studios and start running AI-powered analyses.
                </p>
              </div>
              <Button onClick={() => navigate(`/challenge-brief?workspaceId=${id}`)} rightIcon={<ArrowRight className="w-4 h-4" />} className="flex-shrink-0">
                Start Brief
              </Button>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Recommended journeys for {workspace?.client_name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendations.map((rec, i) => {
                const c = colorMap[rec.color] ?? colorMap.blue
                return (
                  <motion.button
                    key={rec.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => navigate(`/challenge-brief?workspaceId=${id}`)}
                    className={cn('group text-left p-4 rounded-xl border transition-all hover:scale-[1.01]', c.card)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xl">{rec.icon}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider', c.badge)}>
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white leading-tight">{rec.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{rec.subtitle}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {rec.modules.map(m => (
                        <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500">{m}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-xs text-blue-500 group-hover:text-blue-400 transition-colors">
                      Complete brief to launch <ArrowRight className="w-3 h-3" />
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── POST-ONBOARDING + BRIEF DONE: brief summary + suggested studios + all tabs ── */}
      {onboardingDone && briefDone && (
        <>
          {/* Brief summary banner */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Challenge Brief complete: {existingBrief?.organizationName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {existingBrief?.hcAreas?.length ?? 0} HC areas · {existingBrief?.strategicDrivers?.length ?? 0} strategic drivers · {existingBrief?.outputTypes?.length ?? 0} output types
                </p>
              </div>
            </div>
            <button onClick={() => navigate(`/challenge-brief?workspaceId=${id}`)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap flex-shrink-0">
              <FileEdit className="w-3.5 h-3.5" />
              Edit brief
            </button>
          </div>

          {/* Recommended journeys → now go to actual studio */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recommended journeys for {workspace?.client_name}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendations.map((rec, i) => {
                const c = colorMap[rec.color] ?? colorMap.blue
                const alreadyLaunched = id ? hasLaunched(id, rec.id) : false
                return (
                  <motion.button
                    key={rec.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => {
                      if (id) markLaunched(id, rec.id)
                      // If already launched before → go directly to AI advisor (hipo-studio-v2)
                      // If first time → go to the journey's entry point
                      navigate(alreadyLaunched ? '/hipo-studio-v2' : rec.href)
                    }}
                    className={cn('group text-left p-4 rounded-xl border transition-all hover:scale-[1.01]', c.card)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xl">{rec.icon}</span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider', c.badge)}>
                        {alreadyLaunched ? 'In Progress' : 'Recommended'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white leading-tight">{rec.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{rec.subtitle}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {rec.modules.map(m => (
                        <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500">{m}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
                      {alreadyLaunched ? 'Continue in AI Advisor' : 'Launch journey'} <ArrowRight className="w-3 h-3" />
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#2A3648] overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-300'
                )}
              >
                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'skills' && (
            <div>
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} variant="card" />)}
                </div>
              ) : skills.length === 0 ? (
                <div className="text-center py-16">
                  <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-white font-medium">No studios available</p>
                  <p className="text-slate-600 text-sm mt-1">Studios will appear here once configured</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortStudios(skills, briefSignals).map(skill => (
                    <SkillCard key={skill.id} skill={skill} onClick={() => handleSkillClick(skill.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'drafts' && (
            <div className="space-y-4">
              {drafts.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-white font-medium">No drafts yet</p>
                  <p className="text-slate-600 text-sm mt-1">Run a studio to generate your first draft</p>
                </div>
              ) : (
                drafts.map(draft => (
                  <DraftCard key={draft.id} draft={draft} onApprove={handleDraftApprove}
                    onExport={(draftId) => navigate(`/exports?draft=${draftId}`)} />
                ))
              )}
            </div>
          )}

          {activeTab === 'exports' && (
            <div>
              {exports.length === 0 ? (
                <div className="text-center py-16">
                  <Download className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-white font-medium">No exports yet</p>
                  <p className="text-slate-600 text-sm mt-1">Approve a draft and export it</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {exports.map(exp => (
                    <div key={exp.id} className="bg-[#1B2431] border border-[#2A3648] rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white text-sm">{exp.skill_name}</p>
                        <p className="text-xs text-slate-600 mt-0.5 uppercase">{exp.format}</p>
                      </div>
                      <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => window.open(exp.download_url, '_blank')}>
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'connectors' && (
            <div className="text-center py-16">
              <Plug className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-white font-medium">No connectors configured</p>
              <p className="text-slate-600 text-sm mt-1">Connect data sources to enrich your studios</p>
              <Button variant="secondary" className="mt-4" leftIcon={<Plus className="w-4 h-4" />}>
                Add Connector
              </Button>
            </div>
          )}

          {activeTab === 'briefs' && (
            <div className="rounded-xl border border-[#2A3648] bg-[#1B2431] p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="font-semibold text-white">{existingBrief?.organizationName}: Challenge Brief</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Completed {existingBrief?.completedAt ? new Date(existingBrief.completedAt).toLocaleDateString() : ''}
                  </p>
                </div>
                <Button variant="secondary" size="sm" leftIcon={<FileEdit className="w-3.5 h-3.5" />}
                  onClick={() => navigate(`/challenge-brief?workspaceId=${id}`)}>
                  Edit
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-[#0f1117] p-3">
                  <p className="text-slate-500 mb-1 uppercase tracking-widest text-[10px]">HC Areas</p>
                  <p className="text-white font-semibold">{existingBrief?.hcAreas?.length ?? 0} selected</p>
                </div>
                <div className="rounded-lg bg-[#0f1117] p-3">
                  <p className="text-slate-500 mb-1 uppercase tracking-widest text-[10px]">Strategic Drivers</p>
                  <p className="text-white font-semibold">{existingBrief?.strategicDrivers?.length ?? 0} selected</p>
                </div>
                <div className="rounded-lg bg-[#0f1117] p-3">
                  <p className="text-slate-500 mb-1 uppercase tracking-widest text-[10px]">Output Types</p>
                  <p className="text-white font-semibold">{existingBrief?.outputTypes?.length ?? 0} selected</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
