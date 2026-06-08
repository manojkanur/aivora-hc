import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileText, FileImage, FileSpreadsheet, Search, Share2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { exportsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp } from '../lib/animations'
import { formatDate } from '../lib/utils'
import { cn } from '../lib/utils'

interface ExportRecord {
  id: string
  workspace_id: string
  workspace_name: string
  draft_id: string
  skill_name: string
  format: 'pptx' | 'pdf' | 'docx'
  brand_kit_id?: string
  brand_kit_name?: string
  status: string
  created_at: string
}

const formatIcons: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  pptx: { icon: FileImage, label: 'PPTX', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  pdf: { icon: FileText, label: 'PDF', color: 'text-red-600 bg-red-50 border-red-200' },
  docx: { icon: FileSpreadsheet, label: 'DOCX', color: 'text-blue-600 bg-blue-50 border-blue-200' },
}

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [formatFilter, setFormatFilter] = useState<string>('all')

  useEffect(() => {
    exportsAPI.list().then(res => {
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.exports ?? [])
      setExports(raw as ExportRecord[])
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [])

  const filtered = exports.filter(exp => {
    const matchesSearch = exp.skill_name.toLowerCase().includes(search.toLowerCase()) ||
      exp.workspace_name.toLowerCase().includes(search.toLowerCase())
    const matchesFormat = formatFilter === 'all' || exp.format === formatFilter
    return matchesSearch && matchesFormat
  })

  const handleDownload = async (exp: ExportRecord) => {
    try {
      const res = await exportsAPI.create(exp.draft_id, exp.format)
      const blob = new Blob([res.data], { type: res.headers['content-type'] })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename="(.+)"/)
      a.href = url
      a.download = match ? match[1] : `export.${exp.format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${exp.format.toUpperCase()} downloaded`)
    } catch { toast.error('Download failed') }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-text-primary">Exports</h1>
        <p className="text-text-secondary mt-1">Download and publish your generated deliverables</p>
      </motion.div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search exports..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftElement={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-1 bg-white">
          {['all', 'pptx', 'pdf', 'docx'].map(f => (
            <button
              key={f}
              onClick={() => setFormatFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium uppercase transition-colors',
                formatFilter === f ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-tertiary'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-border">
          <Download className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary">
            {search || formatFilter !== 'all' ? 'No matching exports' : 'No exports yet'}
          </h3>
          <p className="text-text-muted text-sm mt-1">
            Approve a draft and export it to see it here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Skill</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 hidden md:table-cell">Workspace</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3">Format</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 hidden sm:table-cell">Brand Kit</th>
                <th className="text-left text-xs font-semibold text-text-muted px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-right text-xs font-semibold text-text-muted px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => {
                const fConfig = formatIcons[exp.format]
                const FIcon = fConfig?.icon || FileText
                return (
                  <tr key={exp.id} className="border-b border-border last:border-0 hover:bg-surface-secondary transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-text-primary">{exp.skill_name}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-text-secondary">{exp.workspace_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', fConfig?.color || 'bg-surface-tertiary text-text-secondary border-border')}>
                        <FIcon className="w-3 h-3" />
                        {fConfig?.label || exp.format.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-text-muted">{exp.brand_kit_name || 'Default'}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-text-muted">{formatDate(exp.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Download className="w-3.5 h-3.5" />}
                          onClick={() => handleDownload(exp)}
                        >
                          Download
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Share2 className="w-3.5 h-3.5" />}
                        >
                          Publish
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
