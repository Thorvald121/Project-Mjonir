// apps/web/src/app/(portal)/portal/set-password/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { Suspense } from 'react'

function SetPasswordForm() {
  const router      = useRouter()
  const supabase    = createSupabaseBrowserClient()

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [checking,  setChecking]  = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    // Verify we have an active session (set by /auth/confirm route)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // No session — link expired or already used
        setError('This link has expired or already been used. Please request a new invite or password reset.')
      }
      setChecking(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true); setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }

    setDone(true)
    setLoading(false)
    setTimeout(() => { router.push('/portal'); router.refresh() }, 1500)
  }

  const inp = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-800 dark:text-white"

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 mb-4">
            {done ? <CheckCircle2 className="w-6 h-6 text-white" /> : <Lock className="w-6 h-6 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {done ? 'Password Set!' : 'Set Your Password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {done ? 'Taking you to the portal…' : 'Choose a password to access your client portal'}
          </p>
        </div>

        {checking && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        )}

        {!checking && error && !done && (
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
            <a href="/portal/login"
              className="block text-center px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
              Back to portal login
            </a>
          </div>
        )}

        {!checking && !error && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoFocus autoComplete="new-password"
                  placeholder="At least 8 characters" className={`${inp} pr-10`} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</label>
              <input type={showPw ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required autoComplete="new-password"
                placeholder="Re-enter your password" className={inp} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Set Password & Enter Portal
            </button>
          </form>
        )}

        {done && (
          <div className="flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return <Suspense><SetPasswordForm /></Suspense>
}