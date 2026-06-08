import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  Building2,
  Zap,
  Download,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { adminAPI } from '../lib/api'
import { AnimatedSection, fadeUp, staggerContainer } from '../lib/animations'
import { cn } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  total_tenants: number
  active_users_today: number
  ai_jobs_today: number
  total_exports: number
}

interface Skill {
  id: string
  name: string
  category: string
  tier: 'starter' | 'professional' | 'enterprise' | 'advisory'
  credit_cost: number
  enabled: boolean
}

interface AdminUser {
  id: string
  name: string
  email: string
  tenant: string
  plan: string
  level: number
  xp: number
  role: string
  created_at: string
}

interface AuditEntry {
  id: string
  timestamp: string
  user: string
  action: string
  resource: string
  ip: string
}

type AdminTab = 'skills' | 'users' | 'audit'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  index: number
  loading: boolean
}

function StatCard({ label, value, icon: Icon, index, loading }: StatCardProps) {
  return (
    <motion.div variants={fadeUp} custom={index}>
      <div
        className="rounded-xl p-5 flex flex-col gap-3"
        style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: '#f4f4f5' }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: '#52525b' }} />
        </div>
        {loading ? (
          <>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-28" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold" style={{ color: '#0a0a0a' }}>
              {value}
            </div>
            <div className="text-sm" style={{ color: '#71717a' }}>
              {label}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean
  onToggle: () => void
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className="relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ backgroundColor: enabled ? '#18181b' : '#e5e5e5' }}
    >
      <span
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(4px)' }}
      />
    </button>
  )
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    adminAPI
      .skills()
      .then((res) => setSkills(res.data?.skills ?? res.data ?? []))
      .catch(() => setError('Failed to load skills'))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (skill: Skill) => {
    if (togglingId) return
    setTogglingId(skill.id)
    try {
      await adminAPI.updateSkill(skill.id, { enabled: !skill.enabled })
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s))
      )
    } catch {
      // no-op
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3"
            style={{ borderBottom: i < 5 ? '1px solid #f4f4f5' : undefined }}
          >
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        <p style={{ color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
        <p className="font-medium" style={{ color: '#0a0a0a' }}>
          No skills found
        </p>
        <p className="text-sm mt-1" style={{ color: '#71717a' }}>
          The skill registry is empty.
        </p>
      </div>
    )
  }

  return (
    <AnimatedSection variants={fadeUp}>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
              <th className="text-left text-xs font-semibold px-4 py-3" style={{ color: '#71717a' }}>
                Name
              </th>
              <th
                className="text-left text-xs font-semibold px-4 py-3 hidden md:table-cell"
                style={{ color: '#71717a' }}
              >
                Category
              </th>
              <th className="text-left text-xs font-semibold px-4 py-3" style={{ color: '#71717a' }}>
                Tier
              </th>
              <th
                className="text-left text-xs font-semibold px-4 py-3 hidden sm:table-cell"
                style={{ color: '#71717a' }}
              >
                Credit Cost
              </th>
              <th className="text-right text-xs font-semibold px-4 py-3" style={{ color: '#71717a' }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill, i) => (
              <tr
                key={skill.id}
                className="transition-colors"
                style={{ borderBottom: i < skills.length - 1 ? '1px solid #f4f4f5' : undefined }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = '#fafafa')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')
                }
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-medium" style={{ color: '#0a0a0a' }}>
                    {skill.name}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-sm capitalize" style={{ color: '#52525b' }}>
                    {skill.category}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge tier={skill.tier}>{skill.tier}</Badge>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-sm" style={{ color: '#52525b' }}>
                    {skill.credit_cost ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Toggle
                    enabled={skill.enabled}
                    onToggle={() => handleToggle(skill)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnimatedSection>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchUsers = useCallback((p: number, q: string) => {
    setLoading(true)
    adminAPI
      .users({ page: p, search: q || undefined })
      .then((res) => setUsers(res.data?.users ?? res.data ?? []))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchUsers(1, '')
  }, [fetchUsers])

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
    fetchUsers(1, value)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchUsers(newPage, search)
  }

  if (error) {
    return (
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        <p style={{ color: '#ef4444' }}>{error}</p>
      </div>
    )
  }

  return (
    <AnimatedSection variants={fadeUp} className="space-y-4">
      <div className="max-w-sm">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          leftElement={<Search className="w-4 h-4" />}
        />
      </div>

      {loading ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3"
              style={{ borderBottom: i < 7 ? '1px solid #f4f4f5' : undefined }}
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
          <p className="font-medium" style={{ color: '#0a0a0a' }}>
            No users found
          </p>
          {search && (
            <p className="text-sm mt-1" style={{ color: '#71717a' }}>
              No results for &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                    {['Name', 'Email', 'Tenant', 'Plan', 'Level', 'XP', 'Role', 'Joined'].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-semibold px-4 py-3"
                          style={{ color: '#71717a' }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.id}
                      className="transition-colors"
                      style={{
                        borderBottom: i < users.length - 1 ? '1px solid #f4f4f5' : undefined,
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.backgroundColor = '#fafafa')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')
                      }
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium" style={{ color: '#0a0a0a' }}>
                          {user.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: '#52525b' }}>
                          {user.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: '#52525b' }}>
                          {user.tenant}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                          style={{
                            backgroundColor: '#f4f4f5',
                            color: '#52525b',
                            border: '1px solid #e5e5e5',
                          }}
                        >
                          {user.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold" style={{ color: '#0a0a0a' }}>
                          {user.level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: '#52525b' }}>
                          {user.xp?.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-medium capitalize"
                          style={{ color: user.role === 'admin' ? '#18181b' : '#71717a' }}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: '#71717a' }}>
                          {formatDate(user.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {users.length === PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#71717a' }}>
                Page {page}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                  leftIcon={<ChevronLeft className="w-4 h-4" />}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatedSection>
  )
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  'login',
  'logout',
  'skill_run',
  'export_created',
  'draft_approved',
  'user_invited',
  'settings_updated',
  'plan_changed',
]

function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const fetchAudit = useCallback(
    (params: { date_from?: string; date_to?: string; action?: string }) => {
      setLoading(true)
      adminAPI
        .auditLog({
          date_from: params.date_from || undefined,
          date_to: params.date_to || undefined,
          action: params.action || undefined,
        })
        .then((res) => setEntries(res.data?.entries ?? res.data ?? []))
        .catch(() => setError('Failed to load audit log'))
        .finally(() => setLoading(false))
    },
    []
  )

  useEffect(() => {
    fetchAudit({})
  }, [fetchAudit])

  const applyFilters = () => fetchAudit({ date_from: dateFrom, date_to: dateTo, action: actionFilter })

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setActionFilter('')
    fetchAudit({})
  }

  return (
    <AnimatedSection variants={fadeUp} className="space-y-4">
      {/* Filter bar */}
      <div
        className="flex flex-wrap items-end gap-3 p-4 rounded-xl"
        style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
      >
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            style={{ borderColor: '#e5e5e5', color: '#0a0a0a', backgroundColor: '#ffffff' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            style={{ borderColor: '#e5e5e5', color: '#0a0a0a', backgroundColor: '#ffffff' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#52525b' }}>
            Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            style={{
              borderColor: '#e5e5e5',
              color: '#0a0a0a',
              backgroundColor: '#ffffff',
              minWidth: '160px',
            }}
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={applyFilters}
            leftIcon={<Filter className="w-3.5 h-3.5" />}
          >
            Apply
          </Button>
          {(dateFrom || dateTo || actionFilter) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3"
              style={{ borderBottom: i < 7 ? '1px solid #f4f4f5' : undefined }}
            >
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4d4d8' }} />
          <p className="font-medium" style={{ color: '#0a0a0a' }}>
            No audit entries found
          </p>
          <p className="text-sm mt-1" style={{ color: '#71717a' }}>
            Try adjusting the date range or action filter.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #e5e5e5', backgroundColor: '#ffffff' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                  {['Timestamp', 'User', 'Action', 'Resource', 'IP'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold px-4 py-3"
                      style={{ color: '#71717a' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className="transition-colors"
                    style={{
                      borderBottom: i < entries.length - 1 ? '1px solid #f4f4f5' : undefined,
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.backgroundColor = '#fafafa')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')
                    }
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-mono" style={{ color: '#71717a' }}>
                        {formatDate(entry.timestamp)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: '#0a0a0a' }}>
                        {entry.user}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: '#f4f4f5',
                          color: '#18181b',
                          border: '1px solid #e5e5e5',
                        }}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: '#52525b' }}>
                        {entry.resource}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono" style={{ color: '#71717a' }}>
                        {entry.ip}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AnimatedSection>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'users', label: 'Users' },
  { id: 'audit', label: 'Audit Log' },
]

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>('skills')

  useEffect(() => {
    adminAPI
      .stats()
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [])

  const statCards = [
    { label: 'Total Tenants', value: stats?.total_tenants ?? '—', icon: Building2 },
    { label: 'Active Users Today', value: stats?.active_users_today ?? '—', icon: Users },
    { label: 'AI Jobs Today', value: stats?.ai_jobs_today ?? '—', icon: Zap },
    { label: 'Total Exports', value: stats?.total_exports ?? '—', icon: Download },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <AnimatedSection variants={fadeUp}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#18181b' }}
          >
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0a0a0a' }}>
              Admin Dashboard
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#71717a' }}>
              Platform administration and monitoring
            </p>
          </div>
        </div>
      </AnimatedSection>

      {/* Stats Row */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statCards.map((card, i) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            index={i}
            loading={statsLoading}
          />
        ))}
      </motion.div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1" style={{ borderBottom: '1px solid #e5e5e5' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id ? 'border-zinc-900' : 'border-transparent hover:border-zinc-300'
              )}
              style={{ color: activeTab === tab.id ? '#0a0a0a' : '#71717a' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'skills' && <SkillsTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'audit' && <AuditLogTab />}
        </div>
      </div>
    </div>
  )
}
