import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, Sparkles, Lock, ArrowRight, Zap,
  Compass, BarChart3, TrendingUp, Lightbulb, ClipboardList, Award,
  Users, Target, GitBranch, Shield, BookOpen, Briefcase,
  HeartPulse, Globe, Layers, PieChart, Cpu, Workflow,
  Star, Rocket, Building2, FileText, RefreshCw, ChevronRight,
} from 'lucide-react'
import { Input } from '../components/ui/Input'
import { cn } from '../lib/utils'

type StudioCategory = 'all' | 'strategy' | 'talent' | 'learning' | 'advisory' | 'commercial'
type TierFilter = 'all' | 'starter' | 'professional' | 'enterprise' | 'advisory'

interface Studio {
  id: string
  name: string
  description: string
  category: StudioCategory
  tier: TierFilter
  creditCost: number
  icon: typeof Compass
  status: 'live' | 'coming' | 'locked'
  tag?: string
}

const studios: Studio[] = [
  // Strategy & Transformation
  { id: 'hc-strategy',      name: 'HC Strategy Charter',        description: 'Build a multi-year HC strategy aligned to business goals',         category: 'strategy', tier: 'starter',      creditCost: 5,  icon: Compass,       status: 'live' },
  { id: 'org-design',       name: 'Org Design Blueprint',       description: 'Design operating structures, spans and reporting lines',            category: 'strategy', tier: 'professional', creditCost: 8,  icon: Building2,     status: 'live' },
  { id: 'maturity',         name: 'Maturity Assessment',        description: 'Score HC maturity across 10 dimensions with heat-map output',       category: 'strategy', tier: 'professional', creditCost: 5,  icon: BarChart3,     status: 'live' },
  { id: 'benchmarking',     name: 'Benchmarking Studio',        description: 'Benchmark HC metrics against industry peers and best practice',     category: 'strategy', tier: 'professional', creditCost: 5,  icon: TrendingUp,    status: 'live' },
  { id: 'business-plan',    name: 'HC Business Plan',           description: 'Board-ready HC business plan with ROI modelling',                  category: 'strategy', tier: 'professional', creditCost: 5,  icon: PieChart,      status: 'live' },
  { id: 'process-exc',      name: 'Process Excellence',         description: 'Map and optimise HC processes using lean principles',               category: 'strategy', tier: 'enterprise',   creditCost: 10, icon: Workflow,      status: 'live' },
  { id: 'framework',        name: 'Framework Review',           description: 'Audit and redesign governance and operating model frameworks',       category: 'strategy', tier: 'enterprise',   creditCost: 10, icon: Layers,        status: 'live' },
  // Talent & Capability
  { id: 'talent-acq',       name: 'Talent Acquisition',         description: 'End-to-end talent acquisition strategy and employer brand',         category: 'talent',   tier: 'professional', creditCost: 5,  icon: Target,        status: 'live' },
  { id: 'performance',      name: 'Performance Management',     description: 'Performance frameworks, OKRs and review cadences',                  category: 'talent',   tier: 'professional', creditCost: 5,  icon: Star,          status: 'live' },
  { id: 'workforce',        name: 'Workforce Planning',         description: 'Model headcount requirements and workforce demand scenarios',        category: 'talent',   tier: 'professional', creditCost: 5,  icon: Users,         status: 'live' },
  { id: 'skills-dev',       name: 'Skills Development',         description: 'Identify skill gaps and build targeted development roadmaps',        category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: GitBranch,     status: 'live' },
  { id: 'capability',       name: 'Capability Assessment',      description: 'Assess organisational capability and design improvement plans',      category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: Shield,        status: 'live' },
  { id: 'succession',       name: 'Succession Planning',        description: 'Build robust succession plans for critical roles',                   category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: Rocket,        status: 'live' },
  // Career & Pipeline
  { id: 'hipo',             name: 'HiPo Development',           description: 'Identify high-potential leaders and build accelerated pipelines',   category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: Lightbulb,     status: 'live',    tag: 'Featured' },
  { id: 'leadership-dev',   name: 'Leadership Development',     description: 'Design leadership programmes from emerging to executive level',      category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: Award,         status: 'live' },
  { id: 'coaching',         name: 'Coaching & Mentoring',       description: 'Build coaching culture and structured mentoring programmes',         category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: HeartPulse,    status: 'live' },
  { id: 'early-career',     name: 'Early Career Studio',        description: 'Graduate and early-career pipeline strategy and onboarding',        category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: BookOpen,      status: 'live' },
  { id: 'mobility',         name: 'Mobility Studio',            description: 'Internal mobility frameworks and career transition pathways',        category: 'talent',   tier: 'enterprise',   creditCost: 10, icon: Globe,         status: 'live' },
  { id: 'learning',         name: 'Learning & Training',        description: 'Learning architecture, curricula and training calendar design',      category: 'learning', tier: 'enterprise',   creditCost: 10, icon: ClipboardList, status: 'live' },
  // Advisory & Deliverables
  { id: 'employee-exp',     name: 'Employee Experience',        description: 'Design employee journeys and engagement improvement strategies',     category: 'advisory', tier: 'enterprise',   creditCost: 10, icon: HeartPulse,    status: 'live' },
  { id: 'total-rewards',    name: 'Total Rewards',              description: 'Pay, benefits and recognition framework design',                    category: 'advisory', tier: 'enterprise',   creditCost: 10, icon: Briefcase,     status: 'live' },
  { id: 'org-dev',          name: 'Organisation Development',   description: 'Change initiatives, culture programmes and OD interventions',        category: 'advisory', tier: 'enterprise',   creditCost: 10, icon: RefreshCw,     status: 'live' },
  { id: 'deck-gen',         name: 'Deck Generator',             description: 'Generate board-ready executive decks from briefing inputs',         category: 'commercial', tier: 'advisory',  creditCost: 15, icon: FileText,      status: 'live' },
  { id: 'playbook',         name: 'Playbook Studio',            description: 'Create structured playbooks for HC programmes and change journeys',  category: 'commercial', tier: 'advisory',  creditCost: 15, icon: BookOpen,      status: 'live' },
  { id: 'infographic',      name: 'Infographic Studio',         description: 'Transform data and insights into visual infographics',              category: 'commercial', tier: 'advisory',  creditCost: 15, icon: Cpu,           status: 'live' },
  { id: 'brand',            name: 'Brand Workspace',            description: 'Manage brand kits and white-label design assets',                   category: 'commercial', tier: 'starter',   creditCost: 0,  icon: Layers,        status: 'live' },
  { id: 'doc-engine',       name: 'Document Engine',            description: 'Collaborative document workspace for HC deliverables',              category: 'commercial', tier: 'starter',   creditCost: 0,  icon: FileText,      status: 'live' },
]

const categoryLabels: Record<StudioCategory, string> = {
  all: 'All', strategy: 'Strategy & Transformation', talent: 'Talent & People',
  learning: 'Learning', advisory: 'Advisory', commercial: 'Commercial',
}

const tierColors: Record<string, { badge: string; glow: string }> = {
  starter:      { badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',  glow: '' },
  professional: { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',     glow: 'hover:shadow-[0_0_20px_rgba(46,125,250,0.08)]' },
  enterprise:   { badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20', glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.08)]' },
  advisory:     { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]' },
}

export default function SkillsMarketplace() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<StudioCategory>('all')
  const [tier, setTier] = useState<TierFilter>('all')

  const filtered = studios.filter(s => {
    const q = search.toLowerCase()
    return (
      (category === 'all' || s.category === category) &&
      (tier === 'all' || s.tier === tier) &&
      (search === '' || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    )
  })

  const counts = {
    live: studios.filter(s => s.status === 'live').length,
    coming: studios.filter(s => s.status === 'coming').length,
  }

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-7">

      {/* Header — matches Dashboard hero proportions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">HC Studios</h1>
          <p className="text-sm text-slate-400 mt-1">
            {counts.live} advisory studios powered by AI, from strategy to deliverables. Every engagement covered.
          </p>
        </div>
      </motion.div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Studios', value: counts.live, color: 'text-blue-400' },
          { label: 'Categories', value: 5, color: 'text-violet-400' },
          { label: 'Output formats', value: 3, color: 'text-cyan-400' },
          { label: 'Coming soon', value: counts.coming, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[#2A3648] bg-[#0f1117] p-3 text-center">
            <div className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</div>
            <div className="text-[11px] text-slate-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search studios..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-[#2A3648] bg-[#0f1117] overflow-x-auto">
          {(Object.entries(categoryLabels) as [StudioCategory, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setCategory(k)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                category === k ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-[#2A3648] bg-[#0f1117] overflow-x-auto">
          {(['all', 'starter', 'professional', 'enterprise', 'advisory'] as TierFilter[]).map(t => (
            <button key={t} onClick={() => setTier(t)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors',
                tier === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5')}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-600">
        Showing <span className="font-semibold text-slate-400">{filtered.length}</span> of {studios.length} studios
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2A3648] py-20 text-center">
          <Sparkles className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">No studios match your filters</p>
          <button onClick={() => { setSearch(''); setCategory('all'); setTier('all') }} className="text-xs text-blue-400 hover:text-blue-300 mt-1.5 transition-colors">Clear filters</button>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {filtered.map(studio => {
            const tc = tierColors[studio.tier] ?? tierColors.starter
            const Icon = studio.icon
            const isLocked = studio.status === 'locked'
            return (
              <motion.button
                key={studio.id}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                onClick={() => !isLocked && navigate(`/studio/${studio.id}`)}
                className={cn(
                  'group relative text-left p-4 rounded-xl border bg-[#0f1117] transition-all duration-200',
                  isLocked
                    ? 'border-[#2A3648] opacity-60 cursor-not-allowed'
                    : 'border-[#2A3648] hover:border-[#252d3f] hover:bg-[#111520] cursor-pointer',
                  tc.glow
                )}
              >
                {/* Tag */}
                {studio.tag && (
                  <span className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                    {studio.tag}
                  </span>
                )}

                {/* Icon */}
                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'w-9 h-9 rounded-lg border flex items-center justify-center transition-colors',
                    isLocked ? 'bg-[#222E3E] border-[#2A3648]' : `${tc.badge.includes('blue') ? 'bg-blue-500/10 border-blue-500/20' : tc.badge.includes('violet') ? 'bg-violet-500/10 border-violet-500/20' : tc.badge.includes('amber') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-500/10 border-slate-500/20'} group-hover:scale-105`
                  )}>
                    {isLocked
                      ? <Lock className="w-4 h-4 text-slate-600" />
                      : <Icon className={cn('w-4 h-4 transition-colors', tc.badge.includes('blue') ? 'text-blue-400' : tc.badge.includes('violet') ? 'text-violet-400' : tc.badge.includes('amber') ? 'text-amber-400' : 'text-slate-400')} />
                    }
                  </div>
                  {!isLocked && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  )}
                </div>

                {/* Content */}
                <p className="text-sm font-semibold text-white leading-tight mb-1 group-hover:text-blue-200 transition-colors">
                  {studio.name}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-3">
                  {studio.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', tc.badge)}>
                    {studio.tier}
                  </span>
                  {studio.creditCost > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] text-slate-600">
                      <Zap className="w-3 h-3" />
                      {studio.creditCost} credits
                    </span>
                  ) : (
                    <span className="text-[11px] text-emerald-500 font-medium">Free</span>
                  )}
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      )}

      {/* Upgrade CTA */}
      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-violet-500/5 p-6 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold text-white">Unlock all 27 studios</p>
          <p className="text-sm text-slate-400 mt-0.5">Upgrade to Professional or Enterprise for full access, unlimited credits, and white-label exports.</p>
        </div>
        <button
          onClick={() => navigate('/billing')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors flex-shrink-0"
        >
          Upgrade plan <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
