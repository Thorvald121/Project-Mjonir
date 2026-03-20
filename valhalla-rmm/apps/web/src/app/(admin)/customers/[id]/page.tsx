// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Building2, Phone, Mail, Edit, Plus, Clock,
  FileText, Package, Ticket, DollarSign, TrendingUp, X,
  CheckCircle2, AlertTriangle, Loader2, Save, Users,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const STATUS_CLS = {
  active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  prospect: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
}
const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-emerald-100 text-emerald-700',
}
const TICKET_STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  waiting:     'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-slate-100 text-slate-600',
}
const INV_STATUS_CLS = {
  draft:   'bg-slate-100 text-slate-600',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-emerald-100 text-emerald-700',
  partial: 'bg-violet-100 text-violet-700',
  overdue: 'bg-rose-100 text-rose-700',
  void:    'bg-slate-100 text-slate-400',
}

const CONTRACT_LABELS = {
  managed:            'Managed Services',
  time_and_materials: 'Time & Materials',
  block_hours:        'Block Hours',
  project:            'Project',
}

const lbl  = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '—' } }
const fmtCurrency = (n) => n != null ? '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-amber-500', bg = 'bg-amber-50 dark:bg-amber-950/30' }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, action, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Edit Customer Dialog ──────────────────────────────────────────────────────
function EditDialog({ open, onClose, onSaved, customer, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open || !customer) return
    setForm({
      name:             customer.name             ?? '',
      status:           customer.status           ?? 'active',
      contract_type:    customer.contract_type    ?? 'managed',
      industry:         customer.industry         ?? '',
      contact_name:     customer.contact_name     ?? '',
      contact_email:    customer.contact_email    ?? '',
      contact_phone:    customer.contact_phone    ?? '',
      monthly_rate:     customer.monthly_rate     ?? '',
      hourly_rate:      customer.hourly_rate      ?? '',
      after_hours_rate: customer.after_hours_rate ?? '',
      block_hours_total:customer.block_hours_total ?? '',
      address:          customer.address          ?? '',
      website:          customer.website          ?? '',
      notes:            customer.notes            ?? '',
    })
    setErr(null)
  }, [open, customer])

  const handleSave = async () => {
    if (!form.name?.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('customers').update({
      name:              form.name.trim(),
      status:            form.status,
      contract_type:     form.contract_type     || null,
      industry:          form.industry          || null,
      contact_name:      form.contact_name      || null,
      contact_email:     form.contact_email     || null,
      contact_phone:     form.contact_phone     || null,
      monthly_rate:      form.monthly_rate      ? parseFloat(form.monthly_rate)      : null,
      hourly_rate:       form.hourly_rate       ? parseFloat(form.hourly_rate)       : null,
      after_hours_rate:  form.after_hours_rate  ? parseFloat(form.after_hours_rate)  : null,
      block_hours_total: form.block_hours_total ? parseInt(form.block_hours_total)   : null,
      address:           form.address           || null,
      website:           form.website           || null,
      notes:             form.notes             || null,
    }).eq('id', customer.id)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Edit Customer</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Name *</label>
              <input value={form.name || ''} onChange={e => s('name', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <select value={form.status || 'active'} onChange={e => s('status', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract Type</label>
              <select value={form.contract_type || 'managed'} onChange={e => s('contract_type', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="managed">Managed Services</option>
                <option value="time_and_materials">Time & Materials</option>
                <option value="block_hours">Block Hours</option>
                <option value="project">Project</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</label>
              <input value={form.industry || ''} onChange={e => s('industry', e.target.value)} placeholder="Healthcare, Legal..." className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Website</label>
              <input value={form.website || ''} onChange={e => s('website', e.target.value)} placeholder="https://..." className={`mt-1 ${inp}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</label>
              <input value={form.address || ''} onChange={e => s('address', e.target.value)} placeholder="123 Main St, City, State ZIP" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Primary Contact</label>
              <input value={form.contact_name || ''} onChange={e => s('contact_name', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email || ''} onChange={e => s('contact_email', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Phone</label>
              <input type="tel" value={form.contact_phone || ''} onChange={e => s('contact_phone', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Rate ($)</label>
              <input type="number" min={0} value={form.monthly_rate || ''} onChange={e => s('monthly_rate', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hourly Rate ($)</label>
              <input type="number" min={0} value={form.hourly_rate || ''} onChange={e => s('hourly_rate', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">After-Hours Rate ($)</label>
              <input type="number" min={0} value={form.after_hours_rate || ''} onChange={e => s('after_hours_rate', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            {form.contract_type === 'block_hours' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Block Hours Total</label>
                <input type="number" min={0} value={form.block_hours_total || ''} onChange={e => s('block_hours_total', e.target.value)} placeholder="40" className={`mt-1 ${inp}`} />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.notes || ''} onChange={e => s('notes', e.target.value)} rows={3} className={`mt-1 ${inp} resize-none`} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── New Ticket Dialog ─────────────────────────────────────────────────────────
function NewTicketDialog({ open, onClose, onSaved, customer, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', category: 'other', assigned_to: '', contact_name: '', contact_email: '' })
  const [techs, setTechs] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm({ title: '', description: '', priority: 'medium', category: 'other', assigned_to: '',
      contact_name: customer?.contact_name || '', contact_email: customer?.contact_email || '' })
    supabase.from('organization_members').select('id,user_email').in('role', ['owner','admin','technician']).then(({ data }) => setTechs(data ?? []))
  }, [open])

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('tickets').insert({
      organization_id: orgId,
      title:           form.title.trim(),
      description:     form.description || null,
      priority:        form.priority,
      category:        form.category,
      status:          'open',
      customer_id:     customer.id,
      customer_name:   customer.name,
      assigned_to:     form.assigned_to || null,
      contact_name:    form.contact_name || null,
      contact_email:   form.contact_email || null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">New Ticket — {customer?.name}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
            <input value={form.title} onChange={e => s('title', e.target.value)} placeholder="Brief description of the issue" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
            <textarea value={form.description} onChange={e => s('description', e.target.value)} rows={3} className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
              <select value={form.priority} onChange={e => s('priority', e.target.value)} className={`mt-1 ${inp}`}>
                {['critical','high','medium','low'].map(p => <option key={p} value={p}>{lbl(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                {['hardware','software','network','security','account','email','printing','other'].map(c => <option key={c} value={c}>{lbl(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To</label>
              <select value={form.assigned_to} onChange={e => s('assigned_to', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.user_email}>{t.user_email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
              <input value={form.contact_name} onChange={e => s('contact_name', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={e => s('contact_email', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()
  const idRef    = useRef(null)
  idRef.current  = params?.id

  const [customer,    setCustomer]    = useState(null)
  const [tickets,     setTickets]     = useState([])
  const [invoices,    setInvoices]    = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [inventory,   setInventory]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [orgId,       setOrgId]       = useState(null)
  const [editOpen,    setEditOpen]    = useState(false)
  const [ticketOpen,  setTicketOpen]  = useState(false)
  const [activeTab,   setActiveTab]   = useState('tickets')

  const loadAll = useCallback(async () => {
    const id = idRef.current
    if (!id) return
    const [cust, t, inv, te, items] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('tickets').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('time_entries').select('*').eq('customer_id', id).order('date', { ascending: false }).limit(200),
      supabase.from('inventory_items').select('*').eq('customer_id', id).order('name').limit(100),
    ])
    if (cust.error) { setError('Customer not found'); setLoading(false); return }
    setCustomer(cust.data)
    setTickets(t.data ?? [])
    setInvoices(inv.data ?? [])
    setTimeEntries(te.data ?? [])
    setInventory(items.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
    }
    init()
    loadAll()
  }, [params?.id])

  // ── Computed stats ────────────────────────────────────────────────────────
  const openTickets    = tickets.filter(t => !['resolved','closed'].includes(t.status))
  const totalRevenue   = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
  const outstanding    = invoices.filter(i => ['sent','overdue','partial'].includes(i.status)).reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amount_paid || 0)), 0)
  const billableHours  = Math.round(timeEntries.filter(e => e.billable).reduce((s, e) => s + (e.minutes || 0), 0) / 60)
  const unbilledHours  = Math.round(timeEntries.filter(e => e.billable && !e.invoice_id).reduce((s, e) => s + (e.minutes || 0), 0) / 60)

  // Block hours tracking
  const blockTotal     = customer?.block_hours_total || 0
  const blockUsed      = blockTotal > 0
    ? Math.round(timeEntries.filter(e => !e.invoice_id).reduce((s, e) => s + (e.minutes || 0), 0) / 60)
    : 0
  const blockRemaining = Math.max(0, blockTotal - blockUsed)
  const blockPct       = blockTotal > 0 ? Math.min(100, Math.round((blockUsed / blockTotal) * 100)) : 0

  const TABS = [
    { id: 'tickets',     label: 'Tickets',      count: tickets.length },
    { id: 'invoices',    label: 'Invoices',      count: invoices.length },
    { id: 'time',        label: 'Time Entries',  count: timeEntries.length },
    { id: 'assets',      label: 'Assets',        count: inventory.length },
  ]

  if (loading) return (
    <div className="max-w-6xl space-y-4 animate-pulse">
      <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-4 gap-4">{Array(4).fill(0).map((_,i) => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}</div>
    </div>
  )

  if (error || !customer) return (
    <div className="text-center py-20 text-slate-400">
      <p className="text-lg font-medium mb-2">{error || 'Customer not found'}</p>
      <button onClick={() => router.push('/customers')} className="text-amber-500 hover:underline text-sm">← Back to Customers</button>
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5">
      {/* Back */}
      <button onClick={() => router.push('/customers')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[customer.status] ?? ''}`}>{lbl(customer.status)}</span>
                {customer.contract_type && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {CONTRACT_LABELS[customer.contract_type] ?? lbl(customer.contract_type)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {customer.contact_name  && <span className="flex items-center gap-1.5 text-sm text-slate-500"><Users className="w-3.5 h-3.5" />{customer.contact_name}</span>}
                {customer.contact_email && <a href={`mailto:${customer.contact_email}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-600 transition-colors"><Mail className="w-3.5 h-3.5" />{customer.contact_email}</a>}
                {customer.contact_phone && <a href={`tel:${customer.contact_phone}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-600 transition-colors"><Phone className="w-3.5 h-3.5" />{customer.contact_phone}</a>}
                {customer.industry      && <span className="text-sm text-slate-400">{customer.industry}</span>}
              </div>
              {customer.address && <p className="text-xs text-slate-400 mt-1">{customer.address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTicketOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> New Ticket
            </button>
            <button onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Edit className="w-4 h-4" /> Edit
            </button>
          </div>
        </div>

        {/* Rates */}
        {(customer.monthly_rate || customer.hourly_rate || customer.after_hours_rate) && (
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            {customer.monthly_rate     && <div className="text-sm"><span className="text-slate-400">Monthly: </span><strong className="text-slate-900 dark:text-white">{fmtCurrency(customer.monthly_rate)}</strong></div>}
            {customer.hourly_rate      && <div className="text-sm"><span className="text-slate-400">Hourly: </span><strong className="text-slate-900 dark:text-white">{fmtCurrency(customer.hourly_rate)}/hr</strong></div>}
            {customer.after_hours_rate && <div className="text-sm"><span className="text-slate-400">After-hours: </span><strong className="text-slate-900 dark:text-white">{fmtCurrency(customer.after_hours_rate)}/hr</strong></div>}
            {customer.website          && <a href={customer.website} target="_blank" rel="noreferrer" className="text-sm text-amber-500 hover:underline">{customer.website}</a>}
          </div>
        )}

        {/* Block hours burndown */}
        {customer.contract_type === 'block_hours' && blockTotal > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Block Hours</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{blockUsed}h used / {blockTotal}h total — <span className={blockRemaining < blockTotal * 0.2 ? 'text-rose-500' : 'text-emerald-500'}>{blockRemaining}h remaining</span></p>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${blockPct >= 90 ? 'bg-rose-500' : blockPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: blockPct + '%' }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{blockPct}% consumed</p>
          </div>
        )}

        {/* Notes */}
        {customer.notes && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Ticket}     label="Open Tickets"   value={openTickets.length}          color="text-amber-500"   bg="bg-amber-50 dark:bg-amber-950/30"   sub={`${tickets.length} total`} />
        <StatCard icon={DollarSign} label="Total Revenue"  value={fmtCurrency(totalRevenue)}   color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30" sub={outstanding > 0 ? `${fmtCurrency(outstanding)} outstanding` : undefined} />
        <StatCard icon={Clock}      label="Billable Hours" value={billableHours + 'h'}          color="text-violet-500"  bg="bg-violet-50 dark:bg-violet-950/30"  sub={unbilledHours > 0 ? `${unbilledHours}h unbilled` : undefined} />
        <StatCard icon={Package}    label="Assets"         value={inventory.length}             color="text-blue-500"    bg="bg-blue-50 dark:bg-blue-950/30" />
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === tab.id ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Tickets tab */}
        {activeTab === 'tickets' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tickets.length === 0 ? (
              <div className="p-12 text-center">
                <Ticket className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm mb-3">No tickets yet for this customer</p>
                <button onClick={() => setTicketOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
                  <Plus className="w-4 h-4" /> Create First Ticket
                </button>
              </div>
            ) : tickets.map(t => (
              <div key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.assigned_to || 'Unassigned'} · {fmtDate(t.created_at)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_CLS[t.priority] ?? ''}`}>{t.priority}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TICKET_STATUS_CLS[t.status] ?? ''}`}>{lbl(t.status)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Invoices tab */}
        {activeTab === 'invoices' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoices.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No invoices yet for this customer</p>
              </div>
            ) : invoices.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${INV_STATUS_CLS[inv.status] ?? ''}`}>{lbl(inv.status)}</span>
                <p className="font-bold text-slate-900 dark:text-white text-sm">{fmtCurrency(inv.total)}</p>
              </div>
            ))}
            {invoices.length > 0 && (
              <div className="px-4 py-3 flex justify-between text-xs text-slate-400">
                <span>{invoices.length} invoices</span>
                <span>Total collected: <strong className="text-slate-700 dark:text-slate-300">{fmtCurrency(totalRevenue)}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Time Entries tab */}
        {activeTab === 'time' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {timeEntries.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No time entries yet for this customer</p>
              </div>
            ) : timeEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{e.description || e.ticket_title || 'Time entry'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{e.technician || '—'} · {fmtDate(e.date)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {e.billable && !e.invoice_id && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Unbilled</span>}
                  {e.billable && e.invoice_id  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Billed</span>}
                  {!e.billable                 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Non-billable</span>}
                  <p className="font-semibold text-slate-900 dark:text-white text-sm w-14 text-right">
                    {Math.floor((e.minutes || 0) / 60)}h {(e.minutes || 0) % 60 > 0 ? ((e.minutes || 0) % 60) + 'm' : ''}
                  </p>
                </div>
              </div>
            ))}
            {timeEntries.length > 0 && (
              <div className="px-4 py-3 flex justify-between text-xs text-slate-400">
                <span>{timeEntries.length} entries</span>
                <span>Billable: <strong className="text-slate-700 dark:text-slate-300">{billableHours}h</strong> · Unbilled: <strong className="text-amber-600">{unbilledHours}h</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Assets tab */}
        {activeTab === 'assets' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {inventory.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm mb-1">No assets assigned to this customer</p>
                <p className="text-xs text-slate-400">Assign inventory items from the Inventory page</p>
              </div>
            ) : inventory.map(item => {
              const warrantyDays = item.warranty_expiry ? Math.round((new Date(item.warranty_expiry) - Date.now()) / 86400000) : null
              const warnExpiring = warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30
              const warnExpired  = warrantyDays !== null && warrantyDays < 0
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{item.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[item.vendor, item.model].filter(Boolean).join(' ')}
                      {item.serial_number && ` · SN: ${item.serial_number}`}
                      {item.location && ` · ${item.location}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 capitalize">{item.category}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.status === 'deployed' ? 'bg-blue-100 text-blue-700' : item.status === 'in_stock' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{lbl(item.status)}</span>
                  {(warnExpiring || warnExpired) && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${warnExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {warnExpired ? 'Warranty expired' : `${warrantyDays}d left`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <EditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); loadAll() }}
        customer={customer} orgId={orgId}
      />
      <NewTicketDialog
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        onSaved={() => { setTicketOpen(false); loadAll() }}
        customer={customer} orgId={orgId}
      />
    </div>
  )
}