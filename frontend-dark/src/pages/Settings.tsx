import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Palette, Users, Bell, Shield, Plus, Trash2, Mail, Plug } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../store/auth'
import { settingsAPI } from '../lib/api'
import { toast } from '../components/ui/Toast'
import { fadeUp } from '../lib/animations'
import { cn } from '../lib/utils'
import { getInitials } from '../lib/utils'

type SettingsTab = 'profile' | 'brand-kits' | 'team' | 'integrations' | 'notifications' | 'security'

const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'brand-kits', label: 'Brand Kits', icon: Palette },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
]

export default function Settings() {
  const { user, updateUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [isSaving, setIsSaving] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  })
  const [passwordForm, setPasswordForm] = useState({ current: '', newPw: '', confirm: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [notifications, setNotifications] = useState({
    new_drafts: true,
    xp_awards: true,
    quest_complete: true,
    billing: true,
    weekly_summary: false,
  })
  const handleSaveProfile = async () => {
    setIsSaving(true)
    try {
      await settingsAPI.updateProfile(profileForm)
      updateUser(profileForm)
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') }
    finally { setIsSaving(false) }
  }

  const handleChangePassword = async () => {
    if (passwordForm.newPw !== passwordForm.confirm) { toast.error('Passwords do not match'); return }
    try {
      await settingsAPI.changePassword(passwordForm.current, passwordForm.newPw)
      setPasswordForm({ current: '', newPw: '', confirm: '' })
      toast.success('Password changed successfully')
    } catch { toast.error('Failed to change password') }
  }

  const handleInvite = async () => {
    if (!inviteEmail) { toast.error('Email is required'); return }
    try {
      await settingsAPI.inviteMember(inviteEmail, inviteRole)
      setInviteEmail('')
      setShowInviteModal(false)
      toast.success(`Invitation sent to ${inviteEmail}`)
    } catch { toast.error('Failed to send invitation') }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-300 mt-1">Manage your account and preferences</p>
      </motion.div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-[#3b82f6] text-white'
                    : 'text-slate-300 hover:bg-[#1a1e2e]'
                )}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <div className="bg-[#131720] rounded-xl border border-[#1e2433] p-6 space-y-5">
              <h2 className="font-semibold text-white">Profile Settings</h2>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#3b82f6] text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {getInitials(user?.name || 'U')}
                </div>
                <div>
                  <Button variant="secondary" size="sm">Upload Photo</Button>
                  <p className="text-xs text-slate-600 mt-1">JPG or PNG, max 2MB</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  value={profileForm.name}
                  onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label="Email"
                  type="email"
                  value={profileForm.email}
                  onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              <Button isLoading={isSaving} onClick={handleSaveProfile}>Save Changes</Button>
            </div>
          )}

          {activeTab === 'brand-kits' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Brand Kits</h2>
                <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>New Brand Kit</Button>
              </div>
              <div className="text-center py-16 bg-[#131720] rounded-xl border border-[#1e2433]">
                <Palette className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-white font-medium">No brand kits yet</p>
                <p className="text-slate-600 text-sm mt-1">Create brand kits to customize your export styles</p>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">Team Members</h2>
                <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowInviteModal(true)}>
                  Invite Member
                </Button>
              </div>

              <div className="bg-[#131720] rounded-xl border border-[#1e2433] overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-[#3b82f6] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {getInitials(user?.name || 'U')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{user?.name}</p>
                    <p className="text-xs text-slate-600">{user?.email}</p>
                  </div>
                  <Badge variant="default" className="capitalize">{user?.role}</Badge>
                </div>
              </div>

              <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite Team Member" size="sm">
                <div className="p-5 space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    leftElement={<Mail className="w-4 h-4" />}
                  />
                  <div>
                    <label className="text-sm font-medium text-white block mb-1.5">Role</label>
                    <div className="flex gap-2">
                      {['admin', 'member', 'viewer'].map(role => (
                        <button
                          key={role}
                          onClick={() => setInviteRole(role)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-sm border capitalize transition-colors',
                            inviteRole === role
                              ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                              : 'bg-[#131720] text-slate-300 border-[#1e2433] hover:border-[#252d3f]'
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                    <Button className="flex-1" onClick={handleInvite}>Send Invite</Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Integrations</h2>
              <div className="bg-[#131720] rounded-xl border border-[#1e2433] p-6 text-sm text-slate-400">
                LinkedIn publishing has moved to the Admin area. Admins can compose posts, carousels, and PDF carousels from <span className="text-slate-200 font-medium">Admin → Publish</span>.
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-[#131720] rounded-xl border border-[#1e2433] p-6 space-y-5">
              <h2 className="font-semibold text-white">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  { key: 'new_drafts' as const, label: 'New Drafts', desc: 'When AI generates a new draft' },
                  { key: 'xp_awards' as const, label: 'XP Awards', desc: 'When you earn XP' },
                  { key: 'quest_complete' as const, label: 'Quest Completions', desc: 'When a quest is complete' },
                  { key: 'billing' as const, label: 'Billing Alerts', desc: 'Credit usage and billing updates' },
                  { key: 'weekly_summary' as const, label: 'Weekly Summary', desc: 'Weekly progress email' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-[#1e2433] last:border-0">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-slate-600">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifications(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                        notifications[item.key] ? 'bg-[#3b82f6]' : 'bg-border'
                      )}
                    >
                      <div className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-[#131720] shadow transition-transform',
                        notifications[item.key] ? 'translate-x-6' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                ))}
              </div>
              <Button>Save Preferences</Button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="bg-[#131720] rounded-xl border border-[#1e2433] p-6 space-y-4">
                <h2 className="font-semibold text-white">Change Password</h2>
                <Input
                  label="Current Password"
                  type="password"
                  value={passwordForm.current}
                  onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                />
                <Input
                  label="New Password"
                  type="password"
                  value={passwordForm.newPw}
                  onChange={e => setPasswordForm(f => ({ ...f, newPw: e.target.value }))}
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                />
                <Button onClick={handleChangePassword}>Update Password</Button>
              </div>

              <div className="bg-[#131720] rounded-xl border border-red-200 p-6 space-y-3">
                <h2 className="font-semibold text-red-700">Danger Zone</h2>
                <div className="flex items-center justify-between py-3 border-b border-[#1e2433]">
                  <div>
                    <p className="text-sm font-medium text-white">Export All Data</p>
                    <p className="text-xs text-slate-600">Download a copy of all your data</p>
                  </div>
                  <Button variant="secondary" size="sm">Export</Button>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-sm font-medium text-red-700">Delete Account</p>
                    <p className="text-xs text-slate-600">Permanently delete your account and data</p>
                  </div>
                  <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />}>Delete</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
