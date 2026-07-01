import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, BookOpen, Clock, ArrowLeft, Tag, Filter, Plus, Pencil, Trash2, X, Save, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import kbSeed from '../lib/seeds/knowledgeBase.json'
import { FRAMEWORK, STUDIOS } from '../lib/advisory/types'
import { Chip } from '../components/ui/Chip'
import { kbAPI, type KbArticle, type KbArticleWrite } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { isAdminUser } from '../lib/adminAccess'

type Article = KbArticle

const CATEGORIES = kbSeed.categories as { id: string; label: string }[]

const EMPTY_DRAFT: KbArticleWrite = {
  title: '',
  category: CATEGORIES[0]?.id ?? 'frameworks',
  dimensions: [],
  readMinutes: 5,
  author: 'Aivora Editorial',
  date: new Date().toISOString().slice(0, 10),
  summary: '',
  tags: [],
  sections: [{ heading: '', body: '' }],
}

export default function KnowledgeBase() {
  const { user } = useAuthStore()
  const isAdmin = isAdminUser(user)

  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [activeDim, setActiveDim] = useState<string>('all')
  const [selected, setSelected] = useState<Article | null>(null)
  const [editorArticle, setEditorArticle] = useState<Article | 'new' | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await kbAPI.listArticles()
      setArticles(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load articles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter(a => {
      if (activeCat !== 'all' && a.category !== activeCat) return false
      if (activeDim !== 'all' && !a.dimensions.includes(activeDim)) return false
      if (!q) return true
      return (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )
    })
  }, [search, activeCat, activeDim, articles])

  if (editorArticle) {
    return (
      <ArticleEditor
        article={editorArticle === 'new' ? null : editorArticle}
        onClose={() => setEditorArticle(null)}
        onSaved={saved => {
          setEditorArticle(null)
          setArticles(prev => {
            const idx = prev.findIndex(a => a.id === saved.id)
            if (idx === -1) return [saved, ...prev]
            const next = [...prev]
            next[idx] = saved
            return next
          })
          if (selected?.id === saved.id) setSelected(saved)
        }}
      />
    )
  }

  if (selected) {
    return (
      <ArticleDetail
        article={selected}
        onBack={() => setSelected(null)}
        related={articles.filter(a => a.id !== selected.id && a.dimensions.some(d => selected.dimensions.includes(d))).slice(0, 3)}
        isAdmin={isAdmin}
        onEdit={() => setEditorArticle(selected)}
        onDelete={async () => {
          if (!confirm(`Delete "${selected.title}"? This can't be undone.`)) return
          try {
            await kbAPI.deleteArticle(selected.id)
            setArticles(prev => prev.filter(a => a.id !== selected.id))
            setSelected(null)
          } catch (e: any) {
            alert(e?.response?.data?.detail || 'Delete failed')
          }
        }}
      />
    )
  }

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-7">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-blue-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Knowledge Base</h1>
          <p className="text-sm text-slate-400 mt-1">Frameworks, playbooks, research and case studies for human capital leaders</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditorArticle('new')}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> New article
          </button>
        )}
      </header>

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

      <div className="text-xs text-slate-500 -mt-3 flex items-center gap-3">
        {loading ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span> : <span>{filtered.length} article{filtered.length === 1 ? '' : 's'}</span>}
        {error && <span className="text-rose-400">· {error}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => (
          <ArticleCard
            key={a.id}
            article={a}
            onClick={() => setSelected(a)}
            isAdmin={isAdmin}
            onEdit={() => setEditorArticle(a)}
          />
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">No articles match those filters.</div>
      )}
    </div>
  )
}

function ArticleCard({ article, onClick, isAdmin, onEdit }: { article: Article; onClick: () => void; isAdmin: boolean; onEdit: () => void }) {
  const cat = CATEGORIES.find(c => c.id === article.category)
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="relative rounded-2xl border border-[#1e2433] bg-[#0f1117] p-4 sm:p-5 hover:border-[#2a3048] hover:bg-[#111420] transition-all group"
    >
      <button onClick={onClick} className="text-left w-full">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-wider text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">{cat?.label ?? article.category}</span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readMinutes} min</span>
        </div>
        <h3 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-blue-300 transition-colors">{article.title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{article.summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {article.tags.slice(0, 3).map(t => (
            <Chip key={t} variant="tag" className="text-[10px]">{t}</Chip>
          ))}
        </div>
      </button>
      {isAdmin && (
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-lg border border-[#1e2433] bg-[#0c0e14]/80 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white hover:border-blue-500/40 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit article"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
      )}
    </motion.div>
  )
}

function ArticleDetail({
  article, onBack, related, isAdmin, onEdit, onDelete,
}: {
  article: Article
  onBack: () => void
  related: Article[]
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = CATEGORIES.find(c => c.id === article.category)
  const relatedStudios = STUDIOS.studios.filter(s => s.dimensions.some(d => article.dimensions.includes(d))).slice(0, 4)

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-blue-400 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to knowledge base
        </button>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-lg border border-[#1e2433] bg-[#0f1117] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-blue-500/40"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      <article className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Chip variant="tag" className="text-[10px] !text-blue-300 !border-blue-500/30 !bg-blue-500/10">{cat?.label ?? article.category}</Chip>
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
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{s.body}</p>
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

function ArticleEditor({ article, onClose, onSaved }: {
  article: Article | null
  onClose: () => void
  onSaved: (a: Article) => void
}) {
  const [draft, setDraft] = useState<KbArticleWrite>(() =>
    article
      ? {
          title: article.title,
          category: article.category,
          dimensions: article.dimensions,
          readMinutes: article.readMinutes,
          author: article.author,
          date: article.date,
          summary: article.summary,
          tags: article.tags,
          sections: article.sections.length ? article.sections : [{ heading: '', body: '' }],
          slug: article.slug,
        }
      : EMPTY_DRAFT
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const patch = (u: Partial<KbArticleWrite>) => setDraft(prev => ({ ...prev, ...u }))
  const patchSection = (idx: number, u: Partial<{ heading: string; body: string }>) => {
    setDraft(prev => {
      const next = [...prev.sections]
      next[idx] = { ...next[idx], ...u }
      return { ...prev, sections: next }
    })
  }
  const addSection = () => patch({ sections: [...draft.sections, { heading: '', body: '' }] })
  const removeSection = (i: number) => patch({ sections: draft.sections.filter((_, idx) => idx !== i) })

  const submit = async () => {
    if (!draft.title.trim()) { setErr('Title is required'); return }
    if (!draft.summary.trim()) { setErr('Summary is required'); return }
    setSaving(true)
    setErr(null)
    try {
      const payload: KbArticleWrite = {
        ...draft,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        author: draft.author.trim() || 'Aivora Editorial',
        sections: draft.sections.filter(s => s.heading.trim() || s.body.trim()),
      }
      const res = article
        ? await kbAPI.updateArticle(article.id, payload)
        : await kbAPI.createArticle(payload)
      onSaved(res.data)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const tagsStr = draft.tags.join(', ')
  const dimsSet = new Set(draft.dimensions)

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-blue-400 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Cancel
        </button>
        <h1 className="text-xl font-bold text-white">{article ? 'Edit article' : 'New article'}</h1>
        <button
          onClick={submit}
          disabled={saving}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {article ? 'Save changes' : 'Publish'}
        </button>
      </div>

      {err && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm px-4 py-3">{err}</div>}

      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 sm:p-6 space-y-5">
        <Field label="Title">
          <input
            value={draft.title}
            onChange={e => patch({ title: e.target.value })}
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            placeholder="Article title"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Category">
            <select
              value={draft.category}
              onChange={e => patch({ category: e.target.value })}
              className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Read time (min)">
            <input
              type="number"
              min={1}
              max={180}
              value={draft.readMinutes}
              onChange={e => patch({ readMinutes: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={draft.date ?? ''}
              onChange={e => patch({ date: e.target.value })}
              className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Author">
          <input
            value={draft.author}
            onChange={e => patch({ author: e.target.value })}
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
          />
        </Field>

        <Field label="Summary">
          <textarea
            value={draft.summary}
            onChange={e => patch({ summary: e.target.value })}
            rows={3}
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            placeholder="One or two sentence hook shown on the card."
          />
        </Field>

        <Field label="Dimensions" hint="Which framework dimensions this article applies to">
          <div className="flex flex-wrap gap-2">
            {FRAMEWORK.dimensions.map(d => {
              const on = dimsSet.has(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(dimsSet)
                    if (on) next.delete(d.id); else next.add(d.id)
                    patch({ dimensions: Array.from(next) })
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${on ? 'bg-blue-500/15 border-blue-500/40 text-blue-200' : 'bg-[#0c0e14] border-[#1e2433] text-slate-400 hover:text-white'}`}
                >
                  {d.name}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Tags" hint="Comma-separated">
          <input
            value={tagsStr}
            onChange={e => patch({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
            className="w-full bg-[#0c0e14] border border-[#1e2433] rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
            placeholder="strategy, board, capital allocation"
          />
        </Field>
      </div>

      <div className="rounded-2xl border border-[#1e2433] bg-[#0f1117] p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Sections</h2>
          <button
            onClick={addSection}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#1e2433] bg-[#0c0e14] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:border-blue-500/40"
          >
            <Plus className="w-3.5 h-3.5" /> Add section
          </button>
        </div>
        {draft.sections.map((s, i) => (
          <div key={i} className="rounded-xl border border-[#1e2433] bg-[#0c0e14] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={s.heading}
                onChange={e => patchSection(i, { heading: e.target.value })}
                className="flex-1 bg-transparent border-b border-[#1e2433] py-1.5 text-sm font-semibold text-white focus:border-blue-500/50 focus:outline-none"
                placeholder={`Section ${i + 1} heading`}
              />
              {draft.sections.length > 1 && (
                <button
                  onClick={() => removeSection(i)}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                  title="Remove section"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <textarea
              value={s.body}
              onChange={e => patchSection(i, { body: e.target.value })}
              rows={4}
              className="w-full bg-transparent text-sm text-slate-200 leading-relaxed focus:outline-none resize-y"
              placeholder="Section body — plain text, line breaks preserved."
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-[11px] uppercase tracking-widest font-bold text-slate-500">{label}</label>
        {hint && <span className="text-[11px] text-slate-600">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
