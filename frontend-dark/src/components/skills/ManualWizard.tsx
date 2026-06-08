import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardContext = Record<string, string | string[] | undefined>

interface ManualWizardProps {
  skillSlug: string
  skillName: string
  onGenerate: (ctx: WizardContext) => void
  isGenerating: boolean
}

// ─── Suggestion lists ─────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Financial Services', 'Healthcare & Life Sciences', 'Technology', 'Retail & Consumer',
  'Energy & Utilities', 'Manufacturing', 'Professional Services', 'Government & Public Sector',
  'Education', 'Real Estate', 'Telecommunications', 'Media & Entertainment',
]
const REGIONS = [
  'North America', 'Europe', 'Asia Pacific', 'Middle East & Africa',
  'Latin America', 'Global / Multi-region', 'UK & Ireland', 'ANZ',
]
const HEADCOUNTS = ['1–50', '51–200', '201–1,000', '1,001–5,000', '5,001–20,000', '20,000+']
const LIFECYCLE_STAGES = [
  'Start-up', 'Growth / Scale-up', 'Established Enterprise',
  'Transformation / Restructure', 'Mature / Optimising', 'Pre-IPO / M&A',
]
const STRATEGIC_PRIORITIES = [
  'Talent Attraction & Retention', 'Leadership Development', 'Culture Transformation',
  'Digital & AI Capability', 'Workforce Planning', 'Org Restructuring',
  'Succession Planning', 'Diversity, Equity & Inclusion', 'Learning & Development',
  'Compensation & Benefits', 'Employee Experience', 'Performance Management',
  'HR Technology & Analytics', 'Agile Ways of Working', 'Wellbeing Strategy',
]
const KEY_CHALLENGES = [
  'High attrition', 'Thin leadership pipeline', 'Siloed culture', 'Skills gaps',
  'Inconsistent performance', 'Low engagement scores', 'Slow hiring velocity',
  'Compliance & regulatory risk', 'Remote workforce management', 'Change fatigue',
  'Underfunded HC function', 'Legacy HR systems',
]
const HC_DOMAINS = [
  'Talent Acquisition', 'Learning & Development', 'Performance Management',
  'Culture & Engagement', 'Leadership Development', 'Workforce Planning',
  'Analytics & Reporting', 'Total Rewards', 'Succession Planning', 'Employee Experience',
]
const MATURITY_DIMS = [
  'Talent Acquisition', 'Learning & Development', 'Performance Management',
  'Succession Planning', 'Workforce Analytics', 'Culture & Engagement',
  'Leadership Development', 'Total Rewards', 'HR Technology', 'Compliance',
]
const BENCHMARKING_METRICS = [
  'Cost per hire', 'Time to hire', 'Attrition rate', 'Engagement score',
  'Training hours per employee', 'Revenue per FTE', 'Promotion rate',
  'Internal mobility rate', 'Absenteeism rate', 'HR-to-employee ratio',
]
const TALENT_PROFILES = [
  'Senior Technology', 'Mid-level Commercial', 'Graduate / Early Career',
  'Executive / C-suite', 'Frontline / Operational', 'Specialist / Niche',
  'Contract / Contingent', 'Global / Expatriate',
]
const LEARNING_MODALITIES = [
  'eLearning / LMS', 'Instructor-led training', 'Coaching & mentoring',
  'On-the-job learning', 'Blended learning', 'Microlearning', 'Leadership programmes',
]
const REWARDS_COMPONENTS = [
  'Base salary', 'Short-term incentive', 'Long-term incentive', 'Benefits & perks',
  'Recognition programmes', 'Equity / Stock options', 'Wellbeing benefits',
]
const TIMELINES = ['30 days', '60 days', '90 days', 'Q1 2026', 'Q2 2026', 'H1 2026', '12 months', '18 months']
const WORKFORCE_SEGMENTS = [
  'Corporate / HQ', 'Field / Operations', 'Technology & Engineering', 'Sales & Commercial',
  'Customer-facing', 'Finance & Risk', 'Shared Services', 'Executive Leadership',
]
const SUCCESSION_LEVELS = [
  'Executive / C-suite', 'Senior Leadership', 'Mid-level Management', 'Technical Experts', 'All levels',
]
const LEADERSHIP_POPULATION = [
  'Emerging leaders', 'Mid-level managers', 'Senior leaders', 'C-suite / Executive', 'New managers', 'Technical leads',
]

// ─── Step definition — ONE question per step ─────────────────────────────────

interface StepDef {
  key: string
  label: string           // progress bar label
  question: string        // bold question text shown to user
  hint?: string           // sub-text under question
  type: 'text' | 'textarea' | 'single' | 'multi'
  options?: string[]
  placeholder?: string
}

// ─── Per-skill step sequences ─────────────────────────────────────────────────

const ORG_STEPS: StepDef[] = [
  {
    key: 'org_name', label: 'Organisation',
    question: "What is the name of the organisation?",
    type: 'text', placeholder: 'e.g. Acme Corporation',
  },
  {
    key: 'industry', label: 'Industry',
    question: "Which industry or sector does the organisation operate in?",
    type: 'single', options: INDUSTRIES,
  },
  {
    key: 'headcount', label: 'Headcount',
    question: "What is the approximate headcount?",
    type: 'single', options: HEADCOUNTS,
  },
  {
    key: 'lifecycle', label: 'Company Stage',
    question: "What stage is the organisation at?",
    type: 'single', options: LIFECYCLE_STAGES,
  },
]

const SKILL_STEPS: Record<string, StepDef[]> = {

  'hc-framework': [
    ...ORG_STEPS,
    {
      key: 'region', label: 'Geography',
      question: "What is the geographic scope of this engagement?",
      type: 'single', options: REGIONS,
    },
    {
      key: 'maturity_level', label: 'HC Maturity',
      question: "How would you describe the current HC maturity?",
      hint: 'This sets the baseline for all recommendations',
      type: 'single', options: [
        'Nascent — minimal processes in place',
        'Developing — some processes, inconsistent',
        'Advanced — structured and measurable',
        'Leading — best-in-class, data-driven',
      ],
    },
    {
      key: 'strategic_priorities', label: 'Priorities',
      question: "What are the top strategic priorities for the HC function?",
      hint: 'Select all that apply — these anchor the framework pillars',
      type: 'multi', options: STRATEGIC_PRIORITIES,
    },
    {
      key: 'focus_areas', label: 'HC Domains',
      question: "Which HC domains should the framework cover?",
      type: 'multi', options: HC_DOMAINS,
    },
  ],

  'strategy': [
    ...ORG_STEPS,
    {
      key: 'horizon_years', label: 'Horizon',
      question: "What is the strategy horizon?",
      hint: 'How many years ahead should this strategy be scoped?',
      type: 'single', options: ['1 year', '2 years', '3 years', '5 years'],
    },
    {
      key: 'focus_areas', label: 'Focus Areas',
      question: "What should the HC strategy prioritise?",
      hint: 'Select the areas that need the most strategic attention',
      type: 'multi', options: STRATEGIC_PRIORITIES,
    },
    {
      key: 'business_goals', label: 'Business Goals',
      question: "What business outcomes must the HC strategy support?",
      hint: 'Be specific — the AI will align HC initiatives to these goals',
      type: 'textarea', placeholder: 'e.g. Grow revenue by 30%, enter 3 new markets, reduce attrition below 10%...',
    },
    {
      key: 'region', label: 'Geography',
      question: "What is the geographic scope of this strategy?",
      type: 'single', options: REGIONS,
    },
  ],

  'maturity': [
    ...ORG_STEPS,
    {
      key: 'dimensions', label: 'Dimensions',
      question: "Which HC dimensions should be assessed?",
      hint: 'Select all areas to include in the maturity assessment',
      type: 'multi', options: MATURITY_DIMS,
    },
    {
      key: 'current_scores', label: 'Current Scores',
      question: "Do you have self-assessed scores for any of these dimensions?",
      hint: 'Enter 1–5 scores per dimension, or leave blank to use industry baselines',
      type: 'textarea', placeholder: 'e.g. Talent Acquisition: 3, L&D: 2, Performance: 4...',
    },
    {
      key: 'benchmark_group', label: 'Benchmark',
      question: "Who should the organisation be benchmarked against?",
      type: 'single', options: ['Industry peers', 'Global top quartile', 'Direct competitors', 'Best-in-class'],
    },
  ],

  'benchmarking': [
    ...ORG_STEPS,
    {
      key: 'region', label: 'Geography',
      question: "What is the geographic scope for benchmarking?",
      type: 'single', options: REGIONS,
    },
    {
      key: 'metrics', label: 'Metrics',
      question: "Which HC metrics do you want to benchmark?",
      hint: 'Select all metrics you have data for or want compared',
      type: 'multi', options: BENCHMARKING_METRICS,
    },
    {
      key: 'current_values', label: 'Current Values',
      question: "What are the organisation's current figures for these metrics?",
      hint: 'The AI will compare these against industry data',
      type: 'textarea', placeholder: 'e.g. Cost per hire: $4,200 · Attrition rate: 18% · Engagement score: 62...',
    },
  ],

  'talent-acquisition': [
    ...ORG_STEPS,
    {
      key: 'open_roles', label: 'Open Roles',
      question: "How many roles are you looking to fill?",
      type: 'single', options: ['1–5', '6–20', '21–50', '51–100', '100+'],
    },
    {
      key: 'target_profile', label: 'Target Profile',
      question: "What type of candidates are you targeting?",
      hint: 'Select all talent profiles relevant to this hiring drive',
      type: 'multi', options: TALENT_PROFILES,
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "What is the target timeline for filling these roles?",
      type: 'single', options: ['1 month', '2 months', '3 months', '6 months', '12 months'],
    },
    {
      key: 'focus_areas', label: 'Strategy Focus',
      question: "What should the talent acquisition strategy prioritise?",
      type: 'multi', options: [
        'Employer branding', 'Sourcing diversity', 'Speed to hire',
        'Candidate experience', 'Cost efficiency', 'Campus / graduate', 'Executive search',
      ],
    },
  ],

  'performance-management': [
    ...ORG_STEPS,
    {
      key: 'performance_cycle', label: 'Review Cycle',
      question: "What is the current performance review cycle?",
      type: 'single', options: ['Annual', 'Bi-annual', 'Quarterly', 'Continuous / Always-on', 'No formal cycle'],
    },
    {
      key: 'current_challenges', label: 'Challenges',
      question: "What are the biggest challenges with the current approach?",
      type: 'multi', options: [
        'Low completion rates', 'Manager capability gaps', 'No link to pay',
        'Poor calibration', 'Recency bias', 'Lack of continuous feedback', 'Too process-heavy',
      ],
    },
    {
      key: 'focus_areas', label: 'Design Goals',
      question: "What should the redesigned performance approach achieve?",
      type: 'multi', options: [
        'Goal alignment (OKRs)', 'Continuous feedback', 'Calibration fairness',
        'Manager enablement', 'Link to rewards', 'Development conversations',
      ],
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "When does the new approach need to be live?",
      type: 'single', options: TIMELINES,
    },
  ],

  'succession': [
    ...ORG_STEPS,
    {
      key: 'succession_levels', label: 'Target Levels',
      question: "Which leadership levels need succession coverage?",
      type: 'multi', options: SUCCESSION_LEVELS,
    },
    {
      key: 'critical_roles', label: 'Critical Roles',
      question: "Which specific roles or functions are most critical to cover?",
      hint: 'Name the positions where a vacancy would cause the most disruption',
      type: 'textarea', placeholder: 'e.g. CEO, CFO, Head of Technology, Regional GMs...',
    },
    {
      key: 'readiness_horizon', label: 'Readiness',
      question: "What readiness horizon should the pipeline target?",
      type: 'single', options: ['Ready now', '1 year', '2 years', '3+ years', 'All horizons'],
    },
    {
      key: 'focus_areas', label: 'Programme Focus',
      question: "What should the succession programme focus on?",
      type: 'multi', options: [
        'HiPo identification', 'Accelerated development', 'Cross-functional exposure',
        'Coaching & mentoring', 'External benchmarking', 'Diversity in pipeline',
      ],
    },
  ],

  'leadership-development': [
    ...ORG_STEPS,
    {
      key: 'target_population', label: 'Target Group',
      question: "Which leaders is this programme designed for?",
      type: 'multi', options: LEADERSHIP_POPULATION,
    },
    {
      key: 'current_challenges', label: 'Challenges',
      question: "What leadership challenges need to be addressed?",
      type: 'multi', options: [
        'Inconsistent leadership style', 'Low psychological safety', 'Poor team performance',
        'Lack of strategic thinking', 'Low engagement scores', 'Poor change management',
      ],
    },
    {
      key: 'focus_areas', label: 'Development Focus',
      question: "What should leaders develop through this programme?",
      type: 'multi', options: [
        'Self-awareness & EQ', 'Strategic thinking', 'Coaching skills',
        'Change leadership', 'Team effectiveness', 'Executive presence', 'Commercial acumen',
      ],
    },
    {
      key: 'timeline_months', label: 'Duration',
      question: "How long should the programme run?",
      type: 'single', options: ['3 months', '6 months', '9 months', '12 months', '18 months'],
    },
  ],

  'total-rewards': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'Components',
      question: "Which rewards components are you reviewing or redesigning?",
      type: 'multi', options: REWARDS_COMPONENTS,
    },
    {
      key: 'current_challenges', label: 'Challenges',
      question: "What are the current pain points with your rewards approach?",
      type: 'multi', options: [
        'Pay equity gaps', 'Market uncompetitiveness', 'Low bonus uptake',
        'Benefits undervalued', 'Retention risk', 'Complexity in structure',
      ],
    },
    {
      key: 'region', label: 'Geography',
      question: "What is the geographic scope for this rewards review?",
      type: 'single', options: REGIONS,
    },
    {
      key: 'business_goals', label: 'Objectives',
      question: "What should the new rewards approach achieve?",
      type: 'textarea', placeholder: 'e.g. Reduce attrition by 15%, achieve market median pay, improve benefits uptake...',
    },
  ],

  'learning-training': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'Learning Needs',
      question: "What skills or behaviours need to be developed?",
      hint: 'Select all learning priorities for this engagement',
      type: 'multi', options: [
        'Technical / hard skills', 'Leadership & management', 'Compliance & regulatory',
        'Digital & data literacy', 'Customer experience', 'Collaboration & communication', 'Sales & commercial',
      ],
    },
    {
      key: 'target_profile', label: 'Target Audience',
      question: "Which employee groups will this learning cover?",
      type: 'multi', options: WORKFORCE_SEGMENTS,
    },
    {
      key: 'learning_modalities', label: 'Delivery',
      question: "What learning delivery methods should be used?",
      type: 'multi', options: LEARNING_MODALITIES,
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "What is the rollout timeline for this learning programme?",
      type: 'single', options: TIMELINES,
    },
  ],

  'workforce-planning': [
    ...ORG_STEPS,
    {
      key: 'planning_horizon', label: 'Horizon',
      question: "What planning horizon does this workforce plan cover?",
      type: 'single', options: ['1 year', '2 years', '3 years', '5 years'],
    },
    {
      key: 'focus_areas', label: 'Planning Focus',
      question: "What aspects of workforce planning should be covered?",
      type: 'multi', options: [
        'Headcount demand', 'Skills supply & demand', 'Attrition modelling',
        'Scenario planning', 'Critical role coverage', 'Cost optimisation', 'Automation impact',
      ],
    },
    {
      key: 'business_goals', label: 'Business Drivers',
      question: "What business changes are driving the workforce planning need?",
      hint: 'This context helps the AI frame the plan around real business pressures',
      type: 'textarea', placeholder: 'e.g. 30% growth in APAC, digital transformation programme, M&A integration...',
    },
    {
      key: 'current_challenges', label: 'Challenges',
      question: "What workforce challenges are you trying to solve?",
      type: 'multi', options: [
        'Skills shortages', 'Over-reliance on contractors', 'Location cost pressures',
        'Productivity gaps', 'Succession gaps in critical roles',
      ],
    },
  ],

  'hipo-development': [
    ...ORG_STEPS,
    {
      key: 'target_population', label: 'HiPo Pool',
      question: "Who is in scope for the HiPo programme?",
      type: 'multi', options: LEADERSHIP_POPULATION,
    },
    {
      key: 'focus_areas', label: 'Programme Design',
      question: "What should the HiPo programme develop?",
      type: 'multi', options: [
        'Accelerated career progression', 'Stretch assignments', 'Executive exposure',
        'Cross-functional rotation', 'External development', 'Mentoring from C-suite',
      ],
    },
    {
      key: 'timeline_months', label: 'Duration',
      question: "How long should the HiPo programme run?",
      type: 'single', options: ['6 months', '12 months', '18 months', '24 months'],
    },
  ],

  'capability-assessment': [
    ...ORG_STEPS,
    {
      key: 'dimensions', label: 'Capabilities',
      question: "Which capability areas should be assessed?",
      type: 'multi', options: [
        'Technical skills', 'Leadership behaviours', 'Digital literacy',
        'Commercial acumen', 'Functional expertise', 'Collaboration', 'Innovation mindset',
      ],
    },
    {
      key: 'target_profile', label: 'Target Population',
      question: "Which employee groups will be assessed?",
      type: 'multi', options: WORKFORCE_SEGMENTS,
    },
    {
      key: 'current_scores', label: 'Current Baseline',
      question: "Do you have any existing capability data to inform the assessment?",
      hint: 'Scores, survey results, or previous assessment findings',
      type: 'textarea', placeholder: 'e.g. Last engagement survey showed 42% felt under-skilled in digital...',
    },
  ],

  'employee-experience': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'EX Focus',
      question: "Which employee experience moments matter most for this engagement?",
      type: 'multi', options: [
        'Onboarding', 'Day-to-day work environment', 'Manager relationships',
        'Career development', 'Recognition & reward', 'Wellbeing', 'Offboarding',
      ],
    },
    {
      key: 'current_challenges', label: 'Pain Points',
      question: "What are the biggest employee experience issues today?",
      type: 'multi', options: KEY_CHALLENGES,
    },
    {
      key: 'business_goals', label: 'Desired Outcome',
      question: "What does an improved employee experience need to achieve for the business?",
      type: 'textarea', placeholder: 'e.g. Reduce attrition by 20%, improve eNPS from 20 to 50, increase productivity...',
    },
  ],

  'skills-development': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'Skills Gap',
      question: "Which skill gaps need to be addressed?",
      type: 'multi', options: [
        'Digital & technology', 'Data & analytics', 'Leadership', 'Commercial',
        'Customer-facing', 'Compliance', 'Functional / technical', 'Soft skills',
      ],
    },
    {
      key: 'target_profile', label: 'Target Audience',
      question: "Which employee groups are in scope for skills development?",
      type: 'multi', options: WORKFORCE_SEGMENTS,
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "What is the target timeline for measurable skills improvement?",
      type: 'single', options: TIMELINES,
    },
  ],

  'coaching-mentoring': [
    ...ORG_STEPS,
    {
      key: 'target_population', label: 'Programme Audience',
      question: "Who will participate in the coaching or mentoring programme?",
      type: 'multi', options: LEADERSHIP_POPULATION,
    },
    {
      key: 'focus_areas', label: 'Programme Type',
      question: "What type of coaching or mentoring is needed?",
      type: 'multi', options: [
        'Executive coaching', 'Group / team coaching', 'Peer mentoring',
        'Reverse mentoring', 'Cross-functional mentoring', 'New manager coaching',
      ],
    },
    {
      key: 'business_goals', label: 'Outcomes',
      question: "What should participants achieve through this programme?",
      type: 'textarea', placeholder: 'e.g. Improve leadership confidence, accelerate readiness for promotion, reduce derailment risk...',
    },
  ],

  'organization-development': [
    ...ORG_STEPS,
    {
      key: 'region', label: 'Geography',
      question: "What is the geographic scope of this OD engagement?",
      type: 'single', options: REGIONS,
    },
    {
      key: 'focus_areas', label: 'OD Focus',
      question: "What does this OD engagement need to address?",
      type: 'multi', options: [
        'Org structure design', 'Spans & layers optimisation', 'Team effectiveness',
        'Culture change', 'Change management', 'Process redesign', 'Role clarity',
      ],
    },
    {
      key: 'current_challenges', label: 'Current State',
      question: "What organisational problems are you trying to solve?",
      type: 'multi', options: [
        'Unclear accountabilities', 'Too many layers', 'Slow decision-making',
        'Siloed teams', 'Culture mismatch post-merger', 'Redundant roles',
      ],
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "What is the target timeline for this OD programme?",
      type: 'single', options: TIMELINES,
    },
  ],

  'early-career': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'Programme Type',
      question: "What type of early career programme are you designing?",
      type: 'multi', options: [
        'Graduate scheme', 'Apprenticeship', 'Internship programme',
        'School leaver programme', 'Rotational programme', 'Cadet / traineeship',
      ],
    },
    {
      key: 'target_profile', label: 'Target Cohort',
      question: "Who are you targeting with this programme?",
      type: 'multi', options: [
        'School leavers (16–18)', 'Undergraduates', 'Graduates', 'Postgraduates', 'Career changers',
      ],
    },
    {
      key: 'business_goals', label: 'Programme Goals',
      question: "What should this early career programme achieve for the business?",
      type: 'textarea', placeholder: 'e.g. Build a pipeline of future leaders, reduce graduate attrition, increase diversity in the workforce...',
    },
  ],

  'mobility': [
    ...ORG_STEPS,
    {
      key: 'focus_areas', label: 'Mobility Type',
      question: "What type of mobility programme is this engagement covering?",
      type: 'multi', options: [
        'Internal job moves', 'Cross-functional rotation', 'International assignments',
        'Short-term project mobility', 'Redeployment', 'Career lattice design',
      ],
    },
    {
      key: 'current_challenges', label: 'Current State',
      question: "What are the barriers to mobility in this organisation today?",
      type: 'multi', options: [
        'Managers blocking moves', 'Lack of visibility of opportunities', 'No formal process',
        'Pay inequity across roles', 'Skills mismatches', 'Cultural resistance',
      ],
    },
    {
      key: 'timeline_months', label: 'Timeline',
      question: "What is the timeline for launching or improving the mobility programme?",
      type: 'single', options: TIMELINES,
    },
  ],

}

// ─── Default for any skill not listed above ───────────────────────────────────

const DEFAULT_STEPS: StepDef[] = [
  ...ORG_STEPS,
  {
    key: 'strategic_priorities', label: 'Priorities',
    question: "What are the top strategic priorities for this engagement?",
    hint: 'Select all that apply — these will anchor the AI output',
    type: 'multi', options: STRATEGIC_PRIORITIES,
  },
  {
    key: 'current_challenges', label: 'Challenges',
    question: "What key challenges should the output address?",
    type: 'multi', options: KEY_CHALLENGES,
  },
  {
    key: 'business_goals', label: 'Goals',
    question: "What does success look like for this engagement?",
    hint: 'Describe the outcomes you want the deliverable to drive',
    type: 'textarea', placeholder: 'e.g. Reduce attrition by 15%, improve manager capability, launch a new L&D programme...',
  },
  {
    key: 'timeline_months', label: 'Timeline',
    question: "What is the implementation timeline?",
    type: 'single', options: TIMELINES,
  },
]

// ─── Context normalisation ────────────────────────────────────────────────────

function normaliseContext(slug: string, ctx: WizardContext): WizardContext {
  const join = (k: string) => Array.isArray(ctx[k]) ? (ctx[k] as string[]).join(', ') : ((ctx[k] as string) ?? '')
  const str  = (k: string) => (ctx[k] as string) ?? ''

  return {
    ...ctx,
    strategic_priorities: join('strategic_priorities') || join('focus_areas'),
    focus_areas:          join('focus_areas') || join('strategic_priorities'),
    business_goals:       str('business_goals') || join('current_challenges'),
    maturity_level:       str('maturity_level').split('—')[0].trim().toLowerCase() || 'developing',
    horizon_years:        str('horizon_years').replace(/\D+$/, '') || str('planning_horizon').replace(/\D+$/, '') || '3',
    dimensions:           join('dimensions') || join('focus_areas'),
    current_scores:       str('current_scores') || 'not provided',
    metrics:              join('metrics') || join('focus_areas'),
    current_values:       str('current_values') || 'not provided',
    open_roles:           str('open_roles') || 'multiple',
    target_profile:       join('target_profile') || 'general workforce',
    timeline_months:      str('timeline_months').replace(/\D+$/, '') || '3',
  }
}

// ─── Pill selector components ─────────────────────────────────────────────────

function PillGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150',
              on
                ? 'bg-[#3b82f6] border-[#3b82f6] text-black'
                : 'bg-[#131720] border-[#1e2433] text-slate-300 hover:border-[#3b82f6] hover:text-white'
            )}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function SingleSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <PillGroup options={options} selected={value ? [value] : []}
      onToggle={v => onChange(v === value ? '' : v)} />
  )
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ total, current, completed }: { total: number; current: number; completed: number[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const done   = completed.includes(n)
        const active = current === n
        return (
          <div key={n} className={cn(
            'rounded-full transition-all duration-300',
            done   ? 'w-2 h-2 bg-[#3b82f6]' :
            active ? 'w-3 h-3 bg-[#3b82f6]' :
                     'w-2 h-2 bg-[#2A2A2A]'
          )} />
        )
      })}
    </div>
  )
}

// ─── Main wizard ───────────────────────────────────────────────────────────────

export function ManualWizard({ skillSlug, skillName, onGenerate, isGenerating }: ManualWizardProps) {
  const steps = SKILL_STEPS[skillSlug] ?? DEFAULT_STEPS

  const [step, setStep]           = useState(1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [completed, setCompleted] = useState<number[]>([])
  const [ctx, setCtx]             = useState<WizardContext>({})

  const markDone = (s: number) => setCompleted(c => c.includes(s) ? c : [...c, s])

  const goNext = () => {
    markDone(step)
    setDirection(1)
    setStep(s => Math.min(s + 1, steps.length))
  }
  const goBack = () => {
    setDirection(-1)
    setStep(s => Math.max(s - 1, 1))
  }

  const isLast   = step === steps.length
  const current  = steps[step - 1]
  const val      = ctx[current.key]
  const arrVal   = Array.isArray(val) ? (val as string[]) : ((val as string) ? [(val as string)] : [])

  const updateSingle = (v: string) => setCtx(c => ({ ...c, [current.key]: v }))
  const toggleMulti  = (v: string) => setCtx(c => ({
    ...c,
    [current.key]: arrVal.includes(v) ? arrVal.filter(x => x !== v) : [...arrVal, v],
  }))

  const handleGenerate = () => {
    markDone(step)
    onGenerate(normaliseContext(skillSlug, ctx))
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header: step counter + progress dots */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-[#1e2433] flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#3b82f6] tracking-widest">
            {String(step).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">{current.label}</p>
        </div>
        <ProgressDots total={steps.length} current={step} completed={completed} />
      </div>

      {/* Step content — animated slide */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-lg">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-5"
            >
              {/* Question */}
              <div>
                <h2 className="text-base font-bold text-white leading-snug">{current.question}</h2>
                {current.hint && <p className="text-xs text-slate-600 mt-1.5">{current.hint}</p>}
              </div>

              {/* Input */}
              {current.type === 'text' && (
                <input
                  type="text"
                  value={(val as string) ?? ''}
                  onChange={e => setCtx(c => ({ ...c, [current.key]: e.target.value }))}
                  placeholder={current.placeholder}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-[#1e2433] bg-[#131720] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6] transition-colors"
                />
              )}

              {current.type === 'textarea' && (
                <textarea
                  value={(val as string) ?? ''}
                  onChange={e => setCtx(c => ({ ...c, [current.key]: e.target.value }))}
                  placeholder={current.placeholder}
                  rows={4}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-[#1e2433] bg-[#131720] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6] resize-none transition-colors"
                />
              )}

              {current.type === 'single' && (
                <SingleSelect
                  options={current.options ?? []}
                  value={(val as string) ?? ''}
                  onChange={updateSingle}
                />
              )}

              {current.type === 'multi' && (
                <PillGroup
                  options={current.options ?? []}
                  selected={arrVal}
                  onToggle={toggleMulti}
                />
              )}

              {/* Selection count for multi */}
              {current.type === 'multi' && arrVal.length > 0 && (
                <p className="text-xs text-slate-600">
                  <span className="text-[#3b82f6] font-semibold">{arrVal.length}</span> selected
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex-shrink-0 border-t border-[#1e2433] px-6 py-4 flex items-center justify-between bg-[#131720]">
        <button
          onClick={goBack}
          disabled={step === 1}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {isLast ? (
          <Button
            leftIcon={<Sparkles className="w-4 h-4" />}
            onClick={handleGenerate}
            isLoading={isGenerating}
            disabled={isGenerating}
          >
            Generate {skillName}
          </Button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#131720] border border-[#1e2433] text-xs font-semibold text-white hover:border-[#3b82f6] hover:bg-[#3b82f6]/5 transition-all"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
