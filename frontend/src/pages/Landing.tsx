import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Trophy, Star, Check,
  Compass, BarChart3, TrendingUp, Lightbulb, ClipboardList, Award,
} from 'lucide-react'
import { fadeUp, scaleIn, staggerContainer, AnimatedSection } from '../lib/animations'
import { AivoraLogo } from '../components/brand/AivoraLogo'

const stats = [
  { value: '27', label: 'HC Modules' },
  { value: '3', label: 'Export formats' },
  { value: '1-click', label: 'LinkedIn ready' },
  { value: 'XP', label: 'Gamified progress' },
]

const skillShowcase = [
  { Icon: Compass,       name: 'HC Strategy Charter', category: 'Strategy',     tier: 'Starter',      credits: 5 },
  { Icon: BarChart3,     name: 'Org Design Blueprint', category: 'Talent',       tier: 'Professional', credits: 8 },
  { Icon: TrendingUp,    name: 'Career Framework',     category: 'Career',       tier: 'Professional', credits: 6 },
  { Icon: Lightbulb,     name: 'Leadership Pipeline',  category: 'Talent',       tier: 'Enterprise',   credits: 10 },
  { Icon: ClipboardList, name: 'Workforce Planning',   category: 'Strategy',     tier: 'Professional', credits: 7 },
  { Icon: Award,         name: 'Engagement Index',     category: 'Deliverables', tier: 'Starter',      credits: 4 },
]

const steps = [
  {
    num: '01',
    title: 'Fill a Challenge Brief',
    desc: 'Describe your client context, challenges, and outcomes. Aivora AI synthesizes your inputs.',
  },
  {
    num: '02',
    title: 'Run AI Skills',
    desc: 'Select from 27 specialized HC skills. Each generates board-ready content in minutes.',
  },
  {
    num: '03',
    title: 'Export & Publish',
    desc: 'Download as PPTX, PDF, or DOCX with your brand kit. Publish directly to LinkedIn.',
  },
]

const plans = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    description: 'Perfect for independent consultants',
    credits: '50 credits/month',
    features: ['5 HC skills', 'PDF & DOCX export', 'Basic brand kit', 'Email support'],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: '$149',
    period: '/month',
    description: 'For boutique advisory firms',
    credits: '200 credits/month',
    features: ['15 HC skills', 'All export formats', 'Advanced brand kits', 'LinkedIn publishing', 'Priority support'],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large consultancies',
    credits: 'Unlimited credits',
    features: ['All 27 HC skills', 'White-label exports', 'Custom brand kits', 'Team collaboration', 'Dedicated support', 'Custom integrations'],
    cta: 'Talk to sales',
    highlighted: false,
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-secondary font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <AivoraLogo size="sm" />
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="space-y-6"
        >
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-border rounded-full text-xs font-medium text-text-secondary shadow-card">
              <Star className="w-3 h-3 fill-current" />
              AI-Powered Human Capital Advisory
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-text-primary tracking-tight leading-none"
          >
            The HC Advisory
            <br />
            <span className="text-text-secondary">Platform for AI.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-lg text-text-secondary max-w-xl mx-auto leading-relaxed"
          >
            Build board-ready deliverables in hours, not weeks.
            27 specialized skills, intelligent briefing, and one-click publishing.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={3}
            className="flex items-center justify-center gap-3"
          >
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent-hover transition-colors shadow-card"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-border text-text-primary font-medium rounded-xl hover:bg-surface-tertiary transition-colors">
              Watch Demo
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Bar */}
      <AnimatedSection>
        <div className="max-w-4xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white px-6 py-6 text-center">
                <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
                <div className="text-sm text-text-muted mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Skills Showcase */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl font-bold text-text-primary">27 Specialized HC Skills</h2>
          <p className="text-text-secondary mt-2">From strategy to deliverables, every engagement covered.</p>
        </AnimatedSection>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {skillShowcase.map((skill, i) => (
            <motion.div
              key={skill.name}
              variants={scaleIn}
              custom={i}
              className="bg-white rounded-xl border border-border p-5 shadow-card"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center">
                  <skill.Icon className="w-5 h-5 text-text-secondary" />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  skill.tier === 'Starter' ? 'bg-surface-tertiary text-text-secondary' :
                  skill.tier === 'Enterprise' ? 'bg-black text-white' :
                  'bg-accent text-white'
                }`}>
                  {skill.tier}
                </span>
              </div>
              <h3 className="font-semibold text-text-primary text-sm">{skill.name}</h3>
              <p className="text-xs text-text-muted mt-1">{skill.category} &middot; {skill.credits} credits</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-border py-24">
        <div className="max-w-4xl mx-auto px-6">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl font-bold text-text-primary">How it works</h2>
            <p className="text-text-secondary mt-2">Three steps from brief to published</p>
          </AnimatedSection>

          <div className="space-y-8">
            {steps.map((step, i) => (
              <AnimatedSection key={step.num} delay={i} className="flex items-start gap-6">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center">
                  <span className="font-bold text-sm">{step.num}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1">{step.title}</h3>
                  <p className="text-text-secondary">{step.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Gamification Section */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <AnimatedSection>
            <div className="space-y-4">
              <span className="px-3 py-1 bg-surface-tertiary text-text-secondary text-xs font-medium rounded-full">
                Gamification
              </span>
              <h2 className="text-3xl font-bold text-text-primary">
                Make consulting engaging, not exhausting.
              </h2>
              <p className="text-text-secondary leading-relaxed">
                Earn XP as you work. Complete quests. Unlock badges for milestones.
                Track your progress on leaderboards and share your expertise.
              </p>
              <div className="space-y-3">
                {['Earn XP for every deliverable', 'Complete quests for bonus rewards', 'Unlock skill streaks', 'Compete on team leaderboards'].map(feat => (
                  <div key={feat} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-text-secondary">{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={1}>
            <div className="bg-white rounded-2xl border border-border shadow-elevated p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">5</div>
                  <div>
                    <p className="font-semibold text-text-primary text-sm">Senior Consultant</p>
                    <p className="text-xs text-text-muted">Level 5</p>
                  </div>
                </div>
                <Trophy className="w-6 h-6 text-text-muted" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1.5">
                  <span>Progress to Level 6</span>
                  <span>1,240 / 3,000 XP</span>
                </div>
                <div className="h-2 bg-surface-tertiary rounded-full">
                  <div className="h-full w-[41%] bg-accent rounded-full" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                {[Trophy, Star, Award, TrendingUp, Lightbulb, Compass].map((Icon, i) => (
                  <div key={i} className={`aspect-square rounded-xl border-2 flex items-center justify-center ${
                    i < 4 ? 'border-border' : 'border-border opacity-30'
                  }`}>
                    <Icon className="w-5 h-5 text-text-secondary" />
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white border-y border-border py-24">
        <div className="max-w-5xl mx-auto px-6">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl font-bold text-text-primary">Simple, transparent pricing</h2>
            <p className="text-text-secondary mt-2">Start free, upgrade as you grow</p>
          </AnimatedSection>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                variants={scaleIn}
                custom={i}
                className={`rounded-2xl p-6 ${
                  plan.highlighted
                    ? 'bg-accent text-white'
                    : 'bg-white border border-border'
                }`}
              >
                <div className="mb-6">
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                    plan.highlighted ? 'text-white/70' : 'text-text-muted'
                  }`}>
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-bold ${plan.highlighted ? 'text-white' : 'text-text-primary'}`}>
                      {plan.price}
                    </span>
                    <span className={plan.highlighted ? 'text-white/70 text-sm' : 'text-text-muted text-sm'}>
                      {plan.period}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${plan.highlighted ? 'text-white/80' : 'text-text-secondary'}`}>
                    {plan.description}
                  </p>
                  <p className={`text-xs font-medium mt-2 ${plan.highlighted ? 'text-white/70' : 'text-text-muted'}`}>
                    {plan.credits}
                  </p>
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map(feat => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? 'text-white' : 'text-text-secondary'}`} />
                      <span className={`text-sm ${plan.highlighted ? 'text-white/90' : 'text-text-secondary'}`}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/signup"
                  className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlighted
                      ? 'bg-white text-accent hover:bg-white/90'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <AnimatedSection>
          <h2 className="text-4xl font-bold text-text-primary mb-4">
            Start your first HC engagement today.
          </h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto">
            Join HC advisors who use Aivora to deliver faster, better work.
            No credit card required.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-white font-semibold rounded-xl hover:bg-accent-hover transition-colors text-base shadow-elevated"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <AivoraLogo size="xs" />
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <Link to="/login" className="hover:text-text-primary transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-text-primary transition-colors">Sign up</Link>
            <span>© 2026 Aivora HC</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
