import { QUESTION_BANK, STUDIOS, type Question, type Studio } from './types'

export function getQuestionsForStudio(studioId: string): Question[] {
  const studio = STUDIOS.studios.find(s => s.id === studioId)
  if (!studio) return []

  // 1) Direct tag match
  const tagged = QUESTION_BANK.questions.filter(q => q.studios.includes(studio.questionTag) || q.studios.includes(studioId))

  // 2) Plus dimension-tagged questions for this studio's dimensions, deduped
  const seen = new Set(tagged.map(q => q.id))
  const dimMatches = QUESTION_BANK.questions.filter(q =>
    q.dimensions.some(d => studio.dimensions.includes(d)) && !seen.has(q.id),
  )

  return [...tagged, ...dimMatches]
}

export function getQuestionsForDimension(dimId: string): Question[] {
  return QUESTION_BANK.questions.filter(q => q.dimensions.includes(dimId))
}

export function getDiagnosticQuestions(): Question[] {
  // Ordered diagnostic walkthrough: context questions first, then by dimension order
  const ctx = QUESTION_BANK.questions.filter(q => q.dimensions.length === 0)
  const scored = QUESTION_BANK.questions.filter(q => q.dimensions.length > 0)
  return [...ctx, ...scored]
}

export function getStudioById(id: string): Studio | undefined {
  return STUDIOS.studios.find(s => s.id === id)
}

export function getStudiosByCategory(cat: string): Studio[] {
  return STUDIOS.studios.filter(s => s.category === cat)
}
