// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Loader2, FileSignature, Pencil, Trash2,
  AlertTriangle, CheckCircle2, Clock, DollarSign,
  RefreshCw, ChevronRight, Building2, Calendar,
} from 'lucide-react'

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
const fmtCur  = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null

const STATUS_OPTS = ['active','expiring_soon','expired','cancelled','pending']
const BILLING_OPTS = ['monthly','quarterly','annually','one_time']
const lbl = (s) => s?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

function statusBadge(contract) {
  const days = daysUntil(contract.end_date)
  if (contract.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' }
  if (contract.status === 'expired' || (days !== null && days < 0)) return { label: 'Expired', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' }
  if (days !== null && days <= 30) return { label: `Expires in ${days}d`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' }
  return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' }
}

// ── Contract Dialog ───────────────────────────────────────────────────────────
function ContractDialog({ open, onClose, onSaved, editing, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [form,   setForm]   = useState({
    customer_id: '', title: '', value: '', billing_cycle: 'monthly',
    start_date: '', end_date: '', auto_renew: false, auto_invoice: false,
    notes: '', document_url: '', status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (editing) {
      setForm({
        customer_id:   editing.customer_id   || '',
        title:         editing.title         || '',
        value:         editing.value         ?? '',
        billing_cycle: editing.billing_cycle || 'monthly',
        start_date:    editing.start_date    || '',
        end_date:      editing.end_date      || '',
        auto_renew:    editing.auto_renew    ?? false,
        auto_invoice:  editing.auto_invoice  ?? false,
        notes:         editing.notes         || '',
        document_url:  editing.document_url  || '',
        status:        editing.status        || 'active',
      })
    } else {
      const today = new Date().toISOString().slice(0, 10)
      const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
      setForm({
        customer_id: '', title: '', value: '', billing_cycle: 'monthly',
        start_date: today, end_date: nextYear, auto_renew: false, auto_invoice: false,
        notes: '', document_url: '', status: 'active',
      })
    }
  }, [open, editing])

  const handleSave = async () => {
    if (!form.customer_id)   { setErr('Customer is required'); return }
    if (!form.title.trim())  { setErr('Title is required'); return }
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === form.customer_id)
    const { error } = editing
      ? await supabase.from('contracts').update({
          customer_id:   form.customer_id,
          customer_name: cust?.name || null,
          title:         form.title.trim(),
          value:         form.value ? parseFloat(form.value) : null,
          billing_cycle: form.billing_cycle,
          start_date:    form.start_date || null,
          end_date:      form.end_date   || null,
          auto_renew:    form.auto_renew,
          auto_invoice:  form.auto_invoice,
          notes:         form.notes || null,
          document_url:  form.document_url || null,
          status:        form.status,
        }).eq('id', editing.id)
      : await supabase.from('contracts').insert({
          organization_id: orgId,
          customer_id:     form.customer_id,
          customer_name:   cust?.name || null,
          title:           form.title.trim(),
          value:           form.value ? parseFloat(form.value) : null,
          billing_cycle:   form.billing_cycle,
          start_date:      form.start_date || null,
          end_date:        form.end_date   || null,
          auto_renew:      form.auto_renew,
          auto_invoice:    form.auto_invoice,
          notes:           form.notes || null,
          document_url:    form.document_url || null,
          status:          'active',
        })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-blue-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Contract' : 'New Contract'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer *</label>
            <select value={form.customer_id} onChange={e => s('customer_id', e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract Title *</label>
            <input value={form.title} onChange={e => s('title', e.target.value)} placeholder="e.g. Managed Services Agreement" className={`mt-1 ${inp}`} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Value ($)</label>
              <input type="number" min={0} value={form.value} onChange={e => s('value', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Cycle</label>
              <select value={form.billing_cycle} onChange={e => s('billing_cycle', e.target.value)} className={`mt-1 ${inp}`}>
                {BILLING_OPTS.map(b => <option key={b} value={b}>{lbl(b)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => s('start_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">End Date</label>
              <input type="date" value={form.end_date} onChange={e => s('end_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
          </div>
          {editing && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <select value={form.status} onChange={e => s('status', e.target.value)} className={`mt-1 ${inp}`}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{lbl(s)}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => s('auto_renew', !form.auto_renew)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.auto_renew ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.auto_renew ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-renew</p>
              <p className="text-xs text-slate-400">Alert when approaching end date</p>
            </div>
          </div>
          {form.value && form.billing_cycle !== 'one_time' && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => s('auto_invoice', !form.auto_invoice)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.auto_invoice ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.auto_invoice ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-invoice</p>
                <p className="text-xs text-slate-400">Automatically create a draft invoice each {form.billing_cycle} period</p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Document URL <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={form.document_url} onChange={e => s('document_url', e.target.value)} placeholder="https://drive.google.com/…" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={3} placeholder="Any special terms, SLA notes, or reminders…" className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const router      = useRouter()
  const supabase    = createSupabaseBrowserClient()
  const [contracts, setContracts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [orgId,     setOrgId]     = useState(null)
  const [dialogOpen,setDialogOpen]= useState(false)
  const [editing,   setEditing]   = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [invoicing, setInvoicing] = useState(null)

  const loadAll = async () => {
    const [c, cust] = await Promise.all([
      supabase.from('contracts').select('*').order('end_date', { ascending: true, nullsFirst: false }),
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
    ])
    setContracts(c.data ?? [])
    setCustomers(cust.data ?? [])
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

  useRealtimeRefresh(['contracts'], loadAll)

  const handleDelete = async (id) => {
    if (!confirm('Delete this contract?')) return
    await supabase.from('contracts').delete().eq('id', id)
    loadAll()
  }

  const generateInvoice = async (contract) => {
    setInvoicing(contract.id)
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      await fetch('https://yetrdrgagfovphrerpie.supabase.co/functions/v1/auto-invoice-contracts', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ contract_id: contract.id }),
      })
      loadAll()
      router.push('/invoices')
    } catch {}
    setInvoicing(null)
  }

  // Stats
  const active   = contracts.filter(c => { const d = daysUntil(c.end_date); return c.status !== 'cancelled' && c.status !== 'expired' && (d === null || d >= 0) })
  const expiring = contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 30 && c.status !== 'cancelled' })
  const totalMrr = active.filter(c => c.billing_cycle === 'monthly' && c.value).reduce((s, c) => s + c.value, 0)
  const totalArr = active.filter(c => c.value).reduce((s, c) => {
    const mult = { monthly: 12, quarterly: 4, annually: 1, one_time: 0 }
    return s + (c.value * (mult[c.billing_cycle] ?? 0))
  }, 0)

  const filtered = useMemo(() => {
    if (filter === 'all')      return contracts
    if (filter === 'active')   return contracts.filter(c => { const d = daysUntil(c.end_date); return c.status !== 'cancelled' && (d === null || d >= 0) })
    if (filter === 'expiring') return contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 30 })
    if (filter === 'expired')  return contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d < 0 })
    return contracts
  }, [contracts, filter])

  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-blue-500" /> Contracts
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Track agreements, renewal dates, and recurring revenue.</p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Contract
        </button>
      </div>

      {/* Stats */}
      {contracts.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Contracts', value: active.length,       icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
            { label: 'Expiring (30d)',   value: expiring.length,     icon: AlertTriangle,color: expiring.length > 0 ? 'text-amber-500' : 'text-slate-400', bg: expiring.length > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-800' },
            { label: 'Monthly MRR',      value: fmtCur(totalMrr),   icon: DollarSign,   color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
            { label: 'Annual Run Rate',  value: fmtCur(totalArr),   icon: RefreshCw,    color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expiring soon alert */}
      {expiring.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <strong>{expiring.length} contract{expiring.length > 1 ? 's' : ''}</strong> expiring in the next 30 days.
          </p>
          <button onClick={() => setFilter('expiring')} className="ml-auto text-xs text-amber-600 hover:underline font-medium flex items-center gap-1">
            View <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        {[
          { value: 'all',      label: `All (${contracts.length})` },
          { value: 'active',   label: `Active (${active.length})` },
          { value: 'expiring', label: `Expiring (${expiring.length})` },
          { value: 'expired',  label: 'Expired' },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {!loading && contracts.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileSignature className="w-7 h-7 text-blue-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No contracts yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Track managed service agreements, renewal dates, and auto-generate invoices for recurring retainers.</p>
          <button onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Add First Contract
          </button>
        </div>
      )}

      {/* Contract list */}
      {filtered.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(c => {
            const badge = statusBadge(c)
            const days  = daysUntil(c.end_date)
            const annualValue = c.value
              ? c.value * ({ monthly: 12, quarterly: 4, annually: 1, one_time: 1 }[c.billing_cycle] ?? 1)
              : null
            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
                  <FileSignature className="w-4 h-4 text-blue-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                    {c.auto_renew && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex-shrink-0">Auto-renew</span>}
                    {c.auto_invoice && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex-shrink-0">Auto-invoice</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Building2 className="w-3 h-3" />
                      <button onClick={() => router.push(`/customers/${c.customer_id}`)} className="hover:text-amber-500 transition-colors">{c.customer_name}</button>
                    </span>
                    {c.start_date && c.end_date && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />{fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                      </span>
                    )}
                    {c.billing_cycle && <span className="text-xs text-slate-400 capitalize">{lbl(c.billing_cycle)}</span>}
                    {c.next_invoice_date && c.auto_invoice && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />
                        Next: {fmtDate(c.next_invoice_date)}
                      </span>
                    )}
                    {c.last_invoiced_at && (
                      <span className="text-xs text-slate-400">
                        Last invoiced {fmtDate(c.last_invoiced_at)}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.notes}</p>}
                </div>

                {/* Value */}
                {c.value && (
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtCur(c.value)}</p>
                    <p className="text-xs text-slate-400">{lbl(c.billing_cycle)}</p>
                    {annualValue && c.billing_cycle !== 'annually' && c.billing_cycle !== 'one_time' && (
                      <p className="text-xs text-slate-400">{fmtCur(annualValue)}/yr</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {c.document_url && (
                    <a href={c.document_url} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors"
                      title="Open document">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {c.value && c.status !== 'cancelled' && c.status !== 'expired' && (
                    <button onClick={() => generateInvoice(c)} disabled={!!invoicing}
                      title="Generate invoice"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors disabled:opacity-50">
                      {invoicing === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                      Invoice
                    </button>
                  )}
                  <button onClick={() => { setEditing(c); setDialogOpen(true) }}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ContractDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing}
        orgId={orgId}
        customers={customers}
      />
    </div>
  )
}