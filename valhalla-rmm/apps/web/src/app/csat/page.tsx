// @ts-nocheck
// Public CSAT survey page — no auth required
// URL: /csat?token=<base64-encoded-json>
'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Star, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

const SCORE_LABELS = { 1: 'Very Unsatisfied', 2: 'Unsatisfied', 3: 'Neutral', 4: 'Satisfied', 5: 'Very Satisfied' }
const SCORE_COLORS = { 1: 'text-rose-500', 2: 'text-orange-500', 3: 'text-yellow-500', 4: 'text-emerald-400', 5: 'text-emerald-500' }

function decodeToken(token) {
  try {
    const padded  = token.replace(/-/g, '+').replace(/_/g, '/')
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - padded.length % 4)
    return JSON.parse(atob(padded + padding))
  } catch { return null }
}

function CsatForm() {
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') || ''

  const tokenData = useMemo(() => decodeToken(token), [token])

  const [score,      setScore]      = useState(0)
  const [hovered,    setHovered]    = useState(0)
  const [comment,    setComment]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [duplicate,  setDuplicate]  = useState(false)
  const [error,      setError]      = useState('')

  if (!token || !tokenData) return (
    <Screen><AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" /><h2 className="text-lg font-semibold text-slate-100 mb-2">Invalid Survey Link</h2><p className="text-slate-400 text-sm">This survey link is invalid or has expired.</p></Screen>
  )
  if (duplicate) return (
    <Screen><CheckCircle2 className="w-12 h-12 text-slate-500 mx-auto mb-4" /><h2 className="text-lg font-semibold text-slate-100 mb-2">Already Submitted</h2><p className="text-slate-400 text-sm">You've already rated this support ticket. Thank you!</p></Screen>
  )
  if (submitted) return (
    <Screen>
      <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-5" />
      <h2 className="text-xl font-bold text-slate-100 mb-2">Thanks for your feedback!</h2>
      <p className="text-slate-400 text-sm">Your response helps us improve our service.</p>
      {score >= 4 && <p className="text-emerald-400 text-sm mt-4 font-medium">We're glad we could help 😊</p>}
      {score <= 2 && <p className="text-amber-400 text-sm mt-4">We'll work harder to do better next time.</p>}
    </Screen>
  )

  const handleSubmit = async () => {
    if (!score) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(
        'https://yetrdrgagfovphrerpie.supabase.co/functions/v1/submit-csat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, score, comment: comment.trim() || null }),
        }
      )
      const data = await res.json()
      if (data?.alreadySubmitted) { setDuplicate(true); setSubmitting(false); return }
      if (data?.error || !res.ok)  { setError(data?.error || 'Submission failed.'); setSubmitting(false); return }
      setSubmitted(true)
    } catch { setError('Could not submit. Please try again.') }
    finally { setSubmitting(false) }
  }

  const displayScore = hovered || score

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 mb-4">
            <Star className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-1">{tokenData.orgName || 'Support Team'}</h1>
          <p className="text-slate-400 text-sm">How did we do resolving your request?</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 mb-7 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Ticket</p>
          <p className="text-slate-200 font-medium text-sm">{tokenData.ticketTitle}</p>
        </div>

        <div className="text-center mb-3">
          <div className="flex justify-center gap-2 mb-2" onMouseLeave={() => setHovered(0)}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onMouseEnter={() => setHovered(n)} onClick={() => setScore(n)}
                className="transition-transform hover:scale-110 focus:outline-none">
                <Star className={`w-10 h-10 transition-colors ${n <= displayScore ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-300'}`} />
              </button>
            ))}
          </div>
          <p className={`text-sm font-medium h-5 transition-colors ${displayScore ? SCORE_COLORS[displayScore] : 'text-transparent'}`}>
            {displayScore ? SCORE_LABELS[displayScore] : '—'}
          </p>
        </div>

        <div className="mt-5 mb-6">
          <label className="text-xs text-slate-400 uppercase tracking-wide block mb-2">
            Additional Comments <span className="normal-case text-slate-600">(optional)</span>
          </label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
            placeholder="Tell us what went well or what we could improve..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-600 rounded-xl text-sm focus:outline-none focus:border-amber-500 resize-none" />
        </div>

        {error && <p className="text-rose-400 text-sm mb-4 text-center">{error}</p>}

        <button onClick={handleSubmit} disabled={!score || submitting}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <p className="text-xs text-slate-600 text-center mt-4">Your feedback helps us improve our service quality.</p>
      </div>
    </div>
  )
}

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 max-w-md w-full text-center">{children}</div>
    </div>
  )
}

export default function CsatPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-950" />}><CsatForm /></Suspense>
}