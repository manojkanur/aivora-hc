import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, FileText, Download, Plug, FileEdit, Plus } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { SkillCard } from '../components/skills/SkillCard'
import { DraftCard } from '../components/ai/DraftCard'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/SkeletonLoader'
import { draftsAPI, exportsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import type { DraftData } from '../components/ai/DraftCard'

type Tab = 'skills' | 'drafts' | 'exports' | 'connectors' | 'briefs'

const tabs: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'skills', label: 'Studios', icon: Sparkles },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'exports', label: 'Exports', icon: Download },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'briefs', label: 'Challenge Briefs', icon: FileEdit },
]

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { workspaces, skills, fetchSkills, currentWorkspace } = useWorkspaceStore()
  const [activeTab, setActiveTab] = useState<Tab>('skills')
  const [drafts, setDrafts] = useState<DraftData[]>([])
  const [exports, setExports] = useState<{ id: string; skill_name: string; format: string; created_at: string; download_url: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const workspace = workspaces.find(w => w.id === id) || currentWorkspace

  useEffect(() => {
    if (id) {
      fetchSkills(id).then(() => setIsLoading(false))
    }
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (activeTab === 'drafts' && id) {
      draftsAPI.list({ workspace_id: id }).then(res => setDrafts(res.data.drafts || [])).catch(() => {})
    }
    if (activeTab === 'exports' && id) {
      exportsAPI.list({ workspace_id: id }).then(res => setExports(res.data.exports || [])).catch(() => {})
    }
  }, [activeTab, id])

  const handleSkillClick = (skillId: string) => {
    navigate(`/workspaces/${id}/skills/${skillId}`)
  }

  const handleDraftApprove = async (draftId: string) => {
    try {
      await draftsAPI.approve(draftId)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'approved' as const } : d))
      toast.success('Draft approved')
    } catch { toast.error('Failed to approve draft') }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/workspaces')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Workspaces
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{workspace?.name || 'Workspace'}</h1>
            <p className="text-text-secondary mt-0.5">{workspace?.client_name}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'skills' && (
        <div>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} variant="card" />)}
            </div>
          ) : skills.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No studios available</p>
              <p className="text-text-muted text-sm mt-1">Studios will appear here once configured by an admin</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {skills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleSkillClick(skill.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'drafts' && (
        <div className="space-y-4">
          {drafts.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No drafts yet</p>
              <p className="text-text-muted text-sm mt-1">Run a skill to generate your first draft</p>
            </div>
          ) : (
            drafts.map(draft => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onApprove={handleDraftApprove}
                onExport={(id) => navigate(`/exports?draft=${id}`)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'exports' && (
        <div>
          {exports.length === 0 ? (
            <div className="text-center py-16">
              <Download className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No exports yet</p>
              <p className="text-text-muted text-sm mt-1">Approve a draft and export it</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exports.map(exp => (
                <div key={exp.id} className="bg-white border border-border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary text-sm">{exp.skill_name}</p>
                    <p className="text-xs text-text-muted mt-0.5 uppercase">{exp.format}</p>
                  </div>
                  <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => window.open(exp.download_url, '_blank')}>
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'connectors' && (
        <div className="text-center py-16">
          <Plug className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium">No connectors configured</p>
          <p className="text-text-muted text-sm mt-1">Connect data sources to enrich your skills</p>
          <Button variant="secondary" className="mt-4" leftIcon={<Plus className="w-4 h-4" />}>
            Add Connector
          </Button>
        </div>
      )}

      {activeTab === 'briefs' && (
        <div className="text-center py-16">
          <FileEdit className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-primary font-medium">No challenge briefs yet</p>
          <p className="text-text-muted text-sm mt-1">Create a brief to run AI analysis across multiple skills</p>
          <Button className="mt-4" leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/challenge-brief')}>
            New Brief
          </Button>
        </div>
      )}
    </div>
  )
}
