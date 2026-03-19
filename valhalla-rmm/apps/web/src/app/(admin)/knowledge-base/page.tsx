// @ts-nocheck
'use client'

import { useState, useMemo, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { Plus, Search, BookOpen, Pencil, Trash2, Loader2, X } from 'lucide-react'

const CATEGORY_CLS = {
  troubleshooting: 'bg-rose-100 text-rose-700',
  how_to:          'bg-blue-100 text-blue-700',
  policy:          'bg-violet-100 text-violet-700',
  setup:           'bg-emerald-100 text-emerald-700',
  faq:             'bg-amber-100 text-amber-700',
}
const CATEGORIES = ['troubleshooting', 'how_to', 'policy', 'setup', 'faq']
const lbl = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '—' } }

function ArticleDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ title: '', content: '', category: 'how_to', is_published: false })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (editing) {
      setForm({ title: editing.title || '', content: editing.content || '', category: editing.category || 'how_to', is_published: editing.is_published || false })
    } else {
      setForm({ title: '', content: '', category: 'how_to', is_published: false })
    }
  }, [editing, open])

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title is required'); return }
    if (!orgId) { setErr('Organization not found — please refresh'); return }
    setSaving(true); setErr(null)
    const { error } = editing
      ? await supabase.from('knowledge_articles').update({ title: form.title, content: form.content, category: form.category, is_published: form.is_published }).eq('id', editing.id)
      : await supabase.from('knowledge_articles').insert({ organization_id: orgId, title: form.title, content: form.content, category: form.category, is_published: form.is_published, view_count: 0, helpful_count: 0 })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Article' : 'New Article'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => s('title', e.target.value)} placeholder="Article title" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Content (Markdown supported)</label>
            <textarea value={form.content} onChange={e => s('content', e.target.value)} rows={14}
              placeholder="Write your article here. **Bold**, *italic*, ## headings, - lists all supported."
              className={`mt-1 ${inp} resize-none font-mono text-sm`} />
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input type="checkbox" id="published" checked={form.is_published} onChange={e => s('is_published', e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <label htmlFor="published" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">Published</label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Saving…</> : editing ? 'Update Article' : 'Create Article'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArticleView({ article, onClose, onEdit, onHelpful }) {
  const renderMarkdown = (text) => {
    if (!text) return ''
    return text
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2 class="text-lg font-bold text-slate-900 dark:text-white mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1 class="text-xl font-bold text-slate-900 dark:text-white mt-5 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,     '<em>$1</em>')
      .replace(/`(.+?)`/g,       '<code class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
      .replace(/^- (.+)$/gm,     '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-3">')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{article.title}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_CLS[article.category] ?? ''}`}>{lbl(article.category)}</span>
            {!article.is_published && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Draft</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Close</button>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: `<p class="mb-3">${renderMarkdown(article.content)}</p>` }} />
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <p className="text-sm text-slate-500">Was this article helpful?</p>
          <button onClick={() => onHelpful(article.id, 'helpful_count', article.helpful_count || 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 text-sm transition-colors">
            👍 Helpful ({article.helpful_count || 0})
          </button>
          <button onClick={() => onHelpful(article.id, 'view_count', article.view_count || 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 text-sm transition-colors">
            👎 Not Helpful
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBasePage() {
  const supabase = createSupabaseBrowserClient()

  const [articles,   setArticles]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [showDrafts, setShowDrafts] = useState(true)
  const [catFilter,  setCatFilter]  = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [viewing,    setViewing]    = useState(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadArticles()
    }
    init()
  }, [])

  useRealtimeRefresh(['knowledge_articles'], loadArticles)

  const loadArticles = async () => {
    setLoading(true)
    const { data } = await supabase.from('knowledge_articles').select('*').order('updated_at', { ascending: false }).limit(200)
    setArticles(data ?? [])
    setLoading(false)
  }

  const handleDelete = async (e, article) => {
    e.stopPropagation()
    if (!confirm(`Delete "${article.title}"?`)) return
    await supabase.from('knowledge_articles').delete().eq('id', article.id)
    if (viewing?.id === article.id) setViewing(null)
    loadArticles()
  }

  const handleHelpful = async (id, field, currentVal) => {
    await supabase.from('knowledge_articles').update({ [field]: currentVal + 1 }).eq('id', id)
    setViewing(v => v ? { ...v, [field]: currentVal + 1 } : v)
    loadArticles()
  }

  const filtered = useMemo(() => articles.filter(a => {
    if (!showDrafts && !a.is_published) return false
    if (catFilter !== 'all' && a.category !== catFilter) return false
    const q = search.toLowerCase()
    return !q || a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q)
  }), [articles, search, showDrafts, catFilter])

  const published = articles.filter(a => a.is_published).length
  const drafts    = articles.filter(a => !a.is_published).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Articles', value: articles.length },
          { label: 'Published',      value: published },
          { label: 'Drafts',         value: drafts },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
          </select>
          <button onClick={() => setShowDrafts(!showDrafts)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${showDrafts ? 'bg-amber-100 text-amber-700 border-amber-300' : 'text-slate-500 border-slate-200 dark:border-slate-700 hover:border-amber-400'}`}>
            {showDrafts ? 'Showing Drafts' : 'Drafts Hidden'}
          </button>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {viewing && (
        <ArticleView
          article={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setDialogOpen(true) }}
          onHelpful={handleHelpful}
        />
      )}

      {!viewing && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-16 mb-3" />
                <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-full mb-1.5" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-2/3" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No articles found</p>
            </div>
          ) : filtered.map(article => (
            <div key={article.id} onClick={() => setViewing(article)}
              className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer group p-5 ${!article.is_published ? 'opacity-75 border-dashed border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-800'}`}>
              <div className="flex items-start justify-between">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_CLS[article.category] ?? ''}`}>{lbl(article.category)}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); setEditing(article); setDialogOpen(true) }}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => handleDelete(e, article)}
                    className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mt-3 line-clamp-2">{article.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-3">{article.content?.replace(/[#*`]/g, '').slice(0, 150)}</p>
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-slate-400">
                  {fmt(article.updated_at || article.created_at)}
                  {!article.is_published && <span className="ml-2 text-amber-500 font-medium">Draft</span>}
                </p>
                {(article.helpful_count > 0) && <p className="text-xs text-slate-400">👍 {article.helpful_count}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ArticleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadArticles() }}
        editing={editing}
        orgId={orgId}
      />
    </div>
  )
}