import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Loader2 } from 'lucide-react'
import './report-paper.css'

// Rich section renderers — used for the canonical layout names the backend emits.
import KpiGrid from './sections/KpiGrid'
import RadarChart from './sections/RadarChart'
import HorizontalBarChart from './sections/HorizontalBarChart'
import ComparisonTable from './sections/ComparisonTable'
import RankedList from './sections/RankedList'
import Heatmap from './sections/Heatmap'
import Timeline from './sections/Timeline'
import Swimlane from './sections/Swimlane'
import NineBoxGrid from './sections/NineBoxGrid'
import RecommendationCards from './sections/RecommendationCards'
import RiskFlagsList from './sections/RiskFlagsList'
import CalloutQuote from './sections/CalloutQuote'
import NarrativeParagraph from './sections/NarrativeParagraph'
import { networkgraph as NetworkGraph } from './sections/NetworkGraph'

// Legacy thin sections, still used as fallbacks for older layout names.
import HeroSection from './sections/HeroSection'
import ProseSection from './sections/ProseSection'
import BulletListSection from './sections/BulletListSection'
import TableSection from './sections/TableSection'
import CalloutSection from './sections/CalloutSection'
import StatBlockSection from './sections/StatBlockSection'
import UnknownSection from './sections/UnknownSection'

export interface StudioOutputSection {
  id: string
  title: string
  layout: string
  data: any
  footnote?: string
}

export interface StudioOutputDocument {
  studio_id: string
  studio_name?: string
  title: string
  subtitle: string
  sections: StudioOutputSection[]
}

function renderLayout(section: StudioOutputSection) {
  const { layout, title, data, footnote } = section
  // SectionShell already renders the numbered section header, so inner components
  // must NOT repeat the title. Pass empty so their own h3 is suppressed.
  const t = ""
  const f = footnote

  switch (layout) {
    // ── KPIs ────────────────────────────────────────────────────────────────
    case 'kpi_grid':
    case 'kpi-grid':
    case 'kpis':
    case 'stat_block':
    case 'stats':
      return <KpiGrid title={t} data={data} footnote={f} />

    // ── Charts ─────────────────────────────────────────────────────────────
    case 'radar_chart':
    case 'radar':
      return <RadarChart title={t} data={data} footnote={f} />

    case 'horizontal_bar_chart':
    case 'bar_chart':
    case 'bar':
      return <HorizontalBarChart title={t} data={data} footnote={f} />

    case 'heatmap':
    case 'maturity_heatmap':
      return <Heatmap title={t} data={data} footnote={f} />

    case 'network_graph':
    case 'network':
      return <NetworkGraph title={t} data={data} footnote={f} />

    // ── Tables / lists ─────────────────────────────────────────────────────
    case 'comparison_table':
    case 'table':
      return <ComparisonTable title={t} data={data} footnote={f} />

    case 'ranked_list':
    case 'ranked':
      return <RankedList title={t} data={data} footnote={f} />

    // ── Timelines ──────────────────────────────────────────────────────────
    case 'timeline':
    case 'roadmap':
      return <Timeline title={t} data={data} footnote={f} />

    case 'swimlane':
    case 'phase_swimlane':
      return <Swimlane title={t} data={data} footnote={f} />

    case 'nine_box':
    case 'nine_box_grid':
      return <NineBoxGrid title={t} data={data} footnote={f} />

    // ── Recommendations / risks ────────────────────────────────────────────
    case 'recommendation_cards':
    case 'recommendations':
    case 'recommendation_grid':
      return <RecommendationCards title={t} data={data} footnote={f} />

    case 'risk_flags_list':
    case 'risk_flags':
    case 'risks':
      return <RiskFlagsList title={t} data={data} footnote={f} />

    // ── Prose ──────────────────────────────────────────────────────────────
    case 'narrative_paragraph':
    case 'narrative':
    case 'prose':
    case 'text':
      return <NarrativeParagraph title={t} data={data} footnote={f} />

    case 'callout_quote':
    case 'quote':
    case 'callout':
    case 'note':
    case 'warning':
      return <CalloutQuote title={t} data={data} footnote={f} />

    // ── Legacy thin layouts ────────────────────────────────────────────────
    case 'hero':
      return <HeroSection title={t} data={data} />
    case 'bullet_list':
    case 'bullets':
    case 'checklist':
      return <BulletListSection data={data} />
    case 'callout_section':
      return <CalloutSection data={data} />
    case 'prose_section':
      return <ProseSection data={data} />
    case 'table_section':
      return <TableSection data={data} />
    case 'stat_block_section':
      return <StatBlockSection data={data} />

    case 'infographic':
    case 'infographics':
    case 'infographic_summary':
      return <InfographicSection title={t} data={data} footnote={f} />

    default:
      return <UnknownSection layout={layout} title={t} data={data} />
  }
}

// Tolerant renderer for model-invented "infographic" sections: renders grouped
// icon/description cards from whatever nested shape arrives, never raw JSON.
function InfographicSection({ title, data, footnote }: { title: string; data: any; footnote?: string }) {
  type Group = { title: string; elements: Array<{ label: string; detail?: string }> }
  const groups: Group[] = []

  const pushElement = (g: Group, el: any) => {
    if (typeof el === 'string') { g.elements.push({ label: el }); return }
    if (el && typeof el === 'object') {
      const label = el.title ?? el.label ?? el.name ?? el.icon ?? el.description ?? ''
      const detail = el.description && el.description !== label ? el.description : (el.value != null ? String(el.value) : undefined)
      if (label) g.elements.push({ label: String(label).replace(/[-_]/g, ' '), detail })
    }
  }

  const content = Array.isArray(data?.content) ? data.content
    : Array.isArray(data?.sections) ? data.sections
    : Array.isArray(data?.items) ? [{ title: '', elements: data.items }]
    : Array.isArray(data?.kpis) ? [{ title: '', elements: data.kpis }]
    : []
  for (const c of content) {
    const g: Group = { title: String(c?.title ?? ''), elements: [] }
    const els = Array.isArray(c?.elements) ? c.elements : Array.isArray(c?.items) ? c.items : (c && typeof c === 'object' && !c.title ? [c] : [])
    for (const el of els) pushElement(g, el)
    if (c && typeof c === 'object' && g.elements.length === 0 && (c.description || c.label || c.name)) pushElement(g, c)
    if (g.elements.length > 0 || g.title) groups.push(g)
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400">This visual summary is included in the exported document.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#1a1e2e] bg-[#131720] p-5 sm:p-6 space-y-5">
      {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">{g.title}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {g.elements.map((el, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-[#1e2433] bg-[#0c0e14] px-3.5 py-3">
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white capitalize">{el.label}</p>
                  {el.detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{el.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {footnote && <p className="text-[11px] text-slate-600">{footnote}</p>}
    </div>
  )
}

interface StudioOutputProps {
  document: StudioOutputDocument
  /** Optional handler: when provided, each section shows a "Regenerate" button. */
  onRegenerateSection?: (sectionId: string, hint: string | null) => Promise<void> | void
}

function extractNarration(data: unknown): string | null {
  if (data && typeof data === 'object' && 'narration' in (data as Record<string, unknown>)) {
    const n = (data as Record<string, unknown>).narration
    if (typeof n === 'string' && n.trim().length > 0) return n.trim()
  }
  return null
}

function SectionShell({
  section,
  index,
  onRegenerate,
}: {
  section: StudioOutputSection
  index: number
  onRegenerate?: (sectionId: string, hint: string | null) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const narration = extractNarration(section.data)

  const handleRegenerate = async () => {
    if (!onRegenerate || busy) return
    const hint = window.prompt(
      'Optional hint to steer this section (leave blank for a plain regenerate):',
      '',
    )
    // If user cancels prompt, hint === null — treat as cancel.
    if (hint === null) return
    try {
      setBusy(true)
      await onRegenerate(section.id, hint.trim() || null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.04, duration: 0.4, ease: 'easeOut' }}
      className="space-y-4 scroll-mt-6"
    >
      {section.title && (
        <div className="flex items-start justify-between gap-3 border-b border-[#1e2433] pb-2.5">
          <div className="flex items-baseline gap-3 min-w-0">
            <span
              className="text-sm font-bold tabular-nums text-blue-400 flex-shrink-0"
              style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h2
              className="text-xl sm:text-2xl font-bold text-white tracking-tight"
              style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
            >
              {section.title.replace(/^\s*\d+[.)]\s*/, '')}
            </h2>
          </div>
          {onRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-[#1e2433] text-slate-400 hover:text-white hover:border-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              title="Regenerate this section with an optional hint"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
              Regenerate
            </button>
          )}
        </div>
      )}
      {renderLayout(section)}
      {narration && (
        <p className="text-xs text-slate-500 italic leading-relaxed pt-1">
          {narration}
        </p>
      )}
      {section.footnote && (
        <div className="text-[11px] text-slate-500 italic leading-relaxed pt-1">
          {section.footnote}
        </div>
      )}
    </motion.section>
  )
}

export default function StudioOutput({ document, onRegenerateSection }: StudioOutputProps) {
  const showRegen =
    !!onRegenerateSection &&
    typeof document.studio_id === 'string' &&
    document.studio_id.startsWith('ai_advisory:')

  const studioLabel = (document.studio_name || String(document.studio_id || '').split(':').pop() || 'Advisory Report')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="report-paper min-h-full font-[Inter]">
      <div className="px-5 sm:px-10 py-10 sm:py-14 max-w-5xl mx-auto space-y-10">
        {/* Cover block */}
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="border-b-2 border-slate-900/90 pb-7"
        >
          <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
            <span className="inline-block w-6 h-[2px] bg-blue-700" />
            {studioLabel}
          </div>
          <h1
            className="mt-4 text-3xl sm:text-[2.6rem] leading-[1.1] font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
          >
            {document.title}
          </h1>
          {document.subtitle && (
            <p className="mt-3 text-base text-slate-600 leading-relaxed max-w-3xl">
              {document.subtitle}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Aivora HC Advisory</span>
            <span>{today}</span>
            <span>{document.sections.length} sections</span>
            <span className="uppercase tracking-wider">Confidential</span>
          </div>
        </motion.header>

        {/* Sections */}
        <div className="space-y-10">
          {document.sections.map((section, i) => (
            <SectionShell
              key={section.id}
              section={section}
              index={i}
              onRegenerate={showRegen ? onRegenerateSection : undefined}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{document.title}</span>
          <span>Generated by Aivora HC · {today}</span>
        </div>
      </div>
    </div>
  )
}
