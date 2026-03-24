// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Pencil, Trash2, BookOpen, Loader2, X, Search } from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => { if (!tables.length || tables.includes(e.detail?.table)) ref.current() }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const BLANK = { name: '', category: '', body: '', is_active: true }

function ReplyDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { name: editing.name, category: editing.category || '', body: editing.body, is_active: editing.is_active !== false }
      : { ...BLANK })
    setErr(null)
  }, [open, editing])

  const handleSave = async () => {
    if (!form.name.trim() || !form.body.trim()) { setErr('Name and body are required'); return }
    setSaving(true); setErr(null)
    const payload = { organization_id: orgId, name: form.name.trim(), category: form.category.trim() || null, body: form.body.trim(), is_active: form.is_active }
    const { error } = editing
      ? await supabase.from('canned_replies').update(payload).eq('id', editing.id)
      : await supabase.from('canned_replies').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Template' : 'New Canned Reply'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Template Name *</label>
              <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Password Reset Steps" className={`mt-1 ${inp}`} autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={form.category} onChange={e => s('category', e.target.value)} placeholder="e.g. Account Issues" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Body *</label>
            <textarea value={form.body} onChange={e => s('body', e.target.value)} rows={6} className={`mt-1 ${inp} resize-y`}
              placeholder={`Hi {{contact_name}},\n\nThank you for reaching out about "{{ticket_title}}". We're looking into this and will update you shortly.\n\nBest regards,\nSupport Team`} />
            <p className="text-xs text-slate-400 mt-1">
              Variables: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{contact_name}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{ticket_title}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{customer_name}}'}</code>
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <button onClick={() => s('is_active', !form.is_active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">{form.is_active ? 'Active — visible to technicians' : 'Inactive — hidden from reply picker'}</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.name.trim() || !form.body.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CannedRepliesPage() {
  const supabase = createSupabaseBrowserClient()
  const [replies,    setReplies]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState(null)

  const loadAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('canned_replies').select('*').order('category').order('name')
    setReplies(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadAll()
    }
    init()
  }, [])

  useRealtimeRefresh(['canned_replies'], loadAll)

  const handleDelete = async (reply) => {
    if (!confirm(`Delete "${reply.name}"?`)) return
    await supabase.from('canned_replies').delete().eq('id', reply.id)
    loadAll()
  }

  const filtered = replies.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.body.toLowerCase().includes(search.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(filtered.map(r => r.category || 'General'))].sort()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" /> Canned Replies
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Saved response templates your team can insert into ticket replies. Supports{' '}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{contact_name}}'}</code>{' '}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{ticket_title}}'}</code>{' '}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{customer_name}}'}</code>
          </p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search templates…" className={`${inp} pl-9`} />
      </div>

      {loading ? (
        Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)
      ) : replies.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-amber-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No canned replies yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Create templates for common responses to save your team time on repetitive ticket replies.</p>
          <button onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Create First Template
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No templates match your search.</div>
      ) : (
        categories.map(cat => (
          <div key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{cat}</h2>
            <div className="space-y-2">
              {filtered.filter(r => (r.category || 'General') === cat).map(reply => (
                <div key={reply.id} className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-start gap-3 transition-opacity ${reply.is_active === false ? 'opacity-55' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{reply.name}</p>
                      {reply.is_active === false && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">Inactive</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 whitespace-pre-wrap">{reply.body}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditing(reply); setDialogOpen(true) }}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(reply)}
                      className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <ReplyDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId}
      />
    </div>
  )
}