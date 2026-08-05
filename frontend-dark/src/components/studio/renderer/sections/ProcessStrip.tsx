import { motion } from 'framer-motion'
import {
  Database, BarChart3, Send, Search, Cpu, Target, CheckCircle2, Rocket,
  Layers, Users, TrendingUp, Zap, type LucideIcon,
} from 'lucide-react'

/**
 * Horizontal process / workflow strip - the "Collect -> Analyze -> Deliver"
 * footer flow from the executive-tracker dashboard. Renders numbered steps with
 * an icon, title and one-line description, separated by chevrons.
 *
 * data: {
 *   eyebrow?: string,        // e.g. "AI Agent in Action"
 *   steps: [{ title, description?, icon? }],
 *   closing?: string,        // e.g. "Decisions accelerated."
 *   narration?: string
 * }
 */

interface Step {
  title: string
  description?: string
  icon?: string
}

export interface ProcessStripData {
  eyebrow?: string
  steps: Step[]
  closing?: string
  narration?: string
}

const ICONS: Record<string, LucideIcon> = {
  collect: Database, database: Database, gather: Database,
  analyze: BarChart3, analyse: BarChart3, chart: BarChart3, insight: TrendingUp,
  deliver: Send, send: Send, share: Send,
  research: Search, search: Search, discover: Search,
  process: Cpu, engine: Cpu, ai: Cpu,
  target: Target, plan: Target,
  validate: CheckCircle2, check: CheckCircle2, review: CheckCircle2,
  launch: Rocket, deploy: Rocket,
  structure: Layers, design: Layers,
  people: Users, team: Users,
  fast: Zap, accelerate: Zap,
}

function iconFor(name: string | undefined, i: number): LucideIcon {
  const key = (name || '').toLowerCase().trim()
  if (key && ICONS[key]) return ICONS[key]
  // Guess from position if no icon given: collect -> analyze -> deliver.
  return [Database, BarChart3, Send, Rocket][i] || Cpu
}

export default function ProcessStrip({ data }: { title?: string; data: ProcessStripData; footnote?: string }) {
  const steps = Array.isArray(data?.steps) ? data.steps.filter(s => s && s.title) : []
  if (steps.length === 0) return null

  return (
    <div className="rounded-2xl border border-[#2A3648] bg-gradient-to-r from-[#0f1522] to-[#1B2431] p-5 sm:p-6">
      {data.eyebrow && (
        <div className="flex items-center gap-2 mb-4">
          <span className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-blue-400" />
          </span>
          <span className="text-sm font-bold text-white">{data.eyebrow}</span>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-stretch gap-2">
        {steps.map((s, i) => {
          const Icon = iconFor(s.icon, i)
          return (
            <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.12, ease: 'easeOut' }}
                className="flex items-start gap-3 flex-1 min-w-0 rounded-xl border border-[#2A3648] bg-[#0B1220] px-3.5 py-3">
                <span className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-blue-400" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">
                    <span className="text-slate-500 mr-1 tabular-nums">{i + 1}.</span>{s.title}
                  </span>
                  {s.description && <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">{s.description}</span>}
                </span>
              </motion.div>
              {i < steps.length - 1 && (
                <span className="hidden md:block text-slate-600 flex-shrink-0 text-lg">&rsaquo;</span>
              )}
            </div>
          )
        })}
      </div>
      {data.closing && (
        <div className="mt-4 text-right">
          <span className="text-sm font-bold text-blue-400">{data.closing}</span>
        </div>
      )}
      {data.narration && <p className="mt-3 text-xs italic text-slate-500">{data.narration}</p>}
    </div>
  )
}
