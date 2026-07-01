import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeReport } from '../lib/advisory/scoring'
import type { AnswerValue, MaturityReport } from '../lib/advisory/types'

interface AdvisoryState {
  answers: Record<string, AnswerValue>
  report: MaturityReport | null
  diagnosticComplete: boolean
  lastUpdated: string | null
  setAnswer: (questionId: string, value: AnswerValue) => void
  setAnswers: (next: Record<string, AnswerValue>) => void
  clearAnswer: (questionId: string) => void
  rebuildReport: () => void
  markDiagnosticComplete: () => void
  resetDiagnostic: () => void
}

export const useAdvisoryStore = create<AdvisoryState>()(
  persist(
    (set, get) => ({
      answers: {},
      report: null,
      diagnosticComplete: false,
      lastUpdated: null,

      setAnswer: (questionId, value) => {
        const next = { ...get().answers, [questionId]: value }
        set({ answers: next, report: computeReport(next), lastUpdated: new Date().toISOString() })
      },

      setAnswers: (next) => {
        set({ answers: next, report: computeReport(next), lastUpdated: new Date().toISOString() })
      },

      clearAnswer: (questionId) => {
        const next = { ...get().answers }
        delete next[questionId]
        set({ answers: next, report: computeReport(next), lastUpdated: new Date().toISOString() })
      },

      rebuildReport: () => set({ report: computeReport(get().answers) }),

      markDiagnosticComplete: () => set({ diagnosticComplete: true, report: computeReport(get().answers) }),

      resetDiagnostic: () => set({ answers: {}, report: null, diagnosticComplete: false, lastUpdated: null }),
    }),
    { name: 'aivora-advisory' },
  ),
)
