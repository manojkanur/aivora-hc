import { FRAMEWORK, QUESTION_BANK, type AnswerValue, type DimensionScore, type MaturityReport, type TierId } from './types'

export function tierFromScore(score: number): TierId {
  for (const t of FRAMEWORK.tiers) {
    if (score >= t.range[0] && score <= t.range[1]) return t.id as TierId
  }
  return 'reactive'
}

export function getTier(tierId: TierId) {
  return FRAMEWORK.tiers.find(t => t.id === tierId)!
}

export function getDimension(dimId: string) {
  return FRAMEWORK.dimensions.find(d => d.id === dimId)
}

function normalizeLikert(v: number): number {
  // 1..5 -> 0..100
  const clamped = Math.max(1, Math.min(5, v))
  return ((clamped - 1) / 4) * 100
}

function normalizeSingle(qId: string, value: string): number {
  const q = QUESTION_BANK.questions.find(q => q.id === qId)
  if (!q?.options?.length) return 50
  const idx = q.options.findIndex(o => o.value === value)
  if (idx < 0) return 50
  return (idx / Math.max(1, q.options.length - 1)) * 100
}

function normalizeMulti(qId: string, values: string[]): number {
  const q = QUESTION_BANK.questions.find(q => q.id === qId)
  if (!q?.options?.length) return 50
  // More-selected suggests more change/complexity; treat as context, return neutral mid-score
  // unless the multi is meaningfully ordered. For now, count-based: 0 picks = 30, 1-2 = 55, 3+ = 75.
  const count = values.length
  if (count === 0) return 30
  if (count <= 2) return 55
  return 75
}

function scoreAnswer(qId: string, value: AnswerValue): number | null {
  const q = QUESTION_BANK.questions.find(q => q.id === qId)
  if (!q) return null
  if (q.type === 'likert' && typeof value === 'number') return normalizeLikert(value)
  if (q.type === 'single' && typeof value === 'string') return normalizeSingle(qId, value)
  if (q.type === 'multi' && Array.isArray(value)) return normalizeMulti(qId, value)
  return null
}

export function computeReport(answers: Record<string, AnswerValue>): MaturityReport {
  const dimScores: DimensionScore[] = FRAMEWORK.dimensions.map(dim => {
    const relevant = QUESTION_BANK.questions.filter(q => q.dimensions.includes(dim.id) && q.weight > 0)
    let weightedSum = 0
    let weightTotal = 0
    let answeredCount = 0
    for (const q of relevant) {
      const v = answers[q.id]
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue
      const s = scoreAnswer(q.id, v)
      if (s === null) continue
      weightedSum += s * q.weight
      weightTotal += q.weight
      answeredCount++
    }
    const score = weightTotal > 0 ? weightedSum / weightTotal : 0
    return {
      dimensionId: dim.id,
      score: Math.round(score),
      tier: tierFromScore(score),
      answeredCount,
      totalCount: relevant.length,
    }
  })

  const answeredDims = dimScores.filter(d => d.answeredCount > 0)
  const overallScore = answeredDims.length > 0
    ? Math.round(answeredDims.reduce((s, d) => s + d.score, 0) / answeredDims.length)
    : 0

  const sorted = [...dimScores].sort((a, b) => a.score - b.score)
  const topGaps = sorted.slice(0, 3).map(d => d.dimensionId)
  const strengths = sorted.slice(-2).reverse().map(d => d.dimensionId)

  return {
    overallScore,
    overallTier: tierFromScore(overallScore),
    dimensions: dimScores,
    topGaps,
    strengths,
    generatedAt: new Date().toISOString(),
  }
}

export function answeredQuestionCount(answers: Record<string, AnswerValue>): number {
  return Object.values(answers).filter(v => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)).length
}
