import { useState } from 'react'
import { FileText, FileImage, FileSpreadsheet, ChevronDown, Code2 } from 'lucide-react'
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

type ExportFormat = 'pptx' | 'pdf' | 'docx' | 'html'

const formatConfig: Record<ExportFormat, { label: string; icon: typeof FileText; credits: number }> = {
  pptx: { label: 'PPTX', icon: FileImage, credits: 3 },
  pdf:  { label: 'PDF',  icon: FileText, credits: 2 },
  docx: { label: 'DOCX', icon: FileSpreadsheet, credits: 2 },
  html: { label: 'HTML', icon: Code2, credits: 1 },
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
      const blob = new Blob([res.data], { type: String(res.headers['content-type'] || 'application/octet-stream') })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = String(res.headers['content-disposition'] || '')
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2A3648] bg-[#1B2431] text-sm text-slate-300 hover:bg-[#222E3E] hover:border-[#252d3f] transition-colors"
          >
            <span>{selectedBrandKit ? brandKits.find(b => b.id === selectedBrandKit)?.name : 'Brand Kit'}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showBrandKitMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[#1B2431] border border-[#2A3648] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-20 min-w-[160px] py-1">
              <button
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-[#222E3E]"
                onClick={() => { setSelectedBrandKit(''); setShowBrandKitMenu(false) }}
              >
                Default
              </button>
              {brandKits.map(kit => (
                <button
                  key={kit.id}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-[#222E3E]',
                    selectedBrandKit === kit.id ? 'text-white font-medium' : 'text-slate-300'
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
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#1B2431] text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              {config.credits} credits
            </div>
          </div>
        )
      })}
    </div>
  )
}
