import { useState } from 'react'
import { FileText, FileImage, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { Button } from '../ui/Button'
import { exportsAPI } from '../../lib/api'
import { toast } from '../ui/Toast'
import { cn } from '../../lib/utils'

interface BrandKit {
  id: string
  name: string
}

interface ExportToolbarProps {
  draftId: string
  brandKits?: BrandKit[]
  onExported?: (exportId: string) => void
}

type ExportFormat = 'pptx' | 'pdf' | 'docx'

const formatConfig: Record<ExportFormat, { label: string; icon: typeof FileText; credits: number }> = {
  pptx: { label: 'PPTX', icon: FileImage, credits: 3 },
  pdf: { label: 'PDF', icon: FileText, credits: 2 },
  docx: { label: 'DOCX', icon: FileSpreadsheet, credits: 2 },
}

export function ExportToolbar({ draftId, brandKits = [], onExported }: ExportToolbarProps) {
  const [loading, setLoading] = useState<ExportFormat | null>(null)
  const [selectedBrandKit, setSelectedBrandKit] = useState<string>('')
  const [showBrandKitMenu, setShowBrandKitMenu] = useState(false)

  const handleExport = async (format: ExportFormat) => {
    setLoading(format)
    try {
      const res = await exportsAPI.create(draftId, format, selectedBrandKit || undefined)
      // Trigger browser download from blob response
      const blob = new Blob([res.data], { type: res.headers['content-type'] })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename="(.+)"/)
      a.href = url
      a.download = match ? match[1] : `export.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} downloaded successfully`)
      if (onExported) onExported(draftId)
    } catch {
      toast.error(`Failed to export ${format.toUpperCase()}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Brand Kit Selector */}
      {brandKits.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowBrandKitMenu(!showBrandKitMenu)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white text-sm text-text-secondary hover:bg-surface-tertiary hover:border-border-dark transition-colors"
          >
            <span>{selectedBrandKit ? brandKits.find(b => b.id === selectedBrandKit)?.name : 'Brand Kit'}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showBrandKitMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-elevated z-20 min-w-[160px] py-1">
              <button
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-surface-tertiary"
                onClick={() => { setSelectedBrandKit(''); setShowBrandKitMenu(false) }}
              >
                Default
              </button>
              {brandKits.map(kit => (
                <button
                  key={kit.id}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-surface-tertiary',
                    selectedBrandKit === kit.id ? 'text-text-primary font-medium' : 'text-text-secondary'
                  )}
                  onClick={() => { setSelectedBrandKit(kit.id); setShowBrandKitMenu(false) }}
                >
                  {kit.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export Buttons */}
      {(Object.entries(formatConfig) as [ExportFormat, typeof formatConfig[ExportFormat]][]).map(([format, config]) => {
        const Icon = config.icon
        return (
          <div key={format} className="relative group">
            <Button
              variant="secondary"
              size="sm"
              isLoading={loading === format}
              leftIcon={<Icon className="w-3.5 h-3.5" />}
              onClick={() => handleExport(format)}
            >
              {config.label}
            </Button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-zinc-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              {config.credits} credits
            </div>
          </div>
        )
      })}
    </div>
  )
}
