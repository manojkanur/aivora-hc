import frameworks from '../seeds/frameworks.json'
import questionBank from '../seeds/questionBank.json'
import studios from '../seeds/studios.json'

export type TierId = 'reactive' | 'structured' | 'integrated' | 'strategic'

export interface Tier {
  id: TierId
  label: string
  range: [number, number]
  color: string
  summary: string
}

export interface Dimension {
  id: string
  name: string
  icon: string
  summary: string
  tierDescriptors: Record<TierId, string>
}

export type QuestionType = 'likert' | 'single' | 'multi' | 'text'

export interface QuestionOption {
  value: string
  label: string
}

export interface Question {
  id: string
  text: string
  type: QuestionType
  dimensions: string[]
  studios: string[]
  options?: QuestionOption[]
  weight: number
}

export interface Studio {
  id: string
  name: string
  category: string
  tier: string
  credits: number
  dimensions: string[]
  questionTag: string
  estMinutes: number
  deliverable: string
  featured?: boolean
}

export interface StudioCategory {
  id: string
  label: string
  description: string
}

export type AnswerValue = number | string | string[]

export interface DimensionScore {
  dimensionId: string
  score: number
  tier: TierId
  answeredCount: number
  totalCount: number
}

export interface MaturityReport {
  overallScore: number
  overallTier: TierId
  dimensions: DimensionScore[]
  topGaps: string[]
  strengths: string[]
  generatedAt: string
}

export const FRAMEWORK = frameworks as {
  name: string
  version: string
  description: string
  scale: { min: number; max: number }
  tiers: Tier[]
  dimensions: Dimension[]
}

export const QUESTION_BANK = questionBank as { version: string; scaleNote: string; questions: Question[] }

export const STUDIOS = studios as { categories: StudioCategory[]; studios: Studio[] }
