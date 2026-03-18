// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { format, parseISO } from 'date-fns'
import {
  FileText, Plus, DollarSign, Clock, AlertTriangle,
  CheckCircle2, Send, Trash2, Eye, X, Loader2,
  Mail, Download, RotateCcw, CreditCard, ExternalLink
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
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
const BLANK_ITEM = { description: '', quantity: 1, unit_price: 0 }

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function computeDueDate(issueDate, terms) {
  if (!issueDate) return ''
  const d = new Date(issueDate)
  d.setDate(d.getDate() + (TERMS_DAYS[terms] ?? 30))
  return d.toISOString().split('T')[0]
}

function calcTotals(items, taxRate, discountAmt, discountPct) {
  const sub = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0)
  const pctDisc = sub * ((discountPct || 0) / 100)
  const flat = discountAmt || 0
  const taxable = Math.max(0, sub - pctDisc - flat)
  const tax = taxable * ((taxRate || 0) / 100)
  return { subtotal: sub, discount_amount: pctDisc + flat, taxAmount: tax, total: taxable + tax }
}

function fmt(d) { try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d || '—' } }

// ── View Invoice Dialog ───────────────────────────────────────────────────────
function ViewDialog({ inv, onClose }) {
  if (!inv) return null
  const items = Array.isArray(inv.line_items) ? inv.line_items : []
  const cfg = STATUS_CFG[inv.status] || STATUS_CFG.draft
  const balance = inv.balance_due ?? inv.total ?? 0

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
                <span className="col-span-2 text-slate-500">${Number(item.unit_price).toFixed(2)}</span>
                <span className="col-span-2 text-right font-medium text-slate-900 dark:text-white">${(item.quantity * item.unit_price).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="text-sm space-y-1.5">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${(inv.subtotal || 0).toFixed(2)}</span></div>
            {(inv.discount_amount || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-${(inv.discount_amount || 0).toFixed(2)}</span></div>}
            {inv.tax_rate > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({inv.tax_rate}%)</span><span>${(inv.tax_amount || 0).toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-lg text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total</span><span>${(inv.total || 0).toFixed(2)}</span></div>
            {(inv.amount_paid || 0) > 0 && <>
              <div className="flex justify-between text-emerald-600 text-sm"><span>Paid</span><span>${(inv.amount_paid || 0).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-amber-500"><span>Balance Due</span><span>${balance.toFixed(2)}</span></div>
            </>}
          </div>

          {inv.notes && <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400">{inv.notes}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Create / Edit Invoice Dialog ──────────────────────────────────────────────
function InvoiceDialog({ open, onClose, onSaved, editing, orgId, customers, timeEntries }) {
  const supabase = createSupabaseBrowserClient()
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    customer_id: '', customer_name: '', contact_email: '',
    issue_date: today, due_date: computeDueDate(today, 'net_30'),
    payment_terms: 'net_30', tax_rate: 0, discount_amount: 0, discount_percent: 0,
    notes: '', line_items: [{ ...BLANK_ITEM }],
    is_recurring: false, recurrence_interval: 'monthly',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (editing) {
      const items = Array.isArray(editing.line_items) && editing.line_items.length
        ? editing.line_items : [{ ...BLANK_ITEM }]
      setForm({
        customer_id:         editing.customer_id        || '',
        customer_name:       editing.customer_name      || '',
        contact_email:       editing.contact_email      || '',
        issue_date:          editing.issue_date         || today,
        due_date:            editing.due_date           || '',
        payment_terms:       editing.payment_terms      || 'net_30',
        tax_rate:            editing.tax_rate           || 0,
        discount_amount:     editing.discount_amount    || 0,
        discount_percent:    editing.discount_percent   || 0,
        notes:               editing.notes              || '',
        line_items:          items,
        is_recurring:        editing.is_recurring       || false,
        recurrence_interval: editing.recurrence_interval || 'monthly',
      })
    } else {
      setForm({
        customer_id: '', customer_name: '', contact_email: '',
        issue_date: today, due_date: computeDueDate(today, 'net_30'),
        payment_terms: 'net_30', tax_rate: 0, discount_amount: 0, discount_percent: 0,
        notes: '', line_items: [{ ...BLANK_ITEM }],
        is_recurring: false, recurrence_interval: 'monthly',
      })
    }
  }, [editing, open])

  const updateItem = (i, field, val) => {
    setForm(f => {
      const items = [...f.line_items]
      items[i] = { ...items[i], [field]: field === 'description' ? val : Number(val) }
      return { ...f, line_items: items }
    })
  }

  const importTime = () => {
    if (!form.customer_id) return
    const unbilled = timeEntries.filter(e => e.customer_id === form.customer_id && e.billable && !e.invoice_id)
    if (!unbilled.length) { alert('No unbilled time entries for this customer'); return }
    const newItems = unbilled.map(e => ({
      description:    `${e.description || e.ticket_title || 'Support time'} (${(e.minutes / 60).toFixed(1)}h)`,
      quantity:       parseFloat((e.minutes / 60).toFixed(2)),
      unit_price:     e.hourly_rate || 0,
      _time_entry_id: e.id,
    }))
    setForm(f => ({ ...f, line_items: [...f.line_items.filter(i => i.description), ...newItems] }))
  }

  const handleSave = async () => {
    if (!form.customer_id) { setErr('Please select a customer'); return }
    if (!orgId) { setErr('Organization not found — please refresh'); return }
    setSaving(true); setErr(null)

    const items = form.line_items.filter(i => i.description)
    const { subtotal, discount_amount, taxAmount, total } = calcTotals(items, form.tax_rate, form.discount_amount, form.discount_percent)
    const invNum = editing?.invoice_number || `INV-${Date.now().toString().slice(-6)}`

    const payload = {
      organization_id:     orgId,
      invoice_number:      invNum,
      customer_id:         form.customer_id,
      customer_name:       form.customer_name,
      contact_email:       form.contact_email || null,
      status:              editing?.status || 'draft',
      payment_terms:       form.payment_terms || 'net_30',
      issue_date:          form.issue_date || null,
      due_date:            form.due_date || computeDueDate(form.issue_date, form.payment_terms) || null,
      line_items:          items.map(i => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total: Number(i.quantity) * Number(i.unit_price) })),
      subtotal,
      discount_amount,
      discount_percent:    form.discount_percent || 0,
      tax_rate:            form.tax_rate || 0,
      tax_amount:          taxAmount,
      total,
      amount_paid:         editing?.amount_paid || 0,
      notes:               form.notes || null,
      is_recurring:        form.is_recurring || false,
      recurrence_interval: form.is_recurring ? (form.recurrence_interval || 'monthly') : null,
    }

    const { data: inv, error } = editing
      ? await supabase.from('invoices').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('invoices').insert(payload).select().single()

    if (error) { setErr(error.message); setSaving(false); return }

    // Mark time entries as billed
    const timeIds = form.line_items.filter(i => i._time_entry_id).map(i => i._time_entry_id)
    if (timeIds.length > 0 && inv) {
      await supabase.from('time_entries').update({ invoice_id: inv.id }).in('id', timeIds)
    }

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
            <div className="col-span-2 grid grid-cols-2 gap-3">
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
              <input type="number" min={0} max={100} value={form.tax_rate} onChange={e => sf('tax_rate', Number(e.target.value))} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount ($)</label>
              <input type="number" min={0} value={form.discount_amount} onChange={e => sf('discount_amount', Number(e.target.value))} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount (%)</label>
              <input type="number" min={0} max={100} value={form.discount_percent} onChange={e => sf('discount_percent', Number(e.target.value))} className={`mt-1 ${inp}`} />
            </div>
          </div>

          {/* Import time */}
          {form.customer_id && (
            <button onClick={importTime}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Clock className="w-3.5 h-3.5" />
              Import Unbilled Time ({unbilledCount} entries)
            </button>
          )}

          {/* Line items */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items</label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
                <span className="col-span-6">Description</span>
                <span className="col-span-2">Qty</span>
                <span className="col-span-2">Unit $</span>
                <span className="col-span-2">Total</span>
              </div>
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                    placeholder="Service description"
                    className="col-span-6 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step={0.5} value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)}
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</span>
                    <button onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }))}
                      className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, line_items: [...f.line_items, { ...BLANK_ITEM }] }))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            {(form.discount_amount > 0 || form.discount_percent > 0) && (
              <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-${totals.discount_amount.toFixed(2)}</span></div>
            )}
            {form.tax_rate > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({form.tax_rate}%)</span><span>${totals.taxAmount.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes / Payment Instructions</label>
            <textarea value={form.notes} onChange={e => sf('notes', e.target.value)} rows={2}
              placeholder="Bank details, payment instructions, etc."
              className={`mt-1 ${inp} resize-none`} />
          </div>

          {/* Recurring */}
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

// ── Record Payment Dialog ─────────────────────────────────────────────────────
function RecordPaymentDialog({ inv, onClose, onSaved }) {
  const supabase = createSupabaseBrowserClient()
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const balance = inv?.balance_due ?? inv?.total ?? 0

  const handleSave = async () => {
    const paid = parseFloat(amount)
    if (!paid || paid <= 0) return
    setSaving(true)
    const newPaid = (inv.amount_paid || 0) + paid
    const newBalance = (inv.total || 0) - newPaid
    const newStatus = newBalance <= 0 ? 'paid' : 'partial'
    await supabase.from('invoices').update({
      amount_paid: newPaid,
      status:      newStatus,
      ...(newStatus === 'paid' ? { paid_date: new Date().toISOString().split('T')[0] } : {}),
    }).eq('id', inv.id)
    setSaving(false); onSaved()
  }

  if (!inv) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Record Payment</h2>
        <p className="text-sm text-slate-500 mb-4">{inv.invoice_number} · Balance due: <strong>${balance.toFixed(2)}</strong></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Amount ($)</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={`Max ${balance.toFixed(2)}`} className={`mt-1 ${inp}`} />
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={!amount || saving}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const supabase = createSupabaseBrowserClient()

  const [invoices,    setInvoices]    = useState([])
  const [customers,   setCustomers]   = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [orgId,       setOrgId]       = useState(null)
  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [viewing,     setViewing]     = useState(null)
  const [payingInv,   setPayingInv]   = useState(null)
  const [statusLoading, setStatusLoading] = useState(null)

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
    const [inv, cust, time] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name,contact_email').eq('status','active').order('name').limit(200),
      supabase.from('time_entries').select('id,customer_id,ticket_title,description,minutes,hourly_rate,billable,invoice_id,date').order('date', { ascending: false }).limit(500),
    ])
    // Auto-mark overdue
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
    if (status === 'paid') {
      updates.paid_date   = new Date().toISOString().split('T')[0]
      updates.amount_paid = inv.total || 0
    }
    if (status === 'sent' && inv.status === 'draft') {
      updates.issue_date = updates.issue_date || inv.issue_date
    }
    await supabase.from('invoices').update(updates).eq('id', inv.id)
    setStatusLoading(null)
    loadAll()
  }

  const deleteInvoice = async (id) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    await supabase.from('invoices').delete().eq('id', id)
    loadAll()
  }

  const totalRevenue  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
  const outstanding   = invoices.filter(i => ['sent','overdue','partial'].includes(i.status)).reduce((s, i) => s + (i.balance_due ?? i.total ?? 0), 0)
  const overdueCount  = invoices.filter(i => i.status === 'overdue').length

  const IconBtn = ({ icon: Icon, onClick, title, color = 'text-slate-400', disabled = false, spinning = false }) => (
    <button onClick={onClick} title={title} disabled={disabled}
      className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 ${color}`}>
      {spinning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create invoices, import billable time, track payments</p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoices', value: invoices.length,              icon: FileText,     color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Outstanding',    value: `$${outstanding.toFixed(2)}`, icon: Clock,         color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Collected',      value: `$${totalRevenue.toFixed(2)}`,icon: DollarSign,    color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Overdue',        value: overdueCount,                 icon: AlertTriangle, color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
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

      {/* Invoice list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array(5).fill(0).map((_,i) => (
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
              const cfg     = STATUS_CFG[inv.status] || STATUS_CFG.draft
              const balance = inv.balance_due ?? inv.total ?? 0
              const isLoading = statusLoading === inv.id
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 dark:text-white">{inv.invoice_number}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                      {inv.is_recurring && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex items-center gap-1">
                          <RotateCcw className="w-2.5 h-2.5" />Recurring
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{inv.customer_name}</p>
                    <p className="text-xs text-slate-400">
                      Issued {fmt(inv.issue_date)} · Due {fmt(inv.due_date)}
                      {inv.payment_terms && ` · ${TERMS_LABELS[inv.payment_terms] || ''}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">${(inv.total || 0).toFixed(2)}</p>
                    {(inv.amount_paid || 0) > 0 && inv.status !== 'paid' && (
                      <p className="text-xs text-amber-500">Bal: ${balance.toFixed(2)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <IconBtn icon={Eye}          onClick={() => setViewing(inv)}    title="View" />
                    <IconBtn icon={FileText}     onClick={() => { setEditing(inv); setDialogOpen(true) }} title="Edit" />
                    {inv.status === 'draft' && (
                      <IconBtn icon={Send} onClick={() => markStatus(inv, 'sent')} title="Mark as Sent" color="text-blue-500" spinning={isLoading} />
                    )}
                    {['sent','overdue','partial'].includes(inv.status) && (
                      <IconBtn icon={CreditCard} onClick={() => setPayingInv(inv)} title="Record Payment" color="text-violet-500" />
                    )}
                    {['sent','overdue','partial'].includes(inv.status) && (
                      <IconBtn icon={CheckCircle2} onClick={() => markStatus(inv, 'paid')} title="Mark Fully Paid" color="text-emerald-500" spinning={isLoading} />
                    )}
                    {inv.stripe_payment_url && inv.status !== 'paid' && (
                      <IconBtn icon={ExternalLink} onClick={() => window.open(inv.stripe_payment_url, '_blank')} title="Open Payment Link" color="text-blue-400" />
                    )}
                    <IconBtn icon={Trash2} onClick={() => deleteInvoice(inv.id)} title="Delete" color="text-rose-400" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <InvoiceDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing}
        orgId={orgId}
        customers={customers}
        timeEntries={timeEntries}
      />

      {viewing && <ViewDialog inv={viewing} onClose={() => setViewing(null)} />}

      {payingInv && (
        <RecordPaymentDialog
          inv={payingInv}
          onClose={() => setPayingInv(null)}
          onSaved={() => { setPayingInv(null); loadAll() }}
        />
      )}
    </div>
  )
}