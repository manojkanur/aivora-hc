import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, BookOpen, Clock, ArrowLeft, Tag, Filter } from 'lucide-react'
import { motion } from 'framer-motion'
import kb from '../lib/seeds/knowledgeBase.json'
import { FRAMEWORK, STUDIOS } from '../lib/advisory/types'
import { cn } from '../lib/utils'
import { Chip } from '../components/ui/Chip'

interface Article {
  id: string
  title: string
  category: string
  dimensions: string[]
  readMinutes: number
  author: string
  date: string
  summary: string
  tags: string[]
  sections: { heading: string; body: string }[]
}

const ARTICLES = kb.articles as Article[]
const CATEGORIES = kb.categories

export default function KnowledgeBase() {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [activeDim, setActiveDim] = useState<string>('all')
  const [selected, setSelected] = useState<Article | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ARTICLES.filter(a => {
      if (activeCat !== 'all' && a.category !== activeCat) return false
      if (activeDim !== 'all' && !a.dimensions.includes(activeDim)) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )
    })
  }, [search, activeCat, activeDim])

  if (selected) return <ArticleDetail article={selected} onBack={() => setSelected(null)} />

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-7">
      {/* Header — matches Dashboard hero proportions */}
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Knowledge Base</h1>
          <p className="text-sm text-slate-400 mt-1">Frameworks, playbooks, research and case studies for human capital leaders</p>
        </div>
      </header>

      {/* Search + filters */}
      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search articles, tags, topics…"
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mr-1 flex items-center gap-1"><Filter className="w-3 h-3" /> Type</span>
          <Chip active={activeCat === 'all'} onClick={() => setActiveCat('all')}>All</Chip>
          {CATEGORIES.map(c => (
            <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.label}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mr-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Dimension</span>
          <Chip active={activeDim === 'all'} onClick={() => setActiveDim('all')}>All</Chip>
          {FRAMEWORK.dimensions.map(d => (
            <Chip key={d.id} active={activeDim === d.id} onClick={() => setActiveDim(d.id)}>{d.name}</Chip>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500 -mt-3">{filtered.length} article{filtered.length === 1 ? '' : 's'}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => (
          <ArticleCard key={a.id} article={a} onClick={() => setSelected(a)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">No articles match those filters.</div>
      )}
    </div>
  )
}

function ArticleCard({ article, onClick }: { article: Article; onClick: () => void }) {
  const cat = CATEGORIES.find(c => c.id === article.category)
  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="text-left rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 sm:p-5 hover:border-[#2a3048] hover:bg-[#111420] transition-all group"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">{cat?.label}</span>
        <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readMinutes} min</span>
      </div>
      <h3 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-blue-300 transition-colors">{article.title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{article.summary}</p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {article.tags.slice(0, 3).map(t => (
          <Chip key={t} variant="tag" className="text-[10px]">{t}</Chip>
        ))}
      </div>
    </motion.button>
  )
}

function ArticleDetail({ article, onBack }: { article: Article; onBack: () => void }) {
  const cat = CATEGORIES.find(c => c.id === article.category)
  const relatedStudios = STUDIOS.studios.filter(s => s.dimensions.some(d => article.dimensions.includes(d))).slice(0, 4)
  const related = ARTICLES
    .filter(a => a.id !== article.id && a.dimensions.some(d => article.dimensions.includes(d)))
    .slice(0, 3)

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-blue-400 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to knowledge base
      </button>

      <article className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Chip variant="tag" className="text-[10px] !text-blue-300 !border-blue-500/30 !bg-blue-500/10">{cat?.label}</Chip>
          <span className="text-xs text-slate-500 flex items-center gap-1.5"><Clock className="w-3 h-3" /> {article.readMinutes} min read</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-500">{article.author}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">{article.title}</h1>
        <p className="text-base text-slate-300 leading-relaxed mb-8 border-l-2 border-blue-500/40 pl-4 italic">{article.summary}</p>

        <div className="space-y-7">
          {article.sections.map((s, i) => (
            <div key={i}>
              <h2 className="text-sm font-semibold text-white mb-2">{s.heading}</h2>
              <p className="text-sm text-slate-300 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-[#1e2433]">
          {article.tags.map(t => (
            <Chip key={t} variant="tag">{t}</Chip>
          ))}
        </div>
      </article>

      {relatedStudios.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Related studios</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedStudios.map(s => (
              <Link key={s.id} to="/skills" className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 hover:border-[#2a3048] hover:bg-[#111420] transition-all">
                <div className="text-sm font-semibold text-white">{s.name}</div>
                <div className="text-xs text-slate-500 mt-1">{s.deliverable}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Read next</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {related.map(r => (
              <button key={r.id} onClick={() => { onBack(); setTimeout(() => window.scrollTo(0, 0), 0) }} className="text-left rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 hover:border-[#2a3048] hover:bg-[#111420] transition-all">
                <div className="text-sm font-semibold text-white leading-snug line-clamp-2">{r.title}</div>
                <div className="text-xs text-slate-500 mt-2">{r.readMinutes} min</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
