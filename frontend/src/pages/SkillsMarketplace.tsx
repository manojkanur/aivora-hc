import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Sparkles } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { SkillCard } from '../components/skills/SkillCard'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { fadeUp, staggerContainer } from '../lib/animations'
import { cn } from '../lib/utils'
import type { Skill } from '../store/workspace'

type CategoryFilter = 'all' | Skill['category']
type TierFilter = 'all' | Skill['tier']

const categoryLabels: Record<CategoryFilter, string> = {
  all: 'All Categories',
  strategy: 'Strategy',
  talent: 'Talent',
  career: 'Career',
  deliverables: 'Deliverables',
}

// Mock skills for the marketplace when API isn't available
const mockSkills: Skill[] = [
  { id: '1',  name: 'HC Strategy Charter',       description: 'Build a comprehensive HC strategy aligned to business goals',    category: 'strategy',     tier: 'starter',      credit_cost: 5,  status: 'active' },
  { id: '2',  name: 'Org Design Blueprint',       description: 'Design optimal organizational structures for scale',              category: 'strategy',     tier: 'professional', credit_cost: 8,  status: 'active' },
  { id: '3',  name: 'Career Framework',           description: 'Create transparent career paths and progression criteria',        category: 'career',       tier: 'professional', credit_cost: 6,  status: 'active' },
  { id: '4',  name: 'Leadership Pipeline',        description: 'Identify and develop high-potential leaders',                     category: 'talent',       tier: 'enterprise',   credit_cost: 10, status: 'locked' },
  { id: '5',  name: 'Workforce Planning',         description: 'Strategic workforce planning and demand forecasting',             category: 'strategy',     tier: 'professional', credit_cost: 7,  status: 'active' },
  { id: '6',  name: 'Engagement Index',           description: 'Measure and improve employee engagement',                        category: 'deliverables', tier: 'starter',      credit_cost: 4,  status: 'active' },
  { id: '7',  name: 'Succession Planning',        description: 'Build robust succession plans for critical roles',               category: 'talent',       tier: 'enterprise',   credit_cost: 12, status: 'locked' },
  { id: '8',  name: 'Compensation Architecture',  description: 'Design competitive and equitable pay structures',                category: 'deliverables', tier: 'enterprise',   credit_cost: 10, status: 'locked' },
  { id: '9',  name: 'Culture Assessment',         description: 'Diagnose organizational culture and transformation needs',       category: 'strategy',     tier: 'professional', credit_cost: 8,  status: 'active' },
  { id: '10', name: 'D&I Strategy',               description: 'Build inclusive workplaces through data-driven D&I',             category: 'talent',       tier: 'professional', credit_cost: 7,  status: 'active' },
  { id: '11', name: 'L&D Blueprint',              description: 'Design learning and development architecture',                   category: 'career',       tier: 'professional', credit_cost: 8,  status: 'active' },
  { id: '12', name: 'HR Tech Roadmap',            description: 'Strategic HR technology assessment and roadmap',                 category: 'deliverables', tier: 'advisory',     credit_cost: 15, status: 'locked' },
]

export default function SkillsMarketplace() {
  const { allSkills, fetchAllSkills, isLoading } = useWorkspaceStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')

  useEffect(() => { fetchAllSkills() }, []) // eslint-disable-line

  const skills = (allSkills.length > 0 ? allSkills : mockSkills).filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || skill.category === categoryFilter
    const matchesTier = tierFilter === 'all' || skill.tier === tierFilter
    return matchesSearch && matchesCategory && matchesTier
  })

  const tiers: TierFilter[] = ['all', 'starter', 'professional', 'enterprise', 'advisory']

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-text-primary">HC Studios</h1>
        <p className="text-text-secondary mt-1">Browse all 27 HC advisory studios. Unlock more with a plan upgrade.</p>
      </motion.div>

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

        <div className="flex gap-1 border border-border rounded-lg p-1 bg-white flex-wrap">
          {(Object.keys(categoryLabels) as CategoryFilter[]).map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                categoryFilter === c ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-tertiary'
              )}
            >
              {categoryLabels[c]}
            </button>
          ))}
        </div>

        <div className="flex gap-1 border border-border rounded-lg p-1 bg-white flex-wrap">
          {tiers.map(t => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                tierFilter === t ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-tertiary'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-text-muted">
        Showing <span className="font-medium text-text-primary">{skills.length}</span> skills
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} variant="card" />)}
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-20">
          <Sparkles className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">No studios found</h3>
          <p className="text-text-muted text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {skills.map((skill, i) => (
            <motion.div key={skill.id} variants={fadeUp} custom={i % 8}>
              <SkillCard
                skill={skill}
                onClick={() => skill.status !== 'locked' && navigate(`/workspaces`)}
                showUpgradeCTA={true}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
