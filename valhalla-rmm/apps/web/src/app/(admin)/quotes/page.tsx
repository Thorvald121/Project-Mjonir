// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { format, parseISO, addDays } from 'date-fns'
import {
  Plus, FileText, Send, CheckCircle2, RotateCcw,
  Trash2, Edit, Clock, DollarSign, TrendingUp, X,
  Loader2, Eye,
} from 'lucide-react'

const STATUS_CFG = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  sent:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  viewed:    { label: 'Viewed',    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  approved:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected:  { label: 'Rejected',  cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  expired:   { label: 'Expired',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  converted: { label: 'Converted', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const BLANK_ITEM = { description: '', quantity: '1', unit_price: '' }

function fmt(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d || '—' } }

function calcTotals(items, taxRate, discountAmt, discountPct) {
  const sub = items.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unit_price || 0)), 0)
  const pctDisc = sub * ((Number(discountPct) || 0) / 100)
  const flat = Number(discountAmt) || 0
  const taxable = Math.max(0, sub - pctDisc - flat)
  const tax = taxable * ((Number(taxRate) || 0) / 100)
  return { subtotal: sub, discount_amount: pctDisc + flat, taxAmount: tax, total: taxable + tax }
}

function Btn({ icon: Icon, onClick, title, color = 'text-slate-400', disabled = false, spinning = false }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 ${color}`}>
      {spinning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    </button>
  )
}

function QuoteFormDialog({ open, onClose, onSaved, editing, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const today = new Date().toISOString().split('T')[0]
  const defaultExpiry = format(addDays(new Date(), 30), 'yyyy-MM-dd')
  const blank = {
    customer_id: '', customer_name: '', contact_name: '', contact_email: '',
    title: '', issue_date: today, expiry_date: defaultExpiry,
    tax_rate: '', discount_amount: '', discount_percent: '',
    notes: '', message_to_client: '', line_items: [{ ...BLANK_ITEM }],
  }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editing) {
      const items = Array.isArray(editing.line_items) && editing.line_items.length
        ? editing.line_items.map(i => ({ ...i, quantity: String(i.quantity ?? 1), unit_price: String(i.unit_price ?? '') }))
        : [{ ...BLANK_ITEM }]
      setForm({
        customer_id: editing.customer_id || '', customer_name: editing.customer_name || '',
        contact_name: editing.contact_name || '', contact_email: editing.contact_email || '',
        title: editing.title || '', issue_date: editing.issue_date || today,
        expiry_date: editing.expiry_date || defaultExpiry,
        tax_rate: String(editing.tax_rate || ''), discount_amount: String(editing.discount_amount || ''),
        discount_percent: String(editing.discount_percent || ''),
        notes: editing.notes || '', message_to_client: editing.message_to_client || '',
        line_items: items,
      })
    } else { setForm(blank) }
  }, [editing, open])

  const updateItem = (i, field, val) => {
    setForm(f => {
      const items = [...f.line_items]
      items[i] = { ...items[i], [field]: val }
      return { ...f, line_items: items }
    })
  }

  const handleSave = async () => {
    if (!form.customer_id) { setErr('Please select a customer'); return }
    if (!form.title.trim()) { setErr('Please enter a quote title'); return }
    if (!orgId) { setErr('Organization not found'); return }
    setSaving(true); setErr(null)
    const items = form.line_items.filter(i => i.description).map(i => ({
      description: i.description, quantity: Number(i.quantity || 1),
      unit_price: Number(i.unit_price || 0), total: Number(i.quantity || 1) * Number(i.unit_price || 0),
    }))
    const { subtotal, discount_amount, taxAmount, total } = calcTotals(items, form.tax_rate, form.discount_amount, form.discount_percent)
    const quoteNum = editing?.quote_number || `QTE-${Date.now().toString().slice(-6)}`
    const approval_token = editing?.approval_token || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))
    const payload = {
      organization_id: orgId, quote_number: quoteNum,
      customer_id: form.customer_id, customer_name: form.customer_name,
      contact_name: form.contact_name || null, contact_email: form.contact_email || null,
      title: form.title, status: editing?.status || 'draft',
      issue_date: form.issue_date, expiry_date: form.expiry_date || null,
      line_items: items, subtotal, discount_amount,
      discount_percent: Number(form.discount_percent || 0),
      tax_rate: Number(form.tax_rate || 0), tax_amount: taxAmount, total,
      notes: form.notes || null, message_to_client: form.message_to_client || null, approval_token,
    }
    const { error } = editing
      ? await supabase.from('quotes').update(payload).eq('id', editing.id)
      : await supabase.from('quotes').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const totals = calcTotals(form.line_items || [], form.tax_rate, form.discount_amount, form.discount_percent)

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Quote' : 'New Quote / Proposal'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer *</label>
              <select value={form.customer_id} onChange={e => {
                const c = customers.find(c => c.id === e.target.value)
                setForm(f => ({ ...f, customer_id: e.target.value, customer_name: c?.name || '', contact_email: c?.contact_email || '', contact_name: c?.contact_name || '' }))
              }} className={`mt-1 ${inp}`}>
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={e => sf('contact_email', e.target.value)} placeholder="client@company.com" className={`mt-1 ${inp}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quote Title *</label>
              <input value={form.title} onChange={e => sf('title', e.target.value)} placeholder="e.g. Annual Managed Services Agreement" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
              <input value={form.contact_name} onChange={e => sf('contact_name', e.target.value)} placeholder="Jane Smith" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Issue Date</label>
              <input type="date" value={form.issue_date} onChange={e => sf('issue_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => sf('expiry_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tax Rate (%)</label>
              <input type="number" min={0} max={100} value={form.tax_rate} onChange={e => sf('tax_rate', e.target.value)} placeholder="0" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount ($)</label>
              <input type="number" min={0} value={form.discount_amount} onChange={e => sf('discount_amount', e.target.value)} placeholder="0" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount (%)</label>
              <input type="number" min={0} max={100} value={form.discount_percent} onChange={e => sf('discount_percent', e.target.value)} placeholder="0" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message to Client</label>
            <textarea value={form.message_to_client} onChange={e => sf('message_to_client', e.target.value)} rows={3}
              placeholder="Thank you for considering our services. Please review this proposal and approve below..."
              className={`mt-1 ${inp} resize-none`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items</label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
                <span className="col-span-6">Description</span><span className="col-span-2">Qty</span><span className="col-span-2">Unit $</span><span className="col-span-2">Total</span>
              </div>
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Service or product"
                    className="col-span-6 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="1"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0.00"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2)}</span>
                    <button onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }))}
                      className="p-1 rounded hover:bg-rose-50 text-rose-400 transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, line_items: [...f.line_items, { ...BLANK_ITEM }] }))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            {totals.discount_amount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-${totals.discount_amount.toFixed(2)}</span></div>}
            {Number(form.tax_rate) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({form.tax_rate}%)</span><span>${totals.taxAmount.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Internal Notes</label>
            <textarea value={form.notes} onChange={e => sf('notes', e.target.value)} rows={2}
              placeholder="Internal notes (not shown to client)" className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.customer_id || !form.title.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Quote'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendQuoteDialog({ quote, onClose, onSent }) {
  const supabase = createSupabaseBrowserClient()
  const [email,   setEmail]   = useState(quote?.contact_email || '')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [err,     setErr]     = useState(null)

  if (!quote) return null
  const items = Array.isArray(quote.line_items) ? quote.line_items : []
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://project-mjonir.vercel.app'
  const approvalUrl = `${appUrl}/quote-approval?token=${quote.approval_token}`

  const handleSend = async () => {
    if (!email.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr(null)

    const lineRows = items.map(i =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i.description}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${i.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(i.unit_price || 0).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">$${(Number(i.quantity || 0) * Number(i.unit_price || 0)).toFixed(2)}</td>
      </tr>`
    ).join('')

    const html = `
<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px;background:#f8fafc;">
  <div style="background:#0f172a;padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#f59e0b;margin:0;font-size:24px;">${quote.quote_number}</h1>
    <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Issued: ${quote.issue_date} &nbsp;·&nbsp; Expires: ${quote.expiry_date || '—'}</p>
    <h2 style="color:#f8fafc;font-size:18px;margin-top:16px;margin-bottom:0;">${quote.title}</h2>
  </div>
  <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    ${quote.message_to_client ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin-top:0;">${quote.message_to_client}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:10px 8px;text-align:left;color:#64748b;font-size:12px;">Description</th>
        <th style="padding:10px 8px;text-align:center;color:#64748b;font-size:12px;">Qty</th>
        <th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;">Rate</th>
        <th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;">Total</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div style="text-align:right;padding:12px 0;border-top:2px solid #0f172a;">
      ${(quote.discount_amount || 0) > 0 ? `<p style="color:#10b981;margin:4px 0;">Discount: -$${Number(quote.discount_amount).toFixed(2)}</p>` : ''}
      ${(quote.tax_rate || 0) > 0 ? `<p style="color:#64748b;margin:4px 0;">Tax (${quote.tax_rate}%): $${Number(quote.tax_amount || 0).toFixed(2)}</p>` : ''}
      <p style="font-size:20px;font-weight:bold;color:#0f172a;margin:8px 0 0;">Total: $${Number(quote.total || 0).toFixed(2)}</p>
    </div>
    ${quote.notes ? `<p style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:13px;">${quote.notes}</p>` : ''}
    <div style="text-align:center;margin-top:32px;">
      <a href="${approvalUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
        ✓ Review &amp; Approve This Quote
      </a>
      <p style="color:#94a3b8;font-size:12px;margin-top:12px;">This quote expires on ${quote.expiry_date || 'N/A'}.</p>
    </div>
  </div>
</div>`

    const { error } = await supabase.functions.invoke('send-invoice-email', {
      body: { to: email.trim(), subject: `Quote ${quote.quote_number} — ${quote.title} ($${Number(quote.total || 0).toFixed(2)})`, html }
    })

    if (error) {
      window.location.href = `mailto:${email}?subject=Quote ${quote.quote_number}&body=Please review your quote at: ${approvalUrl}`
      setSending(false); onClose(); return
    }

    await supabase.from('quotes').update({ status: 'sent' }).eq('id', quote.id)
    setSending(false); setSent(true)
    setTimeout(() => { onSent(); onClose() }, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Send Quote — {quote.quote_number}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-900 dark:text-white">Quote sent!</p>
            <p className="text-sm text-slate-500 mt-1">Emailed to {email}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-400">Quote</span><span className="font-medium text-slate-900 dark:text-white">{quote.quote_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Title</span><span className="text-slate-700 dark:text-slate-300 truncate max-w-[240px]">{quote.title}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-bold text-slate-900 dark:text-white">${Number(quote.total || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Expires</span><span className="text-amber-500">{fmt(quote.expiry_date)}</span></div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-xs text-blue-700 dark:text-blue-400">
              The email will include an <strong>Approve / Reject</strong> link. When the client approves, you can convert it to an invoice in one click.
            </div>
            {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Send To *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" autoFocus className={`mt-1 ${inp}`} />
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSend} disabled={!email.trim() || sending}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Quote'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function QuotesPage() {
  const supabase = createSupabaseBrowserClient()
  const [quotes,     setQuotes]     = useState([])
  const [customers,  setCustomers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [formOpen,   setFormOpen]   = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [sending,    setSending]    = useState(null)
  const [converting, setConverting] = useState(null)

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

  // Auto-refresh when quotes change elsewhere (e.g. client approves)
  useRealtimeRefresh(['quotes'], loadAll)

  const loadAll = async () => {
    setLoading(true)
    const [q, c] = await Promise.all([
      supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name,contact_email,contact_name').eq('status','active').order('name').limit(200),
    ])
    setQuotes(q.data ?? [])
    setCustomers(c.data ?? [])
    setLoading(false)
  }

  const handleDelete = async (q) => {
    if (!confirm(`Delete ${q.quote_number}?`)) return
    await supabase.from('quotes').delete().eq('id', q.id)
    loadAll()
  }

  const handleConvertToInvoice = async (q) => {
    if (!confirm(`Convert ${q.quote_number} to an invoice?`)) return
    setConverting(q.id)
    const today = new Date().toISOString().split('T')[0]
    const dueDate = format(addDays(new Date(), 30), 'yyyy-MM-dd')
    const { error } = await supabase.from('invoices').insert({
      organization_id: orgId, invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      customer_id: q.customer_id, customer_name: q.customer_name,
      contact_email: q.contact_email || null, status: 'draft', payment_terms: 'net_30',
      issue_date: today, due_date: dueDate, line_items: q.line_items || [],
      subtotal: q.subtotal || 0, discount_amount: q.discount_amount || 0,
      discount_percent: q.discount_percent || 0, tax_rate: q.tax_rate || 0,
      tax_amount: q.tax_amount || 0, total: q.total || 0, amount_paid: 0, notes: q.notes || null,
    })
    if (!error) await supabase.from('quotes').update({ status: 'converted' }).eq('id', q.id)
    setConverting(null); loadAll()
  }

  const pipelineValue  = quotes.filter(q => !['rejected','expired'].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0)
  const approvedValue  = quotes.filter(q => ['approved','converted'].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0)
  const pendingCount   = quotes.filter(q => ['sent','viewed'].includes(q.status)).length
  const sentOrMore     = quotes.filter(q => q.status !== 'draft').length
  const conversionRate = sentOrMore > 0 ? Math.round((quotes.filter(q => ['approved','converted'].includes(q.status)).length / sentOrMore) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Quotes & Proposals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create proposals, send for client approval, convert to invoice in one click</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Quote
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pipeline Value',    value: `$${pipelineValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: TrendingUp,   color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Approved Value',    value: `$${approvedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign,   color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Awaiting Response', value: pendingCount,                                                                 icon: Clock,        color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Conversion Rate',   value: `${conversionRate}%`,                                                         icon: CheckCircle2, color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
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

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-40" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-56" />
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-20" />
              </div>
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium mb-1">No quotes yet</p>
            <p className="text-sm text-slate-400 mb-4">Create your first proposal and send it for client approval</p>
            <button onClick={() => { setEditing(null); setFormOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
              <Plus className="w-4 h-4" /> Create First Quote
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {quotes.map(q => {
              const cfg = STATUS_CFG[q.status] || STATUS_CFG.draft
              const isExpired = q.expiry_date && new Date(q.expiry_date) < new Date() && !['approved','converted','rejected'].includes(q.status)
              const isConverting = converting === q.id
              return (
                <div key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 dark:text-white">{q.quote_number}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                      {isExpired && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />Expired
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{q.title}</p>
                    <p className="text-xs text-slate-400">
                      {q.customer_name} · Issued {fmt(q.issue_date)}
                      {q.expiry_date && ` · Expires ${fmt(q.expiry_date)}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">${(q.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {!['approved','converted'].includes(q.status) && (
                      <Btn icon={Edit} onClick={() => { setEditing(q); setFormOpen(true) }} title="Edit quote" />
                    )}
                    {['draft','sent'].includes(q.status) && (
                      <Btn icon={Send} onClick={() => setSending(q)} title="Send to client" color="text-blue-500" />
                    )}
                    {q.approval_token && (
                      <Btn icon={Eye}
                        onClick={() => window.open(`${typeof window !== 'undefined' ? window.location.origin : ''}/quote-approval?token=${q.approval_token}`, '_blank')}
                        title="Preview approval page" color="text-violet-500" />
                    )}
                    {q.status === 'approved' && (
                      <Btn icon={RotateCcw} onClick={() => handleConvertToInvoice(q)} title="Convert to invoice"
                        color="text-emerald-500" spinning={isConverting} />
                    )}
                    {q.status !== 'converted' && (
                      <Btn icon={Trash2} onClick={() => handleDelete(q)} title="Delete quote" color="text-rose-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <QuoteFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={() => { setFormOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId} customers={customers}
      />

      {sending && (
        <SendQuoteDialog
          quote={sending}
          onClose={() => setSending(null)}
          onSent={() => { setSending(null); loadAll() }}
        />
      )}
    </div>
  )
}