// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, X, Loader2, FileCode2, Pencil, Trash2, Copy } from 'lucide-react'

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

const CATEGORIES = ['hardware','software','network','email','account','billing','other']
const PRIORITIES = ['low','medium','high','critical']
const lbl = (s) => s?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}

const STARTER_TEMPLATES = [
  { name: 'Password Reset',      category: 'account',  priority: 'medium', description: 'User needs their password reset.\n\nAffected user:\nSystem/application:\nLast known working date:', tags: 'password,account' },
  { name: 'New Employee Setup',  category: 'account',  priority: 'high',   description: 'New employee onboarding setup required.\n\nEmployee name:\nStart date:\nDepartment:\nEquipment needed:\nSoftware/access required:', tags: 'onboarding,new-hire' },
  { name: 'Virus / Malware',     category: 'software', priority: 'critical',description: 'Potential virus or malware infection reported.\n\nAffected machine:\nSymptoms observed:\nLast full scan date:\nAny recent downloads or emails clicked?', tags: 'security,virus' },
  { name: 'Slow Computer',       category: 'hardware', priority: 'low',    description: 'User reporting slow performance.\n\nAffected machine:\nHow long has this been occurring?\nAny recent changes (updates, new software)?\nIs it slow on startup, during specific apps, or general?', tags: 'performance' },
  { name: 'Printer Not Working', category: 'hardware', priority: 'medium', description: 'Printer issue reported.\n\nPrinter make/model:\nError message (if any):\nIs it a network or USB printer?\nOther users affected?', tags: 'printer,hardware' },
  { name: 'No Internet Access',  category: 'network',  priority: 'high',   description: 'User or location has no internet connectivity.\n\nAffected users/machines:\nIs the whole office down or just one device?\nRouter/switch rebooted?\nAny recent changes to network?', tags: 'network,connectivity' },
  { name: 'Email Not Working',   category: 'email',    priority: 'high',   description: 'Email client or service issue.\n\nAffected email address:\nEmail client used (Outlook, Gmail, etc.):\nError message:\nCan they send, receive, or both?', tags: 'email' },
  { name: 'Software Install',    category: 'software', priority: 'low',    description: 'Software installation requested.\n\nSoftware name and version:\nMachine to install on:\nLicense key available?\nBusiness justification:', tags: 'software,install' },
]

// ── Template Dialog ───────────────────────────────────────────────────────────
function TemplateDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form,   setForm]   = useState({ name: '', category: 'other', priority: 'medium', description: '', tags: '' })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setErr(null)
    setForm(editing ? {
      name:        editing.name        || '',
      category:    editing.category    || 'other',
      priority:    editing.priority    || 'medium',
      description: editing.description || '',
      tags:        Array.isArray(editing.tags) ? editing.tags.join(', ') : (editing.tags || ''),
    } : { name: '', category: 'other', priority: 'medium', description: '', tags: '' })
  }, [open, editing])

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr(null)
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    const payload = {
      organization_id: orgId,
      name:        form.name.trim(),
      category:    form.category,
      priority:    form.priority,
      description: form.description || null,
      tags,
    }
    const { error } = editing
      ? await supabase.from('ticket_templates').update(payload).eq('id', editing.id)
      : await supabase.from('ticket_templates').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Template' : 'New Template'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Template Name *</label>
            <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Password Reset" className={`mt-1 ${inp}`} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Default Priority</label>
              <select value={form.priority} onChange={e => s('priority', e.target.value)} className={`mt-1 ${inp}`}>
                {PRIORITIES.map(p => <option key={p} value={p}>{lbl(p)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description / Checklist</label>
            <p className="text-xs text-slate-400 mt-0.5 mb-1">Pre-filled body for the ticket. Use plain text or bullet points.</p>
            <textarea value={form.description} onChange={e => s('description', e.target.value)}
              rows={8} placeholder="What information should the technician gather?&#10;&#10;- Step 1&#10;- Step 2" className={`mt-1 ${inp} resize-none font-mono text-xs`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tags <span className="font-normal text-slate-400">(comma-separated)</span></label>
            <input value={form.tags} onChange={e => s('tags', e.target.value)} placeholder="e.g. password, account" className={`mt-1 ${inp}`} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TicketTemplatesPage() {
  const supabase    = createSupabaseBrowserClient()
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [orgId,     setOrgId]     = useState(null)
  const [dialogOpen,setDialogOpen]= useState(false)
  const [editing,   setEditing]   = useState(null)
  const [seeding,   setSeeding]   = useState(false)

  const loadAll = async () => {
    const { data } = await supabase.from('ticket_templates').select('*').order('name')
    setTemplates(data ?? [])
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

  useRealtimeRefresh(['ticket_templates'], loadAll)

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return
    await supabase.from('ticket_templates').delete().eq('id', id)
    loadAll()
  }

  const handleDuplicate = async (t) => {
    await supabase.from('ticket_templates').insert({
      organization_id: orgId,
      name:        t.name + ' (copy)',
      category:    t.category,
      priority:    t.priority,
      description: t.description,
      tags:        t.tags,
    })
    loadAll()
  }

  const seedStarters = async () => {
    setSeeding(true)
    await supabase.from('ticket_templates').insert(
      STARTER_TEMPLATES.map(t => ({
        organization_id: orgId,
        ...t,
        tags: t.tags ? t.tags.split(',').map(x => x.trim()) : [],
      }))
    )
    setSeeding(false)
    loadAll()
  }

  // Group by category
  const grouped = templates.reduce((map, t) => {
    const key = t.category || 'other'
    if (!map[key]) map[key] = []
    map[key].push(t)
    return map
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-amber-500" /> Ticket Templates
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Pre-filled forms for common request types. Select a template when creating a ticket.</p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length === 0 && !loading && (
            <button onClick={seedStarters} disabled={seeding}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {seeding ? 'Adding…' : '+ Add Starter Templates'}
            </button>
          )}
          <button onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileCode2 className="w-7 h-7 text-amber-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No templates yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Create templates for common requests like password resets, new employee setups, and hardware issues. Saves time on both ends.</p>
          <button onClick={seedStarters} disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Add Starter Templates
          </button>
        </div>
      )}

      {/* Template grid grouped by category */}
      {Object.entries(grouped).sort((a,b) => a[0].localeCompare(b[0])).map(([cat, items]) => (
        <div key={cat}>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{lbl(cat)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(t => (
              <div key={t.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">{t.name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${PRIORITY_CLS[t.priority] ?? ''}`}>{lbl(t.priority)}</span>
                </div>
                {t.description && (
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed whitespace-pre-wrap">{t.description}</p>
                )}
                {Array.isArray(t.tags) && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">#{tag}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-auto pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button onClick={() => { setEditing(t); setDialogOpen(true) }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => handleDuplicate(t)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <Copy className="w-3 h-3" /> Duplicate
                  </button>
                  <button onClick={() => handleDelete(t.id)}
                    className="flex items-center justify-center px-2 py-1.5 text-xs text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <TemplateDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing}
        orgId={orgId}
      />
    </div>
  )
}