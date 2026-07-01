import { FRAMEWORK, STUDIOS, type MaturityReport, type TierId } from './types'

export interface Recommendation {
  id: string
  dimensionId: string
  priority: 'high' | 'medium' | 'low'
  title: string
  rationale: string
  suggestedStudios: string[]
  horizon: '30d' | '90d' | '12m'
}

const REC_LIBRARY: Record<string, Record<TierId, Omit<Recommendation, 'id' | 'dimensionId' | 'suggestedStudios'>>> = {
  'strategy-capability': {
    reactive: { priority: 'high', title: 'Anchor HC priorities to a documented business thesis', rationale: 'Without a written link to the business strategy, HC investment drifts toward activity instead of impact.', horizon: '90d' },
    structured: { priority: 'high', title: 'Tighten the line of sight between business strategy and HC bets', rationale: 'You have a plan; what you need is a sharper articulation of which two or three capability bets actually win the next 18 months.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Move from annual planning to quarterly capability foresight', rationale: 'The foundation is solid. The next horizon is sensing capability shifts before they bite, with quarterly recalibration.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Defend strategic discipline against process drift', rationale: 'You\'re ahead. The risk now is fatigue. Keep the cadence honest and the bets few.', horizon: '12m' },
  },
  'talent-architecture': {
    reactive: { priority: 'high', title: 'Stand up a unified job architecture and skills baseline', rationale: 'Without architecture, every talent decision is bespoke. Standardize levels, families, and a starter skills taxonomy.', horizon: '90d' },
    structured: { priority: 'high', title: 'Layer skills onto your job architecture', rationale: 'The structure exists. Add a skills overlay used in hiring, development and mobility to unlock real value.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Open an internal mobility marketplace', rationale: 'Internal mobility is where architecture pays for itself. Pilot a marketplace with skills-based matching.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Keep architecture from calcifying', rationale: 'Publish a revision cadence so the architecture stays a living system, not a frozen document.', horizon: '12m' },
  },
  'engagement-culture': {
    reactive: { priority: 'high', title: 'Move from annual surveys to continuous listening', rationale: 'An annual survey can\'t support quarterly decisions. Stand up a pulse cadence with manager-level visibility.', horizon: '90d' },
    structured: { priority: 'high', title: 'Hold managers accountable for team-level action', rationale: 'You collect signal; what\'s missing is accountability. Push team-level dashboards to the manager\'s manager.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Tie culture signals to operating decisions', rationale: 'Culture is observable in what gets promoted and tolerated. Embed engagement KPIs in business reviews.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Treat culture as a measurable strategic asset', rationale: 'Make culture investment visible in the capital allocation conversation.', horizon: '12m' },
  },
  'leadership-hipo': {
    reactive: { priority: 'high', title: 'Install a calibrated HiPo identification process', rationale: 'Reputation-based identification compounds bias. A multi-rater, evidence-led process is the foundation.', horizon: '90d' },
    structured: { priority: 'high', title: 'Build calibration discipline into talent reviews', rationale: 'You identify HiPos; the question is whether the call would survive a hard challenge. Add calibration mechanics.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Deepen bench across the top two levels', rationale: 'Move from \'one ready successor\' to a 1.5× depth for every critical role with active development plans.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Bring predictive analytics into leadership planning', rationale: 'Your pipeline is strong; the upside is foresight: which leaders are at risk, which transitions will be hardest.', horizon: '12m' },
  },
  'workforce-analytics': {
    reactive: { priority: 'high', title: 'Build a single source of workforce truth', rationale: 'Spreadsheet reporting blocks every downstream decision. Start with one trusted dataset for headcount, hires, exits.', horizon: '90d' },
    structured: { priority: 'high', title: 'Get workforce KPIs into business operating reviews', rationale: 'HR dashboards in HR are invisible to the business. Embed five workforce KPIs in operating reviews.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Stand up predictive attrition for critical segments', rationale: 'You measure well. Add forward-looking signal: quarterly attrition risk for critical roles.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Connect analytics to capability investment decisions', rationale: 'Make analytics the spine of capability bets, not a reporting function.', horizon: '12m' },
  },
  'change-readiness': {
    reactive: { priority: 'high', title: 'Adopt a single change methodology and stick to it', rationale: 'Ad-hoc change kills programs. Pick one methodology, train sponsors and PMs in it, apply it consistently.', horizon: '90d' },
    structured: { priority: 'high', title: 'Measure adoption, not training completion', rationale: 'Training is vanity. Behavioural adoption at 30/60/90 days post go-live is the real signal.', horizon: '90d' },
    integrated: { priority: 'medium', title: 'Build change capability into middle management', rationale: 'Middle managers are where change stalls. Equip them with cascade tools and hold them accountable.', horizon: '12m' },
    strategic: { priority: 'low', title: 'Manage change saturation as a portfolio constraint', rationale: 'Your real risk is too much concurrent change. Treat change capacity as a constrained resource.', horizon: '12m' },
  },
}

function studiosForDimension(dimId: string): string[] {
  return STUDIOS.studios
    .filter(s => s.dimensions.includes(dimId))
    .slice(0, 3)
    .map(s => s.id)
}

export function generateRecommendations(report: MaturityReport): Recommendation[] {
  return report.dimensions
    .map(d => {
      const lib = REC_LIBRARY[d.dimensionId]?.[d.tier]
      if (!lib) return null
      return {
        id: `rec-${d.dimensionId}-${d.tier}`,
        dimensionId: d.dimensionId,
        ...lib,
        suggestedStudios: studiosForDimension(d.dimensionId),
      } as Recommendation
    })
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.priority] - order[b.priority]
    })
}

export function topRecommendations(report: MaturityReport, n = 3): Recommendation[] {
  const recs = generateRecommendations(report)
  const gapDims = new Set(report.topGaps)
  return [
    ...recs.filter(r => gapDims.has(r.dimensionId)),
    ...recs.filter(r => !gapDims.has(r.dimensionId)),
  ].slice(0, n)
}

export function getStudio(id: string) {
  return STUDIOS.studios.find(s => s.id === id)
}

export function getDimensionMeta(id: string) {
  return FRAMEWORK.dimensions.find(d => d.id === id)
}
