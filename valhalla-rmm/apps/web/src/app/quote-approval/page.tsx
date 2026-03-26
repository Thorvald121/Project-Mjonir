// @ts-nocheck
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { CheckCircle2, XCircle, Loader2, FileText, Clock } from 'lucide-react'

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function QuoteApprovalContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = createSupabaseBrowserClient()

  const [quote,         setQuote]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason,  setRejectReason]  = useState('')
  const [showReject,    setShowReject]    = useState(false)
  const [done,          setDone]          = useState(null) // 'approved' | 'rejected'

  useEffect(() => {
    if (!token) { setLoading(false); return }
    supabase.from('quotes').select('*').eq('approval_token', token).single()
      .then(({ data }) => { setQuote(data || null); setLoading(false) })
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
      rejected_reason: rejectReason,
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

  // Invalid token
  if (!token || !quote) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <p className="text-xl font-semibold text-slate-200 mb-2">Quote not found</p>
        <p className="text-sm text-slate-400">This link may be invalid or expired.</p>
      </div>
    </div>
  )

  // Already approved
  if (done === 'approved' || ['approved','converted'].includes(quote.status) && done !== 'rejected') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <CheckCircle2 className="w-20 h-20 mx-auto mb-4 text-emerald-500" />
        <h1 className="text-2xl font-bold text-emerald-400 mb-2">Quote Approved!</h1>
        <p className="text-slate-400 max-w-sm mx-auto">
          Thank you for approving <strong className="text-slate-200">{quote.quote_number}</strong>.
          Your service provider has been notified and will be in touch shortly.
        </p>
      </div>
    </div>
  )

  // Already rejected
  if (done === 'rejected' || quote.status === 'rejected') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div>
        <XCircle className="w-20 h-20 mx-auto mb-4 text-rose-500" />
        <h1 className="text-2xl font-bold text-rose-400 mb-2">Quote Declined</h1>
        <p className="text-slate-400 max-w-sm mx-auto">
          Your feedback has been received. Your service provider will follow up with you.
        </p>
      </div>
    </div>
  )

  const items = Array.isArray(quote.line_items) ? quote.line_items : []
  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date()

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
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-slate-400">
            <span>Issued: {fmt(quote.issue_date)}</span>
            {quote.expiry_date && <span>·</span>}
            {quote.expiry_date && (
              <span className={isExpired ? 'text-rose-400' : 'text-amber-400'}>
                Expires: {fmt(quote.expiry_date)}
              </span>
            )}
          </div>
          {isExpired && (
            <div className="inline-flex items-center gap-1.5 bg-rose-900/40 text-rose-400 border border-rose-500/30 rounded-full px-3 py-1 text-xs mt-3">
              <Clock className="w-3 h-3" /> This quote has expired
            </div>
          )}
        </div>

        {/* Message to client */}
        {quote.message_to_client && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 text-slate-300 text-sm leading-relaxed">
            {quote.message_to_client}
          </div>
        )}

        {/* Line items */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
              <span className="col-span-6 text-slate-200">{item.description}</span>
              <span className="col-span-2 text-center text-slate-400">{item.quantity}</span>
              <span className="col-span-2 text-right text-slate-400">${Number(item.unit_price || 0).toFixed(2)}</span>
              <span className="col-span-2 text-right font-semibold text-slate-100">
                ${(Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2)}
              </span>
            </div>
          ))}

          {/* Totals */}
          <div className="border-t border-slate-700 px-4 py-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal</span><span>${Number(quote.subtotal || 0).toFixed(2)}</span>
            </div>
            {(quote.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-sm text-emerald-500">
                <span>Discount</span><span>-${Number(quote.discount_amount).toFixed(2)}</span>
              </div>
            )}
            {(quote.tax_rate || 0) > 0 && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>Tax ({quote.tax_rate}%)</span><span>${Number(quote.tax_amount || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-slate-700 pt-3 flex justify-between font-bold text-xl text-amber-400">
              <span>Total</span><span>${Number(quote.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 text-sm text-slate-400">
            {quote.notes}
          </div>
        )}

        {/* Action buttons */}
        {!isExpired ? (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
            <p className="text-slate-300 text-sm text-center">
              Please review the quote above and indicate your decision below.
            </p>

            {!showReject ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-base"
                >
                  {actionLoading
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <CheckCircle2 className="w-5 h-5" />}
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
                <p className="text-slate-400 text-sm">
                  Please let us know why you're declining so we can improve our proposal:
                </p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Your feedback here..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReject(false)}
                    className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Back
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
            <p className="text-slate-500 text-sm mt-1">Please contact your service provider for an updated proposal.</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-600 pb-4">
          Powered by Valhalla RMM
        </p>
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