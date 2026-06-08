import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WorkspaceBrief {
  organizationName: string
  industry: string
  region: string
  organizationSize: string
  maturityStage: string
  operatingModel: string
  strategicDrivers: string[]
  hcAreas: string[]
  outputTypes: string[]
  completedAt: string
}

interface BriefState {
  briefs: Record<string, WorkspaceBrief>   // workspaceId → brief
  saveBrief: (workspaceId: string, brief: WorkspaceBrief) => void
  getBrief: (workspaceId: string) => WorkspaceBrief | null
  hasBrief: (workspaceId: string) => boolean
}

export const useBriefStore = create<BriefState>()(
  persist(
    (set, get) => ({
      briefs: {},

      saveBrief: (workspaceId, brief) =>
        set(s => ({ briefs: { ...s.briefs, [workspaceId]: brief } })),

      getBrief: (workspaceId) => get().briefs[workspaceId] ?? null,

      hasBrief: (workspaceId) => !!get().briefs[workspaceId],
    }),
    { name: 'aivora-workspace-briefs' }
  )
)
