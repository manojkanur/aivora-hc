import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface KbDocument {
  id: string
  name: string
  size: number  // bytes
  type: string  // mime type
  addedAt: string
}

export interface KbUrl {
  id: string
  url: string
  label?: string
  addedAt: string
}

interface SkillKbState {
  // skillId → { documents, urls }
  kb: Record<string, { documents: KbDocument[]; urls: KbUrl[] }>
  addDocument: (skillId: string, doc: Omit<KbDocument, 'id' | 'addedAt'>) => void
  removeDocument: (skillId: string, docId: string) => void
  addUrl: (skillId: string, url: string, label?: string) => void
  removeUrl: (skillId: string, urlId: string) => void
  getKb: (skillId: string) => { documents: KbDocument[]; urls: KbUrl[] }
}

const empty = { documents: [], urls: [] }

export const useSkillKb = create<SkillKbState>()(
  persist(
    (set, get) => ({
      kb: {},

      addDocument: (skillId, doc) =>
        set(s => {
          const existing = s.kb[skillId] ?? empty
          const newDoc: KbDocument = {
            ...doc,
            id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            addedAt: new Date().toISOString(),
          }
          return { kb: { ...s.kb, [skillId]: { ...existing, documents: [...existing.documents, newDoc] } } }
        }),

      removeDocument: (skillId, docId) =>
        set(s => {
          const existing = s.kb[skillId] ?? empty
          return { kb: { ...s.kb, [skillId]: { ...existing, documents: existing.documents.filter(d => d.id !== docId) } } }
        }),

      addUrl: (skillId, url, label) =>
        set(s => {
          const existing = s.kb[skillId] ?? empty
          const newUrl: KbUrl = {
            id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            url,
            label,
            addedAt: new Date().toISOString(),
          }
          return { kb: { ...s.kb, [skillId]: { ...existing, urls: [...existing.urls, newUrl] } } }
        }),

      removeUrl: (skillId, urlId) =>
        set(s => {
          const existing = s.kb[skillId] ?? empty
          return { kb: { ...s.kb, [skillId]: { ...existing, urls: existing.urls.filter(u => u.id !== urlId) } } }
        }),

      getKb: (skillId) => get().kb[skillId] ?? empty,
    }),
    { name: 'aivora-skill-kb' }
  )
)
