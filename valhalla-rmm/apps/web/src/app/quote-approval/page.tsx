// @ts-nocheck
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { CheckCircle2, XCircle, Loader2, FileText, Clock, Globe, Lock } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function fmtCur(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Section config (matches builder) ─────────────────────────────────────────
const SECTION_LABELS = {
  support:    'Support Plan',
  security:   'Security',
  other:      'Additional Services',
  onboarding: 'Onboarding',
}

// ── Line item display — respects display_mode ─────────────────────────────────
function LineItemDisplay({ items, displayMode, subtotal, discountAmount, taxRate, taxAmount, total }) {
  // Group by section
  const sections = {}
  for (const item of items) {
    const key = item.section || 'other'
    if (!sections[key]) sections[key] = []
    sections[key].push(item)
  }

  const recurring = items.filter(i => !i.is_one_time)
  const oneTime   = items.filter(i => i.is_one_time)
  const recurringTotal = recurring.reduce((s, i) => s + (i.total || 0), 0)
  const oneTimeTotal   = oneTime.reduce((s, i) => s + (i.total || 0), 0)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

      {/* ── FULL mode: description, qty, rate, total ── */}
      {displayMode === 'full' && (
        <>
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-800/80">
            <span className="col-span-6 text-xs font-semibold text-slate-400 uppercase tracking-wide">Description</span>
            <span className="col-span-2 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Qty</span>
            <span className="col-span-2 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Rate</span>
            <span className="col-span-2 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Total</span>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">No line items</div>
          ) : items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-slate-800 text-sm">
              <div className="col-span-6">
                <p className="text-slate-200">{item.description}</p>
                {item.sub && <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>}
                {item.is_one_time && <span className="text-[10px] text-amber-500 font-semibold">One-time</span>}
              </div>
              <span className="col-span-2 text-center text-slate-400">{item.quantity}</span>
              <span className="col-span-2 text-right text-slate-400">{fmtCur(item.unit_price)}</span>
              <span className="col-span-2 text-right font-semibold text-slate-100">{fmtCur(item.total)}</span>
            </div>
          ))}
        </>
      )}

      {/* ── SECTIONED mode: grouped by category, description + total per item, NO rate/qty ── */}
      {displayMode === 'sectioned' && (
        <>
          {Object.entries(sections).map(([sectionKey, sectionItems]) => {
            const sectionTotal = sectionItems.reduce((s, i) => s + (i.total || 0), 0)
            const allOneTime   = sectionItems.every(i => i.is_one_time)
            return (
              <div key={sectionKey} className="border-b border-slate-800 last:border-0">
                {/* Section header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-500">
                    {SECTION_LABELS[sectionKey] ?? sectionKey}
                  </p>
                  <p className="text-sm font-bold text-amber-400">
                    {fmtCur(sectionTotal)}{allOneTime ? ' one-time' : '/mo'}
                  </p>
                </div>
                {/* Items — description + total ONLY, no rate or qty */}
                {sectionItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800/60 text-sm">
                    <div>
                      <p className="text-slate-200">{item.description}</p>
                      {item.sub && <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>}
                    </div>
                    <p className="font-semibold text-slate-100 flex-shrink-0 ml-4">
                      {fmtCur(item.total)}{item.is_one_time ? '' : '/mo'}
                    </p>
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}

      {/* ── SUMMARY mode: section name + section total ONLY — no individual items ── */}
      {displayMode === 'summary' && (
        <>
          <div className="px-4 py-3 bg-slate-800/80">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Service Summary</p>
          </div>
          {Object.entries(sections).map(([sectionKey, sectionItems]) => {
            const sectionTotal = sectionItems.reduce((s, i) => s + (i.total || 0), 0)
            const allOneTime   = sectionItems.every(i => i.is_one_time)
            return (
              <div key={sectionKey} className="flex items-center justify-between px-4 py-3.5 border-t border-slate-800 text-sm">
                <p className="text-slate-200 font-medium">
                  {SECTION_LABELS[sectionKey] ?? sectionKey}
                </p>
                <p className="font-bold text-slate-100">
                  {fmtCur(sectionTotal)}{allOneTime ? ' one-time' : '/mo'}
                </p>
              </div>
            )
          })}
        </>
      )}

      {/* ── Totals — always shown ── */}
      <div className="border-t border-slate-700 px-4 py-4 space-y-2">
        {/* For sectioned/summary, show monthly vs one-time breakdown */}
        {displayMode !== 'full' && oneTimeTotal > 0 && recurringTotal > 0 && (
          <>
            <div className="flex justify-between text-sm text-slate-400">
              <span>Monthly services</span>
              <span>{fmtCur(recurringTotal)}/mo</span>
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>One-time</span>
              <span>{fmtCur(oneTimeTotal)}</span>
            </div>
          </>
        )}
        {/* For full mode, show subtotal/discount/tax breakdown */}
        {displayMode === 'full' && (
          <>
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal</span><span>{fmtCur(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-500">
                <span>Discount</span><span>-{fmtCur(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>Tax ({taxRate}%)</span><span>{fmtCur(taxAmount)}</span>
              </div>
            )}
          </>
        )}
        <div className="border-t border-slate-700 pt-3 flex justify-between font-bold text-xl text-amber-400">
          <span>{displayMode === 'full' ? 'Total' : recurringTotal > 0 ? 'Monthly Total' : 'Total'}</span>
          <span>{fmtCur(recurringTotal > 0 ? recurringTotal : total)}</span>
        </div>
        {displayMode !== 'full' && oneTimeTotal > 0 && (
          <div className="flex justify-between text-sm text-slate-400">
            <span>First month (includes one-time)</span>
            <span className="font-semibold text-slate-200">{fmtCur(recurringTotal + oneTimeTotal)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────
function QuoteApprovalContent() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const supabase     = createSupabaseBrowserClient()

  const [quote,         setQuote]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason,  setRejectReason]  = useState('')
  const [showReject,    setShowReject]    = useState(false)
  const [done,          setDone]          = useState(null) // 'approved' | 'rejected'

  useEffect(() => {
    if (!token) { setLoading(false); return }
    supabase.from('quotes')
      .select('*')
      .eq('approval_token', token)
      .single()
      .then(({ data, error }) => {
        setQuote(data || null)
        setLoading(false)
      })
  }, [token])

  const handleApprove = async () => {
    setActionLoading(true)
    await supabase.from('quotes').update({
      status:      'approved',
      approved_at: new Date().toISOString(),
    }).eq('id', quote.id)
    setDone('approved')
    setActionLoading(false)
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    setActionLoading(true)
    await supabase.from('quotes').update({
      status:          'rejected',
      rejected_reason: rejectReason.trim(),
    }).eq('id', quote.id)
    setDone('rejected')
    setActionLoading(false)
  }

  // Loading
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
    </div>
  )

  // No token or no matching quote
  if (!token || !quote) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <p className="text-xl font-semibold text-slate-200 mb-2">Quote not found</p>
        <p className="text-sm text-slate-400 max-w-xs mx-auto">
          This link may be invalid. Please contact your service provider for the correct link.
        </p>
      </div>
    </div>
  )

  // Approved
  if (done === 'approved' || (['approved', 'converted'].includes(quote.status) && done !== 'rejected')) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <CheckCircle2 className="w-20 h-20 mx-auto mb-4 text-emerald-500" />
        <h1 className="text-2xl font-bold text-emerald-400 mb-2">Quote Approved!</h1>
        <p className="text-slate-400 max-w-sm mx-auto">
          Thank you for approving <strong className="text-slate-200">{quote.quote_number}</strong>.
          Valhalla IT has been notified and will be in touch shortly.
        </p>
      </div>
    </div>
  )

  // Rejected
  if (done === 'rejected' || quote.status === 'rejected') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <XCircle className="w-20 h-20 mx-auto mb-4 text-rose-500" />
        <h1 className="text-2xl font-bold text-rose-400 mb-2">Quote Declined</h1>
        <p className="text-slate-400 max-w-sm mx-auto">
          Your feedback has been received. Valhalla IT will follow up with you to discuss next steps.
        </p>
      </div>
    </div>
  )

  const items     = Array.isArray(quote.line_items) ? quote.line_items : []
  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date()
  // display_mode defaults to 'full' for quotes created before this feature existed
  const displayMode = quote.display_mode || 'full'

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center pb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 mb-4">
            <span className="text-white font-bold text-xl">V</span>
          </div>
          <p className="text-amber-500 font-semibold text-xs uppercase tracking-widest mb-2">Quote / Proposal</p>
          <h1 className="text-3xl font-bold text-white">{quote.title}</h1>
          <p className="text-slate-400 mt-1">{quote.quote_number} · Prepared for {quote.customer_name}</p>
          <div className="flex items-center justify-center gap-3 mt-3 text-sm text-slate-400">
            <span>Issued: {fmt(quote.issue_date)}</span>
            {quote.expiry_date && (
              <>
                <span>·</span>
                <span className={isExpired ? 'text-rose-400' : 'text-amber-400'}>
                  Expires: {fmt(quote.expiry_date)}
                </span>
              </>
            )}
          </div>
          {isExpired && (
            <div className="inline-flex items-center gap-1.5 bg-rose-900/40 text-rose-400 border border-rose-500/30 rounded-full px-3 py-1 text-xs mt-3">
              <Clock className="w-3 h-3" /> This quote has expired
            </div>
          )}
        </div>

        {/* Message to client — shown only if set, never internal notes */}
        {quote.message_to_client && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 text-slate-300 text-sm leading-relaxed">
            {quote.message_to_client}
          </div>
        )}

        {/* Line items — respects display_mode */}
        <LineItemDisplay
          items={items}
          displayMode={displayMode}
          subtotal={quote.subtotal}
          discountAmount={quote.discount_amount}
          taxRate={quote.tax_rate}
          taxAmount={quote.tax_amount}
          total={quote.total}
        />

        {/* Client-visible attachments */}
        <ClientAttachments quoteId={quote.id} />

        {/* Action buttons */}
        {!isExpired ? (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
            <p className="text-slate-300 text-sm text-center">
              Please review the proposal above and let us know your decision.
            </p>

            {!showReject ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-base"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Approve This Quote
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-semibold rounded-xl transition-colors text-base"
                >
                  <XCircle className="w-5 h-5" /> Decline
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-300 text-sm font-medium">Why are you declining this proposal?</p>
                <p className="text-slate-500 text-xs">Your feedback helps us improve. Please be as specific as you'd like.</p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="e.g. The pricing is outside our current budget. We'd like to revisit in Q3..."
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReject(false)}
                    className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Submit Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-center">
            <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">This quote has expired</p>
            <p className="text-slate-500 text-sm mt-1">Please contact Valhalla IT for an updated proposal.</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-600 pb-4">Powered by Valhalla RMM</p>
      </div>
    </div>
  )
}

// ── Client attachments — shows only is_client_visible files ──────────────────
function ClientAttachments({ quoteId }) {
  const supabase = createSupabaseBrowserClient()
  const [attachments, setAttachments] = useState([])

  useEffect(() => {
    if (!quoteId) return
    supabase.from('quote_attachments')
      .select('id, file_name, file_size, file_type, storage_path, is_client_visible')
      .eq('quote_id', quoteId)
      .eq('is_client_visible', true)
      .then(({ data }) => setAttachments(data ?? []))
  }, [quoteId])

  if (attachments.length === 0) return null

  const download = async (a) => {
    const { data } = await supabase.storage
      .from('quote-attachments')
      .createSignedUrl(a.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const fmtSize = (b) => {
    if (!b) return ''
    if (b < 1024 * 1024) return ` · ${(b / 1024).toFixed(0)} KB`
    return ` · ${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/60">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Supporting Documents</p>
      </div>
      <div className="divide-y divide-slate-800">
        {attachments.map(a => (
          <button key={a.id} onClick={() => download(a)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left">
            <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 truncate">{a.file_name}</p>
              <p className="text-xs text-slate-500">{a.file_type?.split('/')[1]?.toUpperCase() || 'File'}{fmtSize(a.file_size)}</p>
            </div>
            <span className="text-xs text-amber-500 font-medium flex-shrink-0">Download ↓</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function QuoteApprovalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    }>
      <QuoteApprovalContent />
    </Suspense>
  )
}