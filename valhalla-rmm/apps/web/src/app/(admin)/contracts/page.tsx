// @ts-nocheck
'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, FileSignature, Building2, Calendar, RefreshCw,
  DollarSign, Pencil, Trash2, ChevronRight, Loader2,
  Send, CheckCircle2, Clock, AlertTriangle, ExternalLink,
  FileText, X, Download,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const BILLING_OPTS = ['monthly','quarterly','annually','one_time']

// Full lifecycle statuses
const STATUS_OPTS = ['draft','sent','signed','active','expiring_soon','expired','cancelled','pending']

const STATUS_META = {
  draft:        { label: 'Draft',         cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',          icon: FileText },
  sent:         { label: 'Sent to client',cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',            icon: Send },
  signed:       { label: 'Signed',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',icon: CheckCircle2 },
  active:       { label: 'Active',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',icon: CheckCircle2 },
  expiring_soon:{ label: 'Expiring soon', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',        icon: Clock },
  expired:      { label: 'Expired',       cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',            icon: AlertTriangle },
  cancelled:    { label: 'Cancelled',     cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',           icon: X },
  pending:      { label: 'Pending',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',        icon: Clock },
}

const lbl     = (s) => s?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
const fmtDate = (d) => { try { return new Date(d + (d?.length===10?'T00:00:00':'')).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return '—' } }
const fmtCur  = (n) => n != null ? `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
const daysUntil = (d) => { if (!d) return null; const diff = new Date(d+'T00:00:00').getTime() - Date.now(); return Math.ceil(diff/86400000) }

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh); ref.current = onRefresh
  useEffect(() => {
    const h = (e) => { if (!tables.length || tables.includes(e.detail?.table)) ref.current() }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

function getStatusMeta(contract) {
  const days = daysUntil(contract.end_date)
  if (contract.status === 'cancelled') return STATUS_META.cancelled
  if (contract.status === 'expired' || (days !== null && days < 0 && !['draft','sent'].includes(contract.status)))
    return STATUS_META.expired
  if (['signed','active'].includes(contract.status) && days !== null && days <= 30)
    return STATUS_META.expiring_soon
  return STATUS_META[contract.status] || STATUS_META.active
}

// ── Contract Dialog ────────────────────────────────────────────────────────────
function ContractDialog({ open, onClose, onSaved, editing, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({
    customer_id: '', title: '', value: '', billing_cycle: 'monthly',
    start_date: '', end_date: '', auto_renew: false, auto_invoice: false,
    notes: '', document_url: '', status: 'draft',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const s = (k,v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    const today    = new Date().toISOString().slice(0,10)
    const nextYear = new Date(Date.now() + 365*86400000).toISOString().slice(0,10)
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
        status:        editing.status        || 'draft',
      })
    } else {
      setForm({ customer_id:'', title:'', value:'', billing_cycle:'monthly', start_date:today, end_date:nextYear, auto_renew:false, auto_invoice:false, notes:'', document_url:'', status:'draft' })
    }
    setErr(null)
  }, [open, editing])

  const handleSave = async () => {
    if (!form.customer_id)  { setErr('Customer is required'); return }
    if (!form.title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === form.customer_id)
    const payload = {
      customer_id:   form.customer_id,
      customer_name: cust?.name || null,
      title:         form.title.trim(),
      value:         form.value ? parseFloat(form.value) : null,
      billing_cycle: form.billing_cycle,
      start_date:    form.start_date || null,
      end_date:      form.end_date   || null,
      auto_renew:    form.auto_renew,
      // auto_invoice only allowed on signed/active contracts
      auto_invoice:  form.auto_invoice && ['signed','active'].includes(form.status),
      notes:         form.notes || null,
      document_url:  form.document_url || null,
      status:        form.status,
    }
    const { error } = editing
      ? await supabase.from('contracts').update(payload).eq('id', editing.id)
      : await supabase.from('contracts').insert({ ...payload, organization_id: orgId })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500'

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Contract' : 'New Contract'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}

          {/* Status — prominent at top */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {['draft','sent','signed','active','cancelled'].map(st => {
                const meta = STATUS_META[st]
                return (
                  <button key={st} type="button" onClick={() => s('status', st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      form.status === st
                        ? `${meta.cls} border-current`
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}>
                    {meta.label}
                  </button>
                )
              })}
            </div>
            {form.status === 'draft' && (
              <p className="text-[11px] text-slate-400 mt-1.5">Draft contracts won't trigger auto-invoicing.</p>
            )}
            {form.status === 'sent' && (
              <p className="text-[11px] text-blue-500 mt-1.5">Sent — awaiting client signature. Auto-invoicing still disabled.</p>
            )}
            {['signed','active'].includes(form.status) && (
              <p className="text-[11px] text-emerald-600 mt-1.5">✓ Signed contracts can use auto-invoicing.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer *</label>
            <select value={form.customer_id} onChange={e => s('customer_id', e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract Title *</label>
            <input value={form.title} onChange={e => s('title', e.target.value)} placeholder="e.g. Managed IT Services — Monthly Retainer" className={`mt-1 ${inp}`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input type="number" min={0} step={0.01} value={form.value} onChange={e => s('value', e.target.value)} placeholder="0.00" className={`${inp} pl-7`} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Cycle</label>
              <select value={form.billing_cycle} onChange={e => s('billing_cycle', e.target.value)} className={`mt-1 ${inp}`}>
                {BILLING_OPTS.map(b => <option key={b} value={b}>{lbl(b)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => s('start_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">End Date</label>
              <input type="date" value={form.end_date} onChange={e => s('end_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Document URL</label>
            <input value={form.document_url} onChange={e => s('document_url', e.target.value)} placeholder="Link to signed contract (Google Drive, DocuSign, etc.)" className={`mt-1 ${inp}`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={2} placeholder="Internal notes about this contract…" className={`mt-1 ${inp} resize-none`} />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => s('auto_renew', !form.auto_renew)}
                className={`w-9 h-5 rounded-full transition-colors relative ${form.auto_renew ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${form.auto_renew ? 'left-4' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-renew</p>
                <p className="text-xs text-slate-400">Automatically renew when this contract expires</p>
              </div>
            </label>
            <label className={`flex items-center gap-3 ${['signed','active'].includes(form.status) ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
              <div onClick={() => ['signed','active'].includes(form.status) && s('auto_invoice', !form.auto_invoice)}
                className={`w-9 h-5 rounded-full transition-colors relative ${form.auto_invoice && ['signed','active'].includes(form.status) ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${form.auto_invoice && ['signed','active'].includes(form.status) ? 'left-4' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Auto-invoice</p>
                <p className="text-xs text-slate-400">
                  {['signed','active'].includes(form.status)
                    ? 'Automatically generate invoices on the billing cycle'
                    : 'Only available on signed contracts'}
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Send Contract Dialog ───────────────────────────────────────────────────────
function SendContractDialog({ contract, open, onClose, onSent }) {
  const supabase = createSupabaseBrowserClient()
  const [email,   setEmail]   = useState('')
  const [name,    setName]    = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    if (!open || !contract) return
    setErr(null); setSending(false)
    // Pre-fill from customer if available
    setEmail(contract.contact_email || '')
    setName(contract.customer_name || '')
    setMessage(`Hi,\n\nPlease find attached your ${contract.title} contract for review.\n\nOnce you've reviewed the terms, please confirm your acceptance by replying to this email.\n\nIf you have any questions, don't hesitate to reach out.\n\nKind regards,\nValhalla IT`)
  }, [open, contract])

  const handleSend = async () => {
    if (!email.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr(null)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-contract-email`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        contract_id:   contract.id,
        to_email:      email.trim(),
        to_name:       name.trim(),
        message:       message.trim(),
      }),
    })

    const data = await res.json()
    if (!res.ok || data.error) { setErr(data.error || 'Failed to send'); setSending(false); return }

    // Update contract status to 'sent'
    await supabase.from('contracts').update({
      status:  'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', contract.id)

    setSending(false)
    onSent()
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500'

  if (!open || !contract) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Send Contract to Client</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">{contract.title}</p>
            <p className="text-xs text-slate-500">{contract.customer_name} · {fmtCur(contract.value)} {lbl(contract.billing_cycle)}</p>
            {contract.document_url && (
              <a href={contract.document_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                <ExternalLink className="w-3 h-3" /> View document
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Client name" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6} className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [contracts,  setContracts]  = useState([])
  const [customers,  setCustomers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [sending,    setSending]    = useState(null) // contract being sent
  const [filter,     setFilter]     = useState('all')
  const [invoicing,  setInvoicing]  = useState(null)

  const loadAll = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: member }   = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) { setLoading(false); return }
    setOrgId(member.organization_id)
    const [contractRes, customerRes] = await Promise.all([
      supabase.from('contracts').select('*').order('end_date', { ascending: true, nullsFirst: false }),
      supabase.from('customers').select('id,name,contact_email').eq('status','active').order('name').limit(200),
    ])
    setContracts(contractRes.data ?? [])
    setCustomers(customerRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])
  useRealtimeRefresh(['contracts'], loadAll)

  const handleDelete = async (id) => {
    if (!confirm('Delete this contract?')) return
    await supabase.from('contracts').delete().eq('id', id)
    loadAll()
  }

  const generateInvoice = async (c) => {
    if (!['signed','active'].includes(c.status)) {
      alert('Only signed or active contracts can be invoiced. Please update the contract status first.')
      return
    }
    setInvoicing(c.id)
    const today      = new Date().toISOString().slice(0,10)
    const dueDate    = new Date(Date.now() + 30*86400000).toISOString().slice(0,10)
    const now        = new Date()
    const month      = now.toLocaleDateString('en-US',{month:'long',year:'numeric'})
    const periodMap  = { monthly: `${month} retainer`, quarterly: `Q${Math.ceil((now.getMonth()+1)/3)} ${now.getFullYear()} retainer`, annually: `${now.getFullYear()} annual retainer`, one_time: 'one-time service' }
    const period     = periodMap[c.billing_cycle] || 'retainer'
    const invNumber  = `INV-${Date.now().toString().slice(-6)}`

    await supabase.from('invoices').insert({
      organization_id: c.organization_id,
      invoice_number:  invNumber,
      customer_id:     c.customer_id,
      customer_name:   c.customer_name,
      status:          'draft',
      payment_terms:   'net_30',
      issue_date:      today,
      due_date:        dueDate,
      line_items:      [{ description: `${c.title} — ${period}`, quantity: 1, unit_price: c.value }],
      subtotal:        c.value,
      total:           c.value,
      amount_paid:     0,
      notes:           `Generated from contract: ${c.title}`,
    })
    await supabase.from('contracts').update({ last_invoiced_at: now.toISOString() }).eq('id', c.id)
    setInvoicing(null)
    router.push('/invoices')
  }

  const markSigned = async (c) => {
    await supabase.from('contracts').update({
      status:    'signed',
      signed_at: new Date().toISOString(),
    }).eq('id', c.id)
    loadAll()
  }

  // Stats
  const signed    = contracts.filter(c => ['signed','active'].includes(c.status))
  const drafts    = contracts.filter(c => c.status === 'draft')
  const sent      = contracts.filter(c => c.status === 'sent')
  const expiring  = contracts.filter(c => { const d = daysUntil(c.end_date); return d !== null && d >= 0 && d <= 30 && ['signed','active'].includes(c.status) })
  const mrr       = signed.filter(c => c.billing_cycle === 'monthly').reduce((s,c) => s + (c.value||0), 0)
  const arr       = signed.reduce((s,c) => s + (c.value||0) * ({monthly:12,quarterly:4,annually:1,one_time:0}[c.billing_cycle]??0), 0)

  const filtered = useMemo(() => {
    if (filter === 'all')      return contracts
    if (filter === 'draft')    return contracts.filter(c => c.status === 'draft')
    if (filter === 'sent')     return contracts.filter(c => c.status === 'sent')
    if (filter === 'signed')   return contracts.filter(c => ['signed','active'].includes(c.status))
    if (filter === 'expiring') return expiring
    if (filter === 'expired')  return contracts.filter(c => { const d = daysUntil(c.end_date); return c.status === 'expired' || (d !== null && d < 0) })
    if (filter === 'cancelled')return contracts.filter(c => c.status === 'cancelled')
    return contracts
  }, [contracts, filter])

  const sel = 'px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Contracts</h1>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Contract
        </button>
      </div>

      {/* KPI cards */}
      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'MRR',          value: fmtCur(mrr),           sub: 'monthly recurring',   color: 'text-emerald-600' },
            { label: 'ARR',          value: fmtCur(arr),           sub: 'annual recurring',    color: 'text-blue-600' },
            { label: 'Active',       value: signed.length,         sub: 'signed contracts',    color: 'text-slate-900 dark:text-white' },
            { label: 'Needs action', value: drafts.length + sent.length, sub: `${drafts.length} draft · ${sent.length} awaiting signature`, color: drafts.length + sent.length > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { key: 'all',      label: `All (${contracts.length})` },
          { key: 'draft',    label: `Draft (${drafts.length})` },
          { key: 'sent',     label: `Awaiting signature (${sent.length})` },
          { key: 'signed',   label: `Active (${signed.length})` },
          { key: 'expiring', label: `Expiring soon (${expiring.length})` },
          { key: 'expired',  label: 'Expired' },
          { key: 'cancelled',label: 'Cancelled' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === key
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Contract list */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {Array(3).fill(0).map((_,i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <FileSignature className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">
            {contracts.length === 0 ? 'No contracts yet' : 'No contracts in this filter'}
          </p>
          {contracts.length === 0 && (
            <>
              <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Track managed service agreements, renewal dates, and auto-generate invoices.</p>
              <button onClick={() => { setEditing(null); setDialogOpen(true) }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold">
                Add First Contract
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(c => {
            const meta       = getStatusMeta(c)
            const days       = daysUntil(c.end_date)
            const annualValue = c.value ? c.value * ({monthly:12,quarterly:4,annually:1,one_time:1}[c.billing_cycle]??1) : null
            const isDraft    = c.status === 'draft'
            const isSent     = c.status === 'sent'
            const isSigned   = ['signed','active'].includes(c.status)

            return (
              <div key={c.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isDraft ? 'border-l-4 border-l-slate-300' : isSent ? 'border-l-4 border-l-blue-400' : isSigned ? 'border-l-4 border-l-emerald-400' : ''}`}>
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isSigned ? 'bg-emerald-50 dark:bg-emerald-950/30' : isSent ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  <FileSignature className={`w-4 h-4 ${isSigned ? 'text-emerald-500' : isSent ? 'text-blue-500' : 'text-slate-400'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
                    {c.auto_renew   && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">Auto-renew</span>}
                    {c.auto_invoice && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Auto-invoice</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Building2 className="w-3 h-3" />{c.customer_name}
                    </span>
                    {c.start_date && c.end_date && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />{fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                      </span>
                    )}
                    {c.billing_cycle && <span className="text-xs text-slate-400">{lbl(c.billing_cycle)}</span>}
                    {c.signed_at    && <span className="text-xs text-emerald-600">Signed {fmtDate(c.signed_at)}</span>}
                    {c.sent_at && !c.signed_at && <span className="text-xs text-blue-500">Sent {fmtDate(c.sent_at)}</span>}
                    {c.next_invoice_date && c.auto_invoice && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />Next invoice: {fmtDate(c.next_invoice_date)}
                      </span>
                    )}
                    {c.last_invoiced_at && <span className="text-xs text-slate-400">Last invoiced {fmtDate(c.last_invoiced_at)}</span>}
                  </div>
                  {c.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.notes}</p>}

                  {/* Workflow action hints */}
                  {isDraft && (
                    <p className="text-[11px] text-slate-400 mt-1">Ready to send? Click Send to email this contract to the client.</p>
                  )}
                  {isSent && (
                    <p className="text-[11px] text-blue-500 mt-1">Awaiting client signature. Mark as signed once confirmed.</p>
                  )}
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
                      title="Open document"
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Send — for draft contracts */}
                  {isDraft && (
                    <button onClick={() => setSending(c)}
                      title="Send to client"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                      <Send className="w-3 h-3" /> Send
                    </button>
                  )}

                  {/* Mark signed — for sent contracts */}
                  {isSent && (
                    <button onClick={() => markSigned(c)}
                      title="Mark as signed"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">
                      <CheckCircle2 className="w-3 h-3" /> Signed
                    </button>
                  )}

                  {/* Generate invoice — for signed contracts */}
                  {isSigned && c.value && (
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

      <SendContractDialog
        contract={sending}
        open={!!sending}
        onClose={() => setSending(null)}
        onSent={() => { setSending(null); loadAll() }}
      />
    </div>
  )
}