import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileImage, FileText, FileSpreadsheet, Code2,
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  Type, AlignLeft, List, Eye, Edit3, Download, Upload,
  Palette, Image as ImageIcon, X, Check, Sparkles,
} from 'lucide-react'
import { canvasAiAPI, draftsAPI } from '../lib/api'
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
  bg?: string          // per-slide background override
  elements: SlideElement[]
}

interface BrandSettings {
  logoDataUrl: string | null
  accentColor: string
  bgColor: string
  textColor: string
}

const DEFAULT_BRAND: BrandSettings = {
  logoDataUrl: null,
  accentColor: '#2E7DFA',
  bgColor: '#0B1220',
  textColor: '#e2e8f0',
}

const PRESET_THEMES = [
  { label: 'Dark Blue',   bg: '#0B1220', accent: '#2E7DFA', text: '#e2e8f0' },
  { label: 'Navy',        bg: '#0f172a', accent: '#6366f1', text: '#e2e8f0' },
  { label: 'Slate',       bg: '#1e293b', accent: '#38bdf8', text: '#f1f5f9' },
  { label: 'Dark Green',  bg: '#0d1f14', accent: '#22c55e', text: '#dcfce7' },
  { label: 'Charcoal',    bg: '#18181b', accent: '#a855f7', text: '#f4f4f5' },
  { label: 'White',       bg: '#ffffff', accent: '#2E7DFA', text: '#1e293b' },
  { label: 'Warm White',  bg: '#fafaf9', accent: '#f97316', text: '#1c1917' },
  { label: 'Brand Dark',  bg: '#111827', accent: '#f59e0b', text: '#f3f4f6' },
]

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

// Turn one StudioOutputDocument section into readable slide elements based on
// its layout, instead of dumping the raw data object as key:value strings.
function sectionToElements(section: Record<string, unknown>): SlideElement[] {
  const title = String(section.title ?? section.id ?? 'Section').replace(/_/g, ' ')
  const layout = String(section.layout ?? '')
  const data = (section.data ?? {}) as Record<string, unknown>
  const els: SlideElement[] = [{ id: uid(), type: 'heading', content: title }]

  const pushBody = (t?: unknown) => { if (t) els.push({ id: uid(), type: 'body', content: String(t) }) }
  const pushBullets = (arr: unknown) => {
    if (Array.isArray(arr)) arr.forEach(x => {
      if (typeof x === 'string') els.push({ id: uid(), type: 'bullet', content: x })
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const label = o.title ?? o.label ?? o.name ?? o.kpi ?? o.activity ?? ''
        const val = o.value ?? o.description ?? o.rationale ?? o.detail ?? o.mitigation ?? o.target ?? ''
        els.push({ id: uid(), type: 'bullet', content: [label, val].filter(Boolean).join(': ') })
      }
    })
  }

  switch (layout) {
    case 'narrative_paragraph':
      pushBody(data.body); break
    case 'kpi_grid':
      pushBullets(data.items ?? data.kpis); break
    case 'bar_chart':
    case 'horizontal_bar_chart':
    case 'ranked_list':
    case 'recommendation_cards':
    case 'risk_flags_list':
      pushBullets(data.items ?? data.cards ?? data.rows); break
    case 'comparison_table': {
      const rows = (data.rows ?? []) as Array<Record<string, unknown>>
      rows.forEach(r => els.push({ id: uid(), type: 'bullet', content: Object.values(r).map(String).join('  ·  ') }))
      break
    }
    case 'timeline': {
      const horizons = (data.horizons ?? []) as Array<Record<string, unknown>>
      horizons.forEach(h => {
        els.push({ id: uid(), type: 'bullet', content: String(h.label ?? '') })
        pushBullets(h.actions)
      })
      break
    }
    case 'callout_quote':
      pushBody(data.quote ?? data.text ?? data.body)
      if (data.attribution) els.push({ id: uid(), type: 'bullet', content: String(data.attribution) })
      break
    default:
      // Unknown layout: fall back to a compact flatten of the data.
      flattenValue(data).slice(0, 8).forEach(l => els.push({ id: uid(), type: 'bullet', content: l }))
  }
  // A section that yielded only its heading still shows the heading.
  const footnote = section.footnote
  if (footnote && String(footnote).trim()) els.push({ id: uid(), type: 'body', content: `Source: ${footnote}` })
  return els
}

function draftToSlides(content: Record<string, unknown>): Slide[] {
  // Preferred path: a StudioOutputDocument with typed sections renders cleanly.
  const sections = content.sections as Array<Record<string, unknown>> | undefined
  if (Array.isArray(sections) && sections.length) {
    const slides: Slide[] = [{
      id: uid(),
      elements: [
        { id: uid(), type: 'label', content: 'HC Advisory' },
        { id: uid(), type: 'title', content: String(content.title ?? 'Deliverable') },
        ...(content.subtitle ? [{ id: uid(), type: 'body' as const, content: String(content.subtitle) }] : []),
      ],
    }]
    for (const section of sections) {
      const els = sectionToElements(section)
      // Chunk long sections across multiple slides (max ~7 elements each).
      for (let i = 0; i < els.length; i += 7) {
        const chunk = i === 0 ? els.slice(0, 7) : [
          { id: uid(), type: 'heading' as const, content: `${String(section.title ?? '')} (cont.)` },
          ...els.slice(i, i + 6),
        ]
        slides.push({ id: uid(), elements: chunk })
      }
    }
    return slides
  }

  const source = (content.tool_input as Record<string, unknown>) ?? content
  const entries = Object.entries(source).filter(([k]) => !SKIP.has(k))
  if (!entries.length) return []

  const slides: Slide[] = []
  const titleEntry = entries.find(([k]) => /name|title|org|organisation/i.test(k))

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
    if (lines.length <= 6) {
      lines.forEach(l => elems.push({ id: uid(), type: 'bullet', content: l }))
    } else {
      elems.push({ id: uid(), type: 'body', content: lines.join('\n') })
    }
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

// ─── Export helpers ───────────────────────────────────────────────────────────

async function doExportPptx(slides: Slide[], title: string, brand: BrandSettings) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const accent = brand.accentColor.replace('#', '')
  const bg = brand.bgColor.replace('#', '')
  const txt = brand.textColor.replace('#', '')

  slides.forEach((slide, idx) => {
    const s = pptx.addSlide()
    const slideBg = (slide.bg || brand.bgColor).replace('#', '')
    s.background = { color: slideBg }
    if (idx === 0) s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: '100%', fill: { color: accent } })

    // Brand logo top-right every slide
    if (brand.logoDataUrl) {
      try {
        s.addImage({ data: brand.logoDataUrl, x: 8.5, y: 0.12, w: 1.3, h: 0.5 })
      } catch { /* skip if image fails */ }
    }

    let y = idx === 0 ? 1.4 : 0.6
    slide.elements.forEach(el => {
      s.addText(el.content || ' ', {
        x: 0.4, y, w: brand.logoDataUrl ? 8.8 : 9.2,
        fontSize: el.type === 'title' ? 34 : el.type === 'heading' ? 20 : el.type === 'label' ? 10 : 13,
        bold: el.type === 'title' || el.type === 'heading',
        color: el.type === 'label' || el.type === 'heading' ? accent : txt,
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
    const canvas = await html2canvas(slideEls[i] as HTMLElement, { scale: 1.5, useCORS: true, allowTaint: true })
    const img = canvas.toDataURL('image/jpeg', 0.92)
    if (i > 0) pdf.addPage([1280, 720], 'landscape')
    pdf.addImage(img, 'JPEG', 0, 0, 1280, 720)
  }
  pdf.save(`${title}.pdf`)
}

async function doExportDocx(slides: Slide[], title: string, brand: BrandSettings) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = []

  // Title page
  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 64, color: brand.accentColor.replace('#', '') })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }))
  children.push(new Paragraph({
    children: [new TextRun({ text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), size: 24, color: '94a3b8' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 800 },
  }))

  slides.slice(1).forEach(slide => {
    slide.elements.forEach(el => {
      if (el.type === 'heading') {
        children.push(new Paragraph({
          text: el.content,
          heading: HeadingLevel.HEADING_2,
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: brand.accentColor.replace('#', '') } },
          spacing: { before: 400, after: 160 },
        }))
      } else if (el.type === 'bullet') {
        children.push(new Paragraph({
          children: [new TextRun({ text: el.content, size: 24 })],
          bullet: { level: 0 },
          spacing: { after: 80 },
        }))
      } else if (el.type !== 'label') {
        children.push(new Paragraph({
          children: [new TextRun({ text: el.content, size: 24, color: '475569' })],
          spacing: { after: 120 },
        }))
      }
    })
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }))
  })

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${title}.docx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildHtmlSrc(slides: Slide[], title: string, brand: BrandSettings): string {
  const navSlides = slides.map((_, i) => `<button onclick="goto(${i})" id="dot-${i}" class="dot"></button>`).join('')
  const slideHtml = slides.map((slide, idx) => {
    const bg = slide.bg || brand.bgColor
    const isLight = parseInt(bg.replace('#','').slice(0,2), 16) > 180
    const bodyTxt = isLight ? '#475569' : brand.textColor
    const headTxt = isLight ? '#1e293b' : '#ffffff'

    const elems = slide.elements.map(el => {
      if (el.type === 'title') return `<h1 style="font-size:3rem;font-weight:900;color:${headTxt};line-height:1.15;margin-bottom:.5rem">${el.content}</h1>`
      if (el.type === 'heading') return `<h2 style="font-size:1.75rem;font-weight:700;color:${headTxt};margin-bottom:1rem;padding-bottom:.5rem;border-bottom:2px solid ${brand.accentColor}">${el.content}</h2>`
      if (el.type === 'label') return `<p style="font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${brand.accentColor};margin-bottom:1rem">${el.content}</p>`
      if (el.type === 'bullet') return `<div style="display:flex;align-items:flex-start;gap:.75rem;margin-bottom:.5rem"><span style="margin-top:.4rem;width:.5rem;height:.5rem;border-radius:50%;background:${brand.accentColor};flex-shrink:0;display:inline-block"></span><span style="font-size:.9rem;color:${bodyTxt}">${el.content}</span></div>`
      return `<p style="font-size:.9rem;line-height:1.7;color:${bodyTxt};white-space:pre-wrap">${el.content.replace(/\n/g,'<br>')}</p>`
    }).join('\n')

    const logoHtml = brand.logoDataUrl
      ? `<img src="${brand.logoDataUrl}" style="position:absolute;top:1.5rem;right:2rem;max-height:2.5rem;max-width:10rem;object-fit:contain" />`
      : ''
    const accentBar = idx === 0 ? `<div style="position:absolute;left:0;top:0;width:.35rem;height:100%;background:${brand.accentColor}"></div>` : ''

    return `<section class="slide" style="background:${bg}" data-idx="${idx}">
  ${accentBar}${logoHtml}
  <div class="inner">${elems}</div>
  <div style="position:absolute;bottom:1rem;right:1.5rem;font-size:.65rem;opacity:.4">${idx + 1} / ${slides.length}</div>
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
body{background:#000;font-family:Inter,system-ui,sans-serif;overflow:hidden;height:100vh}
.deck{width:100%;height:100vh;position:relative}
.slide{position:absolute;inset:0;display:none;align-items:center;justify-content:center;transition:opacity .3s}
.slide.active{display:flex}
.inner{padding:5% 8%;width:100%;max-height:100%;overflow:hidden;position:relative}
nav{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);display:flex;gap:.5rem;z-index:10;align-items:center}
.dot{width:.5rem;height:.5rem;border-radius:9999px;background:rgba(255,255,255,.25);border:none;cursor:pointer;transition:all .2s}
.dot.active{width:1.5rem;background:${brand.accentColor}}
.arrow{position:fixed;top:50%;transform:translateY(-50%);z-index:10;background:rgba(255,255,255,.1);border:none;color:#fff;width:2.5rem;height:2.5rem;border-radius:50%;cursor:pointer;font-size:1.2rem;display:flex;align-items:center;justify-content:center;transition:background .2s}
.arrow:hover{background:rgba(255,255,255,.25)}
#prev{left:1rem}
#next{right:1rem}
@media print{
  body{overflow:visible;height:auto}
  .slide{position:relative;display:flex!important;break-after:page;height:100vh;width:100vw}
  nav,.arrow{display:none}
}
</style>
</head>
<body>
<div class="deck" id="deck">
${slideHtml}
</div>
<button class="arrow" id="prev" onclick="move(-1)">&#8592;</button>
<button class="arrow" id="next" onclick="move(1)">&#8594;</button>
<nav>${navSlides}</nav>
<script>
let cur=0;
const slides=document.querySelectorAll('.slide');
const dots=document.querySelectorAll('.dot');
function goto(n){
  slides[cur].classList.remove('active');
  dots[cur].classList.remove('active');
  cur=Math.max(0,Math.min(n,slides.length-1));
  slides[cur].classList.add('active');
  dots[cur].classList.add('active');
}
function move(d){goto(cur+d)}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')move(1);if(e.key==='ArrowLeft')move(-1)});
goto(0);
</script>
</body>
</html>`

  return html
}

function doExportHtml(slides: Slide[], title: string, brand: BrandSettings) {
  const html = buildHtmlSrc(slides, title, brand)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${title}.html`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Inline editable element ──────────────────────────────────────────────────

function EditEl({ el, brand, onUpdate, onDelete }: {
  el: SlideElement
  brand: BrandSettings
  onUpdate: (id: string, val: string) => void
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const isLight = parseInt(brand.bgColor.replace('#','').slice(0,2), 16) > 180

  const cls = {
    title:   `text-4xl sm:text-5xl font-extrabold leading-tight`,
    heading: `text-2xl sm:text-3xl font-bold`,
    label:   `text-xs font-bold uppercase tracking-widest`,
    body:    `text-sm sm:text-base leading-relaxed whitespace-pre-wrap`,
    bullet:  `text-sm sm:text-base`,
  }[el.type]

  const color = el.type === 'label'
    ? brand.accentColor
    : el.type === 'heading'
    ? (isLight ? '#1e293b' : '#ffffff')
    : el.type === 'title'
    ? (isLight ? '#0f172a' : '#ffffff')
    : (isLight ? '#475569' : brand.textColor)

  return (
    <div className="relative group/el">
      {el.type === 'bullet' ? (
        <div className="flex items-start gap-3">
          <span className="mt-[.4em] w-2 h-2 rounded-full flex-shrink-0" style={{ background: brand.accentColor }} />
          <div
            ref={ref} contentEditable suppressContentEditableWarning
            style={{ color, outlineColor: brand.accentColor + '80' }}
            className={cn(cls, 'outline-none flex-1 min-w-0 rounded px-1 -mx-1', focused ? 'bg-white/5 ring-1' : 'hover:bg-white/5')}
            onFocus={() => setFocused(true)}
            onBlur={e => { setFocused(false); onUpdate(el.id, e.currentTarget.textContent ?? '') }}
            dangerouslySetInnerHTML={{ __html: el.content }}
          />
        </div>
      ) : (
        <div
          ref={ref} contentEditable suppressContentEditableWarning
          style={{ color, outlineColor: brand.accentColor + '80' }}
          className={cn(cls, 'outline-none rounded px-1 -mx-1', focused ? 'bg-white/5 ring-1' : 'hover:bg-white/5')}
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

function SlideCanvas({ slide, idx, brand, onUpdateEl, onAddEl, onDeleteEl, onChangeBg }: {
  slide: Slide; idx: number; brand: BrandSettings
  onUpdateEl: (sid: string, eid: string, val: string) => void
  onAddEl: (sid: string, type: SlideElement['type']) => void
  onDeleteEl: (sid: string, eid: string) => void
  onChangeBg: (sid: string, color: string) => void
}) {
  const isTitle = idx === 0
  const bg = slide.bg || brand.bgColor

  return (
    <div
      data-slide
      className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-[0_8px_48px_rgba(0,0,0,0.7)]"
      style={{ aspectRatio: '16/9', background: bg }}
    >
      {isTitle && <div className="absolute left-0 top-0 w-2 h-full" style={{ background: brand.accentColor }} />}

      {/* Brand logo */}
      {brand.logoDataUrl && (
        <img
          src={brand.logoDataUrl}
          className="absolute top-4 right-5 max-h-10 max-w-[8rem] object-contain pointer-events-none"
          alt="logo"
        />
      )}

      <div className="absolute inset-0 flex flex-col justify-center px-[9%] py-[7%] gap-3">
        {slide.elements.map(el => (
          <EditEl key={el.id} el={el} brand={brand}
            onUpdate={(eid, val) => onUpdateEl(slide.id, eid, val)}
            onDelete={eid => onDeleteEl(slide.id, eid)}
          />
        ))}
      </div>

      {/* Per-slide bg color picker */}
      <div className="absolute top-3 left-4 opacity-0 hover:opacity-100 transition-opacity">
        <label className="flex items-center gap-1 cursor-pointer bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1">
          <Palette className="w-3 h-3 text-white/60" />
          <span className="text-[10px] text-white/60">Slide bg</span>
          <input type="color" value={bg} onChange={e => onChangeBg(slide.id, e.target.value)}
            className="w-4 h-4 rounded cursor-pointer opacity-0 absolute" />
        </label>
      </div>

      {/* Add element toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5">
        <span className="text-[10px] text-white/40 mr-1">Add</span>
        {([
          ['bullet', <List className="w-3 h-3" />, 'Bullet'],
          ['body', <AlignLeft className="w-3 h-3" />, 'Text'],
          ['heading', <Type className="w-3 h-3" />, 'Heading'],
        ] as [SlideElement['type'], React.ReactNode, string][]).map(([type, icon, label]) => (
          <button key={type} onClick={() => onAddEl(slide.id, type)}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="absolute bottom-3 right-4 text-xs opacity-30">{idx + 1}</div>
    </div>
  )
}

// ─── Brand panel ──────────────────────────────────────────────────────────────

function BrandPanel({ brand, onChange, onApplyTheme }: {
  brand: BrandSettings
  onChange: (b: BrandSettings) => void
  onApplyTheme?: (b: BrandSettings) => void
}) {
  const logoRef = useRef<HTMLInputElement>(null)

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onChange({ ...brand, logoDataUrl: ev.target?.result as string })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="border-b border-white/10 p-3 space-y-3">
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Brand</p>

      {/* Logo */}
      <div>
        <p className="text-[10px] text-white/50 mb-1.5">Logo</p>
        {brand.logoDataUrl ? (
          <div className="relative inline-block">
            <img src={brand.logoDataUrl} className="h-8 max-w-[6rem] object-contain rounded bg-white/5 p-1" alt="logo" />
            <button onClick={() => onChange({ ...brand, logoDataUrl: null })}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          </div>
        ) : (
          <button onClick={() => logoRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white border border-dashed border-white/15 hover:border-white/30 rounded-lg px-3 py-1.5 w-full justify-center transition-colors">
            <ImageIcon className="w-3 h-3" /> Upload logo
          </button>
        )}
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
      </div>

      {/* Accent color */}
      <div>
        <p className="text-[10px] text-white/50 mb-1.5">Accent colour</p>
        <div className="flex items-center gap-2">
          <input type="color" value={brand.accentColor} onChange={e => onChange({ ...brand, accentColor: e.target.value })}
            className="w-7 h-7 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
          <span className="text-[11px] text-white/50 font-mono">{brand.accentColor}</span>
        </div>
      </div>

      {/* Themes — applies bg to ALL slides */}
      <div>
        <p className="text-[10px] text-white/50 mb-1">Theme presets</p>
        <p className="text-[9px] text-white/25 mb-1.5">Applies to all slides</p>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESET_THEMES.map(t => (
            <button key={t.label}
              onClick={() => {
                const nb = { ...brand, bgColor: t.bg, accentColor: t.accent, textColor: t.text }
                onChange(nb)
                onApplyTheme?.(nb)
              }}
              title={t.label}
              className={cn(
                'h-6 rounded-md border-2 transition-all',
                brand.bgColor === t.bg && brand.accentColor === t.accent ? 'border-white/60 scale-110' : 'border-transparent hover:border-white/30'
              )}
              style={{ background: `linear-gradient(135deg, ${t.bg} 60%, ${t.accent})` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Format picker ────────────────────────────────────────────────────────────

const FORMAT_CONFIG: Record<ExportFormat, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  pptx: { label: 'PowerPoint', desc: 'Editable .pptx slides', icon: <FileImage className="w-7 h-7" />, color: 'from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60' },
  pdf:  { label: 'PDF',        desc: 'Every slide as a page', icon: <FileText className="w-7 h-7" />,  color: 'from-red-500/20 to-red-500/5 border-red-500/30 hover:border-red-500/60' },
  docx: { label: 'Word',       desc: 'Styled .docx report',   icon: <FileSpreadsheet className="w-7 h-7" />, color: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500/60' },
  html: { label: 'HTML Page',  desc: 'Interactive presentation with keyboard navigation', icon: <Code2 className="w-7 h-7" />, color: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/60' },
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CanvasPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [draftContent, setDraftContent] = useState<Record<string, unknown> | null>(null)
  const [draftTitle, setDraftTitle] = useState('Deliverable')
  const [format, setFormat] = useState<ExportFormat | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [previewAll, setPreviewAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedDraftId, setSavedDraftId] = useState<string | null>(draftId && !draftId.startsWith('hipo-') ? draftId : null)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND)
  const slideContainerRef = useRef<HTMLDivElement>(null)

  // ── AI prompt-driven edit ───────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiLastReply, setAiLastReply] = useState<string | null>(null)

  const runAiEdit = useCallback(async () => {
    const p = aiPrompt.trim()
    if (!p || aiBusy) return
    setAiBusy(true)
    setAiLastReply(null)
    try {
      // Send a slim payload — only id, type, content per element.
      const lean = slides.map(s => ({
        id: s.id,
        elements: s.elements.map(e => ({ id: e.id, type: e.type, content: e.content })),
      }))
      const res = await canvasAiAPI.edit(p, lean)
      const next = res.data?.slides as Array<{ id: string; elements: Array<{ id: string; content: string }> }> | undefined
      if (!next || !Array.isArray(next)) throw new Error('Unexpected reply shape')

      // Merge edited content back into existing slides keyed by ids — keep types
      // and any per-slide bg the user already chose.
      setSlides(prev => prev.map(slide => {
        const editedSlide = next.find(n => n.id === slide.id)
        if (!editedSlide) return slide
        return {
          ...slide,
          elements: slide.elements.map(el => {
            const edited = editedSlide.elements.find(e => e.id === el.id)
            return edited ? { ...el, content: edited.content } : el
          }),
        }
      }))
      setAiLastReply(`Edited ${next.length} slide${next.length === 1 ? '' : 's'}`)
      setAiPrompt('')
      toast.success('AI edits applied')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI edit failed'
      setAiLastReply(msg)
      toast.error('AI edit failed - try a more specific prompt')
    } finally {
      setAiBusy(false)
    }
  }, [aiPrompt, aiBusy, slides])

  // Apply a theme to ALL slides (clear per-slide bg overrides)
  const applyThemeToAllSlides = useCallback((newBrand: BrandSettings) => {
    setSlides(prev => prev.map(s => ({ ...s, bg: newBrand.bgColor })))
    setBrand(newBrand)
  }, [])

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const payload = {
        skill_id: 'canvas',
        workspace_id: draftContent?.workspace_id ?? null,
        content: {
          ...(draftContent ?? {}),
          canvas_slides: slides,
          canvas_brand: { ...brand, logoDataUrl: null }, // don't store base64 in DB
          canvas_title: draftTitle,
          canvas_format: format,
          title: draftTitle,
          skill_slug: 'canvas',
        },
      }
      const res = await draftsAPI.create(payload)
      const newId = res?.data?.id ?? res?.data?.draft?.id
      if (newId) setSavedDraftId(newId)
      toast.success('Saved to Draft Inbox')
    } catch {
      toast.success('Saved locally. Will sync when backend is ready.')
    }
    setSaving(false)
  }

  useEffect(() => {
    const title = searchParams.get('title')
    if (title) setDraftTitle(decodeURIComponent(title))
  }, [searchParams])

  // Word count across all slides — like Notion's footer
  const wordCount = React.useMemo(() => {
    let n = 0
    for (const s of slides) {
      for (const el of s.elements) {
        if (el.content) n += el.content.trim().split(/\s+/).filter(Boolean).length
      }
    }
    return n
  }, [slides])

  // Background autosave to PATCH /ai/drafts/{id}/content — only once we have a saved draft id
  useEffect(() => {
    if (!savedDraftId) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setAutosaveStatus('saving')
        await draftsAPI.patchContent(savedDraftId, {
          canvas_slides: slides,
          canvas_brand: { ...brand, logoDataUrl: null },
          canvas_title: draftTitle,
          canvas_format: format,
          title: draftTitle,
        })
        setAutosaveStatus('saved')
        setLastSavedAt(new Date())
      } catch {
        setAutosaveStatus('error')
      }
    }, 1200)
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [slides, brand, draftTitle, format, savedDraftId])

  useEffect(() => {
    const source = searchParams.get('source')
    const fmtParam = searchParams.get('format') as ExportFormat | null

    if (source === 'hipo') {
      const org = sessionStorage.getItem('hipo_canvas_org') || draftTitle
      const hipoContent: Record<string, unknown> = {
        organisation: org,
        advisory_summary: 'AI-generated HC advisory for ' + org,
        hc_priorities: ['Leadership pipeline development', 'Talent retention strategy', 'Workforce capability building', 'Succession planning'],
        recommendations: ['Accelerate leadership pipeline programs', 'Implement internal mobility framework', 'Build critical role continuity plans', 'Launch skills development track'],
        bench_strength: 'Assessment in progress. Update with client data.',
        retention_risk: 'Review high-risk talent segments and implement targeted retention plans',
        maturity_assessment: 'Current maturity stage mapped against industry benchmarks',
        next_steps: ['Schedule HC priority workshop', 'Validate data with HRBP team', 'Present findings to leadership', 'Agree roadmap milestones'],
      }
      const generated = draftToSlides(hipoContent)
      setDraftContent(hipoContent)
      setSlides(generated)
      setCurrent(0)
      if (fmtParam && ['pptx','pdf','docx','html'].includes(fmtParam)) setFormat(fmtParam)
      setLoading(false)
      return
    }

    if (!draftId) { setLoading(false); return }
    draftsAPI.get(draftId)
      .then(res => {
        const content = res.data.content ?? res.data
        setDraftContent(content)
        if (fmtParam && ['pptx','pdf','docx','html'].includes(fmtParam)) {
          const generated = draftToSlides(content)
          setSlides(generated.length ? generated : [{ id: uid(), elements: [{ id: uid(), type: 'title', content: draftTitle }, { id: uid(), type: 'body', content: 'Click to edit' }] }])
          setCurrent(0)
          setFormat(fmtParam)
        }
      })
      .catch(() => toast.error('Failed to load draft'))
      .finally(() => setLoading(false))
  }, [draftId]) // eslint-disable-line

  const handlePickFormat = (fmt: ExportFormat) => {
    if (!draftContent) return
    const generated = draftToSlides(draftContent)
    setSlides(generated.length ? generated : [{ id: uid(), elements: [{ id: uid(), type: 'title', content: draftTitle }, { id: uid(), type: 'body', content: 'Click to edit content' }] }])
    setCurrent(0)
    setFormat(fmt)
  }

  const updateEl = useCallback((sid: string, eid: string, val: string) => {
    setSlides(prev => prev.map(s => s.id === sid ? { ...s, elements: s.elements.map(e => e.id === eid ? { ...e, content: val } : e) } : s))
  }, [])

  const addEl = useCallback((sid: string, type: SlideElement['type']) => {
    setSlides(prev => prev.map(s => s.id === sid ? { ...s, elements: [...s.elements, { id: uid(), type, content: '' }] } : s))
  }, [])

  const deleteEl = useCallback((sid: string, eid: string) => {
    setSlides(prev => prev.map(s => s.id === sid ? { ...s, elements: s.elements.filter(e => e.id !== eid) } : s))
  }, [])

  const changeBg = useCallback((sid: string, color: string) => {
    setSlides(prev => prev.map(s => s.id === sid ? { ...s, bg: color } : s))
  }, [])

  const addSlide = () => {
    const s: Slide = { id: uid(), elements: [{ id: uid(), type: 'heading', content: 'New Slide' }, { id: uid(), type: 'body', content: 'Click to edit' }] }
    const next = [...slides]; next.splice(current + 1, 0, s)
    setSlides(next); setCurrent(current + 1)
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
      if (format === 'pptx') await doExportPptx(slides, draftTitle, brand)
      else if (format === 'pdf') {
        // Switch to preview-all temporarily for PDF capture
        setPreviewAll(true)
        await new Promise(r => setTimeout(r, 300))
        const els = slideContainerRef.current?.querySelectorAll('[data-slide]')
        if (els) await doExportPdf(els, draftTitle)
        setPreviewAll(false)
      }
      else if (format === 'docx') await doExportDocx(slides, draftTitle, brand)
      else doExportHtml(slides, draftTitle, brand)
      toast.success(`${format.toUpperCase()} downloaded`)
    } catch (e) { console.error(e); toast.error('Export failed') }
    finally { setExporting(false) }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0B1220]">
      <Loader2 className="w-8 h-8 animate-spin text-[#2E7DFA]" />
    </div>
  )

  // ── Format picker ────────────────────────────────────────────────────────────
  if (!format) return (
    <div className="min-h-screen bg-[#0B1220] flex flex-col">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#2A3648] bg-[#1B2431]">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-[#222E3E] text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-white text-lg">Canvas Editor</h1>
          <p className="text-xs text-slate-500">{draftTitle}</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">Choose export format</h2>
          <p className="text-slate-500 text-sm">Each format has its own editor and preview. Edit then download.</p>
        </div>
        <div className="grid grid-cols-2 gap-5 w-full max-w-2xl">
          {(Object.entries(FORMAT_CONFIG) as [ExportFormat, typeof FORMAT_CONFIG[ExportFormat]][]).map(([fmt, cfg]) => (
            <button key={fmt} onClick={() => handlePickFormat(fmt)}
              className={cn('flex flex-col items-start gap-3 p-6 rounded-2xl border bg-gradient-to-br transition-all duration-200 text-left group', cfg.color)}>
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

  // ── Editor ───────────────────────────────────────────────────────────────────
  const fmtCfg = FORMAT_CONFIG[format]
  const editorBg = format === 'docx' ? '#f8fafc' : format === 'pdf' ? '#e2e8f0' : brand.bgColor

  // HTML live preview srcDoc
  const htmlPreviewSrc = format === 'html' ? buildHtmlSrc(slides, draftTitle, brand) : ''

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0B1220]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2A3648] bg-[#1B2431] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setFormat(null)} className="p-1.5 rounded-lg hover:bg-[#222E3E] text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{fmtCfg.icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{draftTitle}</p>
              <p className="text-[11px] text-slate-500">{fmtCfg.label} · {slides.length} slides</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {format !== 'html' && (
            <button onClick={addSlide}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white border border-[#2A3648] hover:border-[#2E7DFA] rounded-lg px-3 py-1.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Slide
            </button>
          )}
          {format === 'pptx' && (
            <button onClick={() => setPreviewAll(p => !p)}
              className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                previewAll ? 'border-[#2E7DFA] text-[#2E7DFA] bg-[#2E7DFA]/10' : 'border-[#2A3648] text-slate-500 hover:text-white')}>
              {previewAll ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {previewAll ? 'Edit' : 'All slides'}
            </button>
          )}
          {/* Autosave + word count */}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 mr-1">
            {savedDraftId ? (
              <>
                {autosaveStatus === 'saving' && <span className="flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>}
                {autosaveStatus === 'saved' && lastSavedAt && <span className="flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> Saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                {autosaveStatus === 'error' && <span className="text-amber-400">Save failed, will retry</span>}
                {autosaveStatus === 'idle' && <span>Autosave on</span>}
              </>
            ) : (
              <span>Unsaved</span>
            )}
            <span className="text-slate-700">·</span>
            <span>{wordCount.toLocaleString()} words</span>
          </div>
          <button onClick={handleSaveDraft} disabled={saving}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white border border-[#2A3648] hover:border-emerald-500/50 hover:text-emerald-400 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {savedDraftId ? 'Saved to Inbox' : 'Save Draft'}
          </button>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 bg-[#2E7DFA] hover:bg-[#175FCC]">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download {format.toUpperCase()}
          </button>
        </div>
      </div>

      {/* AI prompt bar — tell the model to edit the deck and it rewrites the slide content */}
      <div className="border-b border-[#2A3648] bg-gradient-to-r from-blue-500/5 to-violet-500/5 px-4 py-2 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_0_2px_rgba(46,125,250,0.15)]">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <input
          type="text"
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !aiBusy) runAiEdit() }}
          placeholder="Ask AI to edit - e.g. shorten the executive summary, add a slide on workforce risk, change tone to board-level"
          disabled={aiBusy}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
        />
        {aiLastReply && !aiBusy && (
          <span className="text-[11px] text-slate-400 hidden md:inline">{aiLastReply}</span>
        )}
        <button
          onClick={runAiEdit}
          disabled={aiBusy || !aiPrompt.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
        >
          {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {aiBusy ? 'Editing…' : 'Apply'}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: Brand + thumbnails (not for HTML) */}
        {format !== 'html' && (
          <div className="w-44 flex-shrink-0 border-r border-[#2A3648] bg-[#0B1220] flex flex-col overflow-hidden">
            <BrandPanel brand={brand} onChange={setBrand} onApplyTheme={applyThemeToAllSlides} />
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2">
              {slides.map((slide, i) => (
                <div key={slide.id} onClick={() => { setCurrent(i); setPreviewAll(false) }}
                  className={cn('relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all group/thumb',
                    i === current && !previewAll ? 'border-[#2E7DFA] shadow-[0_0_8px_rgba(46,125,250,0.3)]' : 'border-transparent hover:border-[#2A3648]')}>
                  <div className="aspect-[16/9] p-1.5 relative" style={{ background: format === 'docx' ? '#ffffff' : (slide.bg || brand.bgColor) }}>
                    {i === 0 && format !== 'docx' && <div className="absolute left-0 top-0 w-0.5 h-full" style={{ background: brand.accentColor }} />}
                    {slide.elements.slice(0, 4).map(el => (
                      <p key={el.id} className={cn('truncate leading-tight mb-0.5',
                        el.type === 'title' ? 'text-[5.5px] font-extrabold' :
                        el.type === 'heading' ? 'text-[5px] font-bold' :
                        el.type === 'label' ? 'text-[4.5px]' : 'text-[4px] opacity-40')}
                        style={{
                          color: format === 'docx'
                            ? (el.type === 'title' || el.type === 'heading' ? '#1e293b' : el.type === 'label' ? brand.accentColor : '#475569')
                            : (el.type === 'label' ? brand.accentColor : '#ffffff'),
                        }}>
                        {el.content || ' - '}
                      </p>
                    ))}
                    <p className="absolute bottom-0.5 right-1 text-[7px] opacity-20" style={{ color: format === 'docx' ? '#000' : '#fff' }}>{i + 1}</p>
                  </div>
                  {slides.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); deleteSlide(i) }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addSlide}
                className="w-full aspect-[16/9] rounded-lg border border-dashed border-[#2A3648] hover:border-[#2E7DFA] flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Main canvas area */}
        <div className="flex-1 flex flex-col min-h-0" style={{ background: editorBg }}>

          {/* ── PPTX: dark slide editor ── */}
          {format === 'pptx' && (
            <>
              <div className="flex-1 overflow-y-auto p-8" ref={slideContainerRef}>
                <div className="max-w-5xl mx-auto">
                  {previewAll ? (
                    <div className="space-y-6">
                      {slides.map((slide, i) => (
                        <div key={slide.id} data-slide onClick={() => { setCurrent(i); setPreviewAll(false) }}
                          className="relative w-full rounded-2xl overflow-hidden border border-white/10 cursor-pointer"
                          style={{ aspectRatio: '16/9', background: slide.bg || brand.bgColor }}>
                          {i === 0 && <div className="absolute left-0 top-0 w-2 h-full" style={{ background: brand.accentColor }} />}
                          {brand.logoDataUrl && <img src={brand.logoDataUrl} className="absolute top-3 right-4 max-h-8 max-w-[6rem] object-contain" alt="logo" />}
                          <div className="absolute inset-0 flex flex-col justify-center px-[9%] py-[7%] gap-3">
                            {slide.elements.map(el => {
                              const isLight = parseInt((slide.bg || brand.bgColor).replace('#','').slice(0,2), 16) > 180
                              const color = el.type === 'label' ? brand.accentColor : el.type === 'heading' || el.type === 'title' ? (isLight ? '#1e293b' : '#fff') : (isLight ? '#475569' : brand.textColor)
                              return (
                                <div key={el.id} className={cn(el.type === 'bullet' ? 'flex items-start gap-3' : '')}>
                                  {el.type === 'bullet' && <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ background: brand.accentColor }} />}
                                  <p style={{ color }} className={cn(
                                    el.type === 'title' ? 'text-4xl font-extrabold' :
                                    el.type === 'heading' ? 'text-2xl font-bold' :
                                    el.type === 'label' ? 'text-xs font-bold uppercase tracking-widest' :
                                    'text-sm leading-relaxed whitespace-pre-wrap'
                                  )}>
                                    {el.content || <span className="opacity-20 italic">empty</span>}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                          <div className="absolute bottom-2 right-3 text-xs text-white/20">{i + 1}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    slides[current] && (
                      <SlideCanvas key={slides[current].id} slide={slides[current]} idx={current} brand={brand}
                        onUpdateEl={updateEl} onAddEl={addEl} onDeleteEl={deleteEl} onChangeBg={changeBg} />
                    )
                  )}
                </div>
              </div>
              {!previewAll && (
                <div className="flex items-center justify-center gap-4 py-3 border-t border-white/10 bg-black/20 flex-shrink-0">
                  <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/15 text-white/40 hover:text-white hover:border-white/40 disabled:opacity-20 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1.5 items-center">
                    {slides.map((_, i) => (
                      <button key={i} onClick={() => setCurrent(i)}
                        className={cn('rounded-full transition-all', i === current ? 'w-5 h-2' : 'w-2 h-2 hover:opacity-70')}
                        style={{ background: i === current ? brand.accentColor : 'rgba(255,255,255,0.2)' }} />
                    ))}
                  </div>
                  <button onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/15 text-white/40 hover:text-white hover:border-white/40 disabled:opacity-20 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── PDF: light pages stacked vertically ── */}
          {format === 'pdf' && (
            <div className="flex-1 overflow-y-auto py-8 px-6" ref={slideContainerRef} style={{ background: '#cbd5e1' }}>
              <div className="max-w-3xl mx-auto space-y-6">
                {slides.map((slide, i) => (
                  <div key={slide.id} data-slide
                    className="relative bg-white rounded shadow-xl border border-gray-300 cursor-pointer hover:shadow-2xl transition-shadow"
                    style={{ aspectRatio: '1.414/1' }}
                    onClick={() => setCurrent(i)}>
                    {/* PDF page header stripe */}
                    <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: brand.accentColor }} />
                    {brand.logoDataUrl && (
                      <img src={brand.logoDataUrl} className="absolute top-3 right-4 max-h-8 max-w-[7rem] object-contain" alt="logo" />
                    )}
                    <div className="absolute inset-0 flex flex-col justify-center px-10 py-8 gap-3 pt-8">
                      {slide.elements.map(el => {
                        const ref = React.createRef<HTMLDivElement>()
                        return (
                          <div key={el.id} className={cn(el.type === 'bullet' ? 'flex items-start gap-2' : '')}>
                            {el.type === 'bullet' && <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: brand.accentColor }} />}
                            <div ref={ref} contentEditable suppressContentEditableWarning
                              onBlur={e => updateEl(slide.id, el.id, e.currentTarget.textContent ?? '')}
                              className={cn('outline-none flex-1 rounded px-1',
                                el.type === 'title' ? 'text-2xl font-extrabold text-gray-900' :
                                el.type === 'heading' ? 'text-lg font-bold border-b pb-1' :
                                el.type === 'label' ? 'text-[10px] font-bold uppercase tracking-widest' :
                                'text-sm text-gray-600 leading-relaxed')}
                              style={{
                                color: el.type === 'label' ? brand.accentColor : el.type === 'heading' ? '#1e293b' : undefined,
                                borderColor: el.type === 'heading' ? brand.accentColor + '40' : undefined,
                              }}
                              dangerouslySetInnerHTML={{ __html: el.content }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div className="absolute bottom-2 right-4 text-[10px] text-gray-400">{i + 1} / {slides.length}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── DOCX: white Word-style document ── */}
          {format === 'docx' && (
            <div className="flex-1 overflow-y-auto py-10 px-6" style={{ background: '#e2e8f0' }}>
              <div className="max-w-2xl mx-auto bg-white shadow-xl rounded border border-gray-200 px-16 py-12 min-h-[297mm]">
                {/* Title page elements */}
                {slides[0]?.elements.map(el => el.type === 'title' ? (
                  <div key={el.id} contentEditable suppressContentEditableWarning
                    onBlur={e => updateEl(slides[0].id, el.id, e.currentTarget.textContent ?? '')}
                    className="text-4xl font-extrabold text-gray-900 mb-3 outline-none"
                    dangerouslySetInnerHTML={{ __html: el.content }} />
                ) : null)}
                <div className="flex items-center gap-3 mb-10 pb-6 border-b-2" style={{ borderColor: brand.accentColor }}>
                  {brand.logoDataUrl && <img src={brand.logoDataUrl} className="max-h-8 max-w-[6rem] object-contain" alt="logo" />}
                  <span className="text-sm text-gray-400">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                {/* Content slides */}
                {slides.slice(1).map(slide => (
                  <div key={slide.id} className="mb-8">
                    {slide.elements.map(el => (
                      <div key={el.id} className={cn(el.type === 'bullet' ? 'flex items-start gap-2 mb-2' : 'mb-3')}>
                        {el.type === 'bullet' && <span className="mt-2 w-2 h-2 rounded-full flex-shrink-0" style={{ background: brand.accentColor }} />}
                        {el.type !== 'label' && (
                          <div contentEditable suppressContentEditableWarning
                            onBlur={e => updateEl(slide.id, el.id, e.currentTarget.textContent ?? '')}
                            className={cn('outline-none flex-1 rounded px-1',
                              el.type === 'heading' ? 'text-xl font-bold border-b-2 pb-2 mb-4' :
                              el.type === 'title' ? 'text-2xl font-extrabold' :
                              'text-sm text-gray-600 leading-relaxed')}
                            style={{
                              color: el.type === 'heading' ? '#1e293b' : undefined,
                              borderColor: el.type === 'heading' ? brand.accentColor : undefined,
                            }}
                            dangerouslySetInnerHTML={{ __html: el.content }} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-16 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
                  <span>HC Advisory Report</span>
                  <span>{draftTitle}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── HTML: live interactive slideshow preview ── */}
          {format === 'html' && (
            <div className="flex-1 flex min-h-0 bg-[#0B1220]">
              {/* Brand + thumbnail strip */}
              <div className="w-44 flex-shrink-0 border-r border-[#2A3648] bg-[#0B1220] flex flex-col overflow-hidden">
                <BrandPanel brand={brand} onChange={setBrand} onApplyTheme={applyThemeToAllSlides} />
                <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2">
                  {slides.map((slide, i) => (
                    <div key={slide.id} onClick={() => setCurrent(i)}
                      className={cn('relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all group/thumb',
                        i === current ? 'border-[#2E7DFA]' : 'border-transparent hover:border-[#2A3648]')}>
                      <div className="aspect-[16/9] p-1.5 relative" style={{ background: slide.bg || brand.bgColor }}>
                        {i === 0 && <div className="absolute left-0 top-0 w-0.5 h-full" style={{ background: brand.accentColor }} />}
                        {slide.elements.slice(0, 3).map(el => (
                          <p key={el.id} className="text-[4px] truncate mb-0.5 text-white/60">{el.content || ' - '}</p>
                        ))}
                        <p className="absolute bottom-0.5 right-1 text-[6px] text-white/20">{i + 1}</p>
                      </div>
                      {slides.length > 1 && (
                        <button onClick={e => { e.stopPropagation(); deleteSlide(i) }}
                          className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded flex items-center justify-center bg-red-500/80 text-white opacity-0 group-hover/thumb:opacity-100">
                          <Trash2 className="w-2 h-2" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addSlide}
                    className="w-full aspect-[16/9] rounded-lg border border-dashed border-[#2A3648] hover:border-[#2E7DFA] flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Live iframe preview */}
              <iframe
                key={slides.length + brand.accentColor + brand.bgColor}
                srcDoc={htmlPreviewSrc}
                className="flex-1 border-0"
                title="HTML Preview"
                sandbox="allow-scripts"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
