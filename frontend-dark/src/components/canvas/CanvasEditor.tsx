import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Download,
  FileText, FileImage, FileSpreadsheet, Code2, GripVertical,
  Type, AlignLeft, List, Loader2, Eye, Edit3,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { toast } from '../ui/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlideElement {
  id: string
  type: 'title' | 'heading' | 'body' | 'bullet' | 'label'
  content: string
  placeholder?: string
}

export interface Slide {
  id: string
  elements: SlideElement[]
  accent?: string
}

// ─── Draft → Slides converter ─────────────────────────────────────────────────

const SKIP = new Set(['id', 'workspace_id', 'skill_id', 'created_at', 'tool_input', 'knowledge_base'])

function uid() { return Math.random().toString(36).slice(2, 9) }

export function draftToSlides(content: Record<string, unknown>): Slide[] {
  const source = (content.tool_input as Record<string, unknown>) ?? content
  const entries = Object.entries(source).filter(([k]) => !SKIP.has(k))
  if (entries.length === 0) return []

  const slides: Slide[] = []

  // Title slide
  const titleKey = entries.find(([k]) => /name|title|org|organisation/i.test(k))
  slides.push({
    id: uid(),
    accent: '#3b82f6',
    elements: [
      { id: uid(), type: 'label', content: 'HC Advisory', placeholder: 'Label' },
      { id: uid(), type: 'title', content: titleKey ? String(titleKey[1]) : 'Deliverable', placeholder: 'Title' },
      { id: uid(), type: 'body', content: `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, placeholder: 'Subtitle' },
    ],
  })

  for (const [key, value] of entries) {
    if (key === titleKey?.[0]) continue
    const heading = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const elements: SlideElement[] = [
      { id: uid(), type: 'heading', content: heading, placeholder: 'Section heading' },
    ]

    const flattenValue = (v: unknown, depth = 0): string[] => {
      if (v === null || v === undefined) return []
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return [String(v)]
      if (Array.isArray(v)) {
        return v.flatMap(item => {
          if (typeof item === 'string') return [item]
          if (typeof item === 'object' && item !== null) {
            return Object.entries(item as Record<string, unknown>).flatMap(([k, val]) =>
              typeof val === 'string' ? [`${k.replace(/_/g, ' ')}: ${val}`] : flattenValue(val, depth + 1)
            )
          }
          return [String(item)]
        })
      }
      if (typeof v === 'object') {
        return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => {
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const children = flattenValue(val, depth + 1)
          return children.length === 1 ? [`${label}: ${children[0]}`] : [label, ...children.map(c => `  ${c}`)]
        })
      }
      return []
    }

    const lines = flattenValue(value)

    if (lines.length <= 4) {
      lines.forEach(line => elements.push({ id: uid(), type: 'bullet', content: line, placeholder: 'Point' }))
    } else {
      // Split into body paragraphs for long content
      const chunk = lines.join('\n')
      elements.push({ id: uid(), type: 'body', content: chunk, placeholder: 'Content' })
    }

    // Split into multiple slides if > 8 elements
    const chunks: SlideElement[][] = []
    const batchSize = 7
    for (let i = 0; i < elements.length; i += batchSize) {
      chunks.push(i === 0 ? elements.slice(0, batchSize) : [
        { id: uid(), type: 'heading', content: `${heading} (cont.)`, placeholder: 'Heading' },
        ...elements.slice(i, i + batchSize - 1),
      ])
    }
    chunks.forEach(chunk => slides.push({ id: uid(), elements: chunk }))
  }

  return slides
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function exportPptx(slides: Slide[], title: string) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'

  slides.forEach((slide, idx) => {
    const s = pptx.addSlide()
    const isTitle = idx === 0
    s.background = { color: '0C0E14' }

    if (isTitle) {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '0C0E14' } })
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: '100%', fill: { color: '3b82f6' } })
    }

    let y = isTitle ? 1.2 : 0.5
    slide.elements.forEach(el => {
      const isHeading = el.type === 'heading'
      const isTitle_ = el.type === 'title'
      const isLabel = el.type === 'label'
      const isBullet = el.type === 'bullet'

      s.addText(el.content, {
        x: 0.4, y, w: 9.2,
        fontSize: isTitle_ ? 36 : isHeading ? 20 : isLabel ? 11 : 13,
        bold: isTitle_ || isHeading,
        color: isLabel ? '3b82f6' : isHeading ? 'ffffff' : 'cbd5e1',
        bullet: isBullet ? { type: 'bullet' } : false,
        h: isTitle_ ? 0.8 : isHeading ? 0.5 : isBullet ? 0.35 : undefined,
        autoFit: true,
      })
      y += isTitle_ ? 0.9 : isHeading ? 0.65 : isBullet ? 0.38 : 0.5
    })
  })

  await pptx.writeFile({ fileName: `${title}.pptx` })
}

async function exportPdf(containerRef: React.RefObject<HTMLDivElement>, title: string) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const el = containerRef.current
  if (!el) return

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] })
  const slides = el.querySelectorAll<HTMLElement>('[data-slide]')

  for (let i = 0; i < slides.length; i++) {
    const canvas = await html2canvas(slides[i], { backgroundColor: '#0c0e14', scale: 1.5, useCORS: true })
    const img = canvas.toDataURL('image/jpeg', 0.92)
    if (i > 0) pdf.addPage([1280, 720], 'landscape')
    pdf.addImage(img, 'JPEG', 0, 0, 1280, 720)
  }

  pdf.save(`${title}.pdf`)
}

async function exportDocx(slides: Slide[], title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')

  const children: InstanceType<typeof Paragraph>[] = []
  slides.forEach(slide => {
    slide.elements.forEach(el => {
      if (el.type === 'title') {
        children.push(new Paragraph({ text: el.content, heading: HeadingLevel.HEADING_1 }))
      } else if (el.type === 'heading') {
        children.push(new Paragraph({ text: el.content, heading: HeadingLevel.HEADING_2 }))
      } else if (el.type === 'bullet') {
        children.push(new Paragraph({ text: el.content, bullet: { level: 0 } }))
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: el.content, size: 24 })] }))
      }
    })
    children.push(new Paragraph({ text: '' }))
  })

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${title}.docx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportHtml(slides: Slide[], title: string) {
  const slideHtml = slides.map((slide, idx) => {
    const isTitle = idx === 0
    const elementsHtml = slide.elements.map(el => {
      if (el.type === 'title') return `<h1 class="slide-title">${el.content}</h1>`
      if (el.type === 'heading') return `<h2 class="slide-heading">${el.content}</h2>`
      if (el.type === 'label') return `<p class="slide-label">${el.content}</p>`
      if (el.type === 'bullet') return `<li class="slide-bullet">${el.content}</li>`
      return `<p class="slide-body">${el.content.replace(/\n/g, '<br/>')}</p>`
    }).join('\n        ')

    return `
  <section class="slide${isTitle ? ' slide-cover' : ''}">
    <div class="slide-inner">
      ${elementsHtml}
    </div>
  </section>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0c0e14;font-family:'Inter',system-ui,sans-serif;color:#e2e8f0}
  .deck{width:100%;min-height:100vh}
  .slide{width:1280px;height:720px;max-width:100vw;background:#0c0e14;border:1px solid #1e2433;margin:24px auto;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6)}
  .slide-cover{background:linear-gradient(135deg,#0f1623 0%,#0c0e14 100%)}
  .slide-cover::before{content:'';position:absolute;left:0;top:0;width:6px;height:100%;background:#3b82f6;border-radius:3px 0 0 3px}
  .slide-inner{padding:60px 80px;width:100%}
  .slide-label{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3b82f6;margin-bottom:16px}
  .slide-title{font-size:42px;font-weight:800;line-height:1.15;color:#fff;margin-bottom:12px}
  .slide-heading{font-size:26px;font-weight:700;color:#fff;margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid #1e2433}
  .slide-body{font-size:15px;line-height:1.7;color:#94a3b8;white-space:pre-wrap}
  .slide-bullet{font-size:14px;line-height:1.7;color:#94a3b8;margin-left:20px;margin-bottom:6px}
  ul{list-style:disc;padding-left:0}
  @media(max-width:768px){.slide{width:100%;height:auto;min-height:auto}.slide-inner{padding:32px 24px}.slide-title{font-size:28px}.slide-heading{font-size:20px}}
  @media print{.slide{margin:0;border-radius:0;break-after:page;height:100vh;width:100vw}}
</style>
</head>
<body>
<div class="deck">
${slideHtml}
</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${title}.html`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Editable element ─────────────────────────────────────────────────────────

function EditableEl({
  el, onUpdate,
}: {
  el: SlideElement
  onUpdate: (id: string, content: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
  }, [editing])

  const baseClass = cn(
    'outline-none rounded px-1 -mx-1 cursor-text transition-colors',
    editing ? 'bg-white/5 ring-1 ring-[#3b82f6]/50' : 'hover:bg-white/5',
  )

  const typeCls = {
    title: 'text-4xl font-extrabold text-white leading-tight',
    heading: 'text-2xl font-bold text-white',
    label: 'text-[11px] font-bold uppercase tracking-widest text-[#3b82f6]',
    body: 'text-sm text-slate-400 leading-relaxed whitespace-pre-wrap',
    bullet: 'text-sm text-slate-300',
  }[el.type]

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn(baseClass, typeCls)}
      onFocus={() => setEditing(true)}
      onBlur={e => { setEditing(false); onUpdate(el.id, e.currentTarget.textContent ?? '') }}
      dangerouslySetInnerHTML={{ __html: el.content }}
    />
  )
}

// ─── Slide canvas ─────────────────────────────────────────────────────────────

function SlideCanvas({
  slide, slideIndex, isTitle, onUpdateEl, onAddEl, onDeleteEl,
}: {
  slide: Slide
  slideIndex: number
  isTitle: boolean
  onUpdateEl: (slideId: string, elId: string, content: string) => void
  onAddEl: (slideId: string, type: SlideElement['type']) => void
  onDeleteEl: (slideId: string, elId: string) => void
}) {
  const [hoveredEl, setHoveredEl] = useState<string | null>(null)

  return (
    <div
      data-slide
      className={cn(
        'relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-[#1e2433] shadow-[0_4px_40px_rgba(0,0,0,0.6)]',
        isTitle ? 'bg-gradient-to-br from-[#0f1623] to-[#0c0e14]' : 'bg-[#0c0e14]',
      )}
    >
      {isTitle && <div className="absolute left-0 top-0 w-1.5 h-full bg-[#3b82f6]" />}

      <div className="absolute inset-0 flex flex-col justify-center px-[8%] py-[7%] gap-3">
        {slide.elements.map(el => (
          <div
            key={el.id}
            className="relative group"
            onMouseEnter={() => setHoveredEl(el.id)}
            onMouseLeave={() => setHoveredEl(null)}
          >
            {el.type === 'bullet' ? (
              <div className="flex items-start gap-2">
                <span className="mt-[0.35em] w-1.5 h-1.5 rounded-full bg-[#3b82f6] flex-shrink-0" />
                <EditableEl el={el} onUpdate={(id, c) => onUpdateEl(slide.id, id, c)} />
              </div>
            ) : (
              <EditableEl el={el} onUpdate={(id, c) => onUpdateEl(slide.id, id, c)} />
            )}
            {hoveredEl === el.id && (
              <button
                onMouseDown={e => { e.preventDefault(); onDeleteEl(slide.id, el.id) }}
                className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Slide number */}
      <div className="absolute bottom-3 right-4 text-[10px] text-slate-700 font-medium">{slideIndex + 1}</div>

      {/* Add element toolbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity bg-[#131720] border border-[#1e2433] rounded-lg px-2 py-1">
        {([
          ['bullet', <List className="w-3 h-3" />, 'Bullet'],
          ['body', <AlignLeft className="w-3 h-3" />, 'Text'],
          ['heading', <Type className="w-3 h-3" />, 'Heading'],
        ] as [SlideElement['type'], React.ReactNode, string][]).map(([type, icon, label]) => (
          <button
            key={type}
            onClick={() => onAddEl(slide.id, type)}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-400 hover:text-white rounded transition-colors"
            title={`Add ${label}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main CanvasEditor ────────────────────────────────────────────────────────

interface CanvasEditorProps {
  content: Record<string, unknown>
  title?: string
}

type ExportFormat = 'pptx' | 'pdf' | 'docx' | 'html'

export default function CanvasEditor({ content, title = 'Deliverable' }: CanvasEditorProps) {
  const [slides, setSlides] = useState<Slide[]>(() => draftToSlides(content))
  const [current, setCurrent] = useState(0)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateEl = useCallback((slideId: string, elId: string, content_: string) => {
    setSlides(prev => prev.map(s =>
      s.id === slideId ? { ...s, elements: s.elements.map(e => e.id === elId ? { ...e, content: content_ } : e) } : s
    ))
  }, [])

  const addEl = useCallback((slideId: string, type: SlideElement['type']) => {
    setSlides(prev => prev.map(s =>
      s.id === slideId ? { ...s, elements: [...s.elements, { id: uid(), type, content: '', placeholder: type }] } : s
    ))
  }, [])

  const deleteEl = useCallback((slideId: string, elId: string) => {
    setSlides(prev => prev.map(s =>
      s.id === slideId ? { ...s, elements: s.elements.filter(e => e.id !== elId) } : s
    ))
  }, [])

  const addSlide = () => {
    const newSlide: Slide = {
      id: uid(),
      elements: [
        { id: uid(), type: 'heading', content: 'New Slide', placeholder: 'Heading' },
        { id: uid(), type: 'body', content: 'Click to edit content', placeholder: 'Content' },
      ],
    }
    const next = [...slides]
    next.splice(current + 1, 0, newSlide)
    setSlides(next)
    setCurrent(current + 1)
  }

  const deleteSlide = (idx: number) => {
    if (slides.length <= 1) return
    const next = slides.filter((_, i) => i !== idx)
    setSlides(next)
    setCurrent(Math.min(current, next.length - 1))
  }

  const handleExport = async (format: ExportFormat) => {
    setExporting(format)
    try {
      if (format === 'pptx') await exportPptx(slides, title)
      else if (format === 'pdf') await exportPdf(containerRef as React.RefObject<HTMLDivElement>, title)
      else if (format === 'docx') await exportDocx(slides, title)
      else exportHtml(slides, title)
      toast.success(`${format.toUpperCase()} exported`)
    } catch (e) {
      console.error(e)
      toast.error(`Export failed`)
    } finally {
      setExporting(null)
    }
  }

  const exportButtons: { format: ExportFormat; icon: React.ReactNode; label: string }[] = [
    { format: 'pptx', icon: <FileImage className="w-3.5 h-3.5" />, label: 'PPTX' },
    { format: 'pdf', icon: <FileText className="w-3.5 h-3.5" />, label: 'PDF' },
    { format: 'docx', icon: <FileSpreadsheet className="w-3.5 h-3.5" />, label: 'DOCX' },
    { format: 'html', icon: <Code2 className="w-3.5 h-3.5" />, label: 'HTML' },
  ]

  if (slides.length === 0) return null

  return (
    <div className="flex flex-col h-full bg-[#0c0e14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433] bg-[#131720] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400">
            Slide <span className="text-white">{current + 1}</span> / {slides.length}
          </span>
          <button
            onClick={addSlide}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white border border-[#1e2433] hover:border-[#3b82f6] rounded-lg px-2.5 py-1 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add slide
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(p => !p)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
              previewMode
                ? 'border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10'
                : 'border-[#1e2433] text-slate-500 hover:text-white',
            )}
          >
            {previewMode ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {previewMode ? 'Edit' : 'Preview'}
          </button>

          <div className="flex items-center gap-1 border border-[#1e2433] rounded-lg p-0.5 bg-[#0c0e14]">
            {exportButtons.map(({ format, icon, label }) => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                disabled={exporting !== null}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-[#1a1e2e] rounded transition-colors disabled:opacity-50"
              >
                {exporting === format ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Thumbnail strip */}
        <div className="w-32 flex-shrink-0 border-r border-[#1e2433] bg-[#0e1018] overflow-y-auto py-2 px-2 space-y-2">
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              onClick={() => setCurrent(idx)}
              className={cn(
                'relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all group',
                idx === current ? 'border-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'border-transparent hover:border-[#1e2433]',
              )}
            >
              <div className="aspect-[16/9] bg-[#0c0e14] p-1.5">
                <div className={cn('w-2 h-full absolute left-0 top-0', idx === 0 ? 'bg-[#3b82f6]/30' : '')} />
                {slide.elements.slice(0, 3).map((el, i) => (
                  <div
                    key={el.id}
                    className={cn(
                      'truncate mb-0.5',
                      el.type === 'title' ? 'text-[5px] font-bold text-white' :
                      el.type === 'heading' ? 'text-[4.5px] font-semibold text-white' :
                      el.type === 'label' ? 'text-[4px] text-[#3b82f6]' :
                      'text-[4px] text-slate-500',
                    )}
                  >
                    {el.content || el.placeholder}
                  </div>
                ))}
              </div>
              <div className="absolute bottom-0.5 right-1 text-[7px] text-slate-600">{idx + 1}</div>
              {slides.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); deleteSlide(idx) }}
                  className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded flex items-center justify-center bg-red-500/20 hover:bg-red-500/60 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-2 h-2" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSlide}
            className="w-full aspect-[16/9] rounded-lg border border-dashed border-[#1e2433] hover:border-[#3b82f6] flex items-center justify-center text-slate-600 hover:text-[#3b82f6] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Main canvas area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 flex items-start justify-center" ref={containerRef}>
            <div className="w-full max-w-4xl">
              {previewMode ? (
                // Preview: show all slides stacked
                <div className="space-y-4">
                  {slides.map((slide, idx) => (
                    <div
                      key={slide.id}
                      data-slide
                      onClick={() => setCurrent(idx)}
                      className={cn(
                        'relative w-full aspect-[16/9] rounded-xl overflow-hidden border cursor-pointer transition-all',
                        idx === current ? 'border-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.25)]' : 'border-[#1e2433] hover:border-[#252d3f]',
                        idx === 0 ? 'bg-gradient-to-br from-[#0f1623] to-[#0c0e14]' : 'bg-[#0c0e14]',
                      )}
                    >
                      {idx === 0 && <div className="absolute left-0 top-0 w-1.5 h-full bg-[#3b82f6]" />}
                      <div className="absolute inset-0 flex flex-col justify-center px-[8%] py-[7%] gap-3">
                        {slide.elements.map(el => (
                          <div key={el.id} className={cn(
                            el.type === 'bullet' ? 'flex items-start gap-2' : '',
                          )}>
                            {el.type === 'bullet' && <span className="mt-[0.35em] w-1.5 h-1.5 rounded-full bg-[#3b82f6] flex-shrink-0" />}
                            <p className={cn(
                              el.type === 'title' ? 'text-4xl font-extrabold text-white' :
                              el.type === 'heading' ? 'text-2xl font-bold text-white' :
                              el.type === 'label' ? 'text-[11px] font-bold uppercase tracking-widest text-[#3b82f6]' :
                              el.type === 'body' ? 'text-sm text-slate-400 leading-relaxed whitespace-pre-wrap' :
                              'text-sm text-slate-300',
                            )}>
                              {el.content || <span className="opacity-30">{el.placeholder}</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="absolute bottom-3 right-4 text-[10px] text-slate-700">{idx + 1}</div>
                    </div>
                  ))}
                </div>
              ) : (
                // Edit mode: current slide only, full size
                <SlideCanvas
                  key={slides[current].id}
                  slide={slides[current]}
                  slideIndex={current}
                  isTitle={current === 0}
                  onUpdateEl={updateEl}
                  onAddEl={addEl}
                  onDeleteEl={deleteEl}
                />
              )}
            </div>
          </div>

          {/* Prev / Next nav */}
          {!previewMode && (
            <div className="flex items-center justify-center gap-4 py-3 border-t border-[#1e2433] flex-shrink-0">
              <button
                onClick={() => setCurrent(c => Math.max(0, c - 1))}
                disabled={current === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e2433] text-slate-500 hover:text-white hover:border-[#3b82f6] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      'rounded-full transition-all',
                      i === current ? 'w-4 h-1.5 bg-[#3b82f6]' : 'w-1.5 h-1.5 bg-[#1e2433] hover:bg-[#3b82f6]/50',
                    )}
                  />
                ))}
              </div>
              <button
                onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))}
                disabled={current === slides.length - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e2433] text-slate-500 hover:text-white hover:border-[#3b82f6] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
