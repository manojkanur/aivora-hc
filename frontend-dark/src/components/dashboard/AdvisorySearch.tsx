import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles, BookOpen, Briefcase, ArrowRight, MessageSquareText, CornerDownLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { STUDIOS } from '../../lib/advisory/types'
import kbData from '../../lib/seeds/knowledgeBase.json'
import { cn } from '../../lib/utils'

interface SearchHit {
  id: string
  kind: 'studio' | 'kb' | 'action'
  label: string
  desc: string
  href: string
  score: number
}

interface KbArticle {
  id: string
  title: string
  category: string
  summary: string
  tags: string[]
}

const KB_ARTICLES = (kbData.articles as KbArticle[])

const ACTIONS: Omit<SearchHit, 'score'>[] = [
  { id: 'a-advisor',  kind: 'action', label: 'Ask the AI Advisor',     desc: 'Run a conversational diagnostic',     href: '/advisor' },
  { id: 'a-new-ws',   kind: 'action', label: 'Create new workspace',   desc: 'Start a client engagement',           href: '/workspaces' },
  { id: 'a-new-brief',kind: 'action', label: 'Create new brief',       desc: 'Capture a 7-step challenge brief',    href: '/challenge-brief' },
  { id: 'a-inbox',    kind: 'action', label: 'Open draft inbox',       desc: 'Review AI-generated drafts',          href: '/inbox' },
  { id: 'a-kb',       kind: 'action', label: 'Browse knowledge base',  desc: 'Frameworks, playbooks & research',    href: '/knowledge' },
]

function score(text: string, q: string): number {
  if (!q) return 0
  const t = text.toLowerCase()
  const ql = q.toLowerCase()
  if (t === ql) return 100
  if (t.startsWith(ql)) return 80
  if (t.includes(ql)) return 50
  // word boundary match
  const words = ql.split(/\s+/).filter(Boolean)
  let s = 0
  for (const w of words) if (t.includes(w)) s += 25
  return s
}

export function AdvisorySearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim()
    if (!q) {
      return ACTIONS.map(a => ({ ...a, score: 1 }))
    }
    const out: SearchHit[] = []

    for (const a of ACTIONS) {
      const s = Math.max(score(a.label, q), score(a.desc, q) * 0.5)
      if (s > 0) out.push({ ...a, score: s })
    }
    for (const s of STUDIOS.studios) {
      const sc = Math.max(score(s.name, q), score(s.deliverable, q) * 0.6, score(s.category, q) * 0.4)
      if (sc > 0) {
        out.push({
          id: `studio-${s.id}`,
          kind: 'studio',
          label: s.name,
          desc: s.deliverable,
          href: `/studio/${s.id}`,
          score: sc,
        })
      }
    }
    for (const a of KB_ARTICLES) {
      const sc = Math.max(score(a.title, q), score(a.summary, q) * 0.5, score(a.tags.join(' '), q) * 0.6)
      if (sc > 0) {
        out.push({
          id: `kb-${a.id}`,
          kind: 'kb',
          label: a.title,
          desc: a.summary,
          href: '/knowledge',
          score: sc,
        })
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 10)
  }, [query])

  useEffect(() => { setActiveIdx(0) }, [query, open])

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 30)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[activeIdx]
      if (hit) {
        setOpen(false)
        setQuery('')
        navigate(hit.href)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <>
      {/* Trigger bar — always visible on dashboard */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 30) }}
        className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border border-[#1e2433] bg-[#0f1117] hover:border-blue-500/40 hover:bg-[#111420] transition-all group"
      >
        <Search className="w-5 h-5 text-slate-500 group-hover:text-blue-400" />
        <span className="flex-1 text-left text-sm text-slate-400">
          Find advisory: search studios, frameworks, playbooks, or ask the advisor…
        </span>
        <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md border border-[#1e2433] bg-[#0c0e14] text-[10px] text-slate-500">
          <span>⌘</span><span>K</span>
        </kbd>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="relative w-full max-w-2xl rounded-2xl border border-[#1e2433] bg-[#0c0e14] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e2433]">
                <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type to find: HiPo, strategy, engagement, board narrative…"
                  className="flex-1 bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
                  autoFocus
                />
                <kbd className="hidden sm:flex text-[10px] text-slate-500 px-1.5 py-0.5 rounded border border-[#1e2433]">esc</kbd>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {hits.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">
                    No matches. Try "hipo", "strategy", "engagement", or "succession".
                  </div>
                ) : (
                  hits.map((h, i) => (
                    <button
                      key={h.id}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => { setOpen(false); setQuery(''); navigate(h.href) }}
                      className={cn(
                        'w-full flex items-center gap-3 px-5 py-3 text-left border-b border-[#1e2433] last:border-b-0',
                        i === activeIdx ? 'bg-blue-500/10' : 'hover:bg-white/5',
                      )}
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0',
                        h.kind === 'studio' ? 'border-blue-500/30 bg-blue-500/10'
                          : h.kind === 'kb' ? 'border-violet-500/30 bg-violet-500/10'
                          : 'border-emerald-500/30 bg-emerald-500/10',
                      )}>
                        {h.kind === 'studio' && <Sparkles className="w-4 h-4 text-blue-300" />}
                        {h.kind === 'kb' && <BookOpen className="w-4 h-4 text-violet-300" />}
                        {h.kind === 'action' && (
                          h.id === 'a-advisor' ? <MessageSquareText className="w-4 h-4 text-emerald-300" />
                            : h.id === 'a-new-ws' ? <Briefcase className="w-4 h-4 text-emerald-300" />
                            : <ArrowRight className="w-4 h-4 text-emerald-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{h.label}</div>
                        <div className="text-xs text-slate-500 truncate">{h.desc}</div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-wider">
                        <span className={cn(
                          'px-1.5 py-0.5 rounded border',
                          h.kind === 'studio' ? 'border-blue-500/30 text-blue-300'
                            : h.kind === 'kb' ? 'border-violet-500/30 text-violet-300'
                            : 'border-emerald-500/30 text-emerald-300',
                        )}>{h.kind}</span>
                        {i === activeIdx && <CornerDownLeft className="w-3 h-3" />}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between px-5 py-2.5 bg-[#0a0c12] border-t border-[#1e2433] text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <span>↑↓ navigate</span>
                  <span>↵ open</span>
                  <span>esc close</span>
                </div>
                <span>{hits.length} {hits.length === 1 ? 'result' : 'results'}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
