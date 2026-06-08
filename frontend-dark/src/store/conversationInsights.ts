import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ConversationInsight {
  id: string
  type: 'pain_point' | 'priority' | 'challenge' | 'preference' | 'context' | 'risk' | 'goal'
  label: string
  value: string
  confidence: 'low' | 'medium' | 'high'
  source: string   // snippet of user message that triggered this
  sessionId: string
  learnedAt: string
  applied: boolean // whether it's been written back to clientProfile
}

export interface ConversationSession {
  id: string
  workspaceId?: string
  startedAt: string
  messageCount: number
  insightCount: number
}

interface InsightsState {
  insights: ConversationInsight[]
  sessions: ConversationSession[]
  addInsight: (insight: Omit<ConversationInsight, 'id' | 'learnedAt'>) => string
  markApplied: (id: string) => void
  removeInsight: (id: string) => void
  getInsightsForSession: (sessionId: string) => ConversationInsight[]
  getInsightsByType: (type: ConversationInsight['type']) => ConversationInsight[]
  upsertSession: (session: Omit<ConversationSession, 'insightCount'>) => void
  clearSession: (sessionId: string) => void
}

export const useConversationInsights = create<InsightsState>()(
  persist(
    (set, get) => ({
      insights: [],
      sessions: [],

      addInsight: (insight) => {
        const id = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const full: ConversationInsight = { ...insight, id, learnedAt: new Date().toISOString() }
        const insights = get().insights ?? []
        const exists = insights.some(
          i => i.sessionId === insight.sessionId && i.type === insight.type && i.value === insight.value
        )
        if (!exists) {
          set(s => ({ insights: [...(s.insights ?? []), full] }))
          set(s => ({
            sessions: (s.sessions ?? []).map(sess =>
              sess.id === insight.sessionId
                ? { ...sess, insightCount: (s.insights ?? []).filter(i => i.sessionId === insight.sessionId).length + 1 }
                : sess
            ),
          }))
        }
        return id
      },

      markApplied: (id) =>
        set(s => ({ insights: (s.insights ?? []).map(i => i.id === id ? { ...i, applied: true } : i) })),

      removeInsight: (id) =>
        set(s => ({ insights: (s.insights ?? []).filter(i => i.id !== id) })),

      getInsightsForSession: (sessionId) =>
        (get().insights ?? []).filter(i => i.sessionId === sessionId),

      getInsightsByType: (type) =>
        (get().insights ?? []).filter(i => i.type === type),

      upsertSession: (session) =>
        set(s => {
          const sessions = s.sessions ?? []
          const exists = sessions.find(sess => sess.id === session.id)
          if (exists) {
            return { sessions: sessions.map(sess => sess.id === session.id ? { ...sess, ...session } : sess) }
          }
          return { sessions: [...sessions, { ...session, insightCount: 0 }] }
        }),

      clearSession: (sessionId) =>
        set(s => ({
          insights: (s.insights ?? []).filter(i => i.sessionId !== sessionId),
          sessions: (s.sessions ?? []).filter(s => s.id !== sessionId),
        })),
    }),
    {
      name: 'aivora-conversation-insights',
      merge: (persisted: unknown, current) => {
        const p = (persisted ?? {}) as Partial<InsightsState>
        return {
          ...current,
          insights: Array.isArray(p.insights) ? p.insights : [],
          sessions: Array.isArray(p.sessions) ? p.sessions : [],
        }
      },
    }
  )
)
