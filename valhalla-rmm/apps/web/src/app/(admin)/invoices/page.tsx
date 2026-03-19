// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { format, parseISO } from 'date-fns'
import {
  FileText, Plus, DollarSign, Clock, AlertTriangle,
  CheckCircle2, Send, Trash2, Eye, X, Loader2,
  RotateCcw, CreditCard, ExternalLink, Link, Mail,
} from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) ref.current()
    }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

const STATUS_CFG = {
  draft:   { label: 'Draft',   cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  sent:    { label: 'Sent',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  paid:    { label: 'Paid',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partial: { label: 'Partial', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  void:    { label: 'Void',    cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
}
const TERMS_LABELS = {
  due_on_receipt: 'Due on Receipt', net_7: 'Net 7', net_15: 'Net 15',
  net_30: 'Net 30', net_45: 'Net 45', net_60: 'Net 60',
}
const TERMS_DAYS = { due_on_receipt: 0, net_7: 7, net_15: 15, net_30: 30, net_45: 45, net_60: 60 }
const BLANK_ITEM = { description: '', quantity: '1', unit_price: '' }
const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function computeDueDate(issueDate, terms) {
  if (!issueDate) return ''
  const d = new Date(issueDate)
  d.setDate(d.getDate() + (TERMS_DAYS[terms] ?? 30))
  return d.toISOString().split('T')[0]
}

function calcTotals(items, taxRate, discountAmt, discountPct) {
  const sub = items.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unit_price || 0)), 0)
  const pctDisc = sub * ((Number(discountPct) || 0) / 100)
  const flat = Number(discountAmt) || 0
  const taxable = Math.max(0, sub - pctDisc - flat)
  const tax = taxable * ((Number(taxRate) || 0) / 100)
  return { subtotal: sub, discount_amount: pctDisc + flat, taxAmount: tax, total: taxable + tax }
}

function fmt(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d || '—' } }

function Btn({ icon: Icon, onClick, title, color = 'text-slate-400', disabled = false, spinning = false }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 ${color}`}>
      {spinning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    </button>
  )
}

function ViewDialog({ inv, onClose }) {
  if (!inv) return null
  const items = Array.isArray(inv.line_items) ? inv.line_items : []
  const cfg = STATUS_CFG[inv.status] || STATUS_CFG.draft
  const balance = Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-900 dark:text-white">{inv.invoice_number}</h2>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">Bill To</p>
              <p className="font-semibold text-slate-900 dark:text-white">{inv.customer_name}</p>
              {inv.contact_email && <p className="text-xs text-slate-400">{inv.contact_email}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-400">Dates</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">Issued: {fmt(inv.issue_date)}</p>
              <p className="text-xs text-slate-700 dark:text-slate-300">Due: {fmt(inv.due_date)}</p>
              {inv.payment_terms && <p className="text-xs text-slate-400">Terms: {TERMS_LABELS[inv.payment_terms]}</p>}
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 mb-2">
              <span className="col-span-6">Description</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-2">Rate</span>
              <span className="col-span-2 text-right">Total</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="col-span-6 text-slate-900 dark:text-white">{item.description}</span>
                <span className="col-span-2 text-slate-500">{item.quantity}</span>
                <span className="col-span-2 text-slate-500">${Number(item.unit_price || 0).toFixed(2)}</span>
                <span className="col-span-2 text-right font-medium text-slate-900 dark:text-white">${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${(inv.subtotal || 0).toFixed(2)}</span></div>
            {(inv.discount_amount || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-${(inv.discount_amount || 0).toFixed(2)}</span></div>}
            {(inv.tax_rate || 0) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({inv.tax_rate}%)</span><span>${(inv.tax_amount || 0).toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-lg text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total</span><span>${(inv.total || 0).toFixed(2)}</span></div>
            {(inv.amount_paid || 0) > 0 && <>
              <div className="flex justify-between text-emerald-600 text-sm"><span>Paid</span><span>${(inv.amount_paid || 0).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-amber-500"><span>Balance Due</span><span>${balance.toFixed(2)}</span></div>
            </>}
          </div>
          {inv.notes && <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400">{inv.notes}</div>}
          {inv.stripe_payment_url && inv.status !== 'paid' && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/40">
              <Link className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400 flex-1 truncate">{inv.stripe_payment_url}</p>
              <button onClick={() => navigator.clipboard.writeText(inv.stripe_payment_url)}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex-shrink-0">Copy</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InvoiceDialog({ open, onClose, onSaved, editing, orgId, customers, timeEntries }) {
  const supabase = createSupabaseBrowserClient()
  const today = new Date().toISOString().split('T')[0]
  const blank = {
    customer_id: '', customer_name: '', contact_email: '',
    issue_date: today, due_date: computeDueDate(today, 'net_30'),
    payment_terms: 'net_30', tax_rate: '', discount_amount: '', discount_percent: '',
    notes: '', line_items: [{ ...BLANK_ITEM }], is_recurring: false, recurrence_interval: 'monthly',
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
        contact_email: editing.contact_email || '', issue_date: editing.issue_date || today,
        due_date: editing.due_date || '', payment_terms: editing.payment_terms || 'net_30',
        tax_rate: String(editing.tax_rate || ''), discount_amount: String(editing.discount_amount || ''),
        discount_percent: String(editing.discount_percent || ''), notes: editing.notes || '',
        line_items: items, is_recurring: editing.is_recurring || false,
        recurrence_interval: editing.recurrence_interval || 'monthly',
      })
    } else { setForm(blank) }
  }, [editing, open])

  const updateItem = (i, field, val) => {
    setForm(f => { const items = [...f.line_items]; items[i] = { ...items[i], [field]: val }; return { ...f, line_items: items } })
  }

  const importTime = () => {
    if (!form.customer_id) return
    const unbilled = timeEntries.filter(e => e.customer_id === form.customer_id && e.billable && !e.invoice_id)
    if (!unbilled.length) { alert('No unbilled time entries for this customer'); return }
    const newItems = unbilled.map(e => {
      const hours = e.minutes / 60
      const rate = e.hourly_rate || 0
      const total = parseFloat((hours * rate).toFixed(2))
      return { description: `${e.description || e.ticket_title || 'Support time'} (${hours.toFixed(2)}h @ $${rate}/hr)`, quantity: '1', unit_price: String(total), _time_entry_id: e.id }
    })
    setForm(f => ({ ...f, line_items: [...f.line_items.filter(i => i.description), ...newItems] }))
  }

  const handleSave = async () => {
    if (!form.customer_id) { setErr('Please select a customer'); return }
    if (!orgId) { setErr('Organization not found — please refresh'); return }
    setSaving(true); setErr(null)
    const items = form.line_items.filter(i => i.description).map(i => ({
      description: i.description, quantity: Number(i.quantity || 1),
      unit_price: Number(i.unit_price || 0), total: Number(i.quantity || 1) * Number(i.unit_price || 0),
    }))
    const taxRate = Number(form.tax_rate || 0)
    const { subtotal, discount_amount, taxAmount, total } = calcTotals(items, taxRate, form.discount_amount, form.discount_percent)
    const invNum = editing?.invoice_number || `INV-${Date.now().toString().slice(-6)}`
    const payload = {
      organization_id: orgId, invoice_number: invNum,
      customer_id: form.customer_id, customer_name: form.customer_name,
      contact_email: form.contact_email || null, status: editing?.status || 'draft',
      payment_terms: form.payment_terms || 'net_30', issue_date: form.issue_date || null,
      due_date: form.due_date || computeDueDate(form.issue_date, form.payment_terms) || null,
      line_items: items, subtotal, discount_amount, discount_percent: Number(form.discount_percent || 0),
      tax_rate: taxRate, tax_amount: taxAmount, total, amount_paid: editing?.amount_paid || 0,
      notes: form.notes || null, is_recurring: form.is_recurring || false,
      recurrence_interval: form.is_recurring ? (form.recurrence_interval || 'monthly') : null,
    }
    const { data: inv, error } = editing
      ? await supabase.from('invoices').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('invoices').insert(payload).select().single()
    if (error) { setErr(error.message); setSaving(false); return }
    const timeIds = form.line_items.filter(i => i._time_entry_id).map(i => i._time_entry_id)
    if (timeIds.length > 0 && inv) await supabase.from('time_entries').update({ invoice_id: inv.id }).in('id', timeIds)
    setSaving(false); onSaved()
  }

  const totals = calcTotals(form.line_items || [], form.tax_rate, form.discount_amount, form.discount_percent)
  const unbilledCount = timeEntries.filter(e => e.customer_id === form.customer_id && e.billable && !e.invoice_id).length

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer *</label>
              <select value={form.customer_id} onChange={e => {
                const c = customers.find(c => c.id === e.target.value)
                setForm(f => ({ ...f, customer_id: e.target.value, customer_name: c?.name || '', contact_email: c?.contact_email || f.contact_email }))
              }} className={`mt-1 ${inp}`}>
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Email</label>
              <input type="email" value={form.contact_email} onChange={e => sf('contact_email', e.target.value)} placeholder="billing@customer.com" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Terms</label>
              <select value={form.payment_terms} onChange={e => {
                const terms = e.target.value
                setForm(f => ({ ...f, payment_terms: terms, due_date: computeDueDate(f.issue_date, terms) }))
              }} className={`mt-1 ${inp}`}>
                {Object.entries(TERMS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Issue Date</label>
              <input type="date" value={form.issue_date} onChange={e => {
                const d = e.target.value
                setForm(f => ({ ...f, issue_date: d, due_date: computeDueDate(d, f.payment_terms) }))
              }} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => sf('due_date', e.target.value)} className={`mt-1 ${inp}`} />
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
          {form.customer_id && (
            <button onClick={importTime}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Clock className="w-3.5 h-3.5" /> Import Unbilled Time ({unbilledCount} entries)
            </button>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items</label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
                <span className="col-span-6">Description</span><span className="col-span-2">Qty</span><span className="col-span-2">Unit $</span><span className="col-span-2">Total</span>
              </div>
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Service description"
                    className="col-span-6 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="1"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0.00"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2)}</span>
                    <button onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }))} className="p-1 rounded hover:bg-rose-50 text-rose-400 transition-colors"><X className="w-3 h-3" /></button>
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
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes / Payment Instructions</label>
            <textarea value={form.notes} onChange={e => sf('notes', e.target.value)} rows={2} placeholder="Bank details, payment instructions, etc." className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e => sf('is_recurring', e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <label htmlFor="recurring" className="flex-1 cursor-pointer">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Recurring Invoice</p>
              <p className="text-xs text-slate-400">Auto-generate a new draft on a schedule</p>
            </label>
            {form.is_recurring && (
              <select value={form.recurrence_interval} onChange={e => sf('recurrence_interval', e.target.value)}
                className="px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.customer_id || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecordPaymentDialog({ inv, onClose, onSaved }) {
  const supabase = createSupabaseBrowserClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [saving, setSaving] = useState(false)
  const balance = Math.max(0, Number(inv?.total ?? 0) - Number(inv?.amount_paid ?? 0))

  const handleSave = async () => {
    const paid = parseFloat(amount)
    if (!paid || paid <= 0) return
    setSaving(true)
    const newPaid = Number(inv.amount_paid || 0) + paid
    const newStatus = (Number(inv.total || 0) - newPaid) <= 0.01 ? 'paid' : 'partial'
    await supabase.from('invoices').update({
      amount_paid: newPaid, status: newStatus,
      ...(newStatus === 'paid' ? { paid_date: new Date().toISOString().split('T')[0] } : {}),
    }).eq('id', inv.id)
    setSaving(false); onSaved()
  }

  if (!inv) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Record Payment</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{inv.invoice_number} · Balance due: <strong className="text-slate-900 dark:text-white">${balance.toFixed(2)}</strong></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount ($) *</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder={`Up to ${balance.toFixed(2)}`} autoFocus className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={`mt-1 ${inp}`}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card (manual)</option>
              <option value="other">Other</option>
            </select>
          </div>
          {parseFloat(amount) > 0 && (
            <p className="text-xs text-slate-400">{parseFloat(amount) >= balance ? '✓ This will mark the invoice as fully paid' : `Remaining after payment: $${Math.max(0, balance - parseFloat(amount)).toFixed(2)}`}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={!amount || parseFloat(amount) <= 0 || saving}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendEmailDialog({ inv, onClose, onSent }) {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState(inv?.contact_email || '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)

  const handleSend = async () => {
    if (!email.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr(null)
    const balance = Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0))
    const items = Array.isArray(inv?.line_items) ? inv.line_items : []
    let paymentUrl = inv.stripe_payment_url
    if (!paymentUrl) {
      try {
        const { data: stripeData } = await supabase.functions.invoke('stripe-create-payment-link', { body: { invoice_id: inv.id } })
        if (stripeData?.url) paymentUrl = stripeData.url
      } catch { }
    }
    const lineRows = items.map(i => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i.description}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${i.quantity}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(i.unit_price || 0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">$${(Number(i.quantity || 0) * Number(i.unit_price || 0)).toFixed(2)}</td></tr>`).join('')
    const payBtn = paymentUrl ? `<div style="text-align:center;margin-top:32px;"><a href="${paymentUrl}" style="background:#f59e0b;color:#000000;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">Pay Now — $${balance.toFixed(2)}</a><p style="color:#94a3b8;font-size:12px;margin-top:8px;">Secure payment powered by Stripe</p></div>` : ''
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f8fafc;"><div style="background:#0f172a;padding:24px;border-radius:12px 12px 0 0;"><h1 style="color:#f59e0b;margin:0;font-size:24px;">Invoice ${inv.invoice_number}</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Issued: ${inv.issue_date} &nbsp;·&nbsp; Due: ${inv.due_date}</p></div><div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;"><table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><thead><tr style="background:#f1f5f9;"><th style="padding:10px 8px;text-align:left;color:#64748b;font-size:12px;">Description</th><th style="padding:10px 8px;text-align:center;color:#64748b;font-size:12px;">Qty</th><th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;">Rate</th><th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;">Total</th></tr></thead><tbody>${lineRows}</tbody></table><div style="text-align:right;padding:12px 0;border-top:2px solid #0f172a;margin-top:8px;"><p style="font-size:20px;font-weight:bold;color:#0f172a;margin:8px 0 0;">Amount Due: $${balance.toFixed(2)}</p></div>${payBtn}</div></div>`
    const { error } = await supabase.functions.invoke('send-invoice-email', { body: { to: email.trim(), subject: `Invoice ${inv.invoice_number} from Valhalla IT — $${balance.toFixed(2)} due ${inv.due_date}`, html } })
    if (error) {
      window.location.href = `mailto:${email}?subject=Invoice ${inv.invoice_number}&body=Invoice total: $${balance.toFixed(2)}`
      setSending(false); onClose(); return
    }
    if (inv.status === 'draft') await supabase.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
    setSending(false); setSent(true)
    setTimeout(() => { onSent(); onClose() }, 1500)
  }

  if (!inv) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Send Invoice</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-900 dark:text-white">Invoice sent!</p>
            <p className="text-sm text-slate-500 mt-1">Emailed to {email}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-sm">
              <p className="font-medium text-slate-900 dark:text-white">{inv.invoice_number} · {inv.customer_name}</p>
              <p className="text-slate-500 mt-0.5">Total: <strong>${(inv.total || 0).toFixed(2)}</strong> · Due: {fmt(inv.due_date)}</p>
              <p className="text-xs text-slate-400 mt-1">{inv.stripe_payment_url ? '✓ Pay Now button will be included' : 'A Stripe Pay Now button will be auto-generated'}</p>
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
                {sending ? 'Sending…' : 'Send Invoice'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InvoicesPage() {
  const supabase = createSupabaseBrowserClient()
  const [invoices,      setInvoices]      = useState([])
  const [customers,     setCustomers]     = useState([])
  const [timeEntries,   setTimeEntries]   = useState([])
  const [loading,       setLoading]       = useState(true)
  const [orgId,         setOrgId]         = useState(null)
  const [dialogOpen,    setDialogOpen]    = useState(false)
  const [editing,       setEditing]       = useState(null)
  const [viewing,       setViewing]       = useState(null)
  const [payingInv,     setPayingInv]     = useState(null)
  const [sendingInv,    setSendingInv]    = useState(null)
  const [statusLoading, setStatusLoading] = useState(null)
  const [stripeLoading, setStripeLoading] = useState(null)
  const [linkCopied,    setLinkCopied]    = useState(null)

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

  useRealtimeRefresh(['invoices', 'time_entries'], loadAll)

  const loadAll = async () => {
    setLoading(true)
    const [inv, cust, time] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name,contact_email').eq('status','active').order('name').limit(200),
      supabase.from('time_entries').select('id,customer_id,ticket_title,description,minutes,hourly_rate,billable,invoice_id,date').order('date', { ascending: false }).limit(500),
    ])
    const today = new Date().toISOString().split('T')[0]
    const toMark = (inv.data ?? []).filter(i => i.status === 'sent' && i.due_date && i.due_date < today)
    if (toMark.length > 0) {
      await Promise.all(toMark.map(i => supabase.from('invoices').update({ status: 'overdue' }).eq('id', i.id)))
      const refreshed = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200)
      setInvoices(refreshed.data ?? [])
    } else {
      setInvoices(inv.data ?? [])
    }
    setCustomers(cust.data ?? [])
    setTimeEntries(time.data ?? [])
    setLoading(false)
  }

  const markStatus = async (inv, status) => {
    setStatusLoading(inv.id)
    const updates = { status }
    if (status === 'paid') { updates.paid_date = new Date().toISOString().split('T')[0]; updates.amount_paid = inv.total || 0 }
    await supabase.from('invoices').update(updates).eq('id', inv.id)
    setStatusLoading(null); loadAll()
  }

  const generateStripeLink = async (inv) => {
    setStripeLoading(inv.id)
    try {
      const { data, error } = await supabase.functions.invoke('stripe-create-payment-link', { body: { invoice_id: inv.id } })
      if (error || data?.error) { alert(`Stripe error: ${error?.message || data?.error}`); return }
      if (data?.url) {
        await loadAll()
        try { await navigator.clipboard.writeText(data.url); setLinkCopied(inv.id); setTimeout(() => setLinkCopied(null), 3000) }
        catch { window.prompt('Copy this payment link:', data.url) }
      }
    } catch (e) { alert(`Error: ${e.message}`) }
    finally { setStripeLoading(null) }
  }

  const copyLink = async (inv) => {
    try { await navigator.clipboard.writeText(inv.stripe_payment_url); setLinkCopied(inv.id); setTimeout(() => setLinkCopied(null), 3000) }
    catch { window.prompt('Copy this payment link:', inv.stripe_payment_url) }
  }

  const deleteInvoice = async (id) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    await supabase.from('invoices').delete().eq('id', id)
    loadAll()
  }

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0)
  const outstanding  = invoices.filter(i => ['sent','overdue','partial'].includes(i.status)).reduce((s, i) => s + Math.max(0, Number(i.total || 0) - Number(i.amount_paid || 0)), 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, send, and track payments</p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', value: invoices.length,               icon: FileText,     color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Outstanding',    value: `$${outstanding.toFixed(2)}`,  icon: Clock,         color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Collected',      value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign,    color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Overdue',        value: overdueCount,                  icon: AlertTriangle, color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
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
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-40" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-24" />
                </div>
                <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium mb-4">No invoices yet</p>
            <button onClick={() => { setEditing(null); setDialogOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
              <Plus className="w-4 h-4" /> Create First Invoice
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoices.map(inv => {
              const cfg = STATUS_CFG[inv.status] || STATUS_CFG.draft
              const balance = Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0))
              const isPaid = ['paid','void'].includes(inv.status)
              const isCopied = linkCopied === inv.id
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 dark:text-white">{inv.invoice_number}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                      {inv.is_recurring && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1"><RotateCcw className="w-2.5 h-2.5" />Recurring</span>}
                      {inv.stripe_payment_url && !isPaid && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pay link ready</span>}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{inv.customer_name}</p>
                    <p className="text-xs text-slate-400">Issued {fmt(inv.issue_date)} · Due {fmt(inv.due_date)}{inv.payment_terms && ` · ${TERMS_LABELS[inv.payment_terms] || ''}`}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">${(inv.total || 0).toFixed(2)}</p>
                    {(inv.amount_paid || 0) > 0 && !isPaid && <p className="text-xs text-amber-500">Bal: ${balance.toFixed(2)}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Btn icon={Eye} onClick={() => setViewing(inv)} title="View invoice" />
                    <Btn icon={FileText} onClick={() => { setEditing(inv); setDialogOpen(true) }} title="Edit invoice" />
                    {!isPaid && <Btn icon={Mail} onClick={() => setSendingInv(inv)} title="Email invoice" color="text-blue-500" />}
                    {inv.status === 'draft' && <Btn icon={Send} onClick={() => markStatus(inv, 'sent')} title="Mark as Sent" color="text-blue-400" spinning={statusLoading === inv.id} />}
                    {!isPaid && <Btn icon={CreditCard} onClick={() => setPayingInv(inv)} title="Record payment" color="text-violet-500" />}
                    {!isPaid && <Btn icon={CheckCircle2} onClick={() => markStatus(inv, 'paid')} title="Mark as fully paid" color="text-emerald-500" spinning={statusLoading === inv.id} />}
                    {!isPaid && <Btn icon={isCopied ? CheckCircle2 : Link} onClick={() => generateStripeLink(inv)} title={isCopied ? 'Link copied!' : 'Generate Stripe payment link'} color={isCopied ? 'text-emerald-500' : 'text-amber-500'} spinning={stripeLoading === inv.id} disabled={stripeLoading === inv.id} />}
                    {inv.stripe_payment_url && !isPaid && <Btn icon={isCopied ? CheckCircle2 : ExternalLink} onClick={() => copyLink(inv)} title={isCopied ? 'Copied!' : 'Copy existing payment link'} color={isCopied ? 'text-emerald-500' : 'text-blue-400'} />}
                    <Btn icon={Trash2} onClick={() => deleteInvoice(inv.id)} title="Delete invoice" color="text-rose-400" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <InvoiceDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null) }} onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }} editing={editing} orgId={orgId} customers={customers} timeEntries={timeEntries} />
      {viewing   && <ViewDialog inv={viewing} onClose={() => setViewing(null)} />}
      {payingInv && <RecordPaymentDialog inv={payingInv} onClose={() => setPayingInv(null)} onSaved={() => { setPayingInv(null); loadAll() }} />}
      {sendingInv && <SendEmailDialog inv={sendingInv} onClose={() => setSendingInv(null)} onSent={() => { setSendingInv(null); loadAll() }} />}
    </div>
  )
}