/**
 * Brief-driven studio recommender.
 *
 * Given a Challenge Brief (or partial brief), score the 27 studios by how
 * well they match the brief's strategic drivers + HC challenge areas, and
 * return a ranked shortlist with a one-line rationale per studio.
 */

export interface StudioMeta {
  id: string                 // matches SkillsMarketplace + backend slug
  name: string
  description: string
  category: 'strategy' | 'talent' | 'learning' | 'advisory' | 'commercial'
}

export interface BriefSignals {
  strategicDrivers?: string[]            // e.g. ['transformation', 'cost-optimization']
  hcChallengeAreas?: string[]            // e.g. ['leadership-pipeline', 'attrition-retention']
  topPriorityArea?: string               // single dominant pick
  desiredOutputTypes?: string[]          // for tie-breaking commercial studios
  organizationSize?: string              // unused for now, kept for future weighting
  industry?: string                      // unused for now
}

export interface StudioRecommendation extends StudioMeta {
  score: number
  reasons: string[]
}

// ── Studio dictionary (id, name, desc, category). Keep this in sync with
//    SkillsMarketplace.tsx & backend skill_registry.
const STUDIOS: StudioMeta[] = [
  { id: 'hc-strategy',    name: 'HC Strategy Charter',     category: 'strategy',   description: 'Multi-year HC strategy aligned to business goals' },
  { id: 'org-design',     name: 'Org Design Blueprint',    category: 'strategy',   description: 'Operating structures, spans and reporting lines' },
  { id: 'maturity',       name: 'Maturity Assessment',     category: 'strategy',   description: 'Score HC maturity across dimensions' },
  { id: 'benchmarking',   name: 'Benchmarking Studio',     category: 'strategy',   description: 'Benchmark HC metrics against industry peers' },
  { id: 'business-plan',  name: 'HC Business Plan',        category: 'strategy',   description: 'Board-ready HC business plan with ROI modelling' },
  { id: 'process-exc',    name: 'Process Excellence',      category: 'strategy',   description: 'Map and optimise HC processes' },
  { id: 'framework',      name: 'Framework Review',        category: 'strategy',   description: 'Audit governance and operating models' },
  { id: 'talent-acq',     name: 'Talent Acquisition',      category: 'talent',     description: 'End-to-end talent acquisition strategy' },
  { id: 'performance',    name: 'Performance Management',  category: 'talent',     description: 'Performance frameworks and review cadences' },
  { id: 'workforce',      name: 'Workforce Planning',      category: 'talent',     description: 'Model headcount and demand scenarios' },
  { id: 'skills-dev',     name: 'Skills Development',      category: 'talent',     description: 'Identify skill gaps and build roadmaps' },
  { id: 'capability',     name: 'Capability Assessment',   category: 'talent',     description: 'Assess organisational capability' },
  { id: 'succession',     name: 'Succession Planning',     category: 'talent',     description: 'Build succession plans for critical roles' },
  { id: 'hipo',           name: 'HiPo Development',        category: 'talent',     description: 'Identify high-potential leaders' },
  { id: 'leadership-dev', name: 'Leadership Development',  category: 'talent',     description: 'Tiered leadership programmes' },
  { id: 'coaching',       name: 'Coaching & Mentoring',    category: 'talent',     description: 'Coaching culture and mentoring programmes' },
  { id: 'early-career',   name: 'Early Career Studio',     category: 'talent',     description: 'Graduate and early-career pipeline' },
  { id: 'mobility',       name: 'Mobility Studio',         category: 'talent',     description: 'Internal mobility and career transitions' },
  { id: 'learning',       name: 'Learning & Training',     category: 'learning',   description: 'Learning architecture and curriculum' },
  { id: 'employee-exp',   name: 'Employee Experience',     category: 'advisory',   description: 'Employee journeys and engagement strategies' },
  { id: 'total-rewards',  name: 'Total Rewards',           category: 'advisory',   description: 'Pay, benefits and recognition design' },
  { id: 'org-dev',        name: 'Organisation Development',category: 'advisory',   description: 'Change initiatives and culture programmes' },
  { id: 'deck-gen',       name: 'Deck Generator',          category: 'commercial', description: 'Board-ready executive decks' },
  { id: 'playbook',       name: 'Playbook Studio',         category: 'commercial', description: 'Structured playbooks for HC programmes' },
  { id: 'infographic',    name: 'Infographic Studio',      category: 'commercial', description: 'Visual infographics from data' },
  { id: 'brand',          name: 'Brand Workspace',         category: 'commercial', description: 'Brand kits and design assets' },
  { id: 'doc-engine',     name: 'Document Engine',         category: 'commercial', description: 'Collaborative HC document workspace' },
]

// Driver → studio weights with a short rationale per match.
// Tweak weights and rationale together so the explanation stays honest.
const DRIVER_RULES: Record<string, Array<{ id: string; weight: number; reason: string }>> = {
  growth: [
    { id: 'workforce',     weight: 5, reason: 'Growth → model demand and supply gaps before hiring outpaces capability.' },
    { id: 'talent-acq',    weight: 5, reason: 'Growth typically front-loads talent acquisition pressure.' },
    { id: 'org-design',    weight: 4, reason: 'New scale needs spans, layers and reporting re-cut.' },
    { id: 'hc-strategy',   weight: 3, reason: 'Anchor growth bets in a written HC strategy.' },
  ],
  'cost-optimization': [
    { id: 'process-exc',   weight: 5, reason: 'Cost optimisation lives or dies in process design.' },
    { id: 'org-design',    weight: 4, reason: 'Spans and layers are where structural cost hides.' },
    { id: 'workforce',     weight: 3, reason: 'Model the cost glidepath, not just headcount.' },
    { id: 'total-rewards', weight: 2, reason: 'Rewards mix has cost levers beyond base pay.' },
  ],
  transformation: [
    { id: 'org-dev',       weight: 5, reason: 'Transformation is an OD problem before it is a tooling problem.' },
    { id: 'leadership-dev',weight: 4, reason: 'Transformations stall on the bench, not the slides.' },
    { id: 'capability',    weight: 4, reason: 'Pin the capability bets the transformation needs.' },
    { id: 'employee-exp',  weight: 3, reason: 'Adoption is an EX outcome, not a comms task.' },
  ],
  'm-and-a': [
    { id: 'org-design',     weight: 5, reason: 'M&A requires day-1 operating structure decisions.' },
    { id: 'succession',     weight: 4, reason: 'Critical-role continuity is the first M&A risk to surface.' },
    { id: 'total-rewards',  weight: 4, reason: 'Pay harmonisation is often the largest M&A integration cost.' },
    { id: 'org-dev',        weight: 3, reason: 'Cultural integration cannot be left to memos.' },
  ],
  'regulatory-change': [
    { id: 'framework',      weight: 5, reason: 'Regulatory change forces a governance/framework refresh.' },
    { id: 'process-exc',    weight: 4, reason: 'Controlled processes are the audit trail.' },
    { id: 'capability',     weight: 3, reason: 'Capability gaps in compliance are leading indicators of breaches.' },
  ],
  'digital-disruption': [
    { id: 'skills-dev',     weight: 5, reason: 'Digital disruption is a reskilling problem first.' },
    { id: 'capability',     weight: 4, reason: 'Map which digital capabilities matter to your strategy.' },
    { id: 'learning',       weight: 4, reason: 'Stand up modular learning, not big-bang training.' },
    { id: 'workforce',      weight: 3, reason: 'Plan the shape of the workforce post-disruption.' },
  ],
  'market-entry': [
    { id: 'workforce',      weight: 5, reason: 'Entry needs scenario-based workforce demand-supply modelling.' },
    { id: 'talent-acq',     weight: 4, reason: 'Stand up acquisition pipelines for the new geography.' },
    { id: 'org-design',     weight: 3, reason: 'Entry-market structure rarely matches HQ.' },
  ],
  'competitive-pressure': [
    { id: 'benchmarking',   weight: 5, reason: 'Competitive pressure → benchmark before acting.' },
    { id: 'total-rewards',  weight: 4, reason: 'Pay competitiveness usually surfaces first.' },
    { id: 'employee-exp',   weight: 3, reason: 'EX is now the front line of competitive differentiation.' },
  ],
  'talent-shortage': [
    { id: 'talent-acq',     weight: 5, reason: 'Direct attack on the supply problem.' },
    { id: 'early-career',   weight: 4, reason: 'Build supply through graduate and early-career pipelines.' },
    { id: 'mobility',       weight: 4, reason: 'Internal mobility is the cheapest scarce-talent fix.' },
    { id: 'skills-dev',     weight: 3, reason: 'Build the capability you cannot hire fast enough.' },
  ],
  'leadership-change': [
    { id: 'succession',     weight: 5, reason: 'Leadership change forces succession discipline.' },
    { id: 'hipo',           weight: 4, reason: 'Surface the next-tier successors with calibration.' },
    { id: 'leadership-dev', weight: 4, reason: 'Prepare the second line before promotions force the issue.' },
    { id: 'coaching',       weight: 3, reason: 'Top-team coaching reduces transition risk.' },
  ],
  restructuring: [
    { id: 'org-design',     weight: 5, reason: 'Restructuring needs an explicit target operating model.' },
    { id: 'org-dev',        weight: 4, reason: 'Change management makes restructuring stick.' },
    { id: 'workforce',      weight: 4, reason: 'Model the transition headcount, not just steady state.' },
    { id: 'total-rewards',  weight: 2, reason: 'Severance and retention design hide in restructuring.' },
  ],
  'ipo-preparation': [
    { id: 'business-plan',  weight: 5, reason: 'IPO-ready HC business case is non-negotiable.' },
    { id: 'framework',      weight: 4, reason: 'Public-company governance maturity is a gating item.' },
    { id: 'total-rewards',  weight: 3, reason: 'LTIP/equity design becomes a board topic pre-IPO.' },
  ],
  'esg-sustainability': [
    { id: 'org-dev',        weight: 3, reason: 'ESG is an organisational behaviour change.' },
    { id: 'employee-exp',   weight: 3, reason: 'Sustainability narrative shapes EX.' },
    { id: 'benchmarking',   weight: 3, reason: 'ESG benchmarking gives you a baseline that boards trust.' },
  ],
  nationalization: [
    { id: 'early-career',   weight: 5, reason: 'National pipelines start at the graduate funnel.' },
    { id: 'workforce',      weight: 4, reason: 'Nationalisation needs scenario plans by role family.' },
    { id: 'talent-acq',     weight: 4, reason: 'Targeted acquisition strategy for national talent.' },
    { id: 'skills-dev',     weight: 3, reason: 'Close capability gaps holding back nationalisation targets.' },
  ],
}

// HC challenge area → studio weights. Areas come from the brief's "selectedAreas[].area".
const CHALLENGE_RULES: Record<string, Array<{ id: string; weight: number; reason: string }>> = {
  'leadership-pipeline':       [{ id: 'hipo', weight: 6, reason: 'Pipeline depth starts with calibrated HiPo identification.' }, { id: 'succession', weight: 5, reason: 'Succession is the discipline that proves pipeline strength.' }, { id: 'leadership-dev', weight: 4, reason: 'Develop the named bench, do not assume readiness.' }],
  'succession-risk':           [{ id: 'succession', weight: 6, reason: 'Address the named risk directly.' }, { id: 'hipo', weight: 4, reason: 'Build the second-line behind the at-risk roles.' }],
  'attrition-retention':       [{ id: 'employee-exp', weight: 6, reason: 'Regrettable attrition is almost always EX-driven.' }, { id: 'total-rewards', weight: 4, reason: 'Rewards mix shows up in retention risk hotspots.' }, { id: 'mobility', weight: 4, reason: 'Mobility is a proven retention lever, often under-used.' }],
  'engagement-culture':        [{ id: 'employee-exp', weight: 6, reason: 'Engagement actions need an EX programme to land.' }, { id: 'org-dev', weight: 4, reason: 'Culture shifts are an OD job, not a survey job.' }],
  'capability-skills-gap':     [{ id: 'capability', weight: 6, reason: 'Pin the capability bets first.' }, { id: 'skills-dev', weight: 5, reason: 'Translate capability gaps into a skills roadmap.' }, { id: 'learning', weight: 4, reason: 'Stand up learning that matches the skill gaps.' }],
  'talent-acquisition':        [{ id: 'talent-acq', weight: 6, reason: 'Direct hit on the acquisition challenge.' }, { id: 'early-career', weight: 4, reason: 'Graduate pipelines often subsidise scarce-talent costs.' }],
  'workforce-planning':        [{ id: 'workforce', weight: 6, reason: 'Stand up a scenario-based workforce plan.' }, { id: 'benchmarking', weight: 3, reason: 'Benchmarks anchor planning assumptions.' }],
  'performance-management':    [{ id: 'performance', weight: 6, reason: 'Direct redesign of performance system.' }, { id: 'leadership-dev', weight: 3, reason: 'Manager quality is the gating item for any new PM system.' }],
  'rewards-recognition':       [{ id: 'total-rewards', weight: 6, reason: 'Direct rewards architecture redesign.' }, { id: 'employee-exp', weight: 3, reason: 'Recognition is a daily EX behaviour, not an annual program.' }],
  'organisation-design':       [{ id: 'org-design', weight: 6, reason: 'Direct hit on operating model and structure.' }, { id: 'process-exc', weight: 4, reason: 'Structure decisions cascade into process redesign.' }],
  'change-transformation':     [{ id: 'org-dev', weight: 6, reason: 'Direct OD intervention design.' }, { id: 'leadership-dev', weight: 4, reason: 'Transformations stall on weak middle management.' }],
  'hr-operating-model':        [{ id: 'framework', weight: 6, reason: 'Audit and redesign the HR operating model.' }, { id: 'process-exc', weight: 4, reason: 'Process clean-up is the back half of HROM work.' }],
  'dei-inclusion':             [{ id: 'org-dev', weight: 5, reason: 'DEI shifts are OD work, not policy work.' }, { id: 'employee-exp', weight: 4, reason: 'Inclusion is felt in everyday EX moments.' }],
  'employee-experience':       [{ id: 'employee-exp', weight: 6, reason: 'Direct EX programme design.' }],
  'wellbeing-mental-health':   [{ id: 'employee-exp', weight: 5, reason: 'Wellbeing belongs inside the EX programme.' }, { id: 'total-rewards', weight: 3, reason: 'Wellbeing benefits sit in the rewards mix.' }],
  'hr-analytics-data':         [{ id: 'benchmarking', weight: 4, reason: 'Analytics maturity is best contextualised by benchmarks.' }, { id: 'hc-strategy', weight: 3, reason: 'Tie analytics ambition to the HC strategy.' }],
  'manager-effectiveness':     [{ id: 'leadership-dev', weight: 6, reason: 'Direct hit on manager capability.' }, { id: 'coaching', weight: 4, reason: 'Coaching scaffolds first-time manager success.' }],
}

// Output type rules — tie-break the commercial studios.
const OUTPUT_RULES: Record<string, Array<{ id: string; weight: number; reason: string }>> = {
  'board-deck':        [{ id: 'deck-gen',    weight: 4, reason: 'Generate the board-ready deck.' }, { id: 'business-plan', weight: 3, reason: 'Underpin the deck with a real plan.' }],
  'playbook':          [{ id: 'playbook',    weight: 4, reason: 'Produce the structured implementation playbook.' }],
  'infographic':       [{ id: 'infographic', weight: 4, reason: 'Visualise the headline insights.' }],
  'document':          [{ id: 'doc-engine',  weight: 3, reason: 'Collaborative working document space.' }],
  'brand-kit':         [{ id: 'brand',       weight: 3, reason: 'Manage white-label brand assets.' }],
  'diagnostic':        [{ id: 'maturity',    weight: 4, reason: 'Run the maturity diagnostic for the scorecard.' }],
  'roadmap':           [{ id: 'business-plan', weight: 3, reason: 'A roadmap needs a phased plan underneath.' }],
  'metric-tree':       [{ id: 'benchmarking', weight: 3, reason: 'Metric trees gain credibility with benchmarks.' }],
}

export function recommendStudios(brief: BriefSignals, topN = 5): StudioRecommendation[] {
  const scores: Record<string, { score: number; reasons: Set<string> }> = {}

  const bump = (id: string, weight: number, reason: string) => {
    const slot = scores[id] ?? { score: 0, reasons: new Set<string>() }
    slot.score += weight
    if (slot.reasons.size < 2) slot.reasons.add(reason)  // cap reasons per studio
    scores[id] = slot
  }

  for (const d of brief.strategicDrivers ?? []) {
    for (const r of DRIVER_RULES[d] ?? []) bump(r.id, r.weight, r.reason)
  }

  for (const a of brief.hcChallengeAreas ?? []) {
    for (const r of CHALLENGE_RULES[a] ?? []) bump(r.id, r.weight, r.reason)
  }

  // Top priority area gets a small boost so it lifts above ties.
  if (brief.topPriorityArea && brief.topPriorityArea !== 'none') {
    for (const r of CHALLENGE_RULES[brief.topPriorityArea] ?? []) bump(r.id, 2, r.reason)
  }

  for (const o of brief.desiredOutputTypes ?? []) {
    for (const r of OUTPUT_RULES[o] ?? []) bump(r.id, r.weight, r.reason)
  }

  return STUDIOS
    .map(s => ({
      ...s,
      score: scores[s.id]?.score ?? 0,
      reasons: Array.from(scores[s.id]?.reasons ?? []),
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

/**
 * Read a brief from server-shape and pull the signals the recommender wants.
 * Tolerates partial shapes (used by the workspace detail page where the brief
 * `content` JSON is the source of truth).
 */
export function signalsFromBriefContent(content: unknown): BriefSignals {
  const c = (content ?? {}) as Record<string, unknown>
  const businessSituation = (c.businessSituation ?? {}) as Record<string, unknown>
  const hcChallenges = (c.hcChallenges ?? {}) as Record<string, unknown>
  const desiredOutputs = (c.desiredOutputs ?? {}) as Record<string, unknown>
  const organization = (c.organization ?? {}) as Record<string, unknown>

  const selectedAreas = (hcChallenges.selectedAreas as Array<{ area?: string }> | undefined) ?? []
  return {
    strategicDrivers: (businessSituation.strategicDrivers as string[] | undefined) ?? [],
    hcChallengeAreas: selectedAreas.map(a => String(a.area ?? '')).filter(Boolean),
    topPriorityArea: hcChallenges.topPriorityArea as string | undefined,
    desiredOutputTypes: (desiredOutputs.outputTypes as string[] | undefined) ?? [],
    organizationSize: organization.organizationSize as string | undefined,
    industry: organization.industry as string | undefined,
  }
}
