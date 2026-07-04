import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Search, Briefcase, Sparkles, Clock, Archive, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { useClientProfileStore, defaultProfile } from '../store/clientProfile'
import type { ClientIndustry, ClientRegion, ClientOrganizationSize, ClientMaturityStage, ClientOperatingModel } from '../store/clientProfile'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { Badge } from '../components/ui/Badge'
import { toast } from '../components/ui/Toast'
import { fadeUp, staggerContainer } from '../lib/animations'
import { formatRelativeTime } from '../lib/utils'
import { cn } from '../lib/utils'
import { workspacesAPI } from '../lib/api'

// ── Option maps for org selects ────────────────────────────────────────────

const INDUSTRY_OPTIONS: { value: ClientIndustry; label: string }[] = [
  { value: 'oil-gas',               label: 'Oil & Gas'              },
  { value: 'banking-finance',       label: 'Banking & Finance'      },
  { value: 'healthcare',            label: 'Healthcare'             },
  { value: 'public-sector',         label: 'Public Sector'          },
  { value: 'retail',                label: 'Retail'                 },
  { value: 'telco',                 label: 'Telco'                  },
  { value: 'tech',                  label: 'Technology'             },
  { value: 'mining',                label: 'Mining'                 },
  { value: 'utilities',             label: 'Utilities'              },
  { value: 'transport-logistics',   label: 'Transport & Logistics'  },
  { value: 'hospitality',           label: 'Hospitality'            },
  { value: 'professional-services', label: 'Professional Services'  },
  { value: 'manufacturing',         label: 'Manufacturing'          },
  { value: 'education',             label: 'Education'              },
  { value: 'real-estate',           label: 'Real Estate'            },
  { value: 'other',                 label: 'Other'                  },
]

const REGION_OPTIONS: { value: ClientRegion; label: string }[] = [
  { value: 'gcc',          label: 'GCC'                  },
  { value: 'mena',         label: 'MENA (excl. GCC)'     },
  { value: 'africa',       label: 'Africa'               },
  { value: 'europe',       label: 'Europe'               },
  { value: 'americas',     label: 'Americas'             },
  { value: 'asia-pacific', label: 'Asia-Pacific'         },
  { value: 'global',       label: 'Global / Multi-region'},
  { value: 'other',        label: 'Other'                },
]

const SIZE_OPTIONS: { value: ClientOrganizationSize; label: string }[] = [
  { value: 'micro',      label: 'Micro (< 50)'       },
  { value: 'small',      label: 'Small (50-249)'     },
  { value: 'mid',        label: 'Mid (250-999)'      },
  { value: 'large',      label: 'Large (1,000-9,999)'},
  { value: 'enterprise', label: 'Enterprise (10,000+)'},
]

const MATURITY_OPTIONS: { value: ClientMaturityStage; label: string }[] = [
  { value: 'startup',       label: 'Startup'       },
  { value: 'growth',        label: 'Growth'        },
  { value: 'scale',         label: 'Scale'         },
  { value: 'mature',        label: 'Mature'        },
  { value: 'restructuring', label: 'Restructuring' },
]

const MODEL_OPTIONS: { value: ClientOperatingModel; label: string }[] = [
  { value: 'single-entity',       label: 'Single entity'        },
  { value: 'multi-entity',        label: 'Multi-entity'         },
  { value: 'gcc-shared-services', label: 'GCC / Shared services'},
  { value: 'holding',             label: 'Holding company'      },
  { value: 'joint-venture',       label: 'Joint venture'        },
]

function OrgSelect<T extends string>({ label, value, onChange, options, placeholder }: {
  label: string
  value: T | ''
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  placeholder: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-white block">{label}</label>
      <select
        value={value}
        onChange={e => { if (e.target.value) onChange(e.target.value as T) }}
        className={cn(
          'w-full px-3 py-2 text-sm border border-[#1e2433] rounded-lg bg-[#131720] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-[#3b82f6]',
          value ? 'text-white' : 'text-slate-500'
        )}
      >
        <option value="" className="text-slate-500 bg-[#131720]">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value} className="text-white bg-[#131720]">{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Workspaces() {
  const navigate = useNavigate()
  const { workspaces, fetchWorkspaces, createWorkspace, isLoading } = useWorkspaceStore()
  const { profile: existingProfile, isCompleted: profileCompleted, save: saveProfile, setProfile, setActiveWorkspace } = useClientProfileStore()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({
    name: '', description: '',
    industries: [] as ClientIndustry[],
    region: '' as ClientRegion | '',
    organizationSize: '' as ClientOrganizationSize | '',
    maturityStage: '' as ClientMaturityStage | '',
    operatingModel: '' as ClientOperatingModel | '',
  })
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchWorkspaces() }, []) // eslint-disable-line

  const filtered = workspaces.filter(ws => {
    if (!ws?.name) return false
    const matchesSearch = ws.name.toLowerCase().includes(search.toLowerCase()) ||
      (ws.client_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || ws.status === filter
    return matchesSearch && matchesFilter
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await workspacesAPI.archive(deleteTarget.id)
      await fetchWorkspaces()
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete workspace')
    } finally {
      setDeleting(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('Workspace name is required')
      return
    }
    setCreating(true)
    try {
      // Workspace name doubles as the organization/client name.
      const ws = await createWorkspace({
        name: formData.name,
        client_name: formData.name,
        description: formData.description,
      })

      // Scope the profile store to the brand-new workspace BEFORE writing,
      // so the seeded profile lands in this workspace's record only — never
      // bleeds into a previous engagement.
      setActiveWorkspace(ws.id)

      // Start every new workspace with a fresh client profile.
      // Only seed the org name + the bits the create form actually captured,
      // so onboarding does not appear "auto-filled" from a previous engagement.
      setProfile({
        ...defaultProfile(),
        organization: {
          ...defaultProfile().organization,
          name: formData.name,
          industry: (formData.industries[0] || 'other') as ClientIndustry,
          industries: formData.industries,
          region: (formData.region || 'gcc') as ClientRegion,
          organizationSize: (formData.organizationSize || 'mid') as ClientOrganizationSize,
          maturityStage: (formData.maturityStage || 'mature') as ClientMaturityStage,
          operatingModel: (formData.operatingModel || 'single-entity') as ClientOperatingModel,
        },
        lastUpdatedAt: new Date().toISOString(),
      })

      setShowCreateModal(false)
      setFormData({ name: '', description: '', industries: [], region: '', organizationSize: '', maturityStage: '', operatingModel: '' })
      toast.success('Workspace created. Let us walk through onboarding.')
      // Force onboarding before the user can do anything else.
      navigate(`/onboarding?workspaceId=${ws.id}`)
    } catch {
      toast.error('Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Workspaces</h1>
          <p className="text-slate-400 mt-1 text-sm">Manage your client engagements</p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
          New Workspace
        </Button>
      </motion.div>

      {/* Search + Filter */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search workspaces..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-1 border border-[#1e2433] rounded-lg p-1 bg-[#131720]">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-[#1a1e2e]')}>
              {f}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} variant="card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-1">
            {search ? 'No matching workspaces' : 'No workspaces yet'}
          </h3>
          <p className="text-slate-600 text-sm mb-5">
            {search ? 'Try a different search term' : 'Create your first client workspace to get started'}
          </p>
          {!search && (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
              New Workspace
            </Button>
          )}
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ws, i) => (
            <motion.div key={ws.id} variants={fadeUp} custom={i} className="relative h-full">
              <Link to={`/workspaces/${ws.id}`} className="block h-full">
                <div className="h-full flex flex-col bg-[#131720] rounded-xl border border-[#1e2433] hover:shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_0_1px_rgba(59,130,246,0.15)] hover:border-[#252d3f] transition-all p-5 cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#1a1e2e] flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-slate-300" />
                    </div>
                    {ws.status === 'archived' && (
                      <Badge variant="muted"><Archive className="w-3 h-3 mr-1 inline" />Archived</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">{ws.name}</h3>
                  {ws.client_name && ws.client_name !== ws.name && (
                    <p className="text-sm text-slate-600 mt-0.5">{ws.client_name}</p>
                  )}
                  <div className="flex items-center gap-4 mt-auto pt-4 border-t border-[#1e2433]">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                      <span className="text-xs text-slate-300">{ws.skill_count} studios</span>
                    </div>
                    {ws.last_activity && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-xs text-slate-600">{formatRelativeTime(ws.last_activity)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={e => { e.preventDefault(); setDeleteTarget({ id: ws.id, name: ws.name }) }}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-600 hover:bg-red-950/30 hover:text-red-400 transition-colors"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Workspace" size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300">
            Are you sure you want to delete <strong className="text-white">"{deleteTarget?.name}"</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
              isLoading={deleting} onClick={handleDelete} leftIcon={<Trash2 className="w-4 h-4" />}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Workspace" size="md">
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <Input
            label="Workspace Name"
            placeholder="Acme Corp"
            value={formData.name}
            onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white block">Industries</label>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRY_OPTIONS.map(opt => {
                const selected = formData.industries.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(d => ({
                      ...d,
                      industries: selected ? d.industries.filter(v => v !== opt.value) : [...d.industries, opt.value],
                    }))}
                    className={selected
                      ? 'px-3 py-1.5 rounded-lg text-xs font-medium border bg-blue-600/20 border-blue-500/50 text-blue-300 transition-all'
                      : 'px-3 py-1.5 rounded-lg text-xs font-medium border bg-[#131720] border-[#1e2433] text-slate-400 hover:border-[#2a3048] hover:text-slate-300 transition-all'}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OrgSelect
              label="Region"
              value={formData.region}
              onChange={v => setFormData(d => ({ ...d, region: v }))}
              options={REGION_OPTIONS}
              placeholder="Select region..."
            />
            <OrgSelect
              label="Organization Size"
              value={formData.organizationSize}
              onChange={v => setFormData(d => ({ ...d, organizationSize: v }))}
              options={SIZE_OPTIONS}
              placeholder="Select size..."
            />
            <OrgSelect
              label="Maturity Stage"
              value={formData.maturityStage}
              onChange={v => setFormData(d => ({ ...d, maturityStage: v }))}
              options={MATURITY_OPTIONS}
              placeholder="Select stage..."
            />
          </div>

          <OrgSelect
            label="Operating Model"
            value={formData.operatingModel}
            onChange={v => setFormData(d => ({ ...d, operatingModel: v }))}
            options={MODEL_OPTIONS}
            placeholder="Select operating model..."
          />

          <div>
            <label className="text-xs font-medium text-white block mb-1.5">Description (optional)</label>
            <textarea
              placeholder="Brief description of this engagement..."
              value={formData.description}
              onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-[#1e2433] rounded-lg bg-[#131720] text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 resize-none"
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={creating}>
              Create Workspace
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
