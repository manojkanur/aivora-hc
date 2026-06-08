import { create } from 'zustand'
import { workspacesAPI, skillsAPI } from '../lib/api'

export interface Skill {
  id: string
  slug?: string
  name: string
  description: string
  category: string
  tier: 'starter' | 'professional' | 'enterprise' | 'advisory'
  credit_cost: number
  icon?: string
  status: 'locked' | 'active' | 'running'
  last_run?: string
  streak_days?: number
}

export interface Workspace {
  id: string
  name: string
  client_name: string
  description?: string
  status: 'active' | 'archived'
  skill_count: number
  xp_earned: number
  created_at: string
  last_activity?: string
}

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  skills: Skill[]
  allSkills: Skill[]
  isLoading: boolean
  error: string | null
  fetchWorkspaces: () => Promise<void>
  setCurrentWorkspace: (workspace: Workspace) => void
  fetchSkills: (workspaceId: string) => Promise<void>
  fetchAllSkills: () => Promise<void>
  createWorkspace: (data: { name: string; client_name: string; description?: string }) => Promise<Workspace>
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  currentWorkspace: null,
  skills: [],
  allSkills: [],
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await workspacesAPI.list()
      // API returns a bare array
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.workspaces ?? [])
      const workspaces = raw.map((w: unknown) => {
        const ws = w as Record<string, unknown>
        return {
          id: String(ws.id ?? ''),
          name: String(ws.name ?? ''),
          client_name: String(ws.client_name ?? ''),
          description: ws.description ? String(ws.description) : undefined,
          status: (ws.status as 'active' | 'archived') ?? 'active',
          skill_count: Number(ws.skill_count ?? 0),
          xp_earned: Number(ws.xp_earned ?? 0),
          created_at: String(ws.created_at ?? ''),
          last_activity: ws.last_activity ? String(ws.last_activity) : undefined,
        }
      })
      set({ workspaces, isLoading: false })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch workspaces'
      set({ error: message, isLoading: false })
    }
  },

  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),

  fetchSkills: async (_workspaceId) => {
    set({ isLoading: true })
    try {
      const res = await skillsAPI.list()
      // API returns a bare array of SkillResponse objects
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.skills ?? [])
      const skills = raw.map((s: unknown) => {
        const sk = s as Record<string, unknown>
        return {
          id: String(sk.id ?? ''),
          slug: String(sk.slug ?? ''),
          name: String(sk.name ?? ''),
          description: String(sk.description ?? ''),
          category: String(sk.category ?? 'strategy'),
          tier: (sk.tier as Skill['tier']) ?? 'starter',
          credit_cost: Number(sk.credit_cost ?? 0),
          icon: sk.icon ? String(sk.icon) : undefined,
          status: 'active' as const,
        }
      })
      set({ skills, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchAllSkills: async () => {
    try {
      const res = await skillsAPI.list()
      const raw: unknown[] = Array.isArray(res.data) ? res.data : (res.data.skills ?? [])
      const allSkills = raw.map((s: unknown) => {
        const sk = s as Record<string, unknown>
        return {
          id: String(sk.id ?? ''),
          slug: String(sk.slug ?? ''),
          name: String(sk.name ?? ''),
          description: String(sk.description ?? ''),
          category: String(sk.category ?? 'strategy'),
          tier: (sk.tier as Skill['tier']) ?? 'starter',
          credit_cost: Number(sk.credit_cost ?? 0),
          icon: sk.icon ? String(sk.icon) : undefined,
          status: 'active' as const,
        }
      })
      set({ allSkills })
    } catch {
      // ignore
    }
  },

  createWorkspace: async (data) => {
    const res = await workspacesAPI.create(data)
    // API returns the workspace object directly
    const raw = res.data.workspace ?? res.data
    const workspace = {
      id: String(raw.id ?? ''),
      name: String(raw.name ?? ''),
      client_name: String(raw.client_name ?? ''),
      description: raw.description ? String(raw.description) : undefined,
      status: (raw.status as 'active' | 'archived') ?? 'active',
      skill_count: Number(raw.skill_count ?? 0),
      xp_earned: Number(raw.xp_earned ?? 0),
      created_at: String(raw.created_at ?? ''),
      last_activity: raw.last_activity ? String(raw.last_activity) : undefined,
    }
    set(state => ({ workspaces: [workspace, ...state.workspaces] }))
    return workspace
  },
}))
