// @ts-nocheck
'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Search, AlertTriangle, Clock, CheckSquare, X, Trash2 } from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) ref.current()
    }
    window.addEventListener("supabase:change", h)
    return () => window.removeEventListener("supabase:change", h)
  }, [tables.join(",")]) // eslint-disable-line
}

const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  high:     'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
}
const STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  in_progress: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  waiting:     'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  resolved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const STATUSES   = ['open','in_progress','waiting','resolved','closed']
const PRIORITIES = ['critical','high','medium','low']
const CATEGORIES = ['hardware','software','network','security','account','email','printing','other']
const lbl = (s) => s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())

function getSlaState(slaDue, status) {
  if (!slaDue || ['resolved','closed'].includes(status)) return 'ok'
  const diff = new Date(slaDue).getTime() - Date.now()
  if (diff < 0) return 'breached'
  if (diff < 2 * 3600 * 1000) return 'warning'
  return 'ok'
}
function getSlaLabel(slaDue, status) {
  if (!slaDue || ['resolved','closed'].includes(status)) return null
  const diff = new Date(slaDue).getTime() - Date.now()
  if (diff < 0) {
    const h = Math.abs(Math.floor(diff / 3600000))
    return `Breached ${h}h ago`
  }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

function NewTicketDialog({ open, onClose, onSaved, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const [form,   setForm]   = useState({
    title: '', description: '', priority: 'medium', category: 'other',
    customer_id: '', assigned_to: '', contact_name: '', contact_email: '', tags: '',
  })
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === form.customer_id)
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    const { error } = await supabase.from('tickets').insert({
      title:         form.title.trim(),
      description:   form.description || null,
      priority:      form.priority,
      category:      form.category,
      status:        'open',
      customer_id:   form.customer_id || null,
      customer_name: cust?.name || null,
      assigned_to:   form.assigned_to || null,
      contact_name:  form.contact_name || null,
      contact_email: form.contact_email || null,
      tags,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
    setForm({ title:'',description:'',priority:'medium',category:'other',customer_id:'',assigned_to:'',contact_name:'',contact_email:'',tags:'' })
  }

  if (!open) return null
  const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">New Ticket</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => s('title',e.target.value)} required placeholder="Brief description of the issue" className={`mt-1 ${inp}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
              <select value={form.priority} onChange={e => s('priority',e.target.value)} className={`mt-1 ${inp}`}>
                {PRIORITIES.map(p => <option key={p} value={p}>{lbl(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => s('category',e.target.value)} className={`mt-1 ${inp}`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</label>
            <select value={form.customer_id} onChange={e => s('customer_id',e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
              <input value={form.contact_name} onChange={e => s('contact_name',e.target.value)} placeholder="Jane Smith" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={e => s('contact_email',e.target.value)} placeholder="jane@co.com" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To</label>
            <input value={form.assigned_to} onChange={e => s('assigned_to',e.target.value)} placeholder="tech@company.com" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => s('description',e.target.value)} rows={3} placeholder="Detailed description..." className={`mt-1 ${inp} resize-none`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tags <span className="normal-case font-normal text-slate-400">(comma-separated)</span></label>
            <input value={form.tags} onChange={e => s('tags',e.target.value)} placeholder="vpn, outlook" className={`mt-1 ${inp}`} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TicketsPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [tickets,        setTickets]        = useState([])
  const [customers,      setCustomers]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [dialogOpen,     setDialogOpen]     = useState(false)
  const [selected,       setSelected]       = useState(new Set())
  const [bulkStatus,     setBulkStatus]     = useState('')
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [myEmail,        setMyEmail]        = useState(null)
  const [bulkLoading,    setBulkLoading]    = useState(false)
  const [deleteLoading,  setDeleteLoading]  = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyEmail(data.user?.email ?? null))
    loadAll()
  }, [])

  // Auto-refresh when tickets change anywhere
  useRealtimeRefresh(['tickets'], loadAll)

  async function loadAll() {
    setLoading(true)
    const [t, c] = await Promise.all([
      supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
    ])
    setTickets(t.data ?? [])
    setCustomers(c.data ?? [])
    setLoading(false)
  }

  const uniqueCustomers = useMemo(() => [...new Set(tickets.map(t => t.customer_name).filter(Boolean))].sort(), [tickets])
  const uniqueAssignees = useMemo(() => [...new Set(tickets.map(t => t.assigned_to).filter(Boolean))].sort(), [tickets])

  const filtered = useMemo(() => tickets.filter(t => {
    const q = search.toLowerCase()
    if (q && !t.title.toLowerCase().includes(q) && !(t.customer_name ?? '').toLowerCase().includes(q) && !(t.assigned_to ?? '').toLowerCase().includes(q)) return false
    if (statusFilter   !== 'all' && t.status   !== statusFilter)   return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (customerFilter !== 'all' && t.customer_name !== customerFilter) return false
    if (assigneeFilter === 'mine'       && t.assigned_to !== myEmail) return false
    if (assigneeFilter === 'unassigned' && t.assigned_to)             return false
    if (assigneeFilter !== 'all' && assigneeFilter !== 'mine' && assigneeFilter !== 'unassigned' && t.assigned_to !== assigneeFilter) return false
    return true
  }), [tickets, search, statusFilter, priorityFilter, customerFilter, assigneeFilter, myEmail])

  const handleBulkStatus = async () => {
    if (!bulkStatus || selected.size === 0) return
    setBulkLoading(true)
    for (const id of [...selected]) {
      await supabase.from('tickets').update({ status: bulkStatus }).eq('id', id)
    }
    setBulkLoading(false)
    setSelected(new Set()); setBulkStatus('')
    loadAll()
  }

  const handleBulkDelete = async () => {
    setDeleteLoading(true)
    await supabase.from('tickets').delete().in('id', [...selected])
    setDeleteLoading(false)
    setConfirmDelete(false)
    setSelected(new Set())
    loadAll()
  }

  const toggleSelect  = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll     = () => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)))
  const allChecked    = filtered.length > 0 && selected.size === filtered.length
  const someChecked   = selected.size > 0 && !allChecked

  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '—' } }
  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <select value={statusFilter}   onChange={e => setStatusFilter(e.target.value)}   className={sel}>
            <option value="all">All Status</option>{STATUSES.map(s => <option key={s} value={s}>{lbl(s)}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className={sel}>
            <option value="all">All Priority</option>{PRIORITIES.map(p => <option key={p} value={p}>{lbl(p)}</option>)}
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className={sel}>
            <option value="all">All Assignees</option>
            <option value="mine">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
            {uniqueAssignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className={sel}>
            <option value="all">All Customers</option>{uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg">
          <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-blue-600">Set status:</span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              className="h-7 px-2 border border-blue-200 rounded text-xs bg-white dark:bg-slate-800 text-slate-700 focus:outline-none">
              <option value="">Choose…</option>{STATUSES.map(s => <option key={s} value={s}>{lbl(s)}</option>)}
            </select>
            <button disabled={!bulkStatus || bulkLoading} onClick={handleBulkStatus}
              className="h-7 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium">
              {bulkLoading ? 'Applying…' : 'Apply'}
            </button>
          </div>
          <button onClick={() => setConfirmDelete(true)}
            className="ml-auto flex items-center gap-1 h-7 px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded text-xs transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll} className="w-4 h-4 accent-amber-500" />
                </th>
                {['Title','Customer','Priority','Status','Assigned','Tags','SLA','Created'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((_,j) => (
                    <td key={j} className="px-3 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-20" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-sm">No tickets found</td></tr>
              ) : filtered.map(t => {
                const slaState = getSlaState(t.sla_due_date, t.status)
                const slaLabel = getSlaLabel(t.sla_due_date, t.status)
                return (
                  <tr key={t.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${selected.has(t.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} className="w-4 h-4 accent-amber-500" />
                    </td>
                    <td className="px-3 py-3 cursor-pointer max-w-xs" onClick={() => router.push(`/tickets/${t.id}`)}>
                      <p className="font-medium text-slate-900 dark:text-white hover:text-amber-600 transition-colors truncate">{t.title}</p>
                      <p className="text-xs text-slate-400 capitalize mt-0.5">{t.category}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.customer_name || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_CLS[t.priority] ?? ''}`}>{t.priority}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[t.status] ?? ''}`}>{lbl(t.status)}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.assigned_to || 'Unassigned'}</td>
                    <td className="px-3 py-3">
                      {t.tags?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.tags.slice(0,2).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{tag}</span>
                          ))}
                          {t.tags.length > 2 && <span className="text-[10px] text-slate-400">+{t.tags.length-2}</span>}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {t.sla_due_date ? (
                        <div className={`flex items-center gap-1 text-xs font-medium whitespace-nowrap ${slaState==='breached'?'text-rose-600':slaState==='warning'?'text-amber-600':'text-slate-400'}`}>
                          {slaState==='breached' ? <AlertTriangle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                          {slaLabel}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <NewTicketDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={loadAll}
        customers={customers}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-semibold text-slate-900 dark:text-white text-lg mb-2">Delete {selected.size} ticket{selected.size !== 1 ? 's' : ''}?</h2>
            <p className="text-sm text-slate-500 mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={handleBulkDelete} disabled={deleteLoading} className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
                {deleteLoading ? 'Deleting…' : `Delete ${selected.size} ticket${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}