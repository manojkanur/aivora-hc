/**
 * HiPo Development Studio
 * UI: pixel-accurate match to reference screenshot
 *   - Near-black bg #0c0e14
 *   - Header: logo + step breadcrumb pills + Save & Exit
 *   - Right panel: Aivora AI avatar + typing message
 *   - Form: dark rounded inputs, tiny ALL-CAPS labels, 2-col grid
 *   - 5-step Smart Client Onboarding from Asset-Manager
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Bot, Sparkles, Users, Target,
  TrendingUp, Gauge, Zap, AlertTriangle, Send, Download,
  RefreshCw, Building2, FileText, ChevronDown, CheckCircle2,
  Rocket, ChevronRight, BarChart3, Plus, X, Lightbulb, Brain,
  Edit2, FileDown, Presentation, Check, Pencil,
} from 'lucide-react'
import { aiAPI, skillsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { useWorkspaceStore } from '../store/workspace'
import { useClientProfileStore } from '../store/clientProfile'
import { useConversationInsights } from '../store/conversationInsights'
import type { ConversationInsight } from '../store/conversationInsights'
import type { HcPriority } from '../store/clientProfile'
import jsPDF from 'jspdf'
import PptxGenJS from 'pptxgenjs'

// ─── Design tokens ────────────────────────────────────────────────────────────
const PAGE_BG   = 'bg-[#0c0e14]'
const FIELD_BG  = 'bg-[#131720] border border-[#1e2433]'
const LABEL_CLS = 'block text-[10px] font-semibold tracking-[0.15em] text-slate-400 uppercase mb-2'
const INPUT_CLS = `w-full bg-[#131720] border border-[#1e2433] rounded-xl px-4 py-3.5 text-white text-sm
  placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30
  transition-all`
const SELECT_CLS = INPUT_CLS + ' appearance-none cursor-pointer'
const CHIP_ON   = 'bg-blue-600/20 border-blue-500/60 text-blue-300'
const CHIP_OFF  = 'bg-[#131720] border-[#1e2433] text-slate-400 hover:border-slate-500 hover:text-slate-200'
const BTN_PRIMARY = 'flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-900/30'
const BTN_GHOST   = 'flex items-center gap-2 px-5 py-2.5 text-slate-400 hover:text-white text-sm font-semibold transition-colors'

// ─── Option data ──────────────────────────────────────────────────────────────
const INDUSTRIES = [
  { value: 'oil-gas', label: 'Oil & Gas' },
  { value: 'banking-finance', label: 'Banking & Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'public-sector', label: 'Public Sector' },
  { value: 'retail', label: 'Retail' },
  { value: 'telco', label: 'Telco' },
  { value: 'tech', label: 'Technology' },
  { value: 'mining', label: 'Mining' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'transport-logistics', label: 'Transport & Logistics' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'professional-services', label: 'Professional Services' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'education', label: 'Education' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'other', label: 'Other / Not specified' },
]
const REGIONS = [
  { value: 'gcc', label: 'GCC' },
  { value: 'mena', label: 'MENA (excl. GCC)' },
  { value: 'africa', label: 'Africa' },
  { value: 'europe', label: 'Europe' },
  { value: 'americas', label: 'Americas' },
  { value: 'asia-pacific', label: 'Asia-Pacific' },
  { value: 'global', label: 'Global / Multi-region' },
  { value: 'other', label: 'Other / Not specified' },
]
const ORG_SIZES = [
  { value: 'micro', label: 'Micro (< 50 employees)' },
  { value: 'small', label: 'Small (50–249)' },
  { value: 'mid', label: 'Mid (250–999)' },
  { value: 'large', label: 'Large (1,000–9,999)' },
  { value: 'enterprise', label: 'Enterprise (10,000+)' },
]
const MATURITY_STAGES = [
  { value: 'startup', label: 'Startup' },
  { value: 'growth', label: 'Growth' },
  { value: 'scale', label: 'Scale' },
  { value: 'mature', label: 'Mature' },
  { value: 'restructuring', label: 'Restructuring' },
]
const OPERATING_MODELS = [
  { value: 'single-entity', label: 'Single entity' },
  { value: 'multi-entity', label: 'Multi-entity' },
  { value: 'gcc-shared-services', label: 'GCC / Shared services' },
  { value: 'holding', label: 'Holding company' },
  { value: 'joint-venture', label: 'Joint venture' },
]
const BUSINESS_PRIORITIES = [
  { value: 'growth', label: 'Growth' },
  { value: 'cost-efficiency', label: 'Cost & efficiency' },
  { value: 'resilience', label: 'Resilience' },
  { value: 'esg-sustainability', label: 'ESG & sustainability' },
  { value: 'digital-transformation', label: 'Digital transformation' },
  { value: 'm-and-a', label: 'M&A' },
  { value: 'customer-experience', label: 'Customer experience' },
  { value: 'innovation', label: 'Innovation' },
  { value: 'operational-excellence', label: 'Operational excellence' },
  { value: 'risk-compliance', label: 'Risk & compliance' },
  { value: 'talent-capability', label: 'Talent & capability' },
  { value: 'geographic-expansion', label: 'Geographic expansion' },
]
const HC_PRIORITIES = [
  { value: 'workforce-planning', label: 'Workforce planning' },
  { value: 'leadership-development', label: 'Leadership development' },
  { value: 'succession-planning', label: 'Succession planning' },
  { value: 'employee-experience', label: 'Employee experience' },
  { value: 'rewards-strategy', label: 'Rewards strategy' },
  { value: 'skills-capability', label: 'Skills & capability' },
  { value: 'talent-acquisition', label: 'Talent acquisition' },
  { value: 'performance-management', label: 'Performance management' },
  { value: 'learning-development', label: 'Learning & development' },
  { value: 'nationalization', label: 'Nationalization' },
  { value: 'diversity-inclusion', label: 'Diversity & inclusion' },
  { value: 'organization-design', label: 'Organization design' },
  { value: 'change-management', label: 'Change management' },
  { value: 'hr-operating-model', label: 'HR operating model' },
]
const TRANSFORMATION_ITEMS = [
  { value: 'digital', label: 'Digital' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'operating-model', label: 'Operating model' },
  { value: 'm-and-a-integration', label: 'M&A integration' },
  { value: 'post-merger', label: 'Post-merger' },
  { value: 'cost-optimization', label: 'Cost optimization' },
  { value: 'growth-acceleration', label: 'Growth acceleration' },
  { value: 'esg-transformation', label: 'ESG transformation' },
  { value: 'regulatory-driven', label: 'Regulatory-driven' },
  { value: 'none', label: 'No transformation in scope' },
]
const WORKFORCE_CHALLENGES = [
  { value: 'high-attrition', label: 'High attrition' },
  { value: 'scarcity', label: 'Talent scarcity' },
  { value: 'contractor-heavy', label: 'Contractor-heavy workforce' },
  { value: 'aging-workforce', label: 'Ageing workforce' },
  { value: 'skill-mismatch', label: 'Skill mismatch' },
  { value: 'engagement-decline', label: 'Engagement decline' },
  { value: 'remote-hybrid-strain', label: 'Remote / hybrid strain' },
  { value: 'diversity-gaps', label: 'Diversity gaps' },
  { value: 'productivity-decline', label: 'Productivity decline' },
  { value: 'none', label: 'None of the above' },
]
const TALENT_CHALLENGES = [
  { value: 'hipo-gap', label: 'HiPo gap' },
  { value: 'succession-risk', label: 'Succession risk' },
  { value: 'niche-skills-shortage', label: 'Niche skills shortage' },
  { value: 'leadership-bench-thin', label: 'Leadership bench thin' },
  { value: 'external-hire-dependency', label: 'External hire dependency' },
  { value: 'retention-of-critical-talent', label: 'Retention of critical talent' },
  { value: 'graduate-pipeline', label: 'Graduate pipeline' },
  { value: 'none', label: 'None of the above' },
]
const LEADERSHIP_CHALLENGES = [
  { value: 'succession-risk', label: 'Succession risk' },
  { value: 'limited-bench', label: 'Limited bench' },
  { value: 'leadership-quality', label: 'Leadership quality' },
  { value: 'transition-failures', label: 'Transition failures' },
  { value: 'executive-misalignment', label: 'Executive misalignment' },
  { value: 'leadership-development-gap', label: 'Leadership development gap' },
  { value: 'none', label: 'None of the above' },
]
const EX_REWARD_CHALLENGES = [
  { value: 'engagement-decline', label: 'Engagement decline' },
  { value: 'pay-equity', label: 'Pay equity' },
  { value: 'benefits-competitiveness', label: 'Benefits competitiveness' },
  { value: 'ex-journey-friction', label: 'EX journey friction' },
  { value: 'culture-misalignment', label: 'Culture misalignment' },
  { value: 'wellbeing-concerns', label: 'Wellbeing concerns' },
  { value: 'rewards-cost-pressure', label: 'Rewards cost pressure' },
  { value: 'incentive-misalignment', label: 'Incentive misalignment' },
  { value: 'none', label: 'None of the above' },
]
const NATIONALIZATION_PROGRAMS = [
  { value: 'emiratisation', label: 'Emiratisation (UAE)' },
  { value: 'saudization', label: 'Saudization (KSA)' },
  { value: 'qatarization', label: 'Qatarization (Qatar)' },
  { value: 'omanisation', label: 'Omanisation (Oman)' },
  { value: 'bahrainisation', label: 'Bahrainisation (Bahrain)' },
  { value: 'kuwaitisation', label: 'Kuwaitisation (Kuwait)' },
  { value: 'other', label: 'Other / Not specified' },
]
const RATE_BANDS = [
  { value: '0-10', label: '0–10%' },
  { value: '10-25', label: '10–25%' },
  { value: '25-50', label: '25–50%' },
  { value: '50-75', label: '50–75%' },
  { value: '75-100', label: '75–100%' },
  { value: 'unknown', label: 'Unknown' },
]
const AVAILABLE_DOCS = [
  { value: 'strategy-deck', label: 'Strategy deck' },
  { value: 'org-chart', label: 'Org chart' },
  { value: 'hc-policy', label: 'HC policy' },
  { value: 'engagement-survey', label: 'Engagement survey' },
  { value: 'exit-data', label: 'Exit data' },
  { value: 'comp-bands', label: 'Compensation bands' },
  { value: 'competency-framework', label: 'Competency framework' },
  { value: 'succession-plan', label: 'Succession plan' },
  { value: 'training-catalog', label: 'Training catalog' },
  { value: 'kpi-dashboard', label: 'KPI dashboard' },
  { value: 'previous-assessment', label: 'Previous assessment' },
  { value: 'other', label: 'Other' },
]
const OUTPUT_TYPES = [
  { value: 'exec-deck', label: 'Executive deck' },
  { value: 'board-pack', label: 'Board pack' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'infographic', label: 'Infographic' },
  { value: 'narrative-report', label: 'Narrative report' },
  { value: 'operational-toolkit', label: 'Operational toolkit' },
]
const AUDIENCES = [
  { value: 'board', label: 'Board' },
  { value: 'exec-committee', label: 'Executive committee' },
  { value: 'hr-leadership', label: 'HR leadership' },
  { value: 'line-managers', label: 'Line managers' },
  { value: 'employees', label: 'Employees' },
  { value: 'external', label: 'External' },
]
const CONFIDENTIALITY = [
  { value: 'internal', label: 'Internal' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'strictly-confidential', label: 'Strictly confidential' },
]
const URGENCY = [
  { value: 'exploratory', label: 'Exploratory' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-week', label: 'This week' },
  { value: 'immediate', label: 'Immediate' },
]

const JOURNEY_LIBRARY = [
  { id: 'hipo-development', name: 'HiPo Development', description: 'Identify, develop, and track High-Potential employees through structured calibration and tiered programmes.', modules: ['HiPo Identification', 'Calibration Engine', 'Development Tracks', 'Executive Reporting'], duration: '4–8 weeks', triggers: ['hipo-gap', 'succession-risk', 'leadership-bench-thin', 'leadership-development', 'succession-planning'] },
  { id: 'succession-planning', name: 'Succession Planning', description: 'Identify critical roles and build successor benches with readiness assessments.', modules: ['Critical Role Mapping', 'Successor Bench', 'Readiness Assessment', 'Talent Review Charter'], duration: '4–8 weeks', triggers: ['succession-risk', 'limited-bench', 'succession-planning', 'leadership-development'] },
  { id: 'leadership-development', name: 'Leadership Development', description: 'Design leadership competency models and development programs across tiers.', modules: ['Competency Model', 'Development Pathways', 'Coaching Integration', 'Impact Measurement'], duration: '8+ weeks', triggers: ['leadership-quality', 'leadership-development-gap', 'leadership-development', 'skills-capability'] },
  { id: 'workforce-planning', name: 'Workforce Planning', description: 'Forecast future workforce needs vs supply with scenario modelling.', modules: ['Demand Forecast', 'Supply Analysis', 'Gap Modelling', 'Action Plan'], duration: '2–4 weeks', triggers: ['scarcity', 'aging-workforce', 'skill-mismatch', 'workforce-planning'] },
  { id: 'talent-acquisition', name: 'Talent Acquisition', description: 'End-to-end hiring process — demand planning, sourcing, pipeline, selection.', modules: ['Demand Planning', 'Sourcing Strategy', 'Pipeline Management', 'Selection Design'], duration: '4–8 weeks', triggers: ['external-hire-dependency', 'graduate-pipeline', 'talent-acquisition', 'scarcity'] },
  { id: 'nationalization', name: 'Nationalization Programme', description: 'Design and accelerate your nationalization agenda with target-setting, pipeline and compliance tracking.', modules: ['Target Setting', 'Pipeline Design', 'Compliance Dashboard', 'Engagement Plan'], duration: '4–8 weeks', triggers: ['nationalization'] },
]

const AI_MSGS = [
  "Welcome to Aivora HC. Let's start by establishing your organization's profile. Industry, region, size, and maturity stage help calibrate every model and benchmark to your specific context.",
  "Now let's map your strategic agenda. The business and human-capital priorities you select determine which advisory lenses Aivora applies — and which studios are most relevant for your situation.",
  "Understanding your workforce and talent challenges helps me surface the right risk signals. If nationalization applies to your context, I'll factor programme-specific insights into the advisory outputs.",
  "Evidence and output preferences tell me how to shape deliverables. The stronger the evidence you have available, the higher the advisory confidence score I can report.",
  "Based on everything you've shared, I've ranked the journeys where you'll get the most value first. Each card shows the modules involved, the reasoning, and the estimated timeline.",
]

const STEP_META = [
  { label: 'Organization' },
  { label: 'Priorities' },
  { label: 'Workforce' },
  { label: 'Evidence & Output' },
  { label: 'Recommendations' },
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface WizardData {
  org_name: string; industry: string; sub_sector: string; region: string; country: string
  org_size: string; maturity_stage: string; operating_model: string
  business_priorities: string[]; hc_priorities: string[]; transformation_agenda: string[]; key_pain_points: string[]
  workforce_challenges: string[]; talent_challenges: string[]; leadership_challenges: string[]; ex_reward_challenges: string[]
  nationalization_on: boolean; nationalization_program: string; current_rate_band: string; target_rate_band: string
  available_docs: string[]; evidence_notes: string; output_types: string[]; audiences: string[]
  confidentiality: string; urgency: string
}
interface AdvisoryMsg { role: 'ai' | 'user'; text: string }
interface LivePanel {
  bench_strength: number; pool_size: number
  readiness_now: number; readiness_near: number; readiness_later: number
  risk_high: number; risk_med: number; risk_low: number; maturity_score: number
  priorities: { label: string; level: 'High' | 'Medium' | 'Low' }[]
  recommendations: { text: string; priority: 'High' | 'Medium' }[]
}
const EMPTY: WizardData = {
  org_name: '', industry: '', sub_sector: '', region: '', country: '',
  org_size: '', maturity_stage: '', operating_model: '',
  business_priorities: [], hc_priorities: [], transformation_agenda: [], key_pain_points: [],
  workforce_challenges: [], talent_challenges: [], leadership_challenges: [], ex_reward_challenges: [],
  nationalization_on: false, nationalization_program: '', current_rate_band: '', target_rate_band: '',
  available_docs: [], evidence_notes: '', output_types: [], audiences: [], confidentiality: '', urgency: '',
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function SelectField({ label, value, onChange, options, placeholder, optional }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; placeholder?: string; optional?: boolean
}) {
  return (
    <div>
      <label className={LABEL_CLS}>
        {label}{optional && <span className="text-slate-600 ml-1 normal-case tracking-normal font-normal">(optional)</span>}
      </label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)} className={SELECT_CLS}>
          <option value="" disabled className="bg-[#131720]">{placeholder || 'Select…'}</option>
          {options.map(o => <option key={o.value} value={o.value} className="bg-[#131720]">{o.label}</option>)}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}

function ChipGroup({ label, options, selected, onToggle }: {
  label: string; options: { value: string; label: string }[]
  selected: string[]; onToggle: (v: string) => void
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} type="button" onClick={() => onToggle(o.value)}
            className={`py-1.5 px-3.5 rounded-lg border text-xs font-medium transition-all ${selected.includes(o.value) ? CHIP_ON : CHIP_OFF}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Wizard header (shared across all steps) ──────────────────────────────────
function WizardHeader({ step, onBack, onExit }: { step: number; onBack: () => void; onExit: () => void }) {
  return (
    <header className="flex items-center gap-4 px-8 py-4 border-b border-[#1a1e2e] flex-shrink-0">
      {/* Left: back + logo */}
      <div className="flex items-center gap-3 min-w-[160px]">
        <button onClick={onBack} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Rocket className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">Aivora</p>
            <p className="text-xs text-blue-400 font-medium">HC</p>
          </div>
        </div>
      </div>

      {/* Center: step breadcrumb */}
      <div className="flex-1 flex items-center justify-center gap-1">
        {STEP_META.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
              ${i === step
                ? 'bg-blue-600 text-white'
                : i < step
                  ? 'text-slate-400'
                  : 'text-slate-600'}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0
                ${i === step ? 'bg-white/20 text-white' : i < step ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-600'}`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className={i > step && i !== step ? 'hidden sm:inline' : ''}>{s.label}</span>
            </div>
            {i < STEP_META.length - 1 && (
              <ChevronRight className={`w-3 h-3 flex-shrink-0 ${i < step ? 'text-slate-500' : 'text-slate-700'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Right: save & exit */}
      <button onClick={onExit}
        className="min-w-[60px] text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white text-center leading-tight transition-colors">
        SAVE<br />&amp; EXIT
      </button>
    </header>
  )
}

// ─── AI Guide panel (right column) ───────────────────────────────────────────
function AIPanel({ step }: { step: number }) {
  const [displayed, setDisplayed] = useState('')
  const msg = AI_MSGS[Math.min(step, AI_MSGS.length - 1)]
  useEffect(() => {
    setDisplayed('')
    let i = 0
    const iv = setInterval(() => { setDisplayed(msg.slice(0, i)); i++; if (i > msg.length) clearInterval(iv) }, 16)
    return () => clearInterval(iv)
  }, [step, msg])

  return (
    <div className="w-[340px] flex-shrink-0 pt-10 px-6">
      {/* Avatar row */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">AIVORA AI</p>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Strategic Advisor Active
          </p>
        </div>
      </div>

      {/* Message bubble */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          className="bg-[#131720] border border-[#1e2433] border-l-2 border-l-blue-500 rounded-xl p-4">
          <p className="text-sm text-slate-300 leading-relaxed min-h-[80px]">
            {displayed}
            <span className="inline-block w-[2px] h-3.5 bg-blue-400 ml-0.5 animate-pulse align-middle" />
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Step 1: Organization ─────────────────────────────────────────────────────
function StepOrg({ data, onNext }: { data: WizardData; onNext: (d: Partial<WizardData>) => void }) {
  const [local, setLocal] = useState({
    org_name: data.org_name, industry: data.industry, sub_sector: data.sub_sector,
    region: data.region, country: data.country, org_size: data.org_size,
    maturity_stage: data.maturity_stage, operating_model: data.operating_model,
  })
  // Sync when parent seeds org_name after workspace fetch
  useEffect(() => {
    if (data.org_name && !local.org_name) {
      setLocal(p => ({ ...p, org_name: data.org_name }))
    }
  }, [data.org_name]) // eslint-disable-line
  const set = (k: keyof typeof local) => (v: string) => setLocal(p => ({ ...p, [k]: v }))
  const ok = !!(local.org_name && local.industry && local.region && local.org_size && local.maturity_stage && local.operating_model)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] px-8 py-10">
        <h1 className="text-4xl font-light text-white mb-1">
          Organization <span className="font-bold text-blue-400">Profile</span>
        </h1>
        <p className="text-sm text-slate-400 mb-10">Basic context helps calibrate every model and benchmark to your specific environment.</p>

        <div className="space-y-7">
          {/* Org name */}
          <div>
            <label className={LABEL_CLS}>Organization Name</label>
            <input type="text" value={local.org_name} onChange={e => set('org_name')(e.target.value)}
              className={INPUT_CLS} placeholder="e.g. Apex Energy Group" />
          </div>

          {/* Industry + Sub-sector */}
          <div className="grid grid-cols-2 gap-6">
            <SelectField label="Industry / Sector" value={local.industry} onChange={set('industry')} options={INDUSTRIES} placeholder="Select industry..." />
            <div>
              <label className={LABEL_CLS}>Sub-sector <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
              <input type="text" value={local.sub_sector} onChange={e => set('sub_sector')(e.target.value)}
                className={INPUT_CLS} placeholder="e.g. Upstream exploration" />
            </div>
          </div>

          {/* Region + Country */}
          <div className="grid grid-cols-2 gap-6">
            <SelectField label="Region" value={local.region} onChange={set('region')} options={REGIONS} placeholder="Select region..." />
            <div>
              <label className={LABEL_CLS}>Country <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
              <input type="text" value={local.country} onChange={e => set('country')(e.target.value)}
                className={INPUT_CLS} placeholder="e.g. Saudi Arabia" />
            </div>
          </div>

          {/* Org size + Maturity stage */}
          <div className="grid grid-cols-2 gap-6">
            <SelectField label="Organization Size" value={local.org_size} onChange={set('org_size')} options={ORG_SIZES} placeholder="Select size..." />
            <SelectField label="Maturity Stage" value={local.maturity_stage} onChange={set('maturity_stage')} options={MATURITY_STAGES} placeholder="Select stage..." />
          </div>

          {/* Operating model full-width */}
          <SelectField label="Operating Model" value={local.operating_model} onChange={set('operating_model')} options={OPERATING_MODELS} placeholder="Select operating model..." />
        </div>

        <div className="mt-10 flex justify-end">
          <button onClick={() => ok && onNext(local)} disabled={!ok}
            className={`${BTN_PRIMARY} ${!ok ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Priorities & Pain Points ────────────────────────────────────────
function StepPriorities({ data, onNext, onBack }: { data: WizardData; onNext: (d: Partial<WizardData>) => void; onBack: () => void }) {
  const [local, setLocal] = useState({
    business_priorities: data.business_priorities,
    hc_priorities: data.hc_priorities,
    transformation_agenda: data.transformation_agenda,
    key_pain_points: data.key_pain_points,
  })
  const [painInput, setPainInput] = useState('')
  const ok = local.business_priorities.length > 0 || local.hc_priorities.length > 0

  const toggle = (key: 'business_priorities' | 'hc_priorities' | 'transformation_agenda') => (v: string) =>
    setLocal(p => ({ ...p, [key]: p[key].includes(v) ? p[key].filter(x => x !== v) : [...p[key], v] }))

  const addPain = () => {
    const t = painInput.trim()
    if (!t || local.key_pain_points.length >= 12 || t.length > 200) return
    setLocal(p => ({ ...p, key_pain_points: [...p.key_pain_points, t] }))
    setPainInput('')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] px-8 py-10">
        <h1 className="text-4xl font-light text-white mb-1">
          Priorities & <span className="font-bold text-blue-400">Pain Points</span>
        </h1>
        <p className="text-sm text-slate-400 mb-10">Select all that apply — these drive which advisory lenses and studios are most relevant.</p>

        <div className="space-y-8">
          <ChipGroup label="Business Priorities" options={BUSINESS_PRIORITIES} selected={local.business_priorities} onToggle={toggle('business_priorities')} />
          <ChipGroup label="Human-Capital Priorities" options={HC_PRIORITIES} selected={local.hc_priorities} onToggle={toggle('hc_priorities')} />
          <ChipGroup label="Transformation Agenda" options={TRANSFORMATION_ITEMS} selected={local.transformation_agenda} onToggle={toggle('transformation_agenda')} />

          <div>
            <label className={LABEL_CLS}>Key Pain Points <span className="text-slate-600 normal-case tracking-normal font-normal">({local.key_pain_points.length}/12)</span></label>
            <div className="flex gap-2 mb-3">
              <input type="text" value={painInput} onChange={e => setPainInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPain()} maxLength={200}
                placeholder="Describe a specific pain point and press Enter…"
                className={INPUT_CLS + ' flex-1'} />
              <button onClick={addPain} disabled={!painInput.trim() || local.key_pain_points.length >= 12}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition-all flex-shrink-0 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {local.key_pain_points.length > 0 && (
              <div className="space-y-2">
                {local.key_pain_points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 bg-[#131720] border border-[#1e2433] rounded-xl">
                    <span className="text-[10px] font-bold text-slate-600 mt-0.5 w-4 flex-shrink-0">{i + 1}</span>
                    <span className="text-sm text-slate-300 flex-1 leading-snug">{pt}</span>
                    <button onClick={() => setLocal(p => ({ ...p, key_pain_points: p.key_pain_points.filter((_, idx) => idx !== i) }))}
                      className="p-1 hover:bg-white/5 rounded-lg text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <button onClick={onBack} className={BTN_GHOST}><ArrowLeft className="w-4 h-4" /> Back</button>
          <button onClick={() => ok && onNext(local)} disabled={!ok}
            className={`${BTN_PRIMARY} ${!ok ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Workforce & Nationalization ─────────────────────────────────────
function StepWorkforce({ data, onNext, onBack }: { data: WizardData; onNext: (d: Partial<WizardData>) => void; onBack: () => void }) {
  const [local, setLocal] = useState({
    workforce_challenges: data.workforce_challenges,
    talent_challenges: data.talent_challenges,
    leadership_challenges: data.leadership_challenges,
    ex_reward_challenges: data.ex_reward_challenges,
    nationalization_on: data.nationalization_on,
    nationalization_program: data.nationalization_program,
    current_rate_band: data.current_rate_band,
    target_rate_band: data.target_rate_band,
  })
  const ok = local.workforce_challenges.length > 0 || local.talent_challenges.length > 0 || local.leadership_challenges.length > 0

  const toggle = (key: 'workforce_challenges' | 'talent_challenges' | 'leadership_challenges' | 'ex_reward_challenges') => (v: string) =>
    setLocal(p => ({ ...p, [key]: p[key].includes(v) ? p[key].filter(x => x !== v) : [...p[key], v] }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] px-8 py-10">
        <h1 className="text-4xl font-light text-white mb-1">
          Workforce & <span className="font-bold text-blue-400">Nationalization</span>
        </h1>
        <p className="text-sm text-slate-400 mb-10">Select every challenge that applies — this surfaces the right risk signals in your advisory outputs.</p>

        <div className="space-y-8">
          <ChipGroup label="Workforce Challenges" options={WORKFORCE_CHALLENGES} selected={local.workforce_challenges} onToggle={toggle('workforce_challenges')} />
          <ChipGroup label="Talent Challenges" options={TALENT_CHALLENGES} selected={local.talent_challenges} onToggle={toggle('talent_challenges')} />
          <ChipGroup label="Leadership Challenges" options={LEADERSHIP_CHALLENGES} selected={local.leadership_challenges} onToggle={toggle('leadership_challenges')} />
          <ChipGroup label="Employee Experience & Rewards Challenges" options={EX_REWARD_CHALLENGES} selected={local.ex_reward_challenges} onToggle={toggle('ex_reward_challenges')} />

          {/* Nationalization toggle */}
          <div className="bg-[#131720] border border-[#1e2433] rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Nationalization Programme</p>
                <p className="text-xs text-slate-500 mt-0.5">Is a nationalization or localisation mandate applicable?</p>
              </div>
              <button type="button" onClick={() => setLocal(p => ({ ...p, nationalization_on: !p.nationalization_on }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${local.nationalization_on ? 'bg-blue-600' : 'bg-slate-700'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${local.nationalization_on ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <AnimatePresence>
              {local.nationalization_on && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-5 space-y-4">
                    <SelectField label="Programme" value={local.nationalization_program}
                      onChange={v => setLocal(p => ({ ...p, nationalization_program: v }))}
                      options={NATIONALIZATION_PROGRAMS} placeholder="Select programme…" />
                    <div className="grid grid-cols-2 gap-4">
                      <SelectField label="Current Rate Band" value={local.current_rate_band}
                        onChange={v => setLocal(p => ({ ...p, current_rate_band: v }))}
                        options={RATE_BANDS} placeholder="Current rate…" />
                      <SelectField label="Target Rate Band" value={local.target_rate_band}
                        onChange={v => setLocal(p => ({ ...p, target_rate_band: v }))}
                        options={RATE_BANDS} placeholder="Target rate…" />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <button onClick={onBack} className={BTN_GHOST}><ArrowLeft className="w-4 h-4" /> Back</button>
          <button onClick={() => ok && onNext(local)} disabled={!ok}
            className={`${BTN_PRIMARY} ${!ok ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Evidence & Output ────────────────────────────────────────────────
function StepEvidence({ data, onNext, onBack }: { data: WizardData; onNext: (d: Partial<WizardData>) => void; onBack: () => void }) {
  const [local, setLocal] = useState({
    available_docs: data.available_docs, evidence_notes: data.evidence_notes,
    output_types: data.output_types, audiences: data.audiences,
    confidentiality: data.confidentiality, urgency: data.urgency,
  })
  const ok = !!(local.output_types.length > 0 && local.audiences.length > 0 && local.confidentiality && local.urgency)
  const toggle = (key: 'available_docs' | 'output_types' | 'audiences') => (v: string) =>
    setLocal(p => ({ ...p, [key]: p[key].includes(v) ? p[key].filter(x => x !== v) : [...p[key], v] }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] px-8 py-10">
        <h1 className="text-4xl font-light text-white mb-1">
          Evidence & <span className="font-bold text-blue-400">Output Preferences</span>
        </h1>
        <p className="text-sm text-slate-400 mb-10">Tell me what evidence you have and how you need deliverables shaped.</p>

        <div className="space-y-8">
          <ChipGroup label="Available Evidence" options={AVAILABLE_DOCS} selected={local.available_docs} onToggle={toggle('available_docs')} />
          <div>
            <label className={LABEL_CLS}>Notes about Evidence <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
            <textarea value={local.evidence_notes} onChange={e => setLocal(p => ({ ...p, evidence_notes: e.target.value }))}
              maxLength={1000} rows={3} placeholder="Any context about availability, access constraints, or gaps…"
              className={INPUT_CLS + ' resize-none'} />
            <p className="text-[10px] text-slate-600 text-right mt-1">{local.evidence_notes.length}/1000</p>
          </div>
          <ChipGroup label="Preferred Output Formats" options={OUTPUT_TYPES} selected={local.output_types} onToggle={toggle('output_types')} />
          <ChipGroup label="Primary Audience" options={AUDIENCES} selected={local.audiences} onToggle={toggle('audiences')} />
          <div className="grid grid-cols-2 gap-6">
            <SelectField label="Confidentiality" value={local.confidentiality}
              onChange={v => setLocal(p => ({ ...p, confidentiality: v }))} options={CONFIDENTIALITY} placeholder="Select level…" />
            <SelectField label="Urgency" value={local.urgency}
              onChange={v => setLocal(p => ({ ...p, urgency: v }))} options={URGENCY} placeholder="Select urgency…" />
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <button onClick={onBack} className={BTN_GHOST}><ArrowLeft className="w-4 h-4" /> Back</button>
          <button onClick={() => ok && onNext(local)} disabled={!ok}
            className={`${BTN_PRIMARY} ${!ok ? 'opacity-40 cursor-not-allowed' : ''}`}>
            Generate Advisory <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 5: Recommendations ──────────────────────────────────────────────────
function StepRecommendations({ data, onLaunch }: { data: WizardData; onLaunch: () => void }) {
  const allTriggers = [...data.hc_priorities, ...data.talent_challenges, ...data.leadership_challenges, ...data.workforce_challenges, ...(data.nationalization_on ? ['nationalization'] : [])]
  const scored = JOURNEY_LIBRARY.map(j => ({ ...j, score: j.triggers.filter(t => allTriggers.includes(t)).length })).sort((a, b) => b.score - a.score)
  const primary = scored.find(j => j.score > 0) ?? scored[0]
  const complementary = scored.filter(j => j.id !== primary.id && j.score > 0).slice(0, 4)

  const completeness = [data.industry, data.region, data.org_size, data.maturity_stage, data.operating_model,
    data.business_priorities.length > 0, data.hc_priorities.length > 0,
    data.workforce_challenges.length > 0 || data.talent_challenges.length > 0,
    data.output_types.length > 0, data.audiences.length > 0].filter(Boolean).length
  const pct = Math.round((completeness / 10) * 100)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] px-8 py-10">
        <h1 className="text-4xl font-light text-white mb-1">
          Recommended <span className="font-bold text-blue-400">Journeys</span>
        </h1>
        <p className="text-sm text-slate-400 mb-8">Based on what you've shared, here's where you'll get the most value first.</p>

        {/* Readiness strip */}
        <div className="flex items-center gap-4 p-4 bg-[#131720] border border-[#1e2433] rounded-xl mb-7">
          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-semibold text-white">Profile Readiness</span>
              <span className={`text-xs font-bold ${pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full">
              <div className={`h-1.5 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {data.urgency && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full">
              {URGENCY.find(u => u.value === data.urgency)?.label}
            </span>
          )}
        </div>

        {/* Primary */}
        <div className="mb-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Primary Recommendation
          </p>
          <div className="bg-blue-600/10 border border-blue-500/25 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-xl font-bold text-white">{primary.name}</h3>
                <p className="text-sm text-slate-400 mt-1 max-w-lg">{primary.description}</p>
              </div>
              <span className="text-[10px] px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded-full font-bold ml-4 flex-shrink-0">{primary.duration}</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {primary.modules.map(m => (
                <span key={m} className="text-[10px] px-2.5 py-1 bg-white/5 border border-white/10 text-slate-300 rounded-lg font-medium">{m}</span>
              ))}
            </div>
            <button onClick={onLaunch} className={BTN_PRIMARY}>
              Launch {primary.name} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {complementary.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
              <CheckCircle2 className="w-3.5 h-3.5" /> Complementary Journeys
            </p>
            <div className="grid grid-cols-2 gap-4">
              {complementary.map(j => (
                <div key={j.id} className="bg-[#131720] border border-[#1e2433] rounded-xl p-4 hover:border-slate-600 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">{j.name}</h4>
                    <span className="text-[9px] px-2 py-1 bg-white/5 border border-white/10 text-slate-500 rounded-full font-medium ml-2 flex-shrink-0">{j.duration}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{j.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <p className="text-[11px] text-amber-400/80 leading-relaxed">
            <span className="font-bold">Advisory notice:</span> These recommendations are AI-generated based on the inputs provided. Validate all recommendations with your data and expert judgment before implementation.
          </p>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <span />
          <button onClick={onLaunch} className={BTN_PRIMARY}>
            Generate Advisory Dashboard <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Generating ───────────────────────────────────────────────────────────────
function GeneratingScreen({ orgName }: { orgName: string }) {
  return (
    <div className={`min-h-screen ${PAGE_BG} flex items-center justify-center`}>
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 border-t-2 border-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-2 border-r-2 border-blue-400/60 rounded-full animate-[spin_1.5s_linear_reverse_infinite]" />
          <div className="absolute inset-4 border-b-2 border-blue-300/40 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-bold text-blue-400 text-lg">AI</span>
          </div>
        </div>
        <h2 className="text-2xl font-light text-white mb-2">Synthesizing Context…</h2>
        <p className="text-sm text-slate-400 mb-8">Building your advisory for <span className="text-blue-400 font-semibold">{orgName || 'your organization'}</span></p>
        <div className="space-y-2 inline-block text-left">
          {['Calibrating bench-strength engine', 'Mapping tier breakdown', 'Scoring retention risks', 'Drafting strategic priorities', 'Preparing live outputs'].map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.4 }}
              className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />{s}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard chart helpers ──────────────────────────────────────────────────
function DonutChart({ high, med, low }: { high: number; med: number; low: number }) {
  const r = 28, cx = 36, cy = 36, circ = 2 * Math.PI * r
  const hLen = (high / 100) * circ, mLen = (med / 100) * circ, lLen = (low / 100) * circ
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0f172a" strokeWidth="10" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth="10" strokeDasharray={`${hLen} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth="10" strokeDasharray={`${mLen} ${circ}`} strokeDashoffset={-hLen} transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth="10" strokeDasharray={`${lLen} ${circ}`} strokeDashoffset={-(hLen + mLen)} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">Total</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#64748b" fontSize="7">Risk</text>
    </svg>
  )
}
function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  const max = Math.max(...vals), min = Math.min(...vals), range = max - min || 1
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 80},${18 - ((v - min) / range) * 14}`).join(' ')
  return <svg width="80" height="20" viewBox="0 0 80 20"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function HeatCell({ label, val }: { label: string; val: 'High' | 'Medium' | 'Low' }) {
  const bg = { High: 'bg-red-500/70', Medium: 'bg-amber-500/60', Low: 'bg-green-500/60' }[val]
  return <div className={`${bg} rounded p-1.5 flex items-center justify-center`}><span className="text-[9px] font-bold text-white text-center leading-tight">{label}</span></div>
}

// ─── Learning Journey Panel ───────────────────────────────────────────────────
function LearningJourneyPanel({
  sessionInsights, newInsightIds, showInsights, setShowInsights,
  onApply, onRemove, onApplyAll, sessionId, msgCount,
}: {
  sessionInsights: import('../store/conversationInsights').ConversationInsight[]
  newInsightIds: Set<string>
  showInsights: boolean
  setShowInsights: (v: boolean | ((p: boolean) => boolean)) => void
  onApply: (ins: import('../store/conversationInsights').ConversationInsight) => void
  onRemove: (id: string) => void
  onApplyAll: () => void
  sessionId: string
  msgCount: number
}) {
  const allInsights = useConversationInsights(s => s.insights ?? [])
  const crossSession = allInsights.filter(i => i.sessionId !== sessionId)
  const unapplied = sessionInsights.filter(i => !i.applied && (i.type === 'pain_point' || i.type === 'priority'))
  const totalKnown = allInsights.length

  // Journey stage: Exploring → Profiling → Advising → Optimising
  const stage = msgCount === 0 ? 0 : msgCount < 3 ? 1 : msgCount < 7 ? 2 : 3
  const stages = [
    { label: 'Exploring',  icon: '◎', desc: 'Getting context' },
    { label: 'Profiling',  icon: '◉', desc: 'Building profile' },
    { label: 'Advising',   icon: '●', desc: 'Active advisory' },
    { label: 'Optimising', icon: '★', desc: 'Deep learning' },
  ]

  const typeConfig: Record<string, { label: string; dot: string; badge: string }> = {
    pain_point: { label: 'Pain Point',  dot: 'bg-red-500',     badge: 'text-red-300 bg-red-500/10 border-red-500/25' },
    goal:       { label: 'Goal',        dot: 'bg-emerald-500', badge: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
    priority:   { label: 'Priority',    dot: 'bg-blue-500',    badge: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    risk:       { label: 'Risk Signal', dot: 'bg-amber-500',   badge: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    context:    { label: 'Context',     dot: 'bg-slate-500',   badge: 'text-slate-300 bg-slate-500/10 border-slate-500/25' },
    challenge:  { label: 'Challenge',   dot: 'bg-orange-500',  badge: 'text-orange-300 bg-orange-500/10 border-orange-500/25' },
    preference: { label: 'Preference',  dot: 'bg-violet-500',  badge: 'text-violet-300 bg-violet-500/10 border-violet-500/25' },
  }

  // Group session insights by type
  const grouped = sessionInsights.reduce<Record<string, typeof sessionInsights>>((acc, ins) => {
    if (!acc[ins.type]) acc[ins.type] = []
    acc[ins.type].push(ins)
    return acc
  }, {})

  return (
    <div className="bg-[#131720] border border-[#1e2433] rounded-xl overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Learning Journey</span>
          </div>
          <div className="flex items-center gap-1.5">
            {totalKnown > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 font-bold">
                {totalKnown} known
              </span>
            )}
            <button type="button" onClick={() => setShowInsights(v => !v)}
              className="text-slate-600 hover:text-slate-300 transition-colors">
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showInsights ? '' : '-rotate-90'}`} />
            </button>
          </div>
        </div>

        {/* Journey stage track */}
        <div className="flex items-center gap-0 mb-1">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center flex-1 last:flex-none">
              <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 transition-all duration-500 ${i <= stage ? 'opacity-100' : 'opacity-30'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border-2 transition-all ${
                  i < stage ? 'bg-violet-600 border-violet-500 text-white' :
                  i === stage ? 'bg-violet-500/20 border-violet-400 text-violet-300 ring-2 ring-violet-400/30' :
                  'bg-[#0c0e14] border-[#1e2433] text-slate-700'
                }`}>
                  {i < stage ? '✓' : i + 1}
                </div>
                <span className={`text-[7px] font-bold leading-none ${i === stage ? 'text-violet-400' : i < stage ? 'text-slate-500' : 'text-slate-700'}`}>
                  {s.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded transition-all duration-700 ${i < stage ? 'bg-violet-500' : 'bg-[#1e2433]'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-[8px] text-slate-600 text-center">
          {stages[stage].desc} · {msgCount} message{msgCount !== 1 ? 's' : ''} · {sessionInsights.length} insight{sessionInsights.length !== 1 ? 's' : ''} this session
        </p>
      </div>

      {/* Agent evolution bar */}
      {totalKnown > 0 && (
        <div className="mx-3 mb-2 px-3 py-2 bg-[#0c0e14] rounded-lg border border-violet-500/15">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[8px] text-slate-500 font-semibold">Agent Knowledge</span>
            <span className="text-[8px] text-violet-400 font-bold">{Math.min(100, totalKnown * 8)}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#1e2433] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, totalKnown * 8)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-violet-600 to-blue-500 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[7px] text-slate-600">{sessionInsights.length} this session</span>
            {crossSession.length > 0 && (
              <span className="text-[7px] text-violet-500">+{crossSession.length} from past sessions</span>
            )}
          </div>
        </div>
      )}

      {/* Apply All banner */}
      <AnimatePresence>
        {unapplied.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mx-3 mb-2">
            <button type="button" onClick={onApplyAll}
              className="w-full flex items-center justify-between px-3 py-2 bg-violet-500/10 border border-violet-500/30 rounded-lg hover:bg-violet-500/20 transition-all group">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3 h-3 text-violet-400" />
                <span className="text-[9px] text-violet-300 font-semibold">Update Agent Profile</span>
              </div>
              <span className="text-[8px] px-1.5 py-0.5 bg-violet-500/25 text-violet-300 rounded-full font-bold">
                {unapplied.length} pending
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights list */}
      <AnimatePresence>
        {showInsights && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3">
              {sessionInsights.length === 0 ? (
                <div className="text-center py-4">
                  <Brain className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                  <p className="text-[9px] text-slate-600 leading-relaxed">
                    Start chatting — the agent learns<br />from every message you send
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(grouped).map(([type, items]) => {
                    const cfg = typeConfig[type] ?? typeConfig.context
                    return (
                      <div key={type}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600">{cfg.label}s</span>
                          <span className="text-[8px] text-slate-700">({items.length})</span>
                        </div>
                        <div className="space-y-1.5 pl-3">
                          {items.map(ins => (
                            <motion.div key={ins.id}
                              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                              className={`rounded-lg p-2 border transition-all ${
                                newInsightIds.has(ins.id)
                                  ? 'border-violet-500/50 bg-violet-500/8'
                                  : ins.applied
                                  ? 'border-emerald-500/20 bg-emerald-500/5'
                                  : 'border-[#1e2433] bg-[#0c0e14]'
                              }`}>
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-[9px] text-slate-300 leading-snug flex-1">{ins.value}</p>
                                <button type="button" onClick={() => onRemove(ins.id)}
                                  className="text-slate-800 hover:text-slate-500 transition-colors flex-shrink-0 mt-0.5">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <div className="flex items-center gap-1">
                                  <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${
                                    ins.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/10' :
                                    ins.confidence === 'medium' ? 'text-amber-400 bg-amber-500/10' :
                                    'text-slate-500 bg-slate-500/10'
                                  }`}>{ins.confidence}</span>
                                  <span className="text-[7px] text-slate-700">
                                    {new Date(ins.learnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                {ins.applied ? (
                                  <span className="flex items-center gap-1 text-[7px] text-emerald-500 font-semibold">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Applied
                                  </span>
                                ) : (ins.type === 'pain_point' || ins.type === 'priority') ? (
                                  <button type="button" onClick={() => onApply(ins)}
                                    className="flex items-center gap-1 text-[7px] text-violet-400 hover:text-violet-200 font-semibold transition-colors">
                                    <Lightbulb className="w-2.5 h-2.5" /> Apply
                                  </button>
                                ) : null}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Cross-session memory summary */}
                  {crossSession.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1e2433]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                        <span className="text-[8px] font-bold uppercase tracking-widest text-slate-700">Past Sessions</span>
                      </div>
                      <div className="px-2 py-1.5 bg-[#0c0e14] rounded-lg border border-[#1a1e2e]">
                        <p className="text-[8px] text-slate-600 leading-relaxed">
                          {crossSession.length} insight{crossSession.length !== 1 ? 's' : ''} carried over from {[...new Set(crossSession.map(i => i.sessionId))].length} previous session{[...new Set(crossSession.map(i => i.sessionId))].length !== 1 ? 's' : ''}.
                          The agent remembers your priorities and pain points.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Live Dashboard ───────────────────────────────────────────────────────────
function LiveDashboard({ data, live, floatingChat }: { data: WizardData; live: LivePanel; floatingChat?: boolean }) {
  const orgLabel   = INDUSTRIES.find(i => i.value === data.industry)?.label ?? data.industry
  const sizeLabel  = ORG_SIZES.find(s => s.value === data.org_size)?.label?.split(' ')[0] ?? '—'
  const matLabel   = MATURITY_STAGES.find(m => m.value === data.maturity_stage)?.label ?? '—'

  const { profile: clientProfile, save: saveProfile } = useClientProfileStore()
  const { addInsight, getInsightsForSession, markApplied, removeInsight, upsertSession } = useConversationInsights()
  const [sessionId] = useState(() => `sess_${Date.now()}`)

  useEffect(() => {
    upsertSession({ id: sessionId, startedAt: new Date().toISOString(), messageCount: 0 })
  }, []) // eslint-disable-line

  const sessionInsights = useConversationInsights(s => (s.insights ?? []).filter(i => i.sessionId === sessionId))

  const initMsg = `Welcome to AIVORA HC. Your ${data.org_name || 'organization'} profile in ${orgLabel} shows ${live.priorities.filter(p => p.level === 'High').length} high-priority HC areas. Bench strength is ${live.bench_strength}/100. ${live.risk_high > 30 ? `⚠️ ${live.risk_high}% of your talent pool is at high retention risk — that's the first thing I'd address.` : 'Retention risk is manageable.'} Where would you like to start — succession, workforce risk, or benchmarking?`

  const [msgs, setMsgs] = useState<AdvisoryMsg[]>([{ role: 'ai', text: initMsg }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [showAllPriorities, setShowAllPriorities] = useState(false)
  const [expandedDeliverable, setExpandedDeliverable] = useState<number | null>(null)
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftTab, setLeftTab] = useState<'org' | 'learning'>('org')
  const [showInsights, setShowInsights] = useState(true)
  const [newInsightIds, setNewInsightIds] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [editNotes, setEditNotes] = useState(data.evidence_notes)
  const [editRecs, setEditRecs] = useState(live.recommendations.map(r => r.text))
  const [showExportModal, setShowExportModal] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'ppt' | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // ── Shared export helpers ───────────────────────────────────────────────────
  const _recs   = editRecs.filter(r => r.trim()).length > 0 ? editRecs.filter(r => r.trim()) : live.recommendations.map(r => r.text)
  const _prios  = data.hc_priorities.map(v => HC_PRIORITIES.find(h => h.value === v)?.label ?? v)
  const _bprios = data.business_priorities.map(v => BUSINESS_PRIORITIES.find(b => b.value === v)?.label ?? v)
  const _matDims = [
    { label: 'Strategy',  val: live.maturity_score >= 60 ? 'Strong' : 'Developing',  pct: live.maturity_score >= 60 ? 72 : 44 },
    { label: 'Processes', val: live.bench_strength > 50 ? 'Moderate' : 'Early',      pct: live.bench_strength > 50 ? 58 : 32 },
    { label: 'People',    val: live.risk_low > 40 ? 'Moderate' : 'At Risk',          pct: live.risk_low > 40 ? 55 : 38 },
    { label: 'Data',      val: data.maturity_stage === 'mature' ? 'Advanced' : data.maturity_stage === 'scale' ? 'Moderate' : 'Basic', pct: data.maturity_stage === 'mature' ? 75 : data.maturity_stage === 'scale' ? 52 : 30 },
    { label: 'Tech',      val: data.maturity_stage === 'mature' ? 'Modern' : 'Legacy', pct: data.maturity_stage === 'mature' ? 68 : 35 },
    { label: 'Governance',val: data.operating_model ? 'Defined' : 'Ad-hoc',          pct: data.operating_model ? 60 : 28 },
  ]

  const exportToPDF = async () => {
    setExporting('pdf')
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210; const M = 18; const IW = W - M * 2
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

      // ── White-theme helpers (reliable across all PDF viewers) ──
      const ink  = (r: number, g: number, b: number) => { doc.setTextColor(r, g, b) }
      const fill = (r: number, g: number, b: number) => { doc.setFillColor(r, g, b) }
      const draw = (r: number, g: number, b: number) => { doc.setDrawColor(r, g, b) }
      // ── Clean white-theme helpers ──────────────────────────────────────────
      const navy: [number,number,number]  = [15, 23, 42]
      const blue: [number,number,number]  = [37, 99, 235]
      const blueL: [number,number,number] = [96, 165, 250]
      const red:   [number,number,number] = [220, 38, 38]
      const amber: [number,number,number] = [217, 119, 6]
      const green: [number,number,number] = [22, 163, 74]
      const violet:[number,number,number] = [109, 40, 217]
      const gray1: [number,number,number] = [248, 249, 251]  // lightest bg
      const gray2: [number,number,number] = [241, 243, 246]  // card bg
      const gray3: [number,number,number] = [226, 232, 240]  // border
      const ink1:  [number,number,number] = [15, 23, 42]     // primary text
      const ink2:  [number,number,number] = [71, 85, 105]    // secondary text
      const ink3:  [number,number,number] = [148, 163, 184]  // muted text

      const secHead = (label: string, y: number, accent?: [number,number,number]) => {
        const ac = accent ?? blue
        fill(...ac); doc.rect(M, y, 3, 8, 'F')
        fill(...gray2); doc.rect(M + 3, y, IW - 3, 8, 'F')
        ink(...ink1); doc.setFontSize(8); doc.setFont('helvetica','bold')
        doc.text(label, M + 7, y + 5.5)
        return y + 12
      }
      const bar = (x: number, y: number, w: number, pct: number, col: [number,number,number]) => {
        draw(...gray3); doc.setLineWidth(0.2)
        fill(...gray2); doc.roundedRect(x, y, w, 3.5, 1, 1, 'FD')
        if (pct > 2) { fill(...col); doc.roundedRect(x, y, Math.max(4, w * pct / 100), 3.5, 1, 1, 'F') }
      }
      const divider = (y: number) => {
        draw(...gray3); doc.setLineWidth(0.3); doc.line(M, y, M + IW, y)
      }
      const kpiCard = (x: number, y: number, w: number, h: number, label: string, value: string, unit: string, col: [number,number,number]) => {
        draw(...gray3); doc.setLineWidth(0.4)
        fill(255,255,255); doc.roundedRect(x, y, w, h, 2, 2, 'FD')
        fill(...col); doc.roundedRect(x, y, w, 1.5, 1, 1, 'F')  // top accent stripe
        ink(...ink3); doc.setFontSize(7); doc.setFont('helvetica','bold')
        doc.text(label, x + 3.5, y + 8)
        ink(...col); doc.setFontSize(18); doc.setFont('helvetica','bold')
        doc.text(value, x + 3.5, y + 18)
        ink(...ink3); doc.setFontSize(7.5); doc.setFont('helvetica','normal')
        doc.text(unit, x + 3.5 + doc.getTextWidth(value) + 1.5, y + 18)
      }

      // ─── PAGE 1 ────────────────────────────────────────────────────────────
      // White background (default), navy top band
      fill(...navy); doc.rect(0, 0, W, 38, 'F')
      fill(...blue); doc.rect(0, 35, W, 2.5, 'F')   // blue rule

      // Logo mark
      fill(255,255,255); doc.roundedRect(M, 8, 9, 9, 1.5, 1.5, 'F')
      ink(...blue); doc.setFontSize(9); doc.setFont('helvetica','bold')
      doc.text('A', M + 2.8, 15)

      // Report title
      ink(255,255,255); doc.setFontSize(17); doc.setFont('helvetica','bold')
      doc.text('Human Capital Advisory Report', M + 13, 15)
      ink(...blueL); doc.setFontSize(8.5); doc.setFont('helvetica','normal')
      doc.text(`${data.org_name || 'Organisation'}  ·  ${orgLabel}  ·  ${matLabel}  ·  ${today}`, M + 13, 22)

      // Badges (right side of header)
      const confText = (CONFIDENTIALITY.find(c => c.value === data.confidentiality)?.label ?? 'Internal').toUpperCase()
      const urgText  = (URGENCY.find(u => u.value === data.urgency)?.label ?? 'This Quarter').toUpperCase()
      const bx = W - M - 68
      fill(255,255,255); doc.roundedRect(bx, 27, 32, 6, 1, 1, 'F')
      ink(...navy); doc.setFontSize(6.5); doc.setFont('helvetica','bold')
      doc.text(confText, bx + 2, 31.5)
      fill(...blue); doc.roundedRect(bx + 35, 27, 32, 6, 1, 1, 'F')
      ink(255,255,255); doc.text(urgText, bx + 37, 31.5)

      // ── KPI CARDS ──────────────────────────────────────────────────────────
      let y = 46
      const cw = (IW - 9) / 4
      const kpiDefs = [
        { l: 'BENCH STRENGTH', v: `${live.bench_strength}`, u: '/ 100', col: live.bench_strength >= 70 ? green : live.bench_strength >= 45 ? amber : red },
        { l: 'RETENTION RISK',  v: `${live.risk_high}%`, u: 'high-risk',  col: red },
        { l: 'HC PRIORITIES',   v: `${data.hc_priorities.length}`,  u: 'active',    col: blue },
        { l: 'READY-NOW',       v: `${live.readiness_now}%`, u: 'succession', col: violet },
      ]
      kpiDefs.forEach((k, i) => { kpiCard(M + i * (cw + 3), y, cw, 26, k.l, k.v, k.u, k.col) })
      y += 31

      // ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────────
      const LW = IW * 0.54; const GAP = 6; const RW = IW - LW - GAP
      const LC = M; const RC = M + LW + GAP
      let ly = y; let ry2 = y

      // LEFT col — Org Profile
      ly = secHead('ORGANIZATION PROFILE', ly)
      const orgRows2 = [
        ['Organisation', data.org_name || '—'],
        ['Industry', orgLabel || '—'],
        ['Region', REGIONS.find(r => r.value === data.region)?.label ?? '—'],
        ['Size', ORG_SIZES.find(s => s.value === data.org_size)?.label ?? '—'],
        ['Maturity Stage', matLabel || '—'],
        ['Operating Model', OPERATING_MODELS.find(m => m.value === data.operating_model)?.label ?? '—'],
      ]
      orgRows2.forEach(([lbl, val], idx) => {
        if (idx % 2 === 0) { fill(...gray1); doc.rect(LC, ly - 1, LW, 8, 'F') }
        ink(...ink2); doc.setFontSize(8); doc.setFont('helvetica','normal')
        doc.text(lbl, LC + 2, ly + 4.5)
        ink(...ink1); doc.setFont('helvetica','bold')
        doc.text(val, LC + LW * 0.5, ly + 4.5)
        ly += 8
      })
      ly += 3

      // LEFT col — Maturity Heatmap
      ly = secHead('HC MATURITY HEATMAP', ly)
      _matDims.forEach((d, i) => {
        const pctCol: [number,number,number] = d.pct >= 65 ? green : d.pct >= 45 ? amber : red
        if (i % 2 === 0 && i > 0) { /* nothing */ }
        fill(255,255,255); draw(...gray3); doc.setLineWidth(0.3)
        doc.roundedRect(LC, ly, LW, 10, 1, 1, 'FD')
        fill(...pctCol); doc.roundedRect(LC, ly, 2.5, 10, 0.5, 0.5, 'F')
        ink(...ink1); doc.setFontSize(8.5); doc.setFont('helvetica','bold')
        doc.text(d.label, LC + 5, ly + 4.5)
        ink(...ink2); doc.setFontSize(7.5); doc.setFont('helvetica','normal')
        doc.text(d.val, LC + 5, ly + 8.5)
        // score badge
        ink(...pctCol); doc.setFontSize(9); doc.setFont('helvetica','bold')
        doc.text(`${d.pct}%`, LC + LW - 14, ly + 4.5)
        bar(LC + LW - 14, ly + 6, 11, d.pct, pctCol)
        ly += 12
      })
      ly += 4

      // RIGHT col — Workforce Risk
      ry2 = secHead('WORKFORCE RISK', ry2, red)
      const riskDefs = [
        { l: 'High Risk',   v: live.risk_high, col: red,   desc: 'Immediate action required' },
        { l: 'Medium Risk', v: live.risk_med,  col: amber, desc: 'Monitor & engage proactively' },
        { l: 'Low Risk',    v: live.risk_low,  col: green, desc: 'Maintain and leverage' },
      ]
      riskDefs.forEach(r => {
        fill(255,255,255); draw(...gray3); doc.setLineWidth(0.3)
        doc.roundedRect(RC, ry2, RW, 18, 1.5, 1.5, 'FD')
        fill(...r.col); doc.roundedRect(RC, ry2, 2.5, 18, 0.5, 0.5, 'F')
        ink(...r.col); doc.setFontSize(18); doc.setFont('helvetica','bold')
        doc.text(`${r.v}%`, RC + 5, ry2 + 11)
        ink(...ink1); doc.setFontSize(8.5); doc.setFont('helvetica','bold')
        doc.text(r.l, RC + 5 + doc.getTextWidth(`${r.v}%`) + 3, ry2 + 8)
        ink(...ink2); doc.setFontSize(7); doc.setFont('helvetica','normal')
        doc.text(r.desc, RC + 5 + doc.getTextWidth(`${r.v}%`) + 3, ry2 + 13.5)
        bar(RC + 5, ry2 + 14.5, RW - 10, r.v, r.col)
        ry2 += 21
      })
      ry2 += 4

      // RIGHT col — Leadership Pipeline
      ry2 = secHead('LEADERSHIP PIPELINE', ry2, violet)
      const pipeDefs = [
        { l: 'Ready Now', v: live.readiness_now, col: blue,   note: 'Succession-ready today' },
        { l: '1–2 Years', v: live.readiness_near, col: violet, note: 'Fast-track eligible' },
        { l: '3+ Years',  v: live.readiness_later, col: [71,85,105] as [number,number,number], note: 'Long-term pipeline' },
      ]
      pipeDefs.forEach(r => {
        ink(...r.col); doc.setFontSize(15); doc.setFont('helvetica','bold')
        doc.text(`${r.v}%`, RC, ry2 + 8)
        const nw = doc.getTextWidth(`${r.v}%`) + 3
        ink(...ink1); doc.setFontSize(8.5); doc.setFont('helvetica','bold')
        doc.text(r.l, RC + nw, ry2 + 6)
        ink(...ink2); doc.setFontSize(7); doc.setFont('helvetica','normal')
        doc.text(r.note, RC + nw, ry2 + 11)
        bar(RC, ry2 + 13, RW, r.v, r.col)
        ry2 += 19
        divider(ry2 - 3)
      })

      // ── FULL WIDTH SECTIONS from here ──────────────────────────────────────
      let fy = Math.max(ly, ry2) + 4

      // HC Priorities
      fy = secHead('HC PRIORITIES', fy, blue)
      if (_prios.length === 0) {
        ink(...ink3); doc.setFontSize(8); doc.setFont('helvetica','normal')
        doc.text('No HC priorities selected', M + 2, fy + 5)
        fy += 10
      } else {
        let px = M; let py2 = fy; let maxH = 0
        _prios.forEach(lbl => {
          const pw = doc.getTextWidth(lbl) + 8
          if (px + pw > M + IW) { px = M; py2 += maxH + 3; maxH = 0 }
          draw(...blue); doc.setLineWidth(0.5)
          fill(237, 242, 255); doc.roundedRect(px, py2, pw, 7, 1.5, 1.5, 'FD')
          ink(...blue); doc.setFontSize(7.5); doc.setFont('helvetica','bold')
          doc.text(lbl, px + 4, py2 + 4.8)
          px += pw + 4; maxH = Math.max(maxH, 7)
        })
        fy = py2 + maxH + 6
      }

      // Strategic Priorities
      fy = secHead('STRATEGIC PRIORITIES', fy)
      live.priorities.forEach((p, i) => {
        const lvlCol: Record<string,[number,number,number]> = { High: red, Medium: amber, Low: green }
        const col = lvlCol[p.level] ?? ink3
        if (i % 2 === 0) { fill(...gray1); doc.rect(M, fy - 1, IW, 9, 'F') }
        fill(...col); doc.circle(M + 4, fy + 3.5, 2, 'F')
        ink(...ink1); doc.setFontSize(9); doc.setFont('helvetica','normal')
        doc.text(p.label, M + 9, fy + 5.5)
        ink(...col); doc.setFontSize(8); doc.setFont('helvetica','bold')
        doc.text(p.level.toUpperCase(), M + IW - doc.getTextWidth(p.level.toUpperCase()) - 2, fy + 5.5)
        divider(fy + 8)
        fy += 9
      })
      fy += 4

      // Recommendations
      fy = secHead('RECOMMENDATIONS', fy, violet)
      _recs.forEach((r, i) => {
        if (fy > 260) { doc.addPage(); fy = 20 }
        // number badge
        fill(...blue); doc.roundedRect(M, fy, 7, 7, 1, 1, 'F')
        ink(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold')
        doc.text(`${i + 1}`, M + (i >= 9 ? 1.5 : 2.5), fy + 5.3)
        // text
        ink(...ink1); doc.setFontSize(9); doc.setFont('helvetica','normal')
        const lines = doc.splitTextToSize(r, IW - 12)
        doc.text(lines, M + 10, fy + 5.5)
        if (i < _recs.length - 1) { divider(fy + lines.length * 5 + 5) }
        fy += lines.length * 5 + 8
      })

      // Advisory Notes
      if (editNotes.trim()) {
        fy += 2
        const noteLines = doc.splitTextToSize(editNotes, IW - 12)
        const noteH = noteLines.length * 5 + 14
        fill(237, 242, 255); draw(...blueL); doc.setLineWidth(0.5)
        doc.roundedRect(M, fy, IW, noteH, 2, 2, 'FD')
        fill(...violet); doc.roundedRect(M, fy, 2.5, noteH, 0.5, 0.5, 'F')
        ink(...violet); doc.setFontSize(7.5); doc.setFont('helvetica','bold')
        doc.text('ADVISORY NOTES', M + 6, fy + 7)
        ink(...ink2); doc.setFontSize(8.5); doc.setFont('helvetica','normal')
        doc.text(noteLines, M + 6, fy + 13)
        fy += noteH + 4
      }

      // ── FOOTER ─────────────────────────────────────────────────────────────
      const PH = 297
      fill(...navy); doc.rect(0, PH - 14, W, 14, 'F')
      fill(...blue); doc.rect(0, PH - 14, W, 1.5, 'F')
      ink(255,255,255); doc.setFontSize(7.5); doc.setFont('helvetica','normal')
      doc.text('Generated by Aivora HC  ·  AI-Powered Human Capital Advisory  ·  Confidential', M, PH - 6)
      ink(...blueL); doc.text(today, W - M, PH - 6, { align: 'right' })

      doc.save(`${data.org_name || 'Aivora-HC'}_Advisory_Report.pdf`)
      toast.success('PDF downloaded')
    } catch (e) {
      console.error(e)
      toast.error('PDF export failed')
    } finally {
      setExporting(null)
    }
  }

  const exportToPPT = async () => {
    setExporting('ppt')
    try {
      const prs = new PptxGenJS()
      prs.layout = 'LAYOUT_WIDE'  // 13.33" × 7.5"
      prs.title = `${data.org_name || 'Aivora HC'} — Human Capital Advisory`

      // Design tokens (PptxGenJS uses hex without #)
      const C = { dark: '080b11', card: '111827', card2: '1a2035', blue: '3b82f6', blueD: '1d4ed8', blueL: '93c5fd',
        red: 'ef4444', amber: 'f59e0b', green: '22c55e', violet: '6366f1', white: 'ffffff',
        slate4: '94a3b8', slate5: '64748b', slate6: '475569', border: '1e2433' }
      const W = 13.33; const H = 7.5; const today = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })

      // ── slide factory ──
      const mkSlide = (slideNum: number, total: number) => {
        const s = prs.addSlide()
        s.background = { color: C.dark }
        // top bar
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.55, fill: { color: C.card } })
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.04, h: 0.55, fill: { color: C.blue } })
        // logo mark
        s.addShape(prs.ShapeType.roundRect, { x: 0.15, y: 0.09, w: 0.37, h: 0.37, rectRadius: 0.06, fill: { color: C.blue } })
        s.addText('A', { x: 0.15, y: 0.09, w: 0.37, h: 0.37, fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle' })
        s.addText('AIVORA HC', { x: 0.6, y: 0.13, w: 2, h: 0.28, fontSize: 9, bold: true, color: C.white })
        // org name right
        s.addText(data.org_name || 'Advisory Report', { x: W - 3.5, y: 0.13, w: 3.3, h: 0.28, fontSize: 8, color: C.blueL, align: 'right' })
        // slide number
        s.addText(`${slideNum} / ${total}`, { x: W - 0.9, y: H - 0.3, w: 0.75, h: 0.22, fontSize: 7, color: C.slate5, align: 'right' })
        // bottom accent
        s.addShape(prs.ShapeType.rect, { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: C.card } })
        return s
      }
      const sectionTitle = (s: ReturnType<typeof mkSlide>, title: string, sub?: string) => {
        s.addShape(prs.ShapeType.rect, { x: 0.4, y: 0.55, w: 0.05, h: 0.38, fill: { color: C.blue } })
        s.addText(title, { x: 0.55, y: 0.58, w: W - 1.2, h: 0.33, fontSize: 18, bold: true, color: C.white })
        if (sub) s.addText(sub, { x: 0.55, y: 0.9, w: W - 1.2, h: 0.22, fontSize: 9, color: C.slate4 })
      }
      const pBar = (s: ReturnType<typeof mkSlide>, x: number, y: number, w: number, h: number, pct: number, color: string) => {
        s.addShape(prs.ShapeType.roundRect, { x, y, w, h, rectRadius: h/2, fill: { color: C.card2 } })
        if (pct > 0) s.addShape(prs.ShapeType.roundRect, { x, y, w: Math.max(h, w * pct / 100), h, rectRadius: h/2, fill: { color } })
      }

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 1: Cover
      const s1 = prs.addSlide()
      s1.background = { color: C.dark }
      // Full-width navy top band
      s1.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.blue } })
      // Left blue sidebar
      s1.addShape(prs.ShapeType.rect, { x: 0, y: 0.12, w: 3.8, h: H - 0.12, fill: { color: C.blueD } })
      s1.addShape(prs.ShapeType.rect, { x: 3.8, y: 0.12, w: 0.05, h: H - 0.12, fill: { color: C.blue } })
      // Logo on left
      s1.addShape(prs.ShapeType.roundRect, { x: 0.3, y: 0.4, w: 0.55, h: 0.55, rectRadius: 0.1, fill: { color: 'ffffff25' } })
      s1.addText('A', { x: 0.3, y: 0.4, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: C.white, align: 'center', valign: 'middle' })
      s1.addText('AIVORA HC', { x: 1.0, y: 0.5, w: 2.5, h: 0.35, fontSize: 10, bold: true, color: C.white })
      // Left tagline
      s1.addText('Human Capital\nAdvisory Platform', { x: 0.3, y: 2.2, w: 3.2, h: 1.0, fontSize: 16, bold: true, color: C.white })
      s1.addShape(prs.ShapeType.rect, { x: 0.3, y: 3.4, w: 2.2, h: 0.04, fill: { color: 'ffffff50' } })
      s1.addText('AI-Powered  ·  Executive Ready\nStrategic HC Advisory', { x: 0.3, y: 3.55, w: 3.2, h: 0.65, fontSize: 9, color: C.blueL })
      s1.addText(today, { x: 0.3, y: H - 0.55, w: 3.2, h: 0.3, fontSize: 8, color: 'ffffff55' })
      // Right: org name + report title
      s1.addText(data.org_name || 'Advisory Report', { x: 4.15, y: 0.9, w: 8.85, h: 1.15, fontSize: 40, bold: true, color: C.white, wrap: true })
      s1.addText('Human Capital Advisory Report', { x: 4.15, y: 2.1, w: 8.85, h: 0.45, fontSize: 13, color: C.slate4 })
      s1.addShape(prs.ShapeType.rect, { x: 4.15, y: 2.65, w: 8.85, h: 0.03, fill: { color: C.border } })
      // 4 KPI cards — fixed spacing: 4 × 2.1" + 3 × 0.12" gap = 8.76" total
      const snapKpis = [
        { l: 'Bench Strength', v: `${live.bench_strength}`, u: '/100',      c: live.bench_strength>=70?C.green:live.bench_strength>=45?C.amber:C.red },
        { l: 'Retention Risk', v: `${live.risk_high}%`, u: 'high-risk',     c: C.red },
        { l: 'HC Priorities',  v: `${data.hc_priorities.length}`, u: 'active', c: C.blue },
        { l: 'Ready-Now',      v: `${live.readiness_now}%`, u: 'succession', c: C.violet },
      ]
      snapKpis.forEach((k, i) => {
        const sx = 4.15 + i * 2.22
        s1.addShape(prs.ShapeType.roundRect, { x: sx, y: 2.9, w: 2.1, h: 1.5, rectRadius: 0.1, fill: { color: C.card }, line: { color: C.border, pt: 0.8 } })
        s1.addShape(prs.ShapeType.rect, { x: sx, y: 2.9, w: 2.1, h: 0.07, fill: { color: k.c } })
        s1.addText(k.l, { x: sx + 0.12, y: 3.0, w: 1.86, h: 0.3, fontSize: 7.5, color: C.slate4 })
        s1.addText(k.v, { x: sx + 0.12, y: 3.3, w: 1.4, h: 0.65, fontSize: 26, bold: true, color: k.c })
        s1.addText(k.u, { x: sx + 0.12, y: 3.95, w: 1.86, h: 0.3, fontSize: 8, color: C.slate5 })
      })
      s1.addText(`${orgLabel}  ·  ${matLabel}  ·  ${sizeLabel}`, { x: 4.15, y: 4.65, w: 8.85, h: 0.32, fontSize: 9.5, color: C.slate4 })
      const confLabel = CONFIDENTIALITY.find(c=>c.value===data.confidentiality)?.label?.toUpperCase() ?? 'INTERNAL'
      s1.addShape(prs.ShapeType.roundRect, { x: 4.15, y: 5.15, w: 1.4, h: 0.3, rectRadius: 0.06, fill: { color: C.card2 }, line: { color: C.border, pt: 0.5 } })
      s1.addText(confLabel, { x: 4.15, y: 5.15, w: 1.4, h: 0.3, fontSize: 7, bold: true, color: C.slate4, align: 'center', valign: 'middle' })
      s1.addText(`Generated by Aivora HC  ·  ${today}`, { x: 4.15, y: H - 0.48, w: 8.85, h: 0.3, fontSize: 8, color: C.slate5 })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 2: Executive Summary
      const s2 = mkSlide(2, 7)
      sectionTitle(s2, 'Executive Summary', `${data.org_name || 'Organization'}  —  ${orgLabel}  ·  ${matLabel}`)
      const kpis2 = [
        { l: 'Bench Strength', v: `${live.bench_strength}`, u: '/100', c: live.bench_strength>=70?C.green:live.bench_strength>=45?C.amber:C.red, note: live.bench_strength>=70?'Above average':'Below target' },
        { l: 'Retention Risk', v: `${live.risk_high}%`, u: 'high-risk', c: C.red, note: live.risk_high>30?'Elevated — act now':'Manageable level' },
        { l: 'HC Priorities', v: `${data.hc_priorities.length}`, u: 'active', c: C.blue, note: _prios.slice(0,2).join(', ') || 'See priorities slide' },
        { l: 'Ready-Now Pipeline', v: `${live.readiness_now}%`, u: 'succession', c: C.violet, note: live.readiness_now>=20?'On track':'Below 20% target' },
      ]
      kpis2.forEach((k, i) => {
        const x = 0.4 + i * 3.23; const y = 1.35
        s2.addShape(prs.ShapeType.roundRect, { x, y, w: 3.0, h: 2.2, rectRadius: 0.12, fill: { color: C.card }, line: { color: C.border, pt: 0.8 } })
        s2.addShape(prs.ShapeType.rect, { x, y, w: 3.0, h: 0.07, fill: { color: k.c } })
        s2.addText(k.l, { x: x+0.15, y: y+0.18, w: 2.7, h: 0.28, fontSize: 8, color: C.slate4 })
        s2.addText(k.v, { x: x+0.15, y: y+0.5, w: 1.5, h: 0.8, fontSize: 32, bold: true, color: k.c })
        s2.addText(k.u, { x: x+0.15, y: y+1.25, w: 2.7, h: 0.25, fontSize: 8.5, color: C.slate5 })
        s2.addShape(prs.ShapeType.rect, { x: x+0.15, y: y+1.55, w: 2.7, h: 0.01, fill: { color: C.border } })
        s2.addText(k.note, { x: x+0.15, y: y+1.65, w: 2.7, h: 0.28, fontSize: 7.5, color: C.slate4, italic: true })
      })
      // Business priorities strip
      s2.addText('BUSINESS PRIORITIES', { x: 0.4, y: 3.85, w: 6, h: 0.28, fontSize: 7.5, bold: true, color: C.slate5 })
      _bprios.slice(0, 6).forEach((lbl, i) => {
        s2.addShape(prs.ShapeType.roundRect, { x: 0.4 + i * 2.08, y: 4.15, w: 1.95, h: 0.38, rectRadius: 0.06, fill: { color: C.card2 }, line: { color: C.border, pt: 0.5 } })
        s2.addText(lbl, { x: 0.45 + i * 2.08, y: 4.15, w: 1.85, h: 0.38, fontSize: 8, color: C.slate4, align: 'center', valign: 'middle' })
      })
      s2.addText('WORKFORCE CHALLENGES FLAGGED', { x: 0.4, y: 4.75, w: 8, h: 0.28, fontSize: 7.5, bold: true, color: C.slate5 })
      data.workforce_challenges.slice(0,5).forEach((v, i) => {
        const lbl = WORKFORCE_CHALLENGES.find(w=>w.value===v)?.label ?? v
        s2.addShape(prs.ShapeType.roundRect, { x: 0.4 + i * 2.4, y: 5.05, w: 2.25, h: 0.38, rectRadius: 0.06, fill: { color: '3f1515' }, line: { color: C.red+'44', pt: 0.5 } })
        s2.addText(lbl, { x: 0.45 + i * 2.4, y: 5.05, w: 2.15, h: 0.38, fontSize: 7.5, color: 'fca5a5', align: 'center', valign: 'middle' })
      })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 3: HC Priorities & Maturity
      const s3 = mkSlide(3, 7)
      sectionTitle(s3, 'HC Priorities & Maturity', 'Active focus areas and organisational maturity assessment')
      // Left: priorities
      s3.addText('HUMAN CAPITAL PRIORITIES', { x: 0.4, y: 1.28, w: 5.8, h: 0.25, fontSize: 7.5, bold: true, color: C.slate5 })
      _prios.forEach((lbl, i) => {
        const col = i % 2; const row = Math.floor(i / 2)
        const x = 0.4 + col * 3.05; const y = 1.6 + row * 0.65
        s3.addShape(prs.ShapeType.roundRect, { x, y, w: 2.9, h: 0.52, rectRadius: 0.08, fill: { color: C.blueD+'44' }, line: { color: C.blue+'55', pt: 0.6 } })
        s3.addShape(prs.ShapeType.roundRect, { x, y, w: 0.04, h: 0.52, rectRadius: 0.02, fill: { color: C.blue } })
        s3.addText(lbl, { x: x+0.18, y, w: 2.6, h: 0.52, fontSize: 9, bold: true, color: C.white, valign: 'middle' })
      })
      // Right: maturity heatmap
      s3.addShape(prs.ShapeType.rect, { x: 6.5, y: 1.2, w: 0.03, h: 5.5, fill: { color: C.border } })
      s3.addText('MATURITY HEATMAP', { x: 6.7, y: 1.28, w: 6.2, h: 0.25, fontSize: 7.5, bold: true, color: C.slate5 })
      _matDims.forEach((d, i) => {
        const y = 1.65 + i * 0.82
        const pctC = d.pct >= 65 ? C.green : d.pct >= 45 ? C.amber : C.red
        s3.addShape(prs.ShapeType.roundRect, { x: 6.7, y, w: 6.2, h: 0.65, rectRadius: 0.08, fill: { color: C.card } })
        s3.addShape(prs.ShapeType.roundRect, { x: 6.7, y, w: 0.04, h: 0.65, rectRadius: 0.02, fill: { color: pctC } })
        s3.addText(d.label, { x: 6.9, y: y+0.03, w: 1.8, h: 0.3, fontSize: 9, bold: true, color: C.white })
        s3.addText(d.val, { x: 6.9, y: y+0.34, w: 1.8, h: 0.25, fontSize: 7.5, color: C.slate4 })
        pBar(s3, 8.9, y + 0.22, 3.8, 0.2, d.pct, pctC)
        s3.addText(`${d.pct}%`, { x: 12.8, y: y+0.15, w: 0.4, h: 0.3, fontSize: 8.5, bold: true, color: pctC, align: 'right' })
      })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 4: Workforce Risk
      const s4 = mkSlide(4, 7)
      sectionTitle(s4, 'Workforce Risk Analysis', 'Retention risk segmentation and talent pool health')
      const riskD = [
        { l: 'High Risk', v: live.risk_high, c: C.red,   sub: 'Immediate retention action required',  bg: '2d0707' },
        { l: 'Medium Risk', v: live.risk_med, c: C.amber, sub: 'Proactive engagement needed',          bg: '2d1907' },
        { l: 'Low Risk', v: live.risk_low,   c: C.green,  sub: 'Maintain and leverage as anchors',     bg: '052212' },
      ]
      riskD.forEach((r, i) => {
        const y = 1.3 + i * 1.7
        s4.addShape(prs.ShapeType.roundRect, { x: 0.4, y, w: 12.53, h: 1.5, rectRadius: 0.12, fill: { color: r.bg }, line: { color: r.c+'55', pt: 0.8 } })
        s4.addShape(prs.ShapeType.roundRect, { x: 0.4, y, w: 0.06, h: 1.5, rectRadius: 0.03, fill: { color: r.c } })
        s4.addText(`${r.v}%`, { x: 0.6, y: y+0.1, w: 1.8, h: 0.85, fontSize: 40, bold: true, color: r.c })
        s4.addText(r.l, { x: 2.65, y: y+0.2, w: 3.5, h: 0.38, fontSize: 14, bold: true, color: C.white })
        s4.addText(r.sub, { x: 2.65, y: y+0.62, w: 5, h: 0.28, fontSize: 9, color: C.slate4 })
        pBar(s4, 2.65, y+1.0, 9.5, 0.22, r.v, r.c)
        s4.addText(`of talent pool`, { x: 10.5, y: y+0.35, w: 2.2, h: 0.3, fontSize: 8, color: C.slate5, align: 'right' })
      })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 5: Leadership Pipeline
      const s5 = mkSlide(5, 7)
      sectionTitle(s5, 'Leadership Pipeline', 'Succession readiness and bench strength assessment')
      // Bench strength gauge card
      s5.addShape(prs.ShapeType.roundRect, { x: 0.4, y: 1.3, w: 3.5, h: 4.4, rectRadius: 0.15, fill: { color: C.card }, line: { color: C.border, pt: 0.8 } })
      s5.addText('BENCH STRENGTH', { x: 0.55, y: 1.5, w: 3.2, h: 0.3, fontSize: 7.5, bold: true, color: C.slate5, align: 'center' })
      const bsC = live.bench_strength>=70?C.green:live.bench_strength>=45?C.amber:C.red
      s5.addText(`${live.bench_strength}`, { x: 0.55, y: 2.1, w: 3.2, h: 1.4, fontSize: 72, bold: true, color: bsC, align: 'center' })
      s5.addText('/100', { x: 0.55, y: 3.45, w: 3.2, h: 0.4, fontSize: 14, color: C.slate5, align: 'center' })
      pBar(s5, 0.65, 3.95, 3.1, 0.28, live.bench_strength, bsC)
      s5.addText(live.bench_strength>=70?'Above Industry Average':live.bench_strength>=45?'At Industry Average':'Below Industry Average', { x: 0.55, y: 4.35, w: 3.2, h: 0.3, fontSize: 8, color: C.slate4, align: 'center', italic: true })
      s5.addText(`Pool: ${live.pool_size} HiPos`, { x: 0.55, y: 4.75, w: 3.2, h: 0.3, fontSize: 9, bold: true, color: C.white, align: 'center' })
      // Pipeline cohorts
      const pipe5 = [
        { l: 'Ready Now', v: live.readiness_now, c: C.blue,   desc: 'Succession-ready today. Priority: retain & nominate.', target: 20 },
        { l: '1–2 Years', v: live.readiness_near, c: C.violet, desc: 'Highest-ROI acceleration target. Fast-track eligible.',  target: 35 },
        { l: '3+ Years', v: live.readiness_later, c: C.slate6, desc: 'Long-term pipeline. Focus on identification quality.',    target: 45 },
      ]
      pipe5.forEach((r, i) => {
        const y = 1.3 + i * 1.48
        s5.addShape(prs.ShapeType.roundRect, { x: 4.2, y, w: 8.73, h: 1.3, rectRadius: 0.1, fill: { color: C.card } })
        s5.addShape(prs.ShapeType.rect, { x: 4.2, y, w: 8.73, h: 0.06, fill: { color: r.c } })
        s5.addText(`${r.v}%`, { x: 4.35, y: y+0.15, w: 1.6, h: 0.75, fontSize: 36, bold: true, color: r.c })
        s5.addText(r.l, { x: 6.1, y: y+0.18, w: 3.5, h: 0.35, fontSize: 12, bold: true, color: C.white })
        s5.addText(r.desc, { x: 6.1, y: y+0.57, w: 4.5, h: 0.45, fontSize: 8, color: C.slate4 })
        pBar(s5, 4.35, y + 1.0, 8.3, 0.18, r.v, r.c)
        s5.addText(`Target: ${r.target}%`, { x: 11.5, y: y+0.35, w: 1.3, h: 0.3, fontSize: 7.5, color: C.slate5, align: 'right' })
      })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 6: Strategic Priorities & Maturity Actions
      const s6 = mkSlide(6, 7)
      sectionTitle(s6, 'Strategic Priorities', 'Priority areas and recommended focus')
      // Left: priority table
      s6.addText('PRIORITY', { x: 0.4, y: 1.3, w: 5.5, h: 0.25, fontSize: 7, bold: true, color: C.slate5 })
      s6.addText('LEVEL', { x: 5.7, y: 1.3, w: 1, h: 0.25, fontSize: 7, bold: true, color: C.slate5, align: 'center' })
      live.priorities.forEach((p, i) => {
        const y = 1.65 + i * 0.7
        const lvlC: Record<string, string> = { High: C.red, Medium: C.amber, Low: C.green }
        const bg: Record<string, string> = { High: '2d0707', Medium: '2d1907', Low: '052212' }
        const c = lvlC[p.level] ?? C.slate4
        s6.addShape(prs.ShapeType.roundRect, { x: 0.4, y, w: 6.2, h: 0.58, rectRadius: 0.08, fill: { color: bg[p.level] ?? C.card } })
        s6.addShape(prs.ShapeType.roundRect, { x: 0.4, y, w: 0.04, h: 0.58, rectRadius: 0.02, fill: { color: c } })
        s6.addText(p.label, { x: 0.6, y, w: 4.8, h: 0.58, fontSize: 10, bold: true, color: C.white, valign: 'middle' })
        s6.addShape(prs.ShapeType.roundRect, { x: 5.3, y: y+0.12, w: 1.1, h: 0.34, rectRadius: 0.08, fill: { color: c+'33' }, line: { color: c+'88', pt: 0.6 } })
        s6.addText(p.level, { x: 5.3, y: y+0.12, w: 1.1, h: 0.34, fontSize: 8, bold: true, color: c, align: 'center', valign: 'middle' })
      })
      // Right: maturity summary
      s6.addShape(prs.ShapeType.rect, { x: 6.9, y: 1.25, w: 0.03, h: 5.5, fill: { color: C.border } })
      s6.addText('MATURITY SCORES', { x: 7.1, y: 1.3, w: 5.8, h: 0.25, fontSize: 7.5, bold: true, color: C.slate5 })
      _matDims.forEach((d, i) => {
        const y = 1.65 + i * 0.78
        const pctC = d.pct >= 65 ? C.green : d.pct >= 45 ? C.amber : C.red
        s6.addText(d.label, { x: 7.1, y, w: 2.0, h: 0.35, fontSize: 9, bold: true, color: C.white, valign: 'middle' })
        s6.addText(d.val, { x: 9.2, y, w: 2.0, h: 0.35, fontSize: 8, color: C.slate4, valign: 'middle' })
        pBar(s6, 7.1, y + 0.4, 5.5, 0.2, d.pct, pctC)
        s6.addText(`${d.pct}%`, { x: 12.75, y, w: 0.5, h: 0.35, fontSize: 8.5, bold: true, color: pctC, align: 'right', valign: 'middle' })
      })

      // ─────────────────────────────────────────────────────────────────
      // SLIDE 7: Recommendations
      const s7 = mkSlide(7, 7)
      sectionTitle(s7, 'AI-Powered Recommendations', `${_recs.length} priority actions for ${data.org_name || 'your organisation'}`)
      _recs.forEach((r, i) => {
        const col = i % 2; const row = Math.floor(i / 2)
        const x = 0.4 + col * 6.5; const y = 1.35 + row * 1.38
        const priC = live.recommendations[i]?.priority === 'High' ? C.red : C.amber
        s7.addShape(prs.ShapeType.roundRect, { x, y, w: 6.15, h: 1.22, rectRadius: 0.1, fill: { color: C.card }, line: { color: C.border, pt: 0.6 } })
        s7.addShape(prs.ShapeType.roundRect, { x, y, w: 6.15, h: 0.05, rectRadius: 0.02, fill: { color: priC } })
        s7.addShape(prs.ShapeType.roundRect, { x: x+0.12, y: y+0.15, w: 0.4, h: 0.4, rectRadius: 0.06, fill: { color: priC+'33' } })
        s7.addText(`${i+1}`, { x: x+0.12, y: y+0.15, w: 0.4, h: 0.4, fontSize: 11, bold: true, color: priC, align: 'center', valign: 'middle' })
        s7.addText(r, { x: x+0.65, y: y+0.15, w: 5.35, h: 0.9, fontSize: 9.5, color: C.white, wrap: true, valign: 'top' })
        s7.addShape(prs.ShapeType.roundRect, { x: x+0.12, y: y+0.9, w: 1.0, h: 0.24, rectRadius: 0.06, fill: { color: priC+'22' }, line: { color: priC+'55', pt: 0.4 } })
        s7.addText(live.recommendations[i]?.priority === 'High' ? 'High Priority' : 'Medium Priority', { x: x+0.12, y: y+0.9, w: 1.0, h: 0.24, fontSize: 6.5, bold: true, color: priC, align: 'center', valign: 'middle' })
      })
      if (editNotes.trim()) {
        const noteY = 1.35 + Math.ceil(_recs.length / 2) * 1.38
        s7.addShape(prs.ShapeType.roundRect, { x: 0.4, y: noteY, w: 12.53, h: 0.65, rectRadius: 0.08, fill: { color: C.card2 }, line: { color: C.violet+'55', pt: 0.5 } })
        s7.addShape(prs.ShapeType.rect, { x: 0.4, y: noteY, w: 0.04, h: 0.65, fill: { color: C.violet } })
        s7.addText('Advisory Notes: ' + editNotes, { x: 0.6, y: noteY, w: 12.1, h: 0.65, fontSize: 8, color: C.slate4, valign: 'middle', wrap: true })
      }

      await prs.writeFile({ fileName: `${data.org_name || 'Aivora-HC'}_Advisory_Report.pptx` })
      toast.success('PowerPoint downloaded')
    } catch (e) {
      console.error(e)
      toast.error('PPT export failed')
    } finally {
      setExporting(null)
    }
  }

  const extractInsights = (txt: string) => {
    const lower = txt.toLowerCase()
    const extracted: Omit<ConversationInsight, 'id' | 'learnedAt'>[] = []

    // Pain points
    const painPatterns = [
      { re: /(?:we(?:'re| are) (?:struggling|having trouble|facing issues?) (?:with )?|our (?:main |biggest |primary )?(?:problem|issue|challenge) (?:is |with |around )?)(.{8,60}?)(?:\.|,|$)/i, label: 'Pain Point' },
      { re: /(?:the (?:biggest |main )?challenge (?:we face )?is )(.{8,60}?)(?:\.|,|$)/i, label: 'Challenge' },
    ]
    painPatterns.forEach(({ re, label }) => {
      const m = txt.match(re)
      if (m) extracted.push({ type: 'pain_point', label, value: m[1].trim(), confidence: 'high', source: txt.slice(0, 120), sessionId, applied: false })
    })

    // Goals / objectives
    const goalPatterns = [
      /(?:we (?:need|want|must|aim) to |we're trying to |our goal is to )(.{8,80}?)(?:\.|,|$)/i,
      /(?:the board (?:wants|expects|requires) )(.{8,80}?)(?:\.|,|$)/i,
      /(?:we're focused on |focused on )(.{8,60}?)(?:\.|,|$)/i,
    ]
    goalPatterns.forEach(re => {
      const m = txt.match(re)
      if (m) extracted.push({ type: 'goal', label: 'Goal', value: m[1].trim(), confidence: 'high', source: txt.slice(0, 120), sessionId, applied: false })
    })

    // Priorities from keywords
    const priorityKeywords: { kw: string; value: string }[] = [
      { kw: 'succession', value: 'succession-planning' }, { kw: 'leadership', value: 'leadership-development' },
      { kw: 'nationalization', value: 'nationalization' }, { kw: 'workforce planning', value: 'workforce-planning' },
      { kw: 'attrition', value: 'employee-experience' }, { kw: 'engagement', value: 'employee-experience' },
      { kw: 'talent acquisition', value: 'talent-acquisition' }, { kw: 'skills', value: 'skills-capability' },
      { kw: 'performance', value: 'performance-management' }, { kw: 'learning', value: 'learning-development' },
    ]
    priorityKeywords.forEach(({ kw, value }) => {
      if (lower.includes(kw) && !data.hc_priorities.includes(value)) {
        extracted.push({ type: 'priority', label: `HC Priority: ${HC_PRIORITIES.find(h => h.value === value)?.label ?? kw}`, value, confidence: 'medium', source: txt.slice(0, 120), sessionId, applied: false })
      }
    })

    // Context: org info mentioned in chat
    if (lower.includes('headcount') || lower.includes('employees')) {
      const numMatch = txt.match(/(\d[\d,]+)\s*(?:employees?|headcount|people|staff)/i)
      if (numMatch) extracted.push({ type: 'context', label: 'Headcount mentioned', value: numMatch[0], confidence: 'high', source: txt.slice(0, 120), sessionId, applied: false })
    }
    if (lower.includes('our') && (lower.includes('ceo') || lower.includes('chro') || lower.includes('cto'))) {
      extracted.push({ type: 'context', label: 'Executive mentioned', value: txt.match(/(our|the)\s+(?:ceo|chro|cto|coo|cfo)\b[^.]{0,40}/i)?.[0] ?? txt.slice(0, 60), confidence: 'medium', source: txt.slice(0, 120), sessionId, applied: false })
    }

    // Risk signals
    if (lower.includes('risk') && (lower.includes('concern') || lower.includes('worried') || lower.includes('worry'))) {
      extracted.push({ type: 'risk', label: 'Risk concern flagged', value: txt.slice(0, 80), confidence: 'medium', source: txt.slice(0, 120), sessionId, applied: false })
    }

    return extracted
  }

  const applyInsightToProfile = (insight: ConversationInsight) => {
    if (insight.type === 'pain_point') {
      const updated = { ...clientProfile }
      const existing = updated.agenda?.keyPainPoints ?? []
      if (!existing.includes(insight.value)) {
        updated.agenda = { ...updated.agenda, keyPainPoints: [...existing, insight.value] }
        saveProfile(updated)
        toast.success('Insight applied to profile')
      }
    } else if (insight.type === 'priority') {
      const updated = { ...clientProfile }
      const existing = updated.agenda?.hcPriorities ?? []
      const val = insight.value as HcPriority
      if (!existing.includes(val)) {
        updated.agenda = { ...updated.agenda, hcPriorities: [...existing, val] }
        saveProfile(updated)
        toast.success('Priority added to profile')
      }
    }
    markApplied(insight.id)
  }

  const getReply = (txt: string): string => {
    const lower = txt.toLowerCase()

    // Maturity dimension handlers
    if (lower.includes('strategy maturity') || (lower.includes('strategy') && lower.includes('matur'))) {
      const level = live.maturity_score >= 60 ? 'strong' : 'developing'
      return `Strategy maturity for ${data.org_name || orgLabel} is ${level} (score: ${live.maturity_score}/100). At ${matLabel} stage, ${live.maturity_score >= 60 ? 'your HC strategy is well-linked to business goals — focus on formalizing the annual strategy review cadence and embedding HC metrics into the business scorecard.' : 'the biggest gap is translating business strategy into HC planning cycles. Start with a 12-month HC strategic roadmap aligned to your top 3 business priorities: ' + (data.business_priorities.slice(0,2).join(', ') || 'growth and efficiency') + '.'}`
    }
    if (lower.includes('processes maturity') || (lower.includes('processes') && lower.includes('matur'))) {
      const level = live.bench_strength > 50 ? 'moderate' : 'early-stage'
      return `Processes maturity is ${level}. For ${orgLabel} at ${matLabel} stage, key process gaps typically include: inconsistent performance calibration cycles, informal succession review processes, and manual workforce reporting. Quick wins: standardize a quarterly talent review template, automate bench-strength tracking, and create a single source of truth for HC data across business units.`
    }
    if (lower.includes('people maturity') || (lower.includes('people') && lower.includes('matur'))) {
      const riskAdj = live.risk_high > 35 ? 'under pressure' : 'reasonably stable'
      return `People maturity is ${riskAdj} — ${live.risk_high}% of your pool is high-retention-risk. For ${sizeLabel}-scale ${orgLabel}, people maturity is driven by: (1) quality of line manager capability, (2) depth of HiPo identification, (3) strength of career pathing. Your ${live.readiness_now}% ready-now rate suggests line manager development and structured career conversations should be top priorities.`
    }
    if (lower.includes('data maturity') || (lower.includes('data') && lower.includes('matur'))) {
      const dataLevel = data.maturity_stage === 'mature' ? 'established' : data.maturity_stage === 'scale' ? 'growing' : 'nascent'
      return `Data maturity is ${dataLevel} for a ${matLabel}-stage org. You have ${data.available_docs.length} evidence sources in your profile. To move the needle: (1) consolidate people data into a single HC dashboard, (2) establish monthly bench-strength and attrition metrics, (3) link people data to financial outcomes. ${data.available_docs.length < 3 ? 'Start by digitizing exit data and engagement surveys — these are your fastest signals.' : 'You have a solid data foundation — focus on predictive analytics for attrition risk.'}`
    }
    if (lower.includes('tech maturity') || (lower.includes('tech') && lower.includes('matur'))) {
      return `Tech maturity at ${matLabel} stage: ${data.maturity_stage === 'mature' ? 'most mature organizations have HRIS, ATS, and LMS integrated — the next frontier is AI-driven talent analytics and predictive succession tools.' : 'priority investments are: a unified HRIS platform, digital performance management, and an LMS. Avoid over-engineering — 3 well-adopted tools beat 10 underused ones.'} For ${orgLabel}, I'd prioritize platforms that support ${data.hc_priorities[0] ? HC_PRIORITIES.find(h => h.value === data.hc_priorities[0])?.label : 'your top HC priorities'} first.`
    }
    if (lower.includes('gov') && lower.includes('matur')) {
      return `Governance maturity determines how well HC decisions are made and enforced. For ${orgLabel} with a ${data.operating_model} model: ${data.operating_model === 'single-entity' ? 'governance is simpler — focus on clear RACI for HC decisions, quarterly HR leadership reviews, and a board-level talent committee.' : 'multi-entity governance needs: group-level HC policy framework, entity-level flexibility guidelines, and a cross-entity talent mobility protocol.'} ${live.maturity_score > 60 ? 'Your maturity score suggests governance foundations are in place — elevate to predictive governance.' : 'Start with an HC governance charter and decision-rights matrix.'}`
    }

    // Succession
    if (lower.includes('succession') || lower.includes('bench')) {
      const depth = live.readiness_now < 15 ? 'thin' : live.readiness_now < 25 ? 'developing' : 'solid'
      return `Your succession bench is ${depth} — ${live.readiness_now}% ready now, ${live.readiness_near}% in 1–2 years, ${live.readiness_later}% in 3+ years. For a ${matLabel}-stage ${orgLabel}, best practice is 20%+ ready-now. Actions: (1) run a critical role mapping exercise for the top 50 roles, (2) assign 2+ successors per critical role, (3) fast-track the ${live.readiness_near}% near-ready cohort through accelerated exposure and stretch assignments. Timeline: 90-day sprint to close the readiness gap.`
    }

    // Retention / attrition
    if (lower.includes('retention') || lower.includes('attrition') || lower.includes('high risk') || lower.includes('high-risk')) {
      return `With ${live.risk_high}% at high retention risk, priority actions for ${data.org_name || orgLabel}: (1) run stay interviews with the top 20% most critical high-risk talent this month, (2) create a retention bonus pool for high-risk HiPos in critical roles, (3) accelerate career pathing conversations — most HiPos leave due to perceived limited growth, not compensation. For ${orgLabel} at ${sizeLabel} scale, untreated high-risk attrition typically costs 1.5–2x annual salary per loss plus 6–12 months productivity drag.`
    }

    // Medium risk segment
    if (lower.includes('medium') && (lower.includes('risk') || lower.includes('segment'))) {
      return `Your medium-risk segment (${live.risk_med}%) is the "watchlist" — they're not planning to leave immediately, but are vulnerable to poaching or internal frustration. Key lever: proactive career conversations in the next 30–60 days. Assign stretch projects, clarify next-role pathways, and check compensation competitiveness against market. Prevention here is 5x cheaper than replacement.`
    }

    // Low risk
    if (lower.includes('low') && lower.includes('risk')) {
      return `Your low-risk segment (${live.risk_low}%) are your anchors — highly committed talent who are unlikely to leave. Don't neglect them: engage them as mentors, involve them in strategy, and recognize their loyalty. Risk: low-risk can quietly become disengaged if they feel overlooked while you focus on retaining high-risk talent.`
    }

    // Benchmarking / industry / peers
    if (lower.includes('benchmark') || lower.includes('industry') || lower.includes('peers') || lower.includes('compare')) {
      const benchLabel = live.bench_strength < 50 ? 'below industry average' : live.bench_strength < 70 ? 'at industry average' : 'above industry average'
      return `${orgLabel} benchmark vs peers: Bench strength ${live.bench_strength}/100 is ${benchLabel}. Best-in-class ${orgLabel} companies at ${matLabel} stage maintain: bench strength ≥75, ready-now succession ≥20%, HiPo pool ≥4% of headcount. Your biggest gap: ready-now at ${live.readiness_now}% vs 20% target = ${Math.max(0,20-live.readiness_now)}pp to close. Achievable in 2–3 cohort cycles (12–18 months) with structured acceleration programs.`
    }

    // Leadership pipeline / ready now / 1-2 years / 3+ years
    if (lower.includes('ready now') || lower.includes('ready-now')) {
      return `Your ready-now cohort (${live.readiness_now}%) are succession-ready today. Actions: (1) formally nominate them for the next critical vacancy, (2) give them enterprise-wide visibility through cross-functional projects, (3) ensure compensation is at or above market — this cohort gets poached most aggressively. Target: grow this cohort to 20% within 12 months.`
    }
    if ((lower.includes('1') && lower.includes('2') && lower.includes('year')) || lower.includes('1–2') || lower.includes('1-2')) {
      return `Your 1–2 year cohort (${live.readiness_near}%) is your most investable segment. They're close enough to ready that targeted acceleration will pay off quickly. Priority interventions: 6-month rotations in critical functions, executive sponsorship assignments, structured coaching, and participation in leadership forums. Each intervention typically pulls readiness forward by 6–9 months.`
    }
    if (lower.includes('3+') || lower.includes('3 year') || lower.includes('accelerate')) {
      return `Your 3+ year cohort (${live.readiness_later}%) are your long-term pipeline. Don't over-invest in acceleration here — instead, focus on identification quality (are the right people in this cohort?), early capability building, and experience breadth. Some will self-select out; focus resources on the top 25% of this cohort who show the highest potential signals.`
    }
    if (lower.includes('leadership') || lower.includes('pipeline')) {
      return `Leadership pipeline: ${live.readiness_now}% ready now vs 20% target — ${live.readiness_now >= 20 ? 'on track, focus on quality depth.' : `${20-live.readiness_now}pp gap to close.`} The ${live.readiness_near}% in 1–2 years is your highest-ROI acceleration target. For ${orgLabel}, accelerate through: executive exposure programs, cross-functional P&L ownership, external leadership cohort participation, and structured 1:1 coaching with C-suite. Timeline to close the gap: 3–4 cohort cycles.`
    }

    // Workforce / risk
    if (lower.includes('workforce') || lower.includes('risk breakdown')) {
      return `Workforce risk for ${data.org_name || orgLabel}: High ${live.risk_high}% · Medium ${live.risk_med}% · Low ${live.risk_low}%. ${live.risk_high > 35 ? 'ELEVATED — immediate role criticality + retention heatmap needed.' : 'Manageable — focus interventions on the high-risk segment.'} Main drivers flagged in your profile: ${data.workforce_challenges.length > 0 ? data.workforce_challenges.slice(0,3).map(v=>WORKFORCE_CHALLENGES.find(w=>w.value===v)?.label).filter(Boolean).join(', ') : 'attrition, skill gaps, engagement decline'}.`
    }

    // Nationalization
    if (lower.includes('nationalization') || lower.includes('localiz') || lower.includes('programme')) {
      if (!data.nationalization_on) return `Nationalization is not flagged in your profile. For ${orgLabel} operating in GCC markets, this is a strategic risk — regulators are tightening quotas. I can model a nationalization programme design if this becomes relevant.`
      return `${NATIONALIZATION_PROGRAMS.find(n => n.value === data.nationalization_program)?.label} target: ${RATE_BANDS.find(r => r.value === data.current_rate_band)?.label ?? '?'} → ${RATE_BANDS.find(r => r.value === data.target_rate_band)?.label ?? '?'}. To hit that target: (1) structured national talent pipeline with university partnerships, (2) early-career accelerated programme with 18-month rotation, (3) senior national talent advisory committee, (4) monthly compliance dashboard reporting to CHRO. Want a full programme charter?`
    }

    // HC priorities
    if (lower.includes('priorit') || lower.includes('leadership pipeline') || lower.includes('leadership development') || lower.includes('succession planning') || lower.includes('skills') || lower.includes('culture')) {
      const topPriorities = data.hc_priorities.slice(0,3).map(v => HC_PRIORITIES.find(h => h.value === v)?.label).filter(Boolean)
      return `For ${data.org_name || orgLabel}, your top HC priority is "${txt.replace('Tell me more about ', '').replace(' maturity', '')}" — here's my advisory: At ${matLabel} maturity, ${live.bench_strength < 50 ? 'you need to build foundational capability before optimizing.' : 'you\'re ready to move from foundational to differentiated practices.'} Recommended next step: run a focused 4-week diagnostic on this area, identify the top 3 gaps, and build a 90-day action plan. ${topPriorities.length > 0 ? `This links directly to your stated priorities: ${topPriorities.join(', ')}.` : ''}`
    }

    // Pain points / challenges
    if (lower.includes('pain') || lower.includes('challenge')) {
      const pains = data.key_pain_points.length > 0 ? data.key_pain_points.slice(0,2).join('; ') : 'the workforce challenges you flagged'
      return `Root-cause analysis on "${pains}": the primary driver is ${live.risk_high > 30 ? 'talent pipeline fragility — you\'re losing critical talent faster than you\'re developing replacements.' : 'capability gaps — the skills needed for future roles aren\'t being built fast enough.'} Typical resolution: 2-quarter focused programme with clear milestones. Want a phased action plan?`
    }

    // Deliverable-specific
    if (lower.includes('executive deck') || lower.includes('structure') && lower.includes('deck')) {
      return `For ${data.org_name || orgLabel}'s executive deck, I'd structure it as: (1) Strategic Context — 2 slides on business priorities and HC challenge; (2) Current State — bench strength ${live.bench_strength}/100, retention risk ${live.risk_high}%, pipeline readiness; (3) Gap Analysis — vs industry benchmark; (4) Recommended Actions — 3–5 prioritized initiatives; (5) Investment & Timeline. Total: 10–12 slides. Tone: ${data.output_types.includes('board-pack') ? 'board-level — facts first, no jargon.' : 'executive — concise with clear recommendations.'}`
    }
    if (lower.includes('hc framework') || lower.includes('framework structure')) {
      return `HC Framework for ${orgLabel}: at ${matLabel} stage, I'd recommend a 5-pillar framework — (1) Talent Identification & Assessment, (2) Development & Acceleration, (3) Performance & Rewards, (4) Succession & Continuity, (5) HC Analytics. Each pillar maps to your priorities: ${data.hc_priorities.slice(0,2).map(v=>HC_PRIORITIES.find(h=>h.value===v)?.label).filter(Boolean).join(' and ')||'leadership development and workforce planning'}. Want me to detail the key activities under each?`
    }
    if (lower.includes('maturity improvement') || lower.includes('maturity improve') || lower.includes('focus on')) {
      return `Top maturity improvements for ${orgLabel}: (1) **Strategy** — formalize annual HC-strategy alignment workshop; (2) **People** — implement quarterly talent calibration; (3) **Data** — build a real-time HC dashboard with 5 core metrics (bench strength, attrition risk, readiness, engagement, time-to-fill); (4) **Tech** — consolidate onto 1–2 integrated platforms; (5) **Governance** — establish monthly CHRO review with scorecard. Start with Data — it unlocks everything else.`
    }

    // Generic intelligent fallback
    const context = `${data.org_name || orgLabel} (${orgLabel}, ${matLabel}, ${sizeLabel})`
    return `For ${context}: bench strength is ${live.bench_strength}/100, ${live.risk_high}% high retention risk, ${live.readiness_now}% ready-now. Based on your question, I'd focus on the intersection of ${lower.split(' ').filter(w=>w.length>5).slice(0,2).join(' and ')||'leadership and risk'} — the highest-impact area for your profile. Want me to build a specific action plan for that? Or I can go deeper on: succession depth, retention risk segments, workforce planning, benchmarking, or maturity improvements.`
  }

  const send = async (overrideText?: string) => {
    const txt = (overrideText ?? input).trim()
    if (!txt) return
    setInput('')
    setMsgs(p => [...p, { role: 'user', text: txt }])
    setTyping(true)

    // Extract insights from user message
    const extracted = extractInsights(txt)
    const newIds: string[] = []
    extracted.forEach(ins => {
      const id = addInsight(ins)
      if (id) newIds.push(id)
    })
    if (newIds.length > 0) {
      setNewInsightIds(prev => new Set([...prev, ...newIds]))
      setShowInsights(true)
      setLeftTab('learning')
      setTimeout(() => setNewInsightIds(prev => { const n = new Set(prev); newIds.forEach(id => n.delete(id)); return n }), 3000)
    }

    await new Promise(r => setTimeout(r, 900 + Math.random() * 600))
    setMsgs(p => [...p, { role: 'ai', text: getReply(txt) }])
    setTyping(false)
  }

  const QUICK_PROMPTS = [
    { label: 'Succession depth', icon: TrendingUp, q: 'How deep is our succession bench and what should we do?' },
    { label: 'Retention risk', icon: AlertTriangle, q: 'What are the retention risks and priority actions?' },
    { label: 'Benchmark vs peers', icon: BarChart3, q: 'How do we benchmark against industry peers?' },
    { label: 'Leadership pipeline', icon: Users, q: 'Assess our leadership pipeline readiness' },
  ]

  const lvlColor = (l: string) => l === 'High' ? 'text-red-400 bg-red-400/10 border-red-400/30' : l === 'Medium' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : 'text-green-400 bg-green-400/10 border-green-400/30'

  const allPriorities = [
    ...live.priorities,
    ...data.hc_priorities.slice(live.priorities.length).map(v => ({
      label: HC_PRIORITIES.find(h => h.value === v)?.label ?? v,
      level: 'Medium' as 'High' | 'Medium' | 'Low',
    })),
  ]
  const visiblePriorities = showAllPriorities ? allPriorities : live.priorities

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowExportModal(false)}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#131720] border border-[#1e2433] rounded-2xl p-6 w-[360px] shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-white">Download Report</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{data.org_name || 'Advisory'} · {new Date().toLocaleDateString()}</p>
                </div>
                <button onClick={() => setShowExportModal(false)} className="text-slate-600 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <button onClick={() => { setShowExportModal(false); exportToPDF() }}
                  disabled={!!exporting}
                  className="w-full flex items-center gap-4 p-4 bg-[#0c0e14] border border-[#1e2433] hover:border-red-500/40 hover:bg-red-500/5 rounded-xl transition-all group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
                    <FileDown className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-white group-hover:text-red-300 transition-colors">Download PDF</p>
                    <p className="text-xs text-slate-500">Full advisory report · A4 format · Print-ready</p>
                  </div>
                  {exporting === 'pdf' ? <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /> : <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-400 transition-colors" />}
                </button>

                <button onClick={() => { setShowExportModal(false); exportToPPT() }}
                  disabled={!!exporting}
                  className="w-full flex items-center gap-4 p-4 bg-[#0c0e14] border border-[#1e2433] hover:border-blue-500/40 hover:bg-blue-500/5 rounded-xl transition-all group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
                    <Presentation className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">Download PowerPoint</p>
                    <p className="text-xs text-slate-500">6-slide deck · Branded · Editable in PowerPoint</p>
                  </div>
                  {exporting === 'ppt' ? <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" /> : <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />}
                </button>
              </div>

              <p className="text-[10px] text-slate-600 text-center mt-4">Includes all org data, risk analysis, pipeline, and recommendations</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-slate-500">
          {data.org_name ? <><span className="text-white font-semibold">{data.org_name}</span> · Advisory Dashboard</> : 'Advisory Dashboard'}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${editMode ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-[#131720] border-[#1e2433] text-slate-400 hover:text-white hover:border-slate-500'}`}>
            {editMode ? <><Check className="w-3.5 h-3.5" /> Done Editing</> : <><Pencil className="w-3.5 h-3.5" /> Edit Report</>}
          </button>
          <button type="button" onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold transition-all">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: 'HC Priorities', val: `${data.hc_priorities.length}`, unit: 'active', icon: Target, color: 'text-blue-400', key: 'priorities', detail: data.hc_priorities.map(v => HC_PRIORITIES.find(h => h.value === v)?.label).filter(Boolean).join(', ') || 'None selected' },
          { label: 'Bench Strength', val: `${live.bench_strength}`, unit: '/100', icon: Gauge, color: live.bench_strength >= 70 ? 'text-green-400' : live.bench_strength >= 45 ? 'text-amber-400' : 'text-red-400', key: 'bench', detail: `${live.bench_strength < 50 ? 'Below' : live.bench_strength < 70 ? 'At' : 'Above'} industry average. Ready now: ${live.readiness_now}%, 1–2yr: ${live.readiness_near}%` },
          { label: 'Retention Risk', val: `${live.risk_high}%`, unit: 'high', icon: AlertTriangle, color: 'text-red-400', key: 'retention', detail: `High: ${live.risk_high}% · Medium: ${live.risk_med}% · Low: ${live.risk_low}%. ${live.risk_high > 30 ? 'Elevated — immediate action needed.' : 'Manageable risk level.'}` },
          { label: 'Pain Points', val: `${data.key_pain_points.length}`, unit: 'logged', icon: Zap, color: 'text-indigo-400', key: 'pain', detail: data.key_pain_points.length > 0 ? data.key_pain_points.slice(0, 2).join(' · ') : 'No pain points logged yet' },
        ].map(m => (
          <motion.button key={m.label} type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setActiveMetric(activeMetric === m.key ? null : m.key)}
            className={`bg-[#131720] border rounded-xl p-3 text-left transition-all ${activeMetric === m.key ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-[#1e2433] hover:border-[#2a3045]'}`}>
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{m.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${m.color}`}>{m.val}</span>
              <span className="text-[10px] text-slate-500">{m.unit}</span>
            </div>
            <AnimatePresence>
              {activeMetric === m.key && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="text-[10px] text-slate-400 mt-2 leading-snug border-t border-[#1e2433] pt-2">
                  {m.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {/* Main layout */}
      <div className={`flex-1 grid gap-3 min-h-0 overflow-hidden transition-all duration-300 ${floatingChat ? (leftCollapsed ? 'grid-cols-1 lg:grid-cols-[0px_1fr]' : 'grid-cols-1 lg:grid-cols-[200px_1fr]') : (leftCollapsed ? 'grid-cols-1 lg:grid-cols-[0px_1fr_220px]' : 'grid-cols-1 lg:grid-cols-[200px_1fr_220px]')}`}>

        {/* Left sidebar */}
        <div className={`flex flex-col min-h-0 overflow-hidden transition-all duration-300 ${leftCollapsed ? 'hidden lg:flex w-0 overflow-hidden opacity-0 pointer-events-none' : ''}`}>
          {/* Tab bar */}
          <div className="flex items-center gap-0 mb-2 bg-[#131720] border border-[#1e2433] rounded-xl p-1 flex-shrink-0">
            <button type="button" onClick={() => setLeftTab('org')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${leftTab === 'org' ? 'bg-[#0c0e14] text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              <Building2 className="w-3 h-3" /> Org Intel
            </button>
            <button type="button" onClick={() => setLeftTab('learning')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all relative ${leftTab === 'learning' ? 'bg-[#0c0e14] text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              <Brain className="w-3 h-3" /> Learning
              {sessionInsights.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full text-[8px] text-white font-bold flex items-center justify-center">
                  {sessionInsights.length}
                </span>
              )}
            </button>
            <button type="button" onClick={() => setLeftCollapsed(true)}
              className="ml-1 w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors flex-shrink-0"
              title="Collapse panel">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3">
            <AnimatePresence mode="wait">
              {leftTab === 'org' ? (
                <motion.div key="org" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}
                  className="flex flex-col gap-3">
                  {/* Org intel */}
                  <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3">Organization Intelligence</h3>
                    <ul className="space-y-2">
                      {[
                        { label: 'Industry', val: INDUSTRIES.find(i => i.value === data.industry)?.label ?? '—', icon: Building2 },
                        { label: 'Region', val: REGIONS.find(r => r.value === data.region)?.label ?? '—', icon: Target },
                        { label: 'Size', val: ORG_SIZES.find(s => s.value === data.org_size)?.label?.split(' ')[0] ?? '—', icon: Users },
                        { label: 'Maturity', val: MATURITY_STAGES.find(m => m.value === data.maturity_stage)?.label ?? '—', icon: TrendingUp, highlight: true },
                        { label: 'Model', val: OPERATING_MODELS.find(m => m.value === data.operating_model)?.label ?? '—', icon: Zap },
                      ].map(r => (
                        <li key={r.label} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <r.icon className="w-3 h-3 text-blue-400/60 flex-shrink-0" />{r.label}
                          </span>
                          <span className={`text-[10px] font-semibold truncate max-w-[80px] text-right ${(r as { highlight?: boolean }).highlight ? 'text-amber-400' : 'text-slate-200'}`}>{r.val}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* HC Priorities */}
                  <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3">HC Priorities</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(showAllPriorities ? data.hc_priorities : data.hc_priorities.slice(0, 5)).map(v => (
                        <span key={v} className="text-[9px] px-2 py-0.5 bg-blue-500/15 border border-blue-500/25 text-blue-300 rounded-full font-medium">
                          {HC_PRIORITIES.find(h => h.value === v)?.label}
                        </span>
                      ))}
                      {data.hc_priorities.length > 5 && !showAllPriorities && (
                        <button type="button" onClick={() => setShowAllPriorities(true)}
                          className="text-[9px] px-2 py-0.5 border border-dashed border-slate-600 text-slate-500 rounded-full hover:text-slate-300 transition-colors">
                          +{data.hc_priorities.length - 5} more
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Advisory status */}
                  <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Advisory Status</h3>
                    <ul className="space-y-2">
                      {[
                        { label: 'Confidence', val: live.bench_strength >= 60 ? 'Medium' : 'Low', color: 'text-amber-400' },
                        { label: 'Urgency', val: URGENCY.find(u => u.value === data.urgency)?.label ?? '—', color: 'text-blue-400' },
                        { label: 'Confidentiality', val: CONFIDENTIALITY.find(c => c.value === data.confidentiality)?.label ?? '—', color: 'text-slate-300' },
                      ].map(s => (
                        <li key={s.label} className="flex justify-between text-[10px]">
                          <span className="text-slate-500">{s.label}</span>
                          <span className={`font-semibold ${s.color}`}>{s.val}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {data.nationalization_on && (
                    <div className="bg-[#131720] border border-blue-500/20 rounded-xl p-4">
                      <h3 className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-2">Nationalization</h3>
                      <p className="text-xs text-slate-300 font-semibold mb-1">{NATIONALIZATION_PROGRAMS.find(n => n.value === data.nationalization_program)?.label}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{RATE_BANDS.find(r => r.value === data.current_rate_band)?.label}</span>
                        <ArrowRight className="w-3 h-3 text-blue-400" />
                        <span className="text-blue-300 font-semibold">{RATE_BANDS.find(r => r.value === data.target_rate_band)?.label}</span>
                      </div>
                      <button type="button" onClick={() => send('Tell me about our nationalization programme design')}
                        className="mt-2 text-[9px] text-blue-400 hover:text-blue-300 transition-colors underline-offset-2 hover:underline">
                        Get programme advice →
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="learning" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}>
                  <LearningJourneyPanel
                    sessionInsights={sessionInsights}
                    newInsightIds={newInsightIds}
                    showInsights={showInsights}
                    setShowInsights={setShowInsights}
                    onApply={applyInsightToProfile}
                    onRemove={removeInsight}
                    onApplyAll={() => {
                      sessionInsights
                        .filter(i => !i.applied && (i.type === 'pain_point' || i.type === 'priority'))
                        .forEach(i => applyInsightToProfile(i))
                    }}
                    sessionId={sessionId}
                    msgCount={msgs.filter(m => m.role === 'user').length}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center: AI chat — hidden in floatingChat mode */}
        {!floatingChat && <div className="bg-[#131720] border border-[#1e2433] rounded-xl flex flex-col overflow-hidden min-h-[400px] lg:min-h-0">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433] flex-shrink-0">
            <div className="flex items-center gap-2">
              {leftCollapsed && (
                <button type="button" onClick={() => setLeftCollapsed(false)}
                  title="Show org panel"
                  className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors mr-1">
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                </button>
              )}
              <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div>
                <span className="text-sm font-semibold text-white">AI Advisory</span>
                <span className="ml-2 text-[9px] text-green-400 font-medium">● Live</span>
              </div>
            </div>
            <span className="text-[9px] px-2 py-1 bg-blue-500/15 border border-blue-500/25 text-blue-400 rounded-full font-bold">Executive Ready</span>
          </div>

          {/* Quick prompts */}
          <div className="flex gap-1.5 px-3 pt-2 pb-1 overflow-x-auto flex-shrink-0">
            {QUICK_PROMPTS.map(qp => (
              <button key={qp.label} type="button" onClick={() => send(qp.q)}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border border-[#1e2433] bg-[#0c0e14] text-slate-400 hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all whitespace-nowrap flex-shrink-0">
                <qp.icon className="w-3 h-3" /> {qp.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {msgs.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                )}
                <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${m.role === 'ai' ? 'bg-white/5 border border-white/8 text-slate-200' : 'bg-blue-600 text-white'}`}>
                  <p className="text-[10px] font-bold mb-1 opacity-50">{m.role === 'ai' ? 'AIVORA HC' : 'You'}</p>
                  {m.text}
                </div>
                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-700 border border-white/15 flex-shrink-0 mt-1 flex items-center justify-center text-[10px] font-bold text-white">
                    {data.org_name.slice(0, 2).toUpperCase() || 'ME'}
                  </div>
                )}
              </motion.div>
            ))}
            {typing && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3 flex items-center gap-1">
                  {[0, 1, 2].map(d => <div key={d} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#1e2433] flex-shrink-0 space-y-2">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask about succession, retention, pipeline, benchmarking…"
                className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors" />
              <button onClick={() => send()}
                disabled={!input.trim()}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors flex-shrink-0">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <p className="text-[9px] text-slate-600 text-center">AI-generated insights · Validate with expert judgment</p>
          </div>
        </div>}

        {/* Right sidebar — hidden in floatingChat mode (content promoted to main area) */}
        {!floatingChat && <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Strategic priorities */}
          <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Strategic Priorities</h3>
              <button type="button" onClick={() => setShowAllPriorities(v => !v)}
                className="text-[9px] text-blue-400 font-semibold flex items-center gap-0.5 hover:text-blue-300 transition-colors">
                {showAllPriorities ? 'Less' : 'View All'} <ChevronRight className={`w-3 h-3 transition-transform ${showAllPriorities ? 'rotate-90' : ''}`} />
              </button>
            </div>
            <ul className="space-y-2">
              {visiblePriorities.map((p, i) => (
                <motion.li key={i} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => send(`Tell me more about ${p.label}`)}>
                  <span className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                    <span className="text-[9px] text-slate-600 font-bold w-3">{i + 1}</span>{p.label}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${lvlColor(p.level)}`}>{p.level}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          {/* Maturity heatmap */}
          <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3">Maturity Heatmap</h3>
            <div className="grid grid-cols-3 gap-1 mb-1">
              {[
                { label: 'Strategy', val: (live.maturity_score >= 60 ? 'High' : 'Medium') as 'High'|'Medium'|'Low' },
                { label: 'Processes', val: (live.bench_strength > 50 ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                { label: 'People', val: (live.risk_low > 40 ? 'Medium' : 'High') as 'High'|'Medium'|'Low' },
                { label: 'Data', val: (data.maturity_stage === 'mature' ? 'High' : data.maturity_stage === 'scale' ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                { label: 'Tech', val: (data.maturity_stage === 'mature' ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                { label: 'Gov.', val: (data.operating_model ? 'High' : 'Low') as 'High'|'Medium'|'Low' },
              ].map(c => (
                <button key={c.label} type="button" onClick={() => send(`What does ${c.label} maturity mean for us?`)}>
                  <HeatCell label={c.label} val={c.val} />
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-500 mt-2">Current: <span className="text-amber-400 font-semibold">{matLabel}</span></p>
          </div>

          {/* Workforce risk */}
          <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3">Workforce Risk</h3>
            <div className="flex items-center gap-3">
              <DonutChart high={live.risk_high} med={live.risk_med} low={live.risk_low} />
              <div className="space-y-1.5 flex-1">
                {[
                  { label: 'High', pct: live.risk_high, col: 'bg-red-500' },
                  { label: 'Medium', pct: live.risk_med, col: 'bg-amber-500' },
                  { label: 'Low', pct: live.risk_low, col: 'bg-green-500' },
                ].map(r => (
                  <button key={r.label} type="button"
                    onClick={() => send(`Explain the ${r.label.toLowerCase()} retention risk segment`)}
                    className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
                    <div className={`w-2 h-2 rounded-full ${r.col}`} />
                    <span className="text-[9px] text-slate-400 flex-1 text-left">{r.label}</span>
                    <span className="text-[9px] text-slate-200 font-bold">{r.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Leadership pipeline */}
          <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
            <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-3">Leadership Pipeline</h3>
            <div className="space-y-3">
              {[
                { label: 'Ready Now', pct: live.readiness_now, vals: [10,12,14,15,live.readiness_now], col: '#3b82f6' },
                { label: '1–2 Years', pct: live.readiness_near, vals: [35,38,40,41,live.readiness_near], col: '#6366f1' },
                { label: '3+ Years', pct: live.readiness_later, vals: [44,42,40,43,live.readiness_later], col: '#475569' },
              ].map(r => (
                <button key={r.label} type="button"
                  onClick={() => send(`What actions accelerate the ${r.label} leadership cohort?`)}
                  className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
                  <span className="text-lg font-bold text-white w-8">{r.pct}%</span>
                  <div className="flex-1"><Sparkline vals={r.vals} color={r.col} /></div>
                  <span className="text-[9px] text-slate-500 w-14 text-right">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className={`bg-[#131720] border rounded-xl p-4 transition-all ${editMode ? 'border-amber-500/30' : 'border-[#1e2433]'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Recommendations</h3>
              {editMode && <span className="text-[8px] text-amber-400 font-semibold flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />Editing</span>}
            </div>
            <div className="space-y-2">
              {(editRecs.length > 0 ? editRecs : live.recommendations.map(r => r.text)).map((text, i) => (
                editMode ? (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 bg-blue-400" />
                    <input value={text} onChange={e => setEditRecs(prev => prev.map((r, j) => j === i ? e.target.value : r))}
                      className="flex-1 bg-[#0c0e14] border border-amber-500/30 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-amber-400/60 transition-colors" />
                  </div>
                ) : (
                  <button key={i} type="button"
                    onClick={() => send(`Tell me more about: ${text}`)}
                    className="flex items-start gap-2 w-full text-left hover:opacity-80 transition-opacity group">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${live.recommendations[i]?.priority === 'High' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <span className="text-[10px] text-slate-400 leading-snug group-hover:text-slate-300 transition-colors">{text}</span>
                  </button>
                )
              ))}
              {editMode && (
                <button type="button" onClick={() => setEditRecs(prev => [...prev, ''])}
                  className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 transition-colors mt-1">
                  <Plus className="w-3 h-3" /> Add recommendation
                </button>
              )}
            </div>
          </div>

          {/* Advisory Notes (editable) */}
          <div className={`bg-[#131720] border rounded-xl p-4 transition-all ${editMode ? 'border-amber-500/30' : 'border-[#1e2433]'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Advisory Notes</h3>
              {editMode && <span className="text-[8px] text-amber-400 font-semibold flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />Editing</span>}
            </div>
            {editMode ? (
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                rows={3} placeholder="Add context, caveats, or custom notes for this report…"
                className="w-full bg-[#0c0e14] border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 resize-none transition-colors" />
            ) : (
              editNotes
                ? <p className="text-[10px] text-slate-400 leading-relaxed">{editNotes}</p>
                : <p className="text-[10px] text-slate-600 italic">No notes — click Edit Report to add context</p>
            )}
          </div>
        </div>}

        {/* floatingChat mode: analytics promoted to main center column */}
        {floatingChat && <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Strategic priorities */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {live.priorities.map((p, i) => (
              <div key={i} className="bg-[#131720] border border-[#1e2433] rounded-xl p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">{p.label}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${lvlColor(p.level)}`}>{p.level}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Maturity heatmap */}
            <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Maturity Heatmap</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Strategy', val: (live.maturity_score >= 60 ? 'High' : 'Medium') as 'High'|'Medium'|'Low' },
                  { label: 'Processes', val: (live.bench_strength > 50 ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                  { label: 'People', val: (live.risk_low > 40 ? 'Medium' : 'High') as 'High'|'Medium'|'Low' },
                  { label: 'Data', val: (data.maturity_stage === 'mature' ? 'High' : data.maturity_stage === 'scale' ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                  { label: 'Tech', val: (data.maturity_stage === 'mature' ? 'Medium' : 'Low') as 'High'|'Medium'|'Low' },
                  { label: 'Gov.', val: (data.operating_model ? 'High' : 'Low') as 'High'|'Medium'|'Low' },
                ].map(c => (
                  <button key={c.label} type="button" onClick={() => send(`What does ${c.label} maturity mean for us?`)}>
                    <HeatCell label={c.label} val={c.val} />
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">Current: <span className="text-amber-400 font-semibold">{matLabel}</span></p>
            </div>

            {/* Workforce risk */}
            <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Workforce Risk</h3>
              <div className="flex items-center gap-4">
                <DonutChart high={live.risk_high} med={live.risk_med} low={live.risk_low} />
                <div className="space-y-2 flex-1">
                  {[
                    { label: 'High', pct: live.risk_high, col: 'bg-red-500' },
                    { label: 'Medium', pct: live.risk_med, col: 'bg-amber-500' },
                    { label: 'Low', pct: live.risk_low, col: 'bg-green-500' },
                  ].map(r => (
                    <button key={r.label} type="button" onClick={() => send(`Explain the ${r.label.toLowerCase()} retention risk segment`)}
                      className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
                      <div className={`w-2 h-2 rounded-full ${r.col}`} />
                      <span className="text-[10px] text-slate-400 flex-1 text-left">{r.label}</span>
                      <span className="text-[10px] text-slate-200 font-bold">{r.pct}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Leadership pipeline */}
            <div className="bg-[#131720] border border-[#1e2433] rounded-xl p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Leadership Pipeline</h3>
              <div className="space-y-4">
                {[
                  { label: 'Ready Now', pct: live.readiness_now, vals: [10,12,14,15,live.readiness_now], col: '#3b82f6' },
                  { label: '1–2 Years', pct: live.readiness_near, vals: [35,38,40,41,live.readiness_near], col: '#6366f1' },
                  { label: '3–5 Years', pct: live.readiness_later, vals: [52,50,48,45,live.readiness_later], col: '#8b5cf6' },
                ].map(r => (
                  <button key={r.label} type="button" onClick={() => send(`What actions will accelerate ${r.label} readiness?`)} className="w-full text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-400 group-hover:text-slate-200 transition-colors">{r.label}</span>
                      <span className="text-[10px] font-bold text-white">{r.pct}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#1e2433] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.pct}%`, background: r.col }} />
                      </div>
                      <Sparkline vals={r.vals} color={r.col} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendations + Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`bg-[#131720] border rounded-xl p-5 transition-all ${editMode ? 'border-amber-500/30' : 'border-[#1e2433]'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Recommendations</h3>
                {editMode && <span className="text-[8px] text-amber-400 font-semibold flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />Editing</span>}
              </div>
              <div className="space-y-2">
                {(editRecs.length > 0 ? editRecs : live.recommendations.map(r => r.text)).map((text, i) => (
                  editMode ? (
                    <div key={i} className="flex items-start gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 bg-blue-400" />
                      <input value={text} onChange={e => setEditRecs(prev => prev.map((r, j) => j === i ? e.target.value : r))}
                        className="flex-1 bg-[#0c0e14] border border-amber-500/30 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-amber-400/60 transition-colors" />
                    </div>
                  ) : (
                    <button key={i} type="button" onClick={() => { send(`Tell me more about: ${text}`); setChatOpen(true) }}
                      className="flex items-start gap-2 w-full text-left hover:opacity-80 transition-opacity group">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${live.recommendations[i]?.priority === 'High' ? 'bg-red-400' : 'bg-amber-400'}`} />
                      <span className="text-[10px] text-slate-400 leading-snug group-hover:text-slate-300 transition-colors">{text}</span>
                    </button>
                  )
                ))}
                {editMode && (
                  <button type="button" onClick={() => setEditRecs(prev => [...prev, ''])}
                    className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 transition-colors mt-1">
                    <Plus className="w-3 h-3" /> Add recommendation
                  </button>
                )}
              </div>
            </div>

            <div className={`bg-[#131720] border rounded-xl p-5 transition-all ${editMode ? 'border-amber-500/30' : 'border-[#1e2433]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Advisory Notes</h3>
                {editMode && <span className="text-[8px] text-amber-400 font-semibold flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />Editing</span>}
              </div>
              {editMode ? (
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  rows={4} placeholder="Add context, caveats, or custom notes for this report…"
                  className="w-full bg-[#0c0e14] border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 resize-none transition-colors" />
              ) : (
                editNotes
                  ? <p className="text-xs text-slate-400 leading-relaxed">{editNotes}</p>
                  : <p className="text-xs text-slate-600 italic">No notes — click Edit Report to add context</p>
              )}
            </div>
          </div>
        </div>}
      </div>

      {/* Deliverables canvas */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Live Deliverables Canvas</span>
          <button type="button" onClick={() => send('What deliverables should we prioritize first?')}
            className="text-[10px] text-blue-400 font-semibold hover:text-blue-300 flex items-center gap-0.5 transition-colors">
            Ask AI <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { n: 1, title: 'Executive Deck', sub: '12 slides', icon: BarChart3, preview: <div className="space-y-1"><div className="h-2 w-full bg-blue-600/50 rounded-sm" /><div className="h-1.5 w-3/4 bg-white/15 rounded-sm" /><div className="h-1.5 w-5/6 bg-white/15 rounded-sm" /></div>, prompt: 'How should we structure the executive deck for leadership?' },
            { n: 2, title: 'HC Framework', sub: 'v2.1', icon: Zap, preview: <div className="text-center"><div className="text-[8px] text-slate-400 mb-1">Alignment</div><div className="flex gap-1 justify-center">{['Org','People','Cap'].map(l=><div key={l} className="text-[7px] px-1 py-0.5 bg-white/8 text-slate-400 rounded">{l}</div>)}</div></div>, prompt: 'Outline the HC framework structure we should use' },
            { n: 3, title: 'Workforce Roadmap', sub: 'v2.0', icon: TrendingUp, preview: <div className="flex gap-0.5 items-end h-10">{[40,55,45,70,60,75].map((h,i)=><div key={i} className="flex-1 rounded-sm" style={{height:`${h}%`,background:`hsl(${220+i*15},70%,${50+i*3}%)`}}/>)}</div>, prompt: 'What should our workforce planning roadmap look like?' },
            { n: 4, title: 'Benchmarking', sub: INDUSTRIES.find(i=>i.value===data.industry)?.label?.split(' ')[0]??'Industry', icon: Target, preview: <div className="flex items-end gap-1.5 h-10 justify-center"><div className="flex flex-col items-center gap-0.5"><div className="w-5 rounded-sm bg-blue-500/60" style={{height:`${live.bench_strength*0.5}%`}}/><span className="text-[7px] text-slate-500">You</span></div><div className="flex flex-col items-center gap-0.5"><div className="w-5 rounded-sm bg-white/15" style={{height:'40%'}}/><span className="text-[7px] text-slate-500">Avg</span></div><div className="flex flex-col items-center gap-0.5"><div className="w-5 rounded-sm bg-green-500/60" style={{height:'80%'}}/><span className="text-[7px] text-slate-500">Top</span></div></div>, prompt: 'How do we benchmark against industry peers?' },
            { n: 5, title: 'Maturity Dashboard', sub: matLabel, icon: Gauge, preview: <div className="flex justify-center"><svg width="44" height="44" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#1e293b" strokeWidth="8"/><circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" strokeWidth="8" strokeDasharray={`${(live.maturity_score/100)*125.6} 125.6`} transform="rotate(-90 25 25)"/><text x="25" y="29" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{live.maturity_score}</text></svg></div>, prompt: 'What maturity improvements should we focus on?' },
            { n: 6, title: 'AI Recommendations', sub: `${live.recommendations.length} recs`, icon: Sparkles, preview: <div className="space-y-1">{live.recommendations.slice(0,3).map((r,i)=><div key={i} className="flex items-center gap-1"><div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.priority==='High'?'bg-red-400':'bg-amber-400'}`}/><span className="text-[8px] text-slate-400 truncate">{r.text.slice(0,22)}…</span></div>)}</div>, prompt: 'Walk me through all your recommendations in priority order' },
          ].map(d => (
            <motion.button key={d.n} type="button" whileHover={{ scale: 1.02, borderColor: 'rgba(59,130,246,0.4)' }} whileTap={{ scale: 0.97 }}
              onClick={() => { setExpandedDeliverable(expandedDeliverable === d.n ? null : d.n); send(d.prompt) }}
              className={`bg-[#131720] border rounded-xl p-3 text-left transition-all group ${expandedDeliverable === d.n ? 'border-blue-500/50' : 'border-[#1e2433]'}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[9px] font-bold text-slate-600">{d.n}</span>
                <d.icon className="w-3 h-3 text-blue-400" />
                <span className="text-[9px] font-semibold text-slate-300 flex-1 truncate">{d.title}</span>
              </div>
              <div className="mb-2 min-h-[36px] flex items-center">{d.preview}</div>
              <div className="flex justify-between items-center">
                <span className="text-[8px] text-slate-600">{d.sub}</span>
                <span className="text-[8px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">Ask AI →</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Floating chat button + drawer (floatingChat mode only) ────────────── */}
      {floatingChat && (
        <>
          {/* Floating button */}
          <AnimatePresence>
            {!chatOpen && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                onClick={() => setChatOpen(true)}
                className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full shadow-[0_8px_32px_rgba(37,99,235,0.5)] flex items-center justify-center transition-colors"
              >
                <Bot className="w-6 h-6 text-white" />
                {msgs.length > 1 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-[#0c0e14]">
                    {msgs.filter(m => m.role === 'ai').length}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Chat drawer */}
          <AnimatePresence>
            {chatOpen && (
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.96 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed bottom-6 right-6 z-40 w-[400px] h-[560px] bg-[#131720] border border-[#1e2433] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden"
              >
                {/* Drawer header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433] flex-shrink-0 bg-[#0c0e14]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-white">AI Advisory</span>
                      <span className="ml-2 text-[9px] text-green-400 font-medium">● Live</span>
                    </div>
                  </div>
                  <button onClick={() => setChatOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick prompts */}
                <div className="flex gap-1.5 px-3 pt-2 pb-1 overflow-x-auto flex-shrink-0">
                  {QUICK_PROMPTS.map(qp => (
                    <button key={qp.label} type="button" onClick={() => send(qp.q)}
                      className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border border-[#1e2433] bg-[#0c0e14] text-slate-400 hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all whitespace-nowrap flex-shrink-0">
                      <qp.icon className="w-3 h-3" /> {qp.label}
                    </button>
                  ))}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {msgs.map((m, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role === 'ai' && (
                        <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      )}
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${m.role === 'ai' ? 'bg-white/5 border border-white/8 text-slate-200' : 'bg-blue-600 text-white'}`}>
                        <p className="text-[10px] font-bold mb-1 opacity-50">{m.role === 'ai' ? 'AIVORA HC' : 'You'}</p>
                        {m.text}
                      </div>
                      {m.role === 'user' && (
                        <div className="w-7 h-7 rounded-full bg-slate-700 border border-white/15 flex-shrink-0 mt-1 flex items-center justify-center text-[10px] font-bold text-white">
                          {data.org_name.slice(0, 2).toUpperCase() || 'ME'}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {typing && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-blue-900/60 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3 flex items-center gap-1">
                        {[0, 1, 2].map(d => <div key={d} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-[#1e2433] flex-shrink-0 bg-[#0c0e14]">
                  <div className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                      placeholder="Ask about succession, retention, pipeline…"
                      className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors" />
                    <button onClick={() => send()}
                      disabled={!input.trim()}
                      className="w-8 h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-lg flex items-center justify-center transition-colors flex-shrink-0">
                      <Send className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-600 text-center mt-1.5">AI-generated insights · Validate with expert judgment</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ─── buildPanel ───────────────────────────────────────────────────────────────
function buildPanel(data: WizardData): LivePanel {
  const msMap: Record<string, number> = { startup: 18, growth: 35, scale: 55, mature: 72, restructuring: 40 }
  const ms = msMap[data.maturity_stage] ?? 45
  const sizeBonus = { micro: 0, small: 2, mid: 5, large: 8, enterprise: 10 }[data.org_size] ?? 4
  const bench = Math.min(96, Math.max(18, ms + sizeBonus + data.hc_priorities.length * 2 + data.business_priorities.length))
  const poolNum = { micro: 8, small: 22, mid: 65, large: 185, enterprise: 420 }[data.org_size] ?? 40
  const rh = Math.max(10, Math.round(48 - ms / 3)); const rm = Math.min(55, 100 - rh - 25); const rl = 100 - rh - rm
  return {
    bench_strength: Math.round(bench), pool_size: poolNum,
    readiness_now: Math.round(bench * 0.18), readiness_near: Math.round(bench * 0.44),
    readiness_later: 100 - Math.round(bench * 0.18) - Math.round(bench * 0.44),
    risk_high: rh, risk_med: rm, risk_low: rl, maturity_score: ms,
    priorities: [
      { label: 'Leadership Pipeline', level: (data.talent_challenges.includes('hipo-gap') || data.leadership_challenges.includes('succession-risk') ? 'High' : 'Medium') as 'High'|'Medium'|'Low' },
      { label: 'Retention Risk', level: (data.workforce_challenges.includes('high-attrition') ? 'High' : 'Medium') as 'High'|'Medium'|'Low' },
      { label: 'Skills & Capability', level: (data.workforce_challenges.includes('skill-mismatch') ? 'High' : 'Medium') as 'High'|'Medium'|'Low' },
      { label: 'Culture & Engagement', level: (data.ex_reward_challenges.includes('engagement-decline') ? 'High' : 'Low') as 'High'|'Medium'|'Low' },
    ],
    recommendations: [
      { text: 'Accelerate leadership pipeline programs', priority: (data.talent_challenges.includes('hipo-gap') ? 'High' : 'Medium') as 'High'|'Medium' },
      { text: 'Implement internal mobility framework', priority: 'High' },
      { text: 'Build critical role continuity plans', priority: (data.leadership_challenges.includes('succession-risk') ? 'High' : 'Medium') as 'High'|'Medium' },
      { text: 'Launch skills development track', priority: (data.workforce_challenges.includes('skill-mismatch') ? 'High' : 'Medium') as 'High'|'Medium' },
    ],
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HipoStudio() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { workspaces, fetchWorkspaces } = useWorkspaceStore()
  const { profile, isCompleted } = useClientProfileStore()

  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(() => {
    const p = profile
    // Always pre-fill org fields — they come from workspace creation even before onboarding is done
    return {
      org_name: p.organization.name ?? '',
      industry: p.organization.industry !== 'other' ? p.organization.industry : '',
      sub_sector: p.organization.subSector ?? '',
      region: p.organization.region !== 'gcc' ? p.organization.region : '',
      country: p.organization.country ?? '',
      org_size: p.organization.organizationSize !== 'mid' ? p.organization.organizationSize : '',
      maturity_stage: p.organization.maturityStage !== 'mature' ? p.organization.maturityStage : '',
      operating_model: p.organization.operatingModel !== 'single-entity' ? p.organization.operatingModel : '',
      // Agenda + workforce only if onboarding was completed
      business_priorities: isCompleted ? p.agenda.businessPriorities : [],
      hc_priorities: isCompleted ? p.agenda.hcPriorities : [],
      transformation_agenda: isCompleted ? p.agenda.transformationAgenda : [],
      key_pain_points: isCompleted ? p.agenda.keyPainPoints : [],
      workforce_challenges: isCompleted ? p.workforceContext.workforceChallenges : [],
      talent_challenges: isCompleted ? p.workforceContext.talentChallenges : [],
      leadership_challenges: isCompleted ? p.workforceContext.leadershipChallenges : [],
      ex_reward_challenges: isCompleted ? p.workforceContext.exRewardChallenges : [],
      nationalization_on: isCompleted ? p.workforceContext.nationalizationContext.applicable : false,
      nationalization_program: isCompleted ? (p.workforceContext.nationalizationContext.programName ?? '') : '',
      current_rate_band: isCompleted ? (p.workforceContext.nationalizationContext.currentRateBand ?? '') : '',
      target_rate_band: isCompleted ? (p.workforceContext.nationalizationContext.targetRateBand ?? '') : '',
      available_docs: isCompleted ? p.evidence.availableDocuments : [],
      evidence_notes: isCompleted ? (p.evidence.notes ?? '') : '',
      output_types: isCompleted ? p.outputPreferences.preferredOutputType : [],
      audiences: isCompleted ? p.outputPreferences.audience : [],
      confidentiality: isCompleted ? p.outputPreferences.confidentiality : 'internal',
      urgency: isCompleted ? p.outputPreferences.urgency : 'this-quarter',
    }
  })
  const [phase, setPhase] = useState<'wizard' | 'generating' | 'dashboard'>('wizard')
  const [live, setLive]   = useState<LivePanel | null>(null)
  const [skillId, setSkillId] = useState<string | null>(null)

  useEffect(() => {
    skillsAPI.list().then(res => {
      const list = Array.isArray(res.data) ? res.data : res.data?.skills ?? []
      const h = list.find((s: { slug: string }) => s.slug === 'hipo-development')
      if (h) setSkillId(h.id)
    }).catch(() => {})
    if (workspaces.length === 0) fetchWorkspaces()
  }, []) // eslint-disable-line

  // Once workspaces load, fill org_name from workspace client_name if not already set
  useEffect(() => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (ws?.client_name) {
      setData(d => ({ ...d, org_name: d.org_name || ws.client_name }))
    }
  }, [workspaces]) // eslint-disable-line

  const advance = (partial: Partial<WizardData>) => {
    const next = { ...data, ...partial }
    setData(next)
    if (step < STEP_META.length - 1) setStep(s => s + 1); else generate(next)
  }

  const generate = async (d: WizardData) => {
    setPhase('generating')
    const panel = buildPanel(d)
    await new Promise(r => setTimeout(r, 2600))
    if (workspaceId && skillId) {
      try {
        await aiAPI.startJob(workspaceId, skillId, {
          organization_name: d.org_name, industry: d.industry, region: d.region,
          org_size: d.org_size, maturity_stage: d.maturity_stage,
          business_priorities: d.business_priorities.join(', '),
          hc_priorities: d.hc_priorities.join(', '),
          key_pain_points: d.key_pain_points.join(' | '),
          urgency: d.urgency,
        })
        toast.success('HiPo Advisory generated')
      } catch { /* proceed */ }
    }
    setLive(panel)
    setPhase('dashboard')
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  if (phase === 'dashboard' && live) {
    return (
      <div className={`min-h-screen ${PAGE_BG} text-slate-200 flex flex-col`}>
        <header className="h-14 border-b border-[#1a1e2e] flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">AIVORA HC</span>
            <span className="text-slate-600 text-sm">·</span>
            <span className="text-xs text-slate-500">AI-Powered Human Capital Advisory</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Evidence</span>
              <span className="text-white font-bold">{Math.min(100, data.available_docs.length * 9)}%</span>
              <div className="w-16 h-1 bg-slate-800 rounded-full"><div className="h-1 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, data.available_docs.length * 9)}%` }} /></div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Urgency</span>
              <span className="text-white font-bold">{URGENCY.find(u => u.value === data.urgency)?.label ?? '—'}</span>
            </div>
            <button onClick={() => { setPhase('wizard'); setStep(0) }}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg font-bold hover:bg-amber-500/25 transition-colors">
              <AlertTriangle className="w-3 h-3" /> Edit Profile
            </button>
            <button onClick={() => generate(data)}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 bg-white/5 border border-white/8 text-slate-400 rounded-lg font-semibold hover:bg-white/10 transition-colors">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <LiveDashboard data={data} live={live} />
        </main>
      </div>
    )
  }

  // ── Generating ────────────────────────────────────────────────────────────
  if (phase === 'generating') return <GeneratingScreen orgName={data.org_name} />

  // ── Wizard ────────────────────────────────────────────────────────────────
  const stepContent = [
    <StepOrg        key={0} data={data} onNext={advance} />,
    <StepPriorities key={1} data={data} onNext={advance} onBack={() => setStep(0)} />,
    <StepWorkforce  key={2} data={data} onNext={advance} onBack={() => setStep(1)} />,
    <StepEvidence   key={3} data={data} onNext={advance} onBack={() => setStep(2)} />,
    <StepRecommendations key={4} data={data} onLaunch={() => generate(data)} />,
  ]

  return (
    <div className={`h-screen ${PAGE_BG} text-slate-200 flex flex-col overflow-hidden`}>
      <WizardHeader step={step} onBack={() => step > 0 ? setStep(s => s - 1) : navigate(-1)} onExit={() => navigate(-1)} />
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={step} className="flex-1 flex overflow-hidden"
            initial={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -24, filter: 'blur(8px)' }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}>
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>
        <div className="border-l border-[#1a1e2e] flex-shrink-0">
          <AIPanel step={step} />
        </div>
      </div>
    </div>
  )
}

// ─── HiPo Studio V2 (floating chat variant) ───────────────────────────────────
export function HipoStudioV2() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { workspaces, fetchWorkspaces } = useWorkspaceStore()
  const { profile, isCompleted } = useClientProfileStore()

  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>(() => {
    const p = profile
    return {
      org_name: p.organization.name ?? '',
      industry: p.organization.industry !== 'other' ? p.organization.industry : '',
      sub_sector: p.organization.subSector ?? '',
      region: p.organization.region !== 'gcc' ? p.organization.region : '',
      country: p.organization.country ?? '',
      org_size: p.organization.organizationSize !== 'mid' ? p.organization.organizationSize : '',
      maturity_stage: p.organization.maturityStage !== 'mature' ? p.organization.maturityStage : '',
      operating_model: p.organization.operatingModel !== 'single-entity' ? p.organization.operatingModel : '',
      business_priorities: isCompleted ? p.agenda.businessPriorities : [],
      hc_priorities: isCompleted ? p.agenda.hcPriorities : [],
      transformation_agenda: isCompleted ? p.agenda.transformationAgenda : [],
      key_pain_points: isCompleted ? p.agenda.keyPainPoints : [],
      workforce_challenges: isCompleted ? p.workforceContext.workforceChallenges : [],
      talent_challenges: isCompleted ? p.workforceContext.talentChallenges : [],
      leadership_challenges: isCompleted ? p.workforceContext.leadershipChallenges : [],
      ex_reward_challenges: isCompleted ? p.workforceContext.exRewardChallenges : [],
      nationalization_on: isCompleted ? p.workforceContext.nationalizationContext.applicable : false,
      nationalization_program: isCompleted ? (p.workforceContext.nationalizationContext.programName ?? '') : '',
      current_rate_band: isCompleted ? (p.workforceContext.nationalizationContext.currentRateBand ?? '') : '',
      target_rate_band: isCompleted ? (p.workforceContext.nationalizationContext.targetRateBand ?? '') : '',
      available_docs: isCompleted ? p.evidence.availableDocuments : [],
      evidence_notes: isCompleted ? (p.evidence.notes ?? '') : '',
      output_types: isCompleted ? p.outputPreferences.preferredOutputType : [],
      audiences: isCompleted ? p.outputPreferences.audience : [],
      confidentiality: isCompleted ? p.outputPreferences.confidentiality : 'internal',
      urgency: isCompleted ? p.outputPreferences.urgency : 'this-quarter',
    }
  })
  const [phase, setPhase] = useState<'wizard' | 'generating' | 'dashboard'>('wizard')
  const [live, setLive] = useState<LivePanel | null>(null)
  const [skillId, setSkillId] = useState<string | null>(null)

  useEffect(() => {
    skillsAPI.list().then(res => {
      const list = Array.isArray(res.data) ? res.data : res.data?.skills ?? []
      const h = list.find((s: { slug: string }) => s.slug === 'hipo-development')
      if (h) setSkillId(h.id)
    }).catch(() => {})
    if (workspaces.length === 0) fetchWorkspaces()
  }, []) // eslint-disable-line

  useEffect(() => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (ws?.client_name) setData(d => ({ ...d, org_name: d.org_name || ws.client_name }))
  }, [workspaces]) // eslint-disable-line

  const advance = (partial: Partial<WizardData>) => {
    const next = { ...data, ...partial }
    setData(next)
    if (step < STEP_META.length - 1) setStep(s => s + 1); else generate(next)
  }

  const generate = async (d: WizardData) => {
    setPhase('generating')
    const panel = buildPanel(d)
    await new Promise(r => setTimeout(r, 2600))
    if (workspaceId && skillId) {
      try {
        await aiAPI.startJob(workspaceId, skillId, {
          organization_name: d.org_name, industry: d.industry, region: d.region,
          org_size: d.org_size, maturity_stage: d.maturity_stage,
          business_priorities: d.business_priorities.join(', '),
          hc_priorities: d.hc_priorities.join(', '),
          key_pain_points: d.key_pain_points.join(' | '),
          urgency: d.urgency,
        })
        toast.success('HiPo Advisory generated')
      } catch { /* proceed */ }
    }
    setLive(panel)
    setPhase('dashboard')
  }

  if (phase === 'dashboard' && live) {
    return (
      <div className={`min-h-screen ${PAGE_BG} text-slate-200 flex flex-col`}>
        <header className="h-14 border-b border-[#1a1e2e] flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">AIVORA HC</span>
            <span className="text-slate-600 text-sm">·</span>
            <span className="text-xs text-slate-400">AI Advisory · Clean View</span>
            <span className="text-[9px] px-2 py-0.5 bg-blue-500/15 border border-blue-500/25 text-blue-400 rounded-full font-bold ml-2">New</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Evidence</span>
              <span className="text-white font-bold">{Math.min(100, data.available_docs.length * 9)}%</span>
              <div className="w-16 h-1 bg-slate-800 rounded-full"><div className="h-1 bg-blue-500 rounded-full" style={{ width: `${Math.min(100, data.available_docs.length * 9)}%` }} /></div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">Urgency</span>
              <span className="text-white font-bold">{URGENCY.find(u => u.value === data.urgency)?.label ?? '—'}</span>
            </div>
            <button onClick={() => { setPhase('wizard'); setStep(0) }}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg font-bold hover:bg-amber-500/25 transition-colors">
              <AlertTriangle className="w-3 h-3" /> Edit Profile
            </button>
            <button onClick={() => generate(data)}
              className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 bg-white/5 border border-white/8 text-slate-400 rounded-lg font-semibold hover:bg-white/10 transition-colors">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <LiveDashboard data={data} live={live} floatingChat />
        </main>
      </div>
    )
  }

  if (phase === 'generating') return <GeneratingScreen orgName={data.org_name} />

  const stepContent = [
    <StepOrg        key={0} data={data} onNext={advance} />,
    <StepPriorities key={1} data={data} onNext={advance} onBack={() => setStep(0)} />,
    <StepWorkforce  key={2} data={data} onNext={advance} onBack={() => setStep(1)} />,
    <StepEvidence   key={3} data={data} onNext={advance} onBack={() => setStep(2)} />,
    <StepRecommendations key={4} data={data} onLaunch={() => generate(data)} />,
  ]

  return (
    <div className={`h-screen ${PAGE_BG} text-slate-200 flex flex-col overflow-hidden`}>
      <WizardHeader step={step} onBack={() => step > 0 ? setStep(s => s - 1) : navigate(-1)} onExit={() => navigate(-1)} />
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={step} className="flex-1 flex overflow-hidden"
            initial={{ opacity: 0, x: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -24, filter: 'blur(8px)' }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}>
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>
        <div className="border-l border-[#1a1e2e] flex-shrink-0">
          <AIPanel step={step} />
        </div>
      </div>
    </div>
  )
}
