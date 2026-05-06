// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Plus, FileText, Send, CheckCircle2, RotateCcw,
  Trash2, Edit, Clock, DollarSign, TrendingUp, X,
  Loader2, Eye, Paperclip,
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

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function calcTotals(items, taxRate, discountAmt, discountPct) {
  const sub     = items.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unit_price || 0)), 0)
  const pctDisc = sub * ((Number(discountPct) || 0) / 100)
  const flat    = Number(discountAmt) || 0
  const taxable = Math.max(0, sub - pctDisc - flat)
  const tax     = taxable * ((Number(taxRate) || 0) / 100)
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

// ── New Quote Dialog (for creating only — editing now uses full page) ──────────
function NewQuoteDialog({ open, onClose, onSaved, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const today = new Date().toISOString().split('T')[0]
  const defaultExpiry = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] })()
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

  useEffect(() => { if (open) setForm(blank) }, [open])

  const updateItem = (i, field, val) => {
    setForm(f => { const items = [...f.line_items]; items[i] = { ...items[i], [field]: val }; return { ...f, line_items: items } })
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
    const quoteNum = `QTE-${Date.now().toString().slice(-6)}`
    const approval_token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const { error } = await supabase.from('quotes').insert({
      organization_id: orgId, quote_number: quoteNum,
      customer_id: form.customer_id, customer_name: form.customer_name,
      contact_name: form.contact_name || null, contact_email: form.contact_email || null,
      title: form.title, status: 'draft',
      issue_date: form.issue_date, expiry_date: form.expiry_date || null,
      line_items: items, subtotal, discount_amount,
      discount_percent: Number(form.discount_percent || 0),
      tax_rate: Number(form.tax_rate || 0), tax_amount: taxAmount, total,
      notes: form.notes || null, message_to_client: form.message_to_client || null, approval_token,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const totals = calcTotals(form.line_items || [], form.tax_rate, form.discount_amount, form.discount_percent)

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">New Quick Quote</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            For the full quote builder with pricing plans, add-ons, and display modes — use <strong>New Quote</strong> in the nav sidebar.
          </div>
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => sf('expiry_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items</label>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
                <span className="col-span-6">Description</span><span className="col-span-2">Qty</span><span className="col-span-2">Unit $</span><span className="col-span-2">Total</span>
              </div>
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Service or product"
                    className="col-span-6 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="1"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <input type="number" min={0} step="any" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0.00"
                    className="col-span-2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2)}</span>
                    <button onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }))} className="p-1 rounded hover:bg-rose-50 text-rose-400"><X className="w-3 h-3" /></button>
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
            <div className="flex justify-between font-bold text-slate-900 dark:text-white">
              <span>Total</span><span>${totals.total.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.customer_id || !form.title.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : 'Create Quote'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendQuoteDialog({ quote, onClose, onSent }) {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState(quote?.contact_email || '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)

  if (!quote) return null
  const items = Array.isArray(quote.line_items) ? quote.line_items : []
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const approvalUrl = `${appUrl}/quote-approval?token=${quote.approval_token}`

  const handleSend = async () => {
    if (!email.trim()) { setErr('Email address is required'); return }
    setSending(true); setErr(null)

    const displayMode = quote.display_mode || 'full'
    const fmtCur = (n) => '$' + Number(n || 0).toFixed(2)

    const SECTION_LABELS = {
      support: 'Support Plan', security: 'Security',
      other: 'Additional Services', onboarding: 'Onboarding',
    }

    // Build the items HTML block according to display mode
    let itemsHtml = ''

    if (displayMode === 'full') {
      // ── Full: description, qty, rate, total ──────────────────────────────────
      const rows = items.map(i =>
        `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${i.description}${i.is_one_time ? ' <span style="font-size:11px;color:#f59e0b;">(one-time)</span>' : ''}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:14px;">${i.quantity}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;font-size:14px;">${fmtCur(i.unit_price)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:14px;color:#0f172a;">${fmtCur(i.total ?? (i.quantity * i.unit_price))}</td>
        </tr>`
      ).join('')
      itemsHtml = `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:10px 8px;text-align:left;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Description</th>
              <th style="padding:10px 8px;text-align:center;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Qty</th>
              <th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Rate</th>
              <th style="padding:10px 8px;text-align:right;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`

    } else if (displayMode === 'sectioned') {
      // ── Sectioned: grouped by category, description + total only (no qty/rate) ─
      const sections = {}
      for (const item of items) {
        const key = item.section || 'other'
        if (!sections[key]) sections[key] = []
        sections[key].push(item)
      }
      itemsHtml = Object.entries(sections).map(([key, sItems]) => {
        const sTotal    = sItems.reduce((s, i) => s + (i.total ?? (i.quantity * i.unit_price) ?? 0), 0)
        const allOneTime = sItems.every(i => i.is_one_time)
        const label     = SECTION_LABELS[key] ?? key
        const rows      = sItems.map(i =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${i.description}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;font-size:14px;color:#0f172a;">${fmtCur(i.total ?? (i.quantity * i.unit_price))}${i.is_one_time ? '' : '/mo'}</td>
          </tr>`
        ).join('')
        return `
          <table style="width:100%;border-collapse:collapse;margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#0f172a;">
                <th style="padding:10px 12px;text-align:left;color:#f59e0b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">${label}</th>
                <th style="padding:10px 12px;text-align:right;color:#f59e0b;font-size:13px;font-weight:700;">${fmtCur(sTotal)}${allOneTime ? ' one-time' : '/mo'}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`
      }).join('')

    } else {
      // ── Summary: section name + section total only — no individual items ────────
      const sections = {}
      for (const item of items) {
        const key = item.section || 'other'
        if (!sections[key]) sections[key] = []
        sections[key].push(item)
      }
      const rows = Object.entries(sections).map(([key, sItems]) => {
        const sTotal    = sItems.reduce((s, i) => s + (i.total ?? (i.quantity * i.unit_price) ?? 0), 0)
        const allOneTime = sItems.every(i => i.is_one_time)
        return `
          <tr>
            <td style="padding:12px 8px;border-bottom:1px solid #e2e8f0;font-size:15px;font-weight:600;color:#1e293b;">${SECTION_LABELS[key] ?? key}</td>
            <td style="padding:12px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:15px;font-weight:700;color:#0f172a;">${fmtCur(sTotal)}${allOneTime ? ' <span style="font-size:12px;font-weight:400;color:#64748b;">one-time</span>' : ' <span style="font-size:12px;font-weight:400;color:#64748b;">/mo</span>'}</td>
          </tr>`
      }).join('')
      itemsHtml = `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tbody>${rows}</tbody>
        </table>`
    }

    // Recurring vs one-time breakdown for footer
    const recurringTotal = items.filter(i => !i.is_one_time).reduce((s, i) => s + (i.total ?? (i.quantity * i.unit_price) ?? 0), 0)
    const oneTimeTotal   = items.filter(i => i.is_one_time).reduce((s, i) => s + (i.total ?? (i.quantity * i.unit_price) ?? 0), 0)

    const totalsHtml = displayMode === 'full'
      ? `<p style="font-size:20px;font-weight:bold;color:#0f172a;margin:0;">Total: ${fmtCur(quote.total)}</p>`
      : recurringTotal > 0 && oneTimeTotal > 0
        ? `<p style="font-size:18px;font-weight:bold;color:#0f172a;margin:0 0 4px;">Monthly: ${fmtCur(recurringTotal)}/mo</p>
           <p style="font-size:14px;color:#64748b;margin:0;">One-time: ${fmtCur(oneTimeTotal)} &nbsp;·&nbsp; First month: ${fmtCur(recurringTotal + oneTimeTotal)}</p>`
        : `<p style="font-size:20px;font-weight:bold;color:#0f172a;margin:0;">${recurringTotal > 0 ? `${fmtCur(recurringTotal)}/mo` : fmtCur(oneTimeTotal)}</p>`

    const html = `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:32px;background:#f8fafc;">
        <div style="background:#0f172a;padding:24px;border-radius:12px 12px 0 0;">
          <p style="color:#f59e0b;margin:0 0 4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">${quote.quote_number}</p>
          <h1 style="color:#f8fafc;margin:0;font-size:22px;font-weight:700;">${quote.title}</h1>
          <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">Prepared for ${quote.customer_name}</p>
        </div>
        <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          ${quote.message_to_client ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">${quote.message_to_client}</p>` : ''}
          ${itemsHtml}
          <div style="text-align:right;padding:16px 0;border-top:2px solid #0f172a;margin-top:8px;">
            ${totalsHtml}
          </div>
          <div style="text-align:center;margin-top:28px;">
            <a href="${approvalUrl}" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
              Review and Approve This Quote
            </a>
            ${quote.expiry_date ? `<p style="color:#94a3b8;font-size:12px;margin-top:12px;">This quote expires on ${quote.expiry_date}.</p>` : ''}
          </div>
        </div>
      </div>`

    const { error } = await supabase.functions.invoke('send-invoice-email', { body: { to: email.trim(), subject: `Quote ${quote.quote_number} - ${quote.title}`, html } })
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
              <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="font-bold text-slate-900 dark:text-white">${Number(quote.total || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Expires</span><span className="text-amber-500">{fmt(quote.expiry_date)}</span></div>
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
  const supabase   = createSupabaseBrowserClient()
  const router     = useRouter()
  const [quotes,     setQuotes]     = useState([])
  const [customers,  setCustomers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [formOpen,   setFormOpen]   = useState(false)
  const [sending,    setSending]    = useState(null)
  const [converting, setConverting] = useState(null)
  const [attachCounts, setAttachCounts] = useState({})

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
    const [q, c] = await Promise.all([
      supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('id,name,contact_email,contact_name').eq('status', 'active').order('name').limit(200),
    ])
    setQuotes(q.data ?? [])
    setCustomers(c.data ?? [])
    if ((q.data ?? []).length > 0) {
      const ids = (q.data ?? []).map(q => q.id)
      const { data: atts } = await supabase.from('quote_attachments').select('quote_id').in('quote_id', ids)
      const counts = {}
      for (const a of atts ?? []) { counts[a.quote_id] = (counts[a.quote_id] || 0) + 1 }
      setAttachCounts(counts)
    }
    setLoading(false)
  }

  useRealtimeRefresh(['quotes'], loadAll)

  const handleDelete = async (q) => {
    if (!confirm(`Delete ${q.quote_number}?`)) return
    await supabase.from('quotes').delete().eq('id', q.id)
    loadAll()
  }

  const handleConvertToInvoice = async (q) => {
    if (!confirm(`Convert ${q.quote_number} to an invoice?`)) return
    setConverting(q.id)
    const today   = new Date().toISOString().split('T')[0]
    const dueDate = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] })()
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

  const pipelineValue  = quotes.filter(q => !['rejected', 'expired'].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0)
  const approvedValue  = quotes.filter(q => ['approved', 'converted'].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0)
  const pendingCount   = quotes.filter(q => ['sent', 'viewed'].includes(q.status)).length
  const sentOrMore     = quotes.filter(q => q.status !== 'draft').length
  const conversionRate = sentOrMore > 0 ? Math.round((quotes.filter(q => ['approved', 'converted'].includes(q.status)).length / sentOrMore) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Quotes & Proposals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create proposals, send for client approval, convert to invoice in one click</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Quick Quote
          </button>
          <button onClick={() => router.push('/quotes/new')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Quote Builder
          </button>
        </div>
      </div>

      {/* KPI cards */}
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

      {/* Quote list */}
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
            <button onClick={() => router.push('/quotes/new')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
              <Plus className="w-4 h-4" /> Open Quote Builder
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {quotes.map(q => {
              const cfg       = STATUS_CFG[q.status] || STATUS_CFG.draft
              const isExpired = q.expiry_date && new Date(q.expiry_date) < new Date() && !['approved', 'converted', 'rejected'].includes(q.status)
              const attCount  = attachCounts[q.id] || 0
              return (
                <div key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  {/* Clickable info area → detail page */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/quotes/${q.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 dark:text-white">{q.quote_number}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                      {isExpired && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Expired</span>}
                      {attCount > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
                          <Paperclip className="w-2.5 h-2.5" />{attCount}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{q.title}</p>
                    <p className="text-xs text-slate-400">{q.customer_name} · Issued {fmt(q.issue_date)}{q.expiry_date && ` · Expires ${fmt(q.expiry_date)}`}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900 dark:text-white">${(q.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Btn icon={Paperclip} onClick={() => router.push(`/quotes/${q.id}`)} title="Attachments & details" color={attCount > 0 ? 'text-amber-500' : 'text-slate-400'} />
                    {/* Edit now goes to full edit page */}
                    {!['approved', 'converted'].includes(q.status) && <Btn icon={Edit} onClick={() => router.push(`/quotes/${q.id}/edit`)} title="Edit quote" />}
                    {['draft', 'sent'].includes(q.status) && <Btn icon={Send} onClick={() => setSending(q)} title="Send to client" color="text-blue-500" />}
                    {q.approval_token && <Btn icon={Eye} onClick={() => window.open(`${typeof window !== 'undefined' ? window.location.origin : ''}/quote-approval?token=${q.approval_token}`, '_blank')} title="Preview approval page" color="text-violet-500" />}
                    {q.status === 'approved' && <Btn icon={RotateCcw} onClick={() => handleConvertToInvoice(q)} title="Convert to invoice" color="text-emerald-500" spinning={converting === q.id} />}
                    {q.status !== 'converted' && <Btn icon={Trash2} onClick={() => handleDelete(q)} title="Delete quote" color="text-rose-400" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <NewQuoteDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); loadAll() }}
        orgId={orgId}
        customers={customers}
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