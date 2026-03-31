// @ts-nocheck
'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Search, AlertTriangle, Clock, CheckSquare, X, Trash2, FileCode2, Loader2, Bookmark, ChevronDown } from 'lucide-react'
import { SlaPredictionBadge } from '@/components/SlaPrediction'

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

function NewTicketDialog({ open, onClose, onSaved, customers, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState(null)
  const [techs,     setTechs]     = useState([])
  const [templates, setTemplates] = useState([])
  const [showTpl,   setShowTpl]   = useState(false)
  const [form,   setForm]   = useState({
    title: '', description: '', priority: 'medium', category: 'other',
    customer_id: '', assigned_to: '', contact_name: '', contact_email: '', tags: '',
  })
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm({ title: '', description: '', priority: 'medium', category: 'other', customer_id: '', assigned_to: '', contact_name: '', contact_email: '', tags: '' })
    setErr(null); setShowTpl(false)
    supabase.from('organization_members')
      .select('id,user_email,display_name')
      .in('role', ['owner','admin','technician'])
      .then(({ data }) => setTechs(data ?? []))
    supabase.from('ticket_templates')
      .select('id,name,category,priority,description,tags')
      .order('name')
      .then(({ data }) => setTemplates(data ?? []))
  }, [open])

  const applyTemplate = (t) => {
    setForm(p => ({
      ...p,
      title:       t.name,
      description: t.description || '',
      priority:    t.priority    || p.priority,
      category:    t.category    || p.category,
      tags:        Array.isArray(t.tags) ? t.tags.join(', ') : (t.tags || ''),
    }))
    setShowTpl(false)
  }

  // Auto-fill contact info when customer is selected
  const handleCustomerChange = (customerId) => {
    const cust = customers.find(c => c.id === customerId)
    setForm(p => ({
      ...p,
      customer_id:   customerId,
      contact_name:  cust?.contact_name  || p.contact_name,
      contact_email: cust?.contact_email || p.contact_email,
    }))
  }

  const selectedCustomer = customers.find(c => c.id === form.customer_id)
  const blockTotal    = selectedCustomer?.block_hours_total || 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === form.customer_id)
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    // Store the email in assigned_to for backwards compat, but find the tech by display name or email
    const tech = techs.find(t => t.user_email === form.assigned_to)
    const { error } = await supabase.from('tickets').insert({
      organization_id: orgId,
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
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <div className="relative">
                <button onClick={() => setShowTpl(p => !p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500 hover:text-amber-600 hover:border-amber-300 transition-colors">
                  <FileCode2 className="w-3.5 h-3.5" /> Use Template
                </button>
                {showTpl && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-50 max-h-64 overflow-y-auto">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{t.name}</p>
                        <p className="text-xs text-slate-400 capitalize">{t.category} · {t.priority}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => s('title',e.target.value)} required placeholder="Brief description of the issue" className={`mt-1 ${inp}`} autoFocus />
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
            <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.contract_type === 'block_hours' && c.block_hours_total ? ` (Block hrs)` : ''}</option>)}
            </select>
            {selectedCustomer?.contract_type === 'block_hours' && blockTotal > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⏱ Block hours customer — {blockTotal}h purchased
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
              <input value={form.contact_name} onChange={e => s('contact_name',e.target.value)} placeholder="Auto-filled from customer" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={e => s('contact_email',e.target.value)} placeholder="Auto-filled from customer" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To</label>
            <select value={form.assigned_to} onChange={e => s('assigned_to',e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">Unassigned</option>
              {techs.map(t => (
                <option key={t.id} value={t.user_email}>
                  {t.display_name || t.user_email.split('@')[0]}
                </option>
              ))}
            </select>
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
  const [csatMap,        setCsatMap]        = useState({})
  const [loading,        setLoading]        = useState(true)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [hasMore,        setHasMore]        = useState(false)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [sortField,      setSortField]      = useState('created_at')
  const [sortDir,        setSortDir]        = useState('desc')
  const [hideImported,   setHideImported]   = useState(true)
  const [savedFilters,   setSavedFilters]   = useState<any[]>([])
  const [filterName,     setFilterName]     = useState('')
  const [showSaveInput,  setShowSaveInput]  = useState(false)
  const [showSavedMenu,  setShowSavedMenu]  = useState(false)
  const [selected,       setSelected]       = useState(new Set())
  const [bulkStatus,     setBulkStatus]     = useState('')
  const [bulkAssign,     setBulkAssign]     = useState('')
  const [bulkLoading,    setBulkLoading]    = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleteLoading,  setDeleteLoading]  = useState(false)
  const [dialogOpen,     setDialogOpen]     = useState(false)
  const [myEmail,        setMyEmail]        = useState(null)
  const [orgId,          setOrgId]          = useState(null)

  const PAGE = 100

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.target === 'new-ticket') setDialogOpen(true)
    }
    window.addEventListener('valhalla:shortcut', handler as EventListener)
    return () => window.removeEventListener('valhalla:shortcut', handler as EventListener)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyEmail(user?.email ?? null)
      const { data: member } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
    }
    init()
    // Load saved filters from localStorage
    try {
      const saved = localStorage.getItem('ticket-saved-filters')
      if (saved) setSavedFilters(JSON.parse(saved))
    } catch {}
    // Load customers separately — always full list regardless of filters
    supabase.from('customers').select('id,name').eq('status','active').order('name').limit(500)
      .then(({ data }) => setCustomers(data ?? []))
    supabase.from('csat_responses').select('ticket_id,score').not('ticket_id','is',null).limit(2000)
      .then(({ data }) => {
        const map = {}
        for (const r of (data ?? [])) { if (r.ticket_id) map[r.ticket_id] = r.score }
        setCsatMap(map)
      })
  }, [])

  // Close saved filters menu on outside click
  useEffect(() => {
    if (!showSavedMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-saved-menu]')) setShowSavedMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSavedMenu])

  const currentFilters = () => ({
    statusFilter, priorityFilter, assigneeFilter, customerFilter,
    sortField, sortDir, hideImported, search,
  })

  const applyFilter = (f: any) => {
    if (f.statusFilter   !== undefined) setStatusFilter(f.statusFilter)
    if (f.priorityFilter !== undefined) setPriorityFilter(f.priorityFilter)
    if (f.assigneeFilter !== undefined) setAssigneeFilter(f.assigneeFilter)
    if (f.customerFilter !== undefined) setCustomerFilter(f.customerFilter)
    if (f.sortField      !== undefined) setSortField(f.sortField)
    if (f.sortDir        !== undefined) setSortDir(f.sortDir)
    if (f.hideImported   !== undefined) setHideImported(f.hideImported)
    if (f.search         !== undefined) setSearch(f.search)
  }

  const saveFilter = () => {
    if (!filterName.trim()) return
    const entry = { name: filterName.trim(), filters: currentFilters(), savedAt: Date.now() }
    const next = [...savedFilters.filter(f => f.name !== entry.name), entry]
    setSavedFilters(next)
    localStorage.setItem('ticket-saved-filters', JSON.stringify(next))
    setFilterName('')
    setShowSaveInput(false)
  }

  const deleteFilter = (name: string) => {
    const next = savedFilters.filter(f => f.name !== name)
    setSavedFilters(next)
    localStorage.setItem('ticket-saved-filters', JSON.stringify(next))
  }

  const filtersRef = useRef({ statusFilter, priorityFilter, assigneeFilter, customerFilter, sortField, sortDir, hideImported, search, myEmail })
  filtersRef.current = { statusFilter, priorityFilter, assigneeFilter, customerFilter, sortField, sortDir, hideImported, search, myEmail }

  const buildQuery = useCallback((from = 0) => {
    const f = filtersRef.current
    let q = supabase.from('tickets')
      .select('id,title,status,priority,category,assigned_to,customer_id,customer_name,contact_email,sla_due_date,tags,source,created_at,first_response_at')
      .order(f.sortField, { ascending: f.sortDir === 'asc' })
      .range(from, from + PAGE)

    if (f.statusFilter   !== 'all') q = q.eq('status', f.statusFilter)
    if (f.priorityFilter !== 'all') q = q.eq('priority', f.priorityFilter)
    if (f.customerFilter !== 'all') q = q.eq('customer_name', f.customerFilter)
    if (f.hideImported)             q = q.neq('source', 'import')
    if (f.assigneeFilter === 'mine')            q = q.eq('assigned_to', f.myEmail)
    else if (f.assigneeFilter === 'unassigned') q = q.is('assigned_to', null)
    else if (f.assigneeFilter !== 'all')        q = q.eq('assigned_to', f.assigneeFilter)
    if (f.search.trim()) q = q.or(`title.ilike.%${f.search.trim()}%,customer_name.ilike.%${f.search.trim()}%,assigned_to.ilike.%${f.search.trim()}%`)

    return q
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    const result = await buildQuery(0)
    const rows = result.data ?? []
    setHasMore(rows.length > PAGE)
    setTickets(rows.slice(0, PAGE))
    setLoading(false)
  }, [buildQuery])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const result = await buildQuery(tickets.length)
    const rows = result.data ?? []
    setHasMore(rows.length > PAGE)
    setTickets(prev => [...prev, ...rows.slice(0, PAGE)])
    setLoadingMore(false)
  }, [buildQuery, tickets.length])

  useEffect(() => { loadAll() }, [statusFilter, priorityFilter, assigneeFilter, customerFilter, sortField, sortDir, hideImported]) // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => loadAll(), 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  useRealtimeRefresh(['tickets'], loadAll)

  const uniqueCustomers = useMemo(() => customers.map(c => c.name).sort(), [customers])
  const uniqueAssignees = useMemo(() => [...new Set(tickets.map(t => t.assigned_to).filter(Boolean))].sort(), [tickets])
  const filtered = tickets

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

  const handleBulkAssign = async () => {
    if (!bulkAssign || selected.size === 0) return
    setBulkLoading(true)
    const assignTo = bulkAssign === '__unassigned__' ? null : bulkAssign
    for (const id of [...selected]) {
      await supabase.from('tickets').update({ assigned_to: assignTo }).eq('id', id)
    }
    setBulkLoading(false)
    setSelected(new Set()); setBulkAssign('')
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
          <select value={`${sortField}:${sortDir}`} onChange={e => {
            const [f, d] = e.target.value.split(':')
            setSortField(f); setSortDir(d)
          }} className={sel}>
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="updated_at:desc">Recently updated</option>
            <option value="priority:asc">Priority (critical first)</option>
            <option value="sla_due_date:asc">SLA due (soonest)</option>
            <option value="customer_name:asc">Customer A→Z</option>
          </select>
          <button onClick={() => setHideImported(p => !p)}
            title={hideImported ? 'Currently hiding imported tickets — click to show' : 'Currently showing imported tickets — click to hide'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              hideImported
                ? 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700'
            }`}>
            {hideImported ? 'Show imported' : 'Hide imported'}
          </button>

          {/* Saved filters */}
          <div className="relative" data-saved-menu>
            <button onClick={() => { setShowSavedMenu(p => !p); setShowSaveInput(false) }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Bookmark className="w-3.5 h-3.5" />
              Saved{savedFilters.length > 0 && <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{savedFilters.length}</span>}
              <ChevronDown className={`w-3 h-3 transition-transform ${showSavedMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSavedMenu && (
              <div className="absolute top-full mt-1 left-0 z-30 w-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
                {savedFilters.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-400 text-center">No saved filters yet</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {savedFilters.map(sf => (
                      <div key={sf.name} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 group">
                        <button onClick={() => { applyFilter(sf.filters); setShowSavedMenu(false) }}
                          className="flex-1 text-left text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {sf.name}
                        </button>
                        <button onClick={() => deleteFilter(sf.name)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-rose-500 transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-100 dark:border-slate-800 p-2">
                  {!showSaveInput ? (
                    <button onClick={() => setShowSaveInput(true)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Save current filters
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <input autoFocus value={filterName} onChange={e => setFilterName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveFilter(); if (e.key === 'Escape') { setShowSaveInput(false); setFilterName('') } }}
                        placeholder="Filter name…"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
                      <button onClick={saveFilter} disabled={!filterName.trim()}
                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors">
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-600">Assign to:</span>
            <select value={bulkAssign} onChange={e => setBulkAssign(e.target.value)}
              className="h-7 px-2 border border-blue-200 rounded text-xs bg-white dark:bg-slate-800 text-slate-700 focus:outline-none">
              <option value="">Choose…</option>
              <option value="__unassigned__">Unassigned</option>
              {techs.map(t => <option key={t.user_email} value={t.user_email}>{t.display_name || t.user_email}</option>)}
            </select>
            <button disabled={!bulkAssign || bulkLoading} onClick={handleBulkAssign}
              className="h-7 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium">
              Assign
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-white hover:text-amber-600 transition-colors truncate">{t.title}</p>
                        {slaState === 'breached' && <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">SLA!</span>}
                        {slaState === 'warning'  && <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">At risk</span>}
                        <SlaPredictionBadge ticket={t} compact />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-slate-400 capitalize">{t.category}</p>
                        {t.source && t.source !== 'admin' && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            t.source === 'portal' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
                            t.source === 'email'  ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' :
                            'bg-slate-100 text-slate-500'
                          }`}>via {t.source}</span>
                        )}
                      </div>
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
                    <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {fmtDate(t.created_at)}
                      {csatMap[t.id] && (
                        <div className="flex items-center gap-0.5 mt-1">
                          {[1,2,3,4,5].map(n => (
                            <svg key={n} className="w-2.5 h-2.5" viewBox="0 0 20 20" fill={n <= csatMap[t.id] ? '#FBBF24' : '#E2E8F0'}>
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Footer: count + load more */}
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Showing {filtered.length} of {tickets.length} loaded{hasMore ? '+' : ''}</span>
          {hasMore && !search && statusFilter === 'all' && priorityFilter === 'all' && assigneeFilter === 'all' && customerFilter === 'all' && (
            <button onClick={loadMore} disabled={loadingMore}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-60">
              {loadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>

      <NewTicketDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={loadAll}
        customers={customers}
        orgId={orgId}
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