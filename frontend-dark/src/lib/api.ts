import axios, { type AxiosInstance, type AxiosResponse } from 'axios'

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token_dark')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token_dark')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    if (error.response?.status === 402) {
      window.dispatchEvent(new CustomEvent('insufficient-credits'))
    }
    return Promise.reject(error)
  }
)

// Auth
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  signup: (name: string, email: string, password: string) =>
    api.post('/auth/signup', { name, email, password }),
  googleAuthUrl: () => api.get('/auth/google'),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

// Workspaces
export const workspacesAPI = {
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  create: (data: { name: string; client_name: string; description?: string }) =>
    api.post('/workspaces', data),
  update: (id: string, data: Partial<{ name: string; description: string }>) =>
    api.patch(`/workspaces/${id}`, data),
  archive: (id: string) => api.delete(`/workspaces/${id}`),
}

// Skills
export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  getForWorkspace: (workspaceId: string) =>
    api.get(`/workspaces/${workspaceId}/skills`),
  activate: (workspaceId: string, skillId: string) =>
    api.post(`/workspaces/${workspaceId}/skills/${skillId}`),
  run: (workspaceId: string, skillId: string, payload: Record<string, unknown>) =>
    api.post(`/workspaces/${workspaceId}/skills/${skillId}/run`, payload),
}

// Drafts (under /ai/drafts)
export const draftsAPI = {
  list: (params?: { workspace_id?: string; status?: string; skill_id?: string }) =>
    api.get('/ai/drafts', { params }),
  get: (id: string) => api.get(`/ai/drafts/${id}`),
  approve: (id: string) => api.patch(`/ai/drafts/${id}/approval`, { status: 'approved' }),
  submit: (id: string) => api.patch(`/ai/drafts/${id}/approval`, { status: 'submitted' }),
  delete: (id: string) => api.delete(`/ai/drafts/${id}`),
  bulkApprove: (ids: string[]) => Promise.all(ids.map(id => api.patch(`/ai/drafts/${id}/approval`, { status: 'approved' }))),
  bulkDelete: (ids: string[]) => Promise.all(ids.map(id => api.delete(`/ai/drafts/${id}`))),
}

// Exports
export const exportsAPI = {
  list: (params?: { format?: string; workspace_id?: string }) =>
    api.get('/exports', { params }),
  create: (draftId: string, format: 'pptx' | 'pdf' | 'docx', brandKitId?: string) =>
    api.post('/exports', { draft_id: draftId, format, brand_kit_id: brandKitId }, { responseType: 'blob' }),
  download: (id: string) => api.get(`/exports/${id}/download`, { responseType: 'blob' }),
}

// Challenge Briefs
export const challengeBriefsAPI = {
  list: () => api.get('/challenge-briefs'),
  get: (id: string) => api.get(`/challenge-briefs/${id}`),
  create: (data: Record<string, unknown>) => api.post('/challenge-briefs', data),
  run: (id: string) => api.post(`/challenge-briefs/${id}/run`),
}

// Billing
export const billingAPI = {
  getStatus: () => api.get('/billing/balance'),
  createCheckoutSession: (bundleId: string) =>
    api.post('/billing/checkout', { bundle_id: bundleId }),
  getTransactions: () => api.get('/billing/ledger'),
  cancelSubscription: () => api.post('/billing/topup', { amount: 0 }),
  changePlan: (planId: string) => api.post('/billing/topup', { amount: 0, plan_id: planId }),
}

// Credits
export const creditsAPI = {
  getBalance: () => api.get('/billing/balance'),
}

// Gamification
export const gamificationAPI = {
  getStats: () => api.get('/me/stats'),
  getQuests: () => api.get('/me/quests'),
  getBadges: () => api.get('/me/badges'),
  getLeaderboard: (period: 'weekly' | 'monthly' | 'all') =>
    api.get('/gamification/leaderboard', { params: { period } }),
  claimQuest: (questId: string) => api.post(`/me/quests/${questId}/claim`),
  // Canonical short-form aliases
  stats: () => api.get('/me/stats'),
  quests: () => api.get('/me/quests'),
  badges: () => api.get('/me/badges'),
  streaks: () => api.get('/me/streaks'),
  leaderboard: (period: string) => api.get(`/leaderboard?period=${period}`),
}

// Publish
export const publishAPI = {
  getQueue: () => api.get('/publish/queue'),
  schedule: (data: { content: string; export_id?: string; scheduled_at: string }) =>
    api.post('/publish/schedule', data),
  publishNow: (itemId: string) => api.post(`/publish/${itemId}/publish`),
  cancel: (itemId: string) => api.delete(`/publish/${itemId}`),
  connectLinkedIn: () => api.post('/publish/linkedin/connect'),
  getLog: () => api.get('/publish/log'),
}

// Settings
export const settingsAPI = {
  updateProfile: (data: { name?: string; email?: string }) =>
    api.patch('/me/profile', data),
  getBrandKits: () => api.get('/brand-kits'),
  createBrandKit: (data: Record<string, unknown>) => api.post('/brand-kits', data),
  updateBrandKit: (id: string, data: Record<string, unknown>) =>
    api.patch(`/brand-kits/${id}`, data),
  getTeam: () => api.get('/team/members'),
  inviteMember: (email: string, role: string) =>
    api.post('/team/invite', { email, role }),
  updateMemberRole: (memberId: string, role: string) =>
    api.patch(`/team/members/${memberId}`, { role }),
  removeMember: (memberId: string) => api.delete(`/team/members/${memberId}`),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/me/change-password', { current_password: currentPassword, new_password: newPassword }),
}

// Admin
export const adminAPI = {
  // Legacy method names (kept for backward compatibility)
  getStats: () => api.get('/admin/stats'),
  getTenants: () => api.get('/admin/tenants'),
  getUsers: () => api.get('/admin/users'),
  getAuditLog: (params?: Record<string, unknown>) =>
    api.get('/admin/audit-log', { params }),
  getSkillRegistry: () => api.get('/admin/skills'),
  toggleSkill: (skillId: string, enabled: boolean) =>
    api.patch(`/admin/skills/${skillId}`, { enabled }),
  // Canonical short-form methods
  stats: () => api.get('/admin/stats'),
  skills: () => api.get('/admin/skills'),
  updateSkill: (id: string, data: object) => api.patch(`/admin/skills/${id}`, data),
  users: (params?: { page?: number; search?: string }) =>
    api.get('/admin/users', { params }),
  updateUser: (id: string, data: object) => api.patch(`/admin/users/${id}`, data),
  auditLog: (params?: { date_from?: string; date_to?: string; action?: string }) =>
    api.get('/admin/audit-log', { params }),
  createSkill: (data: object) => api.post('/admin/skills', data),
  deleteSkill: (id: string) => api.delete(`/admin/skills/${id}`),
  categories: () => api.get('/admin/skill-categories'),
  createCategory: (data: object) => api.post('/admin/skill-categories', data),
  updateCategory: (id: string, data: object) => api.patch(`/admin/skill-categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/skill-categories/${id}`),
  skillInsights: (id: string) => api.get(`/admin/skills/${id}/insights`),
  llmConfig: () => api.get('/admin/llm-config'),
  updateLlmConfig: (data: object) => api.patch('/admin/llm-config', data),
}

// Knowledge Base
export const kbAPI = {
  scrape: (url: string) => api.post('/kb/scrape', { url }),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/kb/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// AI jobs
export const aiAPI = {
  startJob: (workspaceId: string, skillId: string, context: Record<string, unknown>) =>
    api.post('/ai/jobs', { workspace_id: workspaceId, skill_id: skillId, context }),
  getJob: (jobId: string) => api.get(`/ai/jobs/${jobId}`),
  cancelJob: (jobId: string) => api.post(`/ai/jobs/${jobId}/cancel`),
}

export { api }
export type { AxiosResponse }
