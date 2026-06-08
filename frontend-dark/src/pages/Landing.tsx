import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Check, Star, Sparkles, Zap,
  Building2, Target, Users, FileSearch, BarChart3, Award,
  ChevronRight, Play, Shield, Clock, Globe,
} from 'lucide-react'
import { fadeUp, staggerContainer } from '../lib/animations'
import { AivoraLogo } from '../components/brand/AivoraLogo'

const stats = [
  { value: '27', label: 'HC Studios', icon: Sparkles },
  { value: '5-step', label: 'Smart Onboarding', icon: Target },
  { value: '3', label: 'Export formats', icon: FileSearch },
  { value: 'AI', label: 'Powered advisory', icon: Zap },
]

const flow = [
  { num: '01', icon: Building2, title: 'Smart Client Onboarding',  desc: 'Capture industry, region, priorities, workforce challenges and evidence preferences in 5 structured steps.', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/25' },
  { num: '02', icon: Target,    title: 'Challenge Brief',           desc: 'Define the advisory challenge, HC domains, questions, constraints, and desired outputs — pre-populated from your onboarding.', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/25' },
  { num: '03', icon: Sparkles,  title: 'Run 27 HC Studios',         desc: 'Each studio receives your client context automatically. Generate board-ready outputs in minutes.', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/25' },
  { num: '04', icon: BarChart3, title: 'Export & Publish',          desc: 'Download as PPTX, PDF, or DOCX with your brand kit. Publish directly to LinkedIn.', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
]

const studiosGrid = [
  { name: 'HC Strategy Charter',  cat: 'Strategy',    tier: 'Starter',   icon: Target },
  { name: 'HiPo Development',     cat: 'Leadership',  tier: 'Enterprise', icon: Award,   featured: true },
  { name: 'Workforce Planning',   cat: 'Talent',      tier: 'Pro',       icon: Users },
  { name: 'Org Design Blueprint', cat: 'Strategy',    tier: 'Pro',       icon: Building2 },
  { name: 'Employee Experience',  cat: 'Culture',     tier: 'Enterprise', icon: Globe },
  { name: 'Total Rewards',        cat: 'Rewards',     tier: 'Enterprise', icon: Shield },
]

const plans = [
  {
    name: 'Starter', price: '$49', period: '/month',
    description: 'For independent consultants',
    credits: '50 credits/month',
    features: ['5 HC studios', 'PDF & DOCX export', 'Smart onboarding', 'Email support'],
    cta: 'Get started', highlighted: false,
  },
  {
    name: 'Professional', price: '$149', period: '/month',
    description: 'For boutique advisory firms',
    credits: '200 credits/month',
    features: ['15 HC studios', 'All export formats', 'Challenge Brief', 'LinkedIn publishing', 'Priority support'],
    cta: 'Start free trial', highlighted: true,
  },
  {
    name: 'Enterprise', price: 'Custom', period: '',
    description: 'For large consultancies',
    credits: 'Unlimited credits',
    features: ['All 27 studios', 'White-label exports', 'Team collaboration', 'Custom brand kits', 'Dedicated support'],
    cta: 'Talk to sales', highlighted: false,
  },
]

const tierColor = (t: string) =>
  t === 'Enterprise' ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
  : t === 'Pro' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
  : 'text-slate-400 bg-slate-500/10 border-slate-500/20'

export default function Landing() {
  const [videoOpen, setVideoOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#0c0e14] text-white font-sans overflow-x-hidden">

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#0c0e14]/95 backdrop-blur-md border-b border-[#1a1e2e]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <AivoraLogo size="sm" />
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-500">
            <a href="#flow" className="hover:text-white transition-colors">How it works</a>
            <a href="#studios" className="hover:text-white transition-colors">Studios</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-500 hover:text-white transition-colors hidden sm:block">Sign in</Link>
            <Link to="/signup" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition-colors shadow-[0_0_12px_rgba(59,130,246,0.3)]">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-64 h-64 bg-violet-600/6 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center relative">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">

            <motion.div variants={fadeUp} custom={0}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border border-blue-500/25 bg-blue-500/8 text-blue-400">
                <Star className="w-3 h-3 fill-current" /> AI-Powered Human Capital Advisory Platform
              </span>
            </motion.div>

            <motion.h1 variants={fadeUp} custom={1} className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
              Build HC deliverables
              <br />
              <span className="text-blue-400">10× faster.</span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={2} className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Smart onboarding captures your client context once. 27 HC studios use it to generate board-ready
              deliverables in minutes — not weeks.
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="flex items-center justify-center gap-3 flex-wrap">
              <Link to="/signup" className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-all shadow-[0_0_24px_rgba(59,130,246,0.35)]">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-2 px-7 py-3.5 border border-[#1e2433] text-slate-300 font-medium rounded-xl hover:border-[#252d3f] hover:text-white transition-all"
              >
                <Play className="w-4 h-4 text-blue-400" /> Watch demo
              </button>
            </motion.div>

            <motion.p variants={fadeUp} custom={4} className="text-xs text-slate-600">
              No credit card required · Setup in 5 minutes · GCC-focused advisory intelligence
            </motion.p>

          </motion.div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1a1e2e] rounded-2xl overflow-hidden border border-[#1a1e2e]">
          {stats.map(s => (
            <div key={s.label} className="bg-[#0f1117] px-6 py-5 text-center group hover:bg-[#111520] transition-colors">
              <s.icon className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow ─────────────────────────────────────────────────────── */}
      <section id="flow" className="border-y border-[#1a1e2e] bg-[#080a0f] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">The flow</span>
            <h2 className="text-3xl font-bold text-white mt-2">One context. Every studio.</h2>
            <p className="text-slate-500 mt-2">Enter your client details once. Every studio and brief is pre-populated.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {flow.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 hover:border-[#252d3f] transition-colors group"
              >
                {i < flow.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${step.bg}`}>
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                </div>
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{step.num}</span>
                <h3 className="text-sm font-bold text-white mt-1 mb-2 group-hover:text-blue-300 transition-colors">{step.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Studios ──────────────────────────────────────────────────── */}
      <section id="studios" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">27 studios</span>
            <h2 className="text-3xl font-bold text-white mt-2">Every HC engagement covered.</h2>
            <p className="text-slate-500 mt-2">From strategy to succession, leadership to rewards.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {studiosGrid.map((s, i) => {
              const Icon = s.icon
              return (
                <motion.div
                  key={s.name}
                  initial={{ opacity: 0, scale: 0.97 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className={`rounded-xl border p-5 hover:border-blue-500/25 hover:bg-[#111520] transition-all ${s.featured ? 'border-blue-500/30 bg-blue-500/5' : 'border-[#1e2433] bg-[#0f1117]'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${s.featured ? 'bg-blue-500/15 border-blue-500/30' : 'bg-[#1a1e2e] border-[#1e2433]'}`}>
                      <Icon className={`w-4 h-4 ${s.featured ? 'text-blue-400' : 'text-slate-400'}`} />
                    </div>
                    {s.featured && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-600 text-white">Featured</span>}
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600">{s.cat}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${tierColor(s.tier)}`}>{s.tier}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
          <div className="text-center">
            <Link to="/signup" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Explore all 27 studios <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Social proof / features ──────────────────────────────────── */}
      <section className="border-y border-[#1a1e2e] bg-[#080a0f] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Clock,   title: 'Hours, not weeks', desc: 'Generate board-ready deliverables from a Challenge Brief in under an hour. What used to take a week now takes a morning.' },
              { icon: Globe,   title: 'GCC-native intelligence', desc: 'Nationalization programs, GCC operating models, and regional HC benchmarks built-in from day one.' },
              { icon: Shield,  title: 'Advisory-grade quality', desc: 'Outputs match the quality expectations of Big-4 advisory firms. Every studio is designed by experienced HC practitioners.' },
            ].map(f => (
              <div key={f.title} className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Pricing</span>
            <h2 className="text-3xl font-bold text-white mt-2">Simple, transparent pricing.</h2>
            <p className="text-slate-500 mt-2">Start free, upgrade as you grow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-2xl p-6 border relative overflow-hidden ${
                  plan.highlighted
                    ? 'bg-blue-600 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.3)]'
                    : 'bg-[#0f1117] border-[#1e2433] hover:border-[#252d3f] transition-colors'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute top-4 right-4">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black/20 text-white/80">Most popular</span>
                  </div>
                )}
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.highlighted ? 'text-white/60' : 'text-slate-600'}`}>{plan.name}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-3xl font-bold ${plan.highlighted ? 'text-white' : 'text-white'}`}>{plan.price}</span>
                  <span className={`text-sm ${plan.highlighted ? 'text-white/60' : 'text-slate-600'}`}>{plan.period}</span>
                </div>
                <p className={`text-sm mb-1 ${plan.highlighted ? 'text-white/70' : 'text-slate-500'}`}>{plan.description}</p>
                <p className={`text-xs font-medium mb-5 ${plan.highlighted ? 'text-white/60' : 'text-slate-600'}`}>{plan.credits}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${plan.highlighted ? 'bg-white/20' : 'bg-blue-500/15 border border-blue-500/30'}`}>
                        <Check className={`w-2.5 h-2.5 ${plan.highlighted ? 'text-white' : 'text-blue-400'}`} />
                      </div>
                      <span className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-slate-400'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/signup"
                  className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    plan.highlighted
                      ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-[0_4px_12px_rgba(0,0,0,0.3)]'
                      : 'bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
                  }`}>
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-[#1a1e2e] py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-4xl font-bold text-white mb-4">
              Start your first HC engagement today.
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Join HC advisors who use Aivora to deliver faster, better work. Setup in 5 minutes.
            </p>
            <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-all text-base shadow-[0_0_32px_rgba(59,130,246,0.35)]">
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="text-xs text-slate-600 mt-4">No credit card required</p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[#1a1e2e] bg-[#0c0e14]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <AivoraLogo size="xs" />
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <Link to="/login" className="hover:text-blue-400 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-blue-400 transition-colors">Sign up</Link>
            <a href="#pricing" className="hover:text-blue-400 transition-colors">Pricing</a>
            <span>© 2026 Aivora HC</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
