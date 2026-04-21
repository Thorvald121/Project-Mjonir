// @ts-nocheck
'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Clock, Plus, Search, Trash2, DollarSign, Timer, FileText, Edit, X, CheckCircle2, Download, CheckSquare, AlertTriangle, Loader2 } from 'lucide-react'

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

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

const fmtHours = (mins) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const BLANK = {
  ticket_id: '', ticket_title: '', customer_id: '', customer_name: '',
  technician: '', description: '', minutes: 60, billable: true,
  hourly_rate: '', date: new Date().toISOString().split('T')[0],
}

function LogTimeDialog({ open, onClose, onSaved, editing, orgId, tickets, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (editing) {
      setForm({
        ticket_id:    editing.ticket_id    || '',
        ticket_title: editing.ticket_title || '',
        customer_id:  editing.customer_id  || '',
        customer_name: editing.customer_name || '',
        technician:   editing.technician   || '',
        description:  editing.description  || '',
        minutes:      editing.minutes      || 60,
        billable:     editing.billable     ?? true,
        hourly_rate:  editing.hourly_rate  ?? '',
        date:         editing.date         || new Date().toISOString().split('T')[0],
      })
    } else {
      setForm({ ...BLANK })
    }
  }, [editing, open])

  const handleTicketSelect = (ticketId) => {
    if (ticketId === '__none__') { s('ticket_id', ''); s('ticket_title', ''); return }
    const t = tickets.find(x => x.id === ticketId)
    s('ticket_id', ticketId)
    s('ticket_title', t?.title || '')
    if (t?.customer_id)   s('customer_id', t.customer_id)
    if (t?.customer_name) s('customer_name', t.customer_name)
    if (t?.assigned_to)   s('technician', t.assigned_to)
    // Auto-fill hourly rate from customer
    if (t?.customer_id) {
      const c = customers.find(x => x.id === t.customer_id)
      if (c?.hourly_rate && (!form.hourly_rate || form.hourly_rate === '')) {
        s('hourly_rate', String(c.hourly_rate))
      }
    }
  }

  const handleCustomerSelect = (customerId) => {
    if (customerId === '__none__') { s('customer_id', ''); s('customer_name', ''); return }
    const c = customers.find(x => x.id === customerId)
    s('customer_id', customerId)
    s('customer_name', c?.name || '')
    // Auto-fill hourly rate from customer if not already set
    if (c?.hourly_rate && (!form.hourly_rate || form.hourly_rate === '')) {
      s('hourly_rate', String(c.hourly_rate))
    }
  }

  const handleSave = async () => {
    if (!form.minutes || Number(form.minutes) < 1) { setErr('Please enter a valid number of minutes.'); return }
    if (!orgId) { setErr('Organization not found — please refresh'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id: orgId,
      ticket_id:     form.ticket_id     || null,
      ticket_title:  form.ticket_title  || null,
      customer_id:   form.customer_id   || null,
      customer_name: form.customer_name || null,
      technician:    form.technician    || null,
      description:   form.description   || null,
      minutes:       Number(form.minutes),
      billable:      form.billable,
      hourly_rate:   form.hourly_rate !== '' ? Number(form.hourly_rate) : null,
      date:          form.date,
    }
    const { error } = editing
      ? await supabase.from('time_entries').update(payload).eq('id', editing.id)
      : await supabase.from('time_entries').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Time Entry' : 'Log Time'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ticket (optional)</label>
            <select value={form.ticket_id || '__none__'} onChange={e => handleTicketSelect(e.target.value)} className={`mt-1 ${inp}`}>
              <option value="__none__">No ticket linked</option>
              {tickets.map(t => <option key={t.id} value={t.id}>{t.title}{t.customer_name ? ` — ${t.customer_name}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</label>
            <select value={form.customer_id || '__none__'} onChange={e => handleCustomerSelect(e.target.value)} className={`mt-1 ${inp}`}>
              <option value="__none__">No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Technician</label>
            <input value={form.technician} onChange={e => s('technician', e.target.value)} placeholder="Technician email or name" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => s('description', e.target.value)} rows={3} placeholder="What was worked on?" className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Minutes *</label>
              <input type="number" min={1} value={form.minutes} onChange={e => s('minutes', e.target.value)} className={`mt-1 ${inp}`} />
              {Number(form.minutes) > 0 && <p className="text-xs text-slate-400 mt-0.5">= {fmtHours(Number(form.minutes))}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</label>
              <input type="date" value={form.date} onChange={e => s('date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="billable" checked={form.billable} onChange={e => s('billable', e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <label htmlFor="billable" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">Billable</label>
          </div>
          {form.billable && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hourly Rate ($)</label>
              <input type="number" min={0} step="0.01" value={form.hourly_rate} onChange={e => s('hourly_rate', e.target.value)} placeholder="e.g. 125.00" className={`mt-1 ${inp}`} />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.minutes || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Log Time'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TimeTrackingPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [entries,        setEntries]        = useState([])
  const [tickets,        setTickets]        = useState([])
  const [customers,      setCustomers]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [orgId,          setOrgId]          = useState(null)
  const [search,         setSearch]         = useState('')
  const [techFilter,     setTechFilter]     = useState('all')
  const [billableFilter, setBillableFilter] = useState('all')
  const [monthFilter,    setMonthFilter]    = useState(new Date().toISOString().slice(0, 7))
  const [dialogOpen,     setDialogOpen]     = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [activeTab,      setActiveTab]      = useState('log')
  const [selected,       setSelected]       = useState(new Set())
  const [bulkLoading,    setBulkLoading]    = useState(false)
  const [approvedFilter, setApprovedFilter] = useState('all') // all | pending | approved | invoiced

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

  const loadAll = async () => {
    setLoading(true)
    const [ent, tick, cust] = await Promise.all([
      supabase.from('time_entries').select('*').order('date', { ascending: false }).limit(1000),
      supabase.from('tickets').select('id,title,customer_id,customer_name,assigned_to').not('status','in','("resolved","closed")').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name,hourly_rate').eq('status','active').order('name').limit(200),
    ])
    setEntries(ent.data ?? [])
    setTickets(tick.data ?? [])
    setCustomers(cust.data ?? [])
    setLoading(false)
  }

  useRealtimeRefresh(['time_entries'], loadAll)


  const handleDelete = async (id) => {
    if (!confirm('Delete this time entry? This cannot be undone.')) return
    await supabase.from('time_entries').delete().eq('id', id)
    loadAll()
  }

  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.ticket_title?.toLowerCase().includes(q) && !e.customer_name?.toLowerCase().includes(q) && !e.technician?.toLowerCase().includes(q) && !e.description?.toLowerCase().includes(q)) return false
    if (techFilter     !== 'all' && e.technician !== techFilter) return false
    if (billableFilter === 'billable'     && !e.billable) return false
    if (billableFilter === 'non-billable' &&  e.billable) return false
    if (approvedFilter === 'pending'  && (e.approved || e.invoice_id)) return false
    if (approvedFilter === 'approved' && (!e.approved || e.invoice_id)) return false
    if (approvedFilter === 'invoiced' && !e.invoice_id) return false
    if (monthFilter && monthFilter !== 'all' && e.date && !e.date.startsWith(monthFilter)) return false
    return true
  }), [entries, search, techFilter, billableFilter, monthFilter, approvedFilter])

  const totalMinutes    = filtered.reduce((s, e) => s + (e.minutes || 0), 0)
  const billableMinutes = filtered.filter(e => e.billable).reduce((s, e) => s + (e.minutes || 0), 0)
  const totalRevenue    = filtered.filter(e => e.billable && e.hourly_rate).reduce((s, e) => s + (e.hourly_rate * e.minutes) / 60, 0)
  const uniqueTechs     = [...new Set(entries.map(e => e.technician).filter(Boolean))]

  // Report breakdowns
  const byTech = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const k = e.technician || 'Unknown'
      if (!map[k]) map[k] = { name: k, total: 0, billable: 0, revenue: 0, entries: 0 }
      map[k].total    += e.minutes || 0
      map[k].entries  += 1
      if (e.billable) {
        map[k].billable += e.minutes || 0
        if (e.hourly_rate) map[k].revenue += (e.hourly_rate * (e.minutes || 0)) / 60
      }
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filtered])

  const byCustomer = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const k = e.customer_name || 'No customer'
      if (!map[k]) map[k] = { name: k, total: 0, billable: 0, revenue: 0, entries: 0 }
      map[k].total    += e.minutes || 0
      map[k].entries  += 1
      if (e.billable) {
        map[k].billable += e.minutes || 0
        if (e.hourly_rate) map[k].revenue += (e.hourly_rate * (e.minutes || 0)) / 60
      }
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filtered])

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    return d.toISOString().slice(0, 7)
  })

  const fmt = (d) => { if (!d) return '—'; try { const dt = new Date(d.includes('T') ? d : d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '—' } }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Hours',    value: fmtHours(totalMinutes),    icon: Clock,     color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Billable Hours', value: fmtHours(billableMinutes), icon: Timer,     color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Entries',        value: filtered.length,           icon: FileText,  color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Revenue',        value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ticket, customer, technician…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={sel}>
            <option value="all">All Time</option>
            {monthOptions.map(m => (
              <option key={m} value={m}>{new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</option>
            ))}
          </select>
          <select value={techFilter} onChange={e => setTechFilter(e.target.value)} className={sel}>
            <option value="all">All Technicians</option>
            {uniqueTechs.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={billableFilter} onChange={e => setBillableFilter(e.target.value)} className={sel}>
            <option value="all">All Entries</option>
            <option value="billable">Billable Only</option>
            <option value="non-billable">Non-Billable</option>
          </select>
          <select value={approvedFilter} onChange={e => setApprovedFilter(e.target.value)} className={sel}>
            <option value="all">All Status</option>
            <option value="pending">Pending approval{pendingApproval > 0 ? ` (${pendingApproval})` : ''}</option>
            <option value="approved">Approved{readyToInvoice > 0 ? ` (${readyToInvoice} ready)` : ''}</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => {
            const rows = [['Date','Technician','Customer','Ticket','Description','Minutes','Hours','Billable','Rate','Amount']]
            filtered.forEach(e => {
              const amt = e.billable && e.hourly_rate ? ((e.hourly_rate * (e.minutes||0)) / 60).toFixed(2) : ''
              rows.push([e.date||'', e.technician||'', e.customer_name||'', e.ticket_title||'', e.description||'', e.minutes||0, ((e.minutes||0)/60).toFixed(2), e.billable?'Yes':'No', e.hourly_rate||'', amt])
            })
            const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
            const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
            a.download = `time-report-${monthFilter||'all'}.csv`; a.click()
          }}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => { setEditing(null); setDialogOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Log Time
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[{ id: 'log', label: `Entry Log (${filtered.length})` }, { id: 'report', label: 'Report' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report tab */}
      {activeTab === 'report' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By technician */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">By Technician</h3>
            </div>
            {byTech.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No entries in this period</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-2.5 text-left font-semibold">Technician</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Billable</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byTech.map(r => (
                    <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{r.name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">{fmtHours(r.total)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 dark:text-amber-400">{fmtHours(r.billable)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">${r.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-700 dark:text-slate-300">{fmtHours(totalMinutes)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-600">{fmtHours(billableMinutes)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-600">${totalRevenue.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* By customer */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">By Customer</h3>
            </div>
            {byCustomer.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No entries in this period</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-2.5 text-left font-semibold">Customer</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Billable</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {byCustomer.map(r => (
                    <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{r.name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 dark:text-slate-400">{fmtHours(r.total)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 dark:text-amber-400">{fmtHours(r.billable)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">${r.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-700 dark:text-slate-300">{fmtHours(totalMinutes)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-600">{fmtHours(billableMinutes)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-600">${totalRevenue.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'log' && (
        <>
        {/* Pending approval banner */}
        {pendingApproval > 0 && approvedFilter !== 'invoiced' && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400 flex-1">
              <span className="font-semibold">{pendingApproval} billable {pendingApproval === 1 ? 'entry' : 'entries'}</span> pending approval
              {readyToInvoice > 0 && <span> · <span className="font-semibold text-emerald-600">{readyToInvoice} approved</span> and ready to invoice</span>}
            </p>
            <button onClick={() => setApprovedFilter('pending')}
              className="text-xs font-semibold text-amber-600 hover:underline flex-shrink-0">
              Review →
            </button>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex-wrap">
            <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{selected.size} selected</span>
            <button onClick={handleBulkApprove} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors">
              {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Approve
            </button>
            <button onClick={handleBulkInvoice} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors">
              <FileText className="w-3 h-3" /> Create Invoice
            </button>
            <button onClick={handleBulkUnapprove} disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors">
              Unapprove
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll} className="w-4 h-4 accent-amber-500" />
                </th>
                {['Date','Technician','Ticket / Description','Customer','Time','Billable','Status','Rate','Amount',''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
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
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-slate-400 text-sm">
                    <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {entries.length === 0 ? "No time entries yet. Click 'Log Time' to get started." : 'No entries match your filters.'}
                  </td>
                </tr>
              ) : filtered.map(entry => {
                const amount = entry.billable && entry.hourly_rate ? (entry.hourly_rate * entry.minutes) / 60 : null
                return (
                  <tr key={entry.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${selected.has(entry.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleSelect(entry.id)} className="w-4 h-4 accent-amber-500" />
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.date ? fmt(entry.date) : '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{entry.technician || '—'}</td>
                    <td className="px-3 py-3 max-w-xs">
                      {entry.ticket_title && <p className="font-medium text-slate-900 dark:text-white truncate">{entry.ticket_title}</p>}
                      {entry.description  && <p className="text-xs text-slate-400 truncate">{entry.description}</p>}
                      {!entry.ticket_title && !entry.description && <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.customer_name || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{fmtHours(entry.minutes || 0)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${entry.billable ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {entry.billable ? 'Billable' : 'Non-billable'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {entry.invoice_id ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">Invoiced</span>
                      ) : entry.approved ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Approved</span>
                      ) : entry.billable ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Pending</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.hourly_rate ? `$${entry.hourly_rate}/hr` : '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{amount != null ? `$${amount.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(entry); setDialogOpen(true) }}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {entry.billable && !entry.invoice_id && (
                          <button
                            title="Add to new invoice"
                            onClick={() => router.push(`/invoices?prefill_customer=${entry.customer_id}&prefill_entry=${entry.id}`)}
                            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 text-slate-400 hover:text-amber-500 transition-colors">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {entry.invoice_id && (
                          <span title="Already invoiced" className="p-1.5 text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <button onClick={() => handleDelete(entry.id)}
                          className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <LogTimeDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing}
        orgId={orgId}
        tickets={tickets}
        customers={customers}
      />
    </div>
  )
}