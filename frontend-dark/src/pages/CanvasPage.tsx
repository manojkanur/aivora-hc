import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileImage, FileText, FileSpreadsheet, Code2,
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  Type, AlignLeft, List, Eye, Edit3, Download,
} from 'lucide-react'
import { draftsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportFormat = 'pptx' | 'pdf' | 'docx' | 'html'

interface SlideElement {
  id: string
  type: 'title' | 'heading' | 'label' | 'body' | 'bullet'
  content: string
}

interface Slide {
  id: string
  elements: SlideElement[]
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }

const SKIP = new Set(['id', 'workspace_id', 'skill_id', 'created_at', 'knowledge_base'])

function flattenValue(v: unknown): string[] {
  if (v === null || v === undefined) return []
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return [String(v)]
  if (Array.isArray(v)) return v.flatMap(item => {
    if (typeof item === 'string') return [item]
    if (typeof item === 'object' && item !== null)
      return Object.entries(item as Record<string, unknown>).flatMap(([k, val]) =>
        typeof val === 'string' ? [`${k.replace(/_/g, ' ')}: ${val}`] : flattenValue(val)
      )
    return [String(item)]
  })
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) => {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const kids = flattenValue(val)
    return kids.length === 1 ? [`${label}: ${kids[0]}`] : [label, ...kids]
  })
  return []
}

function draftToSlides(content: Record<string, unknown>): Slide[] {
  const source = (content.tool_input as Record<string, unknown>) ?? content
  const entries = Object.entries(source).filter(([k]) => !SKIP.has(k))
  if (!entries.length) return []

  const slides: Slide[] = []
  const titleEntry = entries.find(([k]) => /name|title|org|organisation/i.test(k))

  // Cover slide
  slides.push({
    id: uid(),
    elements: [
      { id: uid(), type: 'label', content: 'HC Advisory' },
      { id: uid(), type: 'title', content: titleEntry ? String(titleEntry[1]) : 'Deliverable' },
      { id: uid(), type: 'body', content: `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` },
    ],
  })

  for (const [key, value] of entries) {
    if (key === titleEntry?.[0]) continue
    const heading = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const lines = flattenValue(value)
    const elems: SlideElement[] = [{ id: uid(), type: 'heading', content: heading }]

    if (lines.length <= 5) {
      lines.forEach(l => elems.push({ id: uid(), type: 'bullet', content: l }))
    } else {
      elems.push({ id: uid(), type: 'body', content: lines.join('\n') })
    }

    // Chunk into slides of 7 elements
    for (let i = 0; i < elems.length; i += 7) {
      const chunk = i === 0 ? elems.slice(0, 7) : [
        { id: uid(), type: 'heading' as const, content: `${heading} (cont.)` },
        ...elems.slice(i, i + 6),
      ]
      slides.push({ id: uid(), elements: chunk })
    }
  }
  return slides
}

// ─── Export functions ─────────────────────────────────────────────────────────

async function doExportPptx(slides: Slide[], title: string) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  slides.forEach((slide, idx) => {
    const s = pptx.addSlide()
    s.background = { color: '0C0E14' }
    if (idx === 0) s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: '100%', fill: { color: '3b82f6' } })
    let y = idx === 0 ? 1.2 : 0.5
    slide.elements.forEach(el => {
      s.addText(el.content || ' ', {
        x: 0.4, y, w: 9.2,
        fontSize: el.type === 'title' ? 36 : el.type === 'heading' ? 20 : el.type === 'label' ? 11 : 13,
        bold: el.type === 'title' || el.type === 'heading',
        color: el.type === 'label' ? '3b82f6' : el.type === 'heading' ? 'ffffff' : 'cbd5e1',
        bullet: el.type === 'bullet' ? { type: 'bullet' } : false,
        h: el.type === 'title' ? 0.8 : el.type === 'heading' ? 0.5 : 0.38,
        autoFit: true,
      })
      y += el.type === 'title' ? 0.9 : el.type === 'heading' ? 0.65 : 0.42
    })
  })
  await pptx.writeFile({ fileName: `${title}.pptx` })
}

async function doExportPdf(slideEls: NodeListOf<Element>, title: string) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] })
  for (let i = 0; i < slideEls.length; i++) {
    const canvas = await html2canvas(slideEls[i] as HTMLElement, { backgroundColor: '#0c0e14', scale: 1.5, useCORS: true })
    const img = canvas.toDataURL('image/jpeg', 0.92)
    if (i > 0) pdf.addPage([1280, 720], 'landscape')
    pdf.addImage(img, 'JPEG', 0, 0, 1280, 720)
  }
  pdf.save(`${title}.pdf`)
}

async function doExportDocx(slides: Slide[], title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = []
  slides.forEach(slide => {
    slide.elements.forEach(el => {
      if (el.type === 'title') children.push(new Paragraph({ text: el.content, heading: HeadingLevel.HEADING_1 }))
      else if (el.type === 'heading') children.push(new Paragraph({ text: el.content, heading: HeadingLevel.HEADING_2 }))
      else if (el.type === 'bullet') children.push(new Paragraph({ text: el.content, bullet: { level: 0 } }))
      else children.push(new Paragraph({ children: [new TextRun({ text: el.content, size: 24 })] }))
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

function doExportHtml(slides: Slide[], title: string) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0c0e14;font-family:system-ui,sans-serif;color:#e2e8f0}
.slide{width:1280px;height:720px;max-width:100vw;background:#0c0e14;border:1px solid #1e2433;margin:24px auto;display:flex;align-items:center;position:relative;overflow:hidden;border-radius:12px}
.slide:first-child{background:linear-gradient(135deg,#0f1623,#0c0e14)}
.slide:first-child::before{content:'';position:absolute;left:0;top:0;width:6px;height:100%;background:#3b82f6}
.inner{padding:60px 80px;width:100%}
.label{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3b82f6;margin-bottom:16px}
.title{font-size:42px;font-weight:800;color:#fff;line-height:1.15;margin-bottom:12px}
.heading{font-size:26px;font-weight:700;color:#fff;margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid #1e2433}
.body{font-size:15px;line-height:1.7;color:#94a3b8;white-space:pre-wrap}
.bullet{font-size:14px;line-height:1.7;color:#94a3b8;margin:0 0 6px 20px;list-style:disc}
@media print{.slide{margin:0;border-radius:0;break-after:page;height:100vh;width:100vw}}
</style></head><body>
${slides.map((s, i) => `<div class="slide"><div class="inner">
${s.elements.map(el =>
  el.type === 'title' ? `<h1 class="title">${el.content}</h1>` :
  el.type === 'heading' ? `<h2 class="heading">${el.content}</h2>` :
  el.type === 'label' ? `<p class="label">${el.content}</p>` :
  el.type === 'bullet' ? `<ul><li class="bullet">${el.content}</li></ul>` :
  `<p class="body">${el.content.replace(/\n/g, '<br>')}</p>`
).join('\n')}</div></div>`).join('\n')}
</body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${title}.html`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Inline editable element ──────────────────────────────────────────────────

function EditEl({ el, onUpdate, onDelete }: {
  el: SlideElement
  onUpdate: (id: string, val: string) => void
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

  const cls = {
    title: 'text-5xl font-extrabold text-white leading-tight',
    heading: 'text-3xl font-bold text-white',
    label: 'text-xs font-bold uppercase tracking-widest text-[#3b82f6]',
    body: 'text-base text-slate-400 leading-relaxed whitespace-pre-wrap',
    bullet: 'text-base text-slate-300',
  }[el.type]

  return (
    <div className="relative group/el">
      {el.type === 'bullet' ? (
        <div className="flex items-start gap-3">
          <span className="mt-2 w-2 h-2 rounded-full bg-[#3b82f6] flex-shrink-0" />
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            className={cn(cls, 'outline-none flex-1 min-w-0 rounded px-1 -mx-1', focused ? 'bg-white/5 ring-1 ring-[#3b82f6]/40' : 'hover:bg-white/5')}
            onFocus={() => setFocused(true)}
            onBlur={e => { setFocused(false); onUpdate(el.id, e.currentTarget.textContent ?? '') }}
            dangerouslySetInnerHTML={{ __html: el.content }}
          />
        </div>
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          className={cn(cls, 'outline-none rounded px-1 -mx-1', focused ? 'bg-white/5 ring-1 ring-[#3b82f6]/40' : 'hover:bg-white/5')}
          onFocus={() => setFocused(true)}
          onBlur={e => { setFocused(false); onUpdate(el.id, e.currentTarget.textContent ?? '') }}
          dangerouslySetInnerHTML={{ __html: el.content }}
        />
      )}
      <button
        onMouseDown={e => { e.preventDefault(); onDelete(el.id) }}
        className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center bg-red-500/20 hover:bg-red-500/50 text-red-400 opacity-0 group-hover/el:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Slide canvas ─────────────────────────────────────────────────────────────

function SlideCanvas({ slide, idx, onUpdateEl, onAddEl, onDeleteEl }: {
  slide: Slide
  idx: number
  onUpdateEl: (sid: string, eid: string, val: string) => void
  onAddEl: (sid: string, type: SlideElement['type']) => void
  onDeleteEl: (sid: string, eid: string) => void
}) {
  const isTitle = idx === 0
  return (
    <div
      data-slide
      className={cn(
        'relative w-full rounded-2xl overflow-hidden border border-[#1e2433] shadow-[0_8px_48px_rgba(0,0,0,0.7)]',
        isTitle ? 'bg-gradient-to-br from-[#0f1623] to-[#0c0e14]' : 'bg-[#0c0e14]',
      )}
      style={{ aspectRatio: '16/9' }}
    >
      {isTitle && <div className="absolute left-0 top-0 w-2 h-full bg-[#3b82f6]" />}

      <div className="absolute inset-0 flex flex-col justify-center px-[9%] py-[7%] gap-4">
        {slide.elements.map(el => (
          <EditEl
            key={el.id}
            el={el}
            onUpdate={(eid, val) => onUpdateEl(slide.id, eid, val)}
            onDelete={eid => onDeleteEl(slide.id, eid)}
          />
        ))}
      </div>

      {/* Bottom add-element toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity bg-[#131720]/90 border border-[#1e2433] rounded-xl px-3 py-1.5 backdrop-blur-sm">
        <span className="text-[10px] text-slate-600 mr-1">Add</span>
        {([
          ['bullet', <List className="w-3 h-3" />, 'Bullet'],
          ['body', <AlignLeft className="w-3 h-3" />, 'Text'],
          ['heading', <Type className="w-3 h-3" />, 'Heading'],
        ] as [SlideElement['type'], React.ReactNode, string][]).map(([type, icon, label]) => (
          <button
            key={type}
            onClick={() => onAddEl(slide.id, type)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-slate-400 hover:text-white hover:bg-[#1a1e2e] rounded-lg transition-colors"
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="absolute bottom-4 right-4 text-xs text-slate-700 font-medium">{idx + 1}</div>
    </div>
  )
}

// ─── Format picker card ───────────────────────────────────────────────────────

const FORMAT_CONFIG: Record<ExportFormat, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  pptx: { label: 'PowerPoint', desc: 'Editable .pptx slides', icon: <FileImage className="w-7 h-7" />, color: 'from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60' },
  pdf:  { label: 'PDF',        desc: 'Print-ready document',  icon: <FileText className="w-7 h-7" />,  color: 'from-red-500/20 to-red-500/5 border-red-500/30 hover:border-red-500/60' },
  docx: { label: 'Word',       desc: 'Editable .docx report', icon: <FileSpreadsheet className="w-7 h-7" />, color: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500/60' },
  html: { label: 'HTML Page',  desc: 'Interactive web page',  icon: <Code2 className="w-7 h-7" />,     color: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/60' },
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CanvasPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, unknown> | null>(null)
  const [draftTitle, setDraftTitle] = useState('Deliverable')

  // null = format picker, otherwise editing
  const [format, setFormat] = useState<ExportFormat | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [previewAll, setPreviewAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const slideContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const title = searchParams.get('title')
    if (title) setDraftTitle(decodeURIComponent(title))
  }, [searchParams])

  useEffect(() => {
    if (!draftId) return
    draftsAPI.get(draftId)
      .then(res => {
        const content = res.data.content ?? res.data
        setDraftContent(content)
      })
      .catch(() => toast.error('Failed to load draft'))
      .finally(() => setLoading(false))
  }, [draftId])

  const handlePickFormat = (fmt: ExportFormat) => {
    if (!draftContent) return
    const generated = draftToSlides(draftContent)
    setSlides(generated.length ? generated : [{
      id: uid(),
      elements: [
        { id: uid(), type: 'title', content: draftTitle },
        { id: uid(), type: 'body', content: 'No structured content found.' },
      ],
    }])
    setCurrent(0)
    setFormat(fmt)
  }

  const updateEl = useCallback((sid: string, eid: string, val: string) => {
    setSlides(prev => prev.map(s => s.id === sid
      ? { ...s, elements: s.elements.map(e => e.id === eid ? { ...e, content: val } : e) }
      : s))
  }, [])

  const addEl = useCallback((sid: string, type: SlideElement['type']) => {
    setSlides(prev => prev.map(s => s.id === sid
      ? { ...s, elements: [...s.elements, { id: uid(), type, content: '' }] }
      : s))
  }, [])

  const deleteEl = useCallback((sid: string, eid: string) => {
    setSlides(prev => prev.map(s => s.id === sid
      ? { ...s, elements: s.elements.filter(e => e.id !== eid) }
      : s))
  }, [])

  const addSlide = () => {
    const s: Slide = { id: uid(), elements: [
      { id: uid(), type: 'heading', content: 'New Slide' },
      { id: uid(), type: 'body', content: 'Click to edit' },
    ]}
    const next = [...slides]
    next.splice(current + 1, 0, s)
    setSlides(next)
    setCurrent(current + 1)
  }

  const deleteSlide = (i: number) => {
    if (slides.length <= 1) return
    setSlides(prev => prev.filter((_, j) => j !== i))
    setCurrent(c => Math.min(c, slides.length - 2))
  }

  const handleExport = async () => {
    if (!format) return
    setExporting(true)
    try {
      if (format === 'pptx') await doExportPptx(slides, draftTitle)
      else if (format === 'pdf') {
        const els = slideContainerRef.current?.querySelectorAll('[data-slide]')
        if (els) await doExportPdf(els, draftTitle)
      }
      else if (format === 'docx') await doExportDocx(slides, draftTitle)
      else doExportHtml(slides, draftTitle)
      toast.success(`${format.toUpperCase()} downloaded`)
    } catch (e) {
      console.error(e)
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0c0e14]">
      <Loader2 className="w-8 h-8 animate-spin text-[#3b82f6]" />
    </div>
  )

  // ── Format picker ────────────────────────────────────────────────────────────
  if (!format) return (
    <div className="min-h-screen bg-[#0c0e14] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1e2433] bg-[#131720]">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-[#1a1e2e] text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-white text-lg">Canvas Editor</h1>
          <p className="text-xs text-slate-500">{draftTitle}</p>
        </div>
      </div>

      {/* Format picker */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">Choose your format</h2>
          <p className="text-slate-500 text-sm">Your draft will be converted into an editable canvas.<br />Pick the format you want to work in and export.</p>
        </div>
        <div className="grid grid-cols-2 gap-5 w-full max-w-2xl">
          {(Object.entries(FORMAT_CONFIG) as [ExportFormat, typeof FORMAT_CONFIG[ExportFormat]][]).map(([fmt, cfg]) => (
            <button
              key={fmt}
              onClick={() => handlePickFormat(fmt)}
              className={cn(
                'flex flex-col items-start gap-3 p-6 rounded-2xl border bg-gradient-to-br transition-all duration-200 text-left group',
                cfg.color,
              )}
            >
              <div className="text-slate-300 group-hover:text-white transition-colors">{cfg.icon}</div>
              <div>
                <p className="font-bold text-white text-base">{cfg.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Canvas editor ────────────────────────────────────────────────────────────
  const fmt = FORMAT_CONFIG[format]

  return (
    <div className="h-screen flex flex-col bg-[#0c0e14] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2433] bg-[#131720] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFormat(null)}
            className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-slate-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{fmt.icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{draftTitle}</p>
              <p className="text-[11px] text-slate-600">{fmt.label} · {slides.length} slides</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={addSlide}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white border border-[#1e2433] hover:border-[#3b82f6] rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add slide
          </button>
          <button
            onClick={() => setPreviewAll(p => !p)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
              previewAll ? 'border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10' : 'border-[#1e2433] text-slate-500 hover:text-white',
            )}
          >
            {previewAll ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {previewAll ? 'Edit' : 'Preview all'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#3b82f6] hover:bg-[#60a5fa] text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export {format.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Thumbnail strip */}
        <div className="w-36 flex-shrink-0 border-r border-[#1e2433] bg-[#0e1018] overflow-y-auto py-3 px-2.5 space-y-2.5">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              onClick={() => { setCurrent(i); setPreviewAll(false) }}
              className={cn(
                'relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all group/thumb',
                i === current && !previewAll ? 'border-[#3b82f6] shadow-[0_0_14px_rgba(59,130,246,0.35)]' : 'border-transparent hover:border-[#252d3f]',
              )}
            >
              <div className={cn(
                'aspect-[16/9] p-2 relative',
                i === 0 ? 'bg-gradient-to-br from-[#0f1623] to-[#0c0e14]' : 'bg-[#0c0e14]',
              )}>
                {i === 0 && <div className="absolute left-0 top-0 w-1 h-full bg-[#3b82f6]" />}
                {slide.elements.slice(0, 4).map(el => (
                  <p key={el.id} className={cn(
                    'truncate leading-tight mb-0.5',
                    el.type === 'title' ? 'text-[5.5px] font-extrabold text-white' :
                    el.type === 'heading' ? 'text-[5px] font-bold text-white' :
                    el.type === 'label' ? 'text-[4.5px] text-[#3b82f6]' :
                    'text-[4px] text-slate-500',
                  )}>
                    {el.content || '—'}
                  </p>
                ))}
                <p className="absolute bottom-1 right-1.5 text-[7px] text-slate-700">{i + 1}</p>
              </div>
              {slides.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); deleteSlide(i) }}
                  className="absolute top-1 right-1 w-4 h-4 rounded flex items-center justify-center bg-red-500/20 hover:bg-red-500/60 text-red-400 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSlide}
            className="w-full aspect-[16/9] rounded-xl border border-dashed border-[#1e2433] hover:border-[#3b82f6] flex items-center justify-center text-slate-600 hover:text-[#3b82f6] transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Main canvas */}
        <div className="flex-1 flex flex-col min-h-0" ref={slideContainerRef}>
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto">
              {previewAll ? (
                <div className="space-y-6">
                  {slides.map((slide, i) => (
                    <div
                      key={slide.id}
                      data-slide
                      onClick={() => { setCurrent(i); setPreviewAll(false) }}
                      className={cn(
                        'relative w-full rounded-2xl overflow-hidden border cursor-pointer transition-all',
                        i === current ? 'border-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-[#1e2433] hover:border-[#252d3f]',
                        i === 0 ? 'bg-gradient-to-br from-[#0f1623] to-[#0c0e14]' : 'bg-[#0c0e14]',
                      )}
                      style={{ aspectRatio: '16/9' }}
                    >
                      {i === 0 && <div className="absolute left-0 top-0 w-2 h-full bg-[#3b82f6]" />}
                      <div className="absolute inset-0 flex flex-col justify-center px-[9%] py-[7%] gap-4">
                        {slide.elements.map(el => (
                          <div key={el.id} className={cn(el.type === 'bullet' ? 'flex items-start gap-3' : '')}>
                            {el.type === 'bullet' && <span className="mt-2 w-2 h-2 rounded-full bg-[#3b82f6] flex-shrink-0" />}
                            <p className={cn(
                              el.type === 'title' ? 'text-5xl font-extrabold text-white' :
                              el.type === 'heading' ? 'text-3xl font-bold text-white' :
                              el.type === 'label' ? 'text-xs font-bold uppercase tracking-widest text-[#3b82f6]' :
                              el.type === 'body' ? 'text-base text-slate-400 leading-relaxed whitespace-pre-wrap' :
                              'text-base text-slate-300',
                            )}>
                              {el.content || <span className="opacity-30 italic">empty</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="absolute bottom-3 right-4 text-xs text-slate-700">{i + 1}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <SlideCanvas
                  key={slides[current]?.id}
                  slide={slides[current]}
                  idx={current}
                  onUpdateEl={updateEl}
                  onAddEl={addEl}
                  onDeleteEl={deleteEl}
                />
              )}
            </div>
          </div>

          {/* Slide navigation */}
          {!previewAll && (
            <div className="flex items-center justify-center gap-4 py-3 border-t border-[#1e2433] bg-[#0e1018] flex-shrink-0">
              <button
                onClick={() => setCurrent(c => Math.max(0, c - 1))}
                disabled={current === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e2433] text-slate-500 hover:text-white hover:border-[#3b82f6] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1.5 items-center">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      'rounded-full transition-all',
                      i === current ? 'w-5 h-2 bg-[#3b82f6]' : 'w-2 h-2 bg-[#1e2433] hover:bg-[#3b82f6]/50',
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
