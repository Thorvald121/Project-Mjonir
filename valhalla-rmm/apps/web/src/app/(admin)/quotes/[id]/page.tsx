// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import QuoteAttachments from '@/components/QuoteAttachments'
import {
  ArrowLeft, Send, CheckCircle2, RotateCcw,
  Trash2, Edit, Clock, DollarSign, Paperclip,
  Loader2, Eye, Calendar, User, Mail,
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

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function fmtCur(n) {
  return n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function QuoteDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [quote,     setQuote]     = useState(null)
  const [orgId,     setOrgId]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [converting,setConverting]= useState(false)
  const [activeTab, setActiveTab] = useState('details')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      const { data } = await supabase.from('quotes').select('*').eq('id', params.id).single()
      setQuote(data)
      setLoading(false)
    }
    init()
  }, [params.id])

  const handleDelete = async () => {
    if (!confirm(`Delete ${quote.quote_number}? This cannot be undone.`)) return
    await supabase.from('quotes').delete().eq('id', quote.id)
    router.push('/quotes')
  }

  const handleConvert = async () => {
    if (!confirm(`Convert ${quote.quote_number} to an invoice?`)) return
    setConverting(true)
    const today   = new Date().toISOString().split('T')[0]
    const dueDate = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0] })()
    const { error } = await supabase.from('invoices').insert({
      organization_id: orgId, invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      customer_id: quote.customer_id, customer_name: quote.customer_name,
      contact_email: quote.contact_email || null, status: 'draft', payment_terms: 'net_30',
      issue_date: today, due_date: dueDate, line_items: quote.line_items || [],
      subtotal: quote.subtotal || 0, discount_amount: quote.discount_amount || 0,
      discount_percent: quote.discount_percent || 0, tax_rate: quote.tax_rate || 0,
      tax_amount: quote.tax_amount || 0, total: quote.total || 0, amount_paid: 0,
      notes: quote.notes || null,
    })
    if (!error) {
      await supabase.from('quotes').update({ status: 'converted' }).eq('id', quote.id)
      setQuote(prev => ({ ...prev, status: 'converted' }))
    }
    setConverting(false)
  }

  if (loading) return (
    <div className="max-w-4xl space-y-4 animate-pulse">
      <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl" />
    </div>
  )

  if (!quote) return (
    <div className="text-center py-20 text-slate-400">
      <p className="text-lg font-medium mb-2">Quote not found</p>
      <button onClick={() => router.push('/quotes')} className="text-amber-500 hover:underline text-sm">← Back to Quotes</button>
    </div>
  )

  const cfg       = STATUS_CFG[quote.status] ?? STATUS_CFG.draft
  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : []
  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date() && !['approved', 'converted', 'rejected'].includes(quote.status)
  const appUrl    = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="max-w-4xl space-y-5">

      {/* Back */}
      <button onClick={() => router.push('/quotes')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Quotes
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{quote.quote_number}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>{cfg.label}</span>
              {isExpired && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Expired
                </span>
              )}
            </div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">{quote.title}</p>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{fmtCur(quote.total)}</p>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {[
            { icon: User,     label: 'Client',  value: quote.customer_name },
            { icon: Mail,     label: 'Contact', value: quote.contact_email || '—' },
            { icon: Calendar, label: 'Issued',  value: fmt(quote.issue_date) },
            { icon: Calendar, label: 'Expires', value: fmt(quote.expiry_date) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-0.5">
                <Icon className="w-3 h-3" /> {label}
              </p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{value}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {/* Edit → full edit page */}
          {!['approved', 'converted'].includes(quote.status) && (
            <button onClick={() => router.push(`/quotes/${quote.id}/edit`)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Edit className="w-4 h-4" /> Edit Quote
            </button>
          )}
          {quote.approval_token && (
            <button onClick={() => window.open(`${appUrl}/quote-approval?token=${quote.approval_token}`, '_blank')}
              className="flex items-center gap-2 px-3 py-2 border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 rounded-lg text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors">
              <Eye className="w-4 h-4" /> Preview Client View
            </button>
          )}
          {quote.status === 'approved' && (
            <button onClick={handleConvert} disabled={converting}
              className="flex items-center gap-2 px-3 py-2 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors disabled:opacity-50">
              {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Convert to Invoice
            </button>
          )}
          {quote.status !== 'converted' && (
            <button onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors ml-auto">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          {[{ id: 'details', label: 'Details' }, { id: 'attachments', label: 'Attachments' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {tab.id === 'attachments' && <Paperclip className="w-3.5 h-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Details tab */}
        {activeTab === 'details' && (
          <div className="p-5 space-y-5">
            {quote.message_to_client && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Message to Client</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{quote.message_to_client}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Line Items</p>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_90px_90px] gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  <div>Description</div><div className="text-right">Qty</div><div className="text-right">Rate</div><div className="text-right">Total</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lineItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_90px_90px] gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{item.description}</p>
                        {item.sub && <p className="text-xs text-slate-400 mt-0.5">{item.sub}</p>}
                      </div>
                      <div className="text-right text-slate-600 dark:text-slate-400">{item.quantity}</div>
                      <div className="text-right text-slate-600 dark:text-slate-400">{fmtCur(item.unit_price)}</div>
                      <div className="text-right font-semibold text-slate-900 dark:text-white">{fmtCur(item.total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{fmtCur(quote.subtotal)}</span></div>
              {Number(quote.discount_amount) > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{fmtCur(quote.discount_amount)}</span></div>}
              {Number(quote.tax_rate) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({quote.tax_rate}%)</span><span>{fmtCur(quote.tax_amount)}</span></div>}
              <div className="flex justify-between font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700 pt-2"><span>Total</span><span>{fmtCur(quote.total)}</span></div>
            </div>

            {quote.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Internal Notes</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">{quote.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Attachments tab */}
        {activeTab === 'attachments' && orgId && (
          <div className="p-5 space-y-4">
            <div className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <strong>Client visible</strong> — shown on the approval page
              </div>
              <div className="flex items-center gap-1.5 ml-4">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                <strong>Internal only</strong> — never sent to client
              </div>
            </div>
            <QuoteAttachments quoteId={quote.id} orgId={orgId} />
          </div>
        )}
      </div>
    </div>
  )
}