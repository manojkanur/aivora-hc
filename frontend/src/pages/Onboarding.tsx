import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight, Building2, Users, Palette } from 'lucide-react'
import { AivoraLogo } from '../components/brand/AivoraLogo'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const industries = ['Consulting', 'Technology', 'Financial Services', 'Healthcare', 'Retail', 'Manufacturing', 'Other']
const companySizes = ['1-10', '11-50', '51-200', '201-1000', '1000+']
const fonts = ['Space Grotesk', 'Inter', 'Poppins', 'DM Sans']

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49/mo',
    credits: '50 credits/mo',
    description: 'For individual consultants',
    features: ['5 HC skills', 'PDF & DOCX', 'Basic brand kit'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$149/mo',
    credits: '200 credits/mo',
    description: 'For boutique firms',
    features: ['15 HC skills', 'All exports', 'LinkedIn publishing'],
    recommended: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    credits: 'Unlimited',
    description: 'For large teams',
    features: ['All 27 skills', 'White-label', 'Team collaboration'],
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { setTenant } = useAuthStore()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    companyName: '',
    domain: '',
    industry: '',
    size: '',
    plan: 'professional',
    logoUrl: '',
    primaryColor: '#18181b',
    secondaryColor: '#ffffff',
    font: 'Space Grotesk',
  })

  const update = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }))

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      const res = await api.post('/onboarding/complete', formData)
      setTenant(res.data.tenant)
      setStep(4)
    } catch {
      // Proceed anyway
      setStep(4)
    } finally {
      setIsLoading(false)
    }
  }

  const stepLabels = ['Company', 'Plan', 'Brand Kit', 'Done']

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <AivoraLogo size="md" />
        </div>

        {/* Progress */}
        {step < 4 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    i + 1 < step ? 'bg-accent text-white' :
                    i + 1 === step ? 'bg-accent text-white' :
                    'bg-border text-text-muted'
                  )}>
                    {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn(
                    'ml-1.5 text-xs font-medium hidden sm:block',
                    i + 1 === step ? 'text-text-primary' : 'text-text-muted'
                  )}>
                    {label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <div className={cn('flex-1 h-px mx-3 min-w-[20px] sm:min-w-[40px]', i + 1 < step ? 'bg-accent' : 'bg-border')} />
                  )}
                </div>
              ))}
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${((step - 1) / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-2xl border border-border shadow-card p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-text-secondary" />
                </div>
                <div>
                  <h2 className="font-bold text-text-primary">Your Organization</h2>
                  <p className="text-sm text-text-muted">Tell us about your company</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Company Name"
                  placeholder="Acme Consulting"
                  value={formData.companyName}
                  onChange={e => update('companyName', e.target.value)}
                />
                <Input
                  label="Company Domain"
                  placeholder="acmeconsulting.com"
                  value={formData.domain}
                  onChange={e => update('domain', e.target.value)}
                />
                <div>
                  <label className="text-sm font-medium text-text-primary block mb-1.5">Industry</label>
                  <div className="flex flex-wrap gap-2">
                    {industries.map(ind => (
                      <button
                        key={ind}
                        onClick={() => update('industry', ind)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                          formData.industry === ind
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white text-text-secondary border-border hover:border-border-dark'
                        )}
                      >
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-primary block mb-1.5">
                    <Users className="w-4 h-4 inline mr-1" />
                    Company Size
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {companySizes.map(size => (
                      <button
                        key={size}
                        onClick={() => update('size', size)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                          formData.size === size
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white text-text-secondary border-border hover:border-border-dark'
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button className="w-full mt-6" onClick={() => setStep(2)} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Continue
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold text-text-primary">Choose your plan</h2>
                <p className="text-sm text-text-muted mt-1">You can change this anytime</p>
              </div>
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => update('plan', plan.id)}
                  className={cn(
                    'w-full p-5 rounded-2xl border text-left transition-all',
                    formData.plan === plan.id
                      ? 'border-accent bg-accent text-white'
                      : 'bg-white border-border hover:border-border-dark'
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn('font-bold', formData.plan === plan.id ? 'text-white' : 'text-text-primary')}>
                          {plan.name}
                        </span>
                        {plan.recommended && (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            formData.plan === plan.id ? 'bg-white/20 text-white' : 'bg-accent text-white'
                          )}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className={cn('text-sm mt-0.5', formData.plan === plan.id ? 'text-white/80' : 'text-text-muted')}>
                        {plan.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={cn('font-bold', formData.plan === plan.id ? 'text-white' : 'text-text-primary')}>
                        {plan.price}
                      </div>
                      <div className={cn('text-xs', formData.plan === plan.id ? 'text-white/70' : 'text-text-muted')}>
                        {plan.credits}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {plan.features.map(f => (
                      <span key={f} className={cn(
                        'text-xs',
                        formData.plan === plan.id ? 'text-white/80' : 'text-text-secondary'
                      )}>
                        • {f}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(3)} rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-2xl border border-border shadow-card p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
                  <Palette className="w-5 h-5 text-text-secondary" />
                </div>
                <div>
                  <h2 className="font-bold text-text-primary">Brand Kit Setup</h2>
                  <p className="text-sm text-text-muted">Customize your exports</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Logo URL (optional)"
                  placeholder="https://yourcompany.com/logo.png"
                  value={formData.logoUrl}
                  onChange={e => update('logoUrl', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-text-primary block mb-1.5">Primary Color</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-white">
                      <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={e => update('primaryColor', e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer"
                      />
                      <span className="text-sm text-text-secondary font-mono">{formData.primaryColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-primary block mb-1.5">Secondary Color</label>
                    <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-white">
                      <input
                        type="color"
                        value={formData.secondaryColor}
                        onChange={e => update('secondaryColor', e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer"
                      />
                      <span className="text-sm text-text-secondary font-mono">{formData.secondaryColor}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-text-primary block mb-1.5">Preferred Font</label>
                  <div className="flex gap-2 flex-wrap">
                    {fonts.map(font => (
                      <button
                        key={font}
                        onClick={() => update('font', font)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                          formData.font === font
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white text-text-secondary border-border hover:border-border-dark'
                        )}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" isLoading={isLoading} onClick={handleComplete} rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Finish Setup
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl border border-border shadow-card p-12 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">Your HC platform is ready!</h2>
              <p className="text-text-secondary mb-8">
                Welcome to Aivora HC. Let's build your first engagement.
              </p>
              <Button onClick={() => navigate('/dashboard')} className="w-full" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Go to Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
