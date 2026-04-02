// apps/web/src/app/(portal)/portal/set-password/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { Suspense } from 'react'

function SetPasswordForm() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [ready,    setReady]    = useState(false)  // true once auth event fires
  const [error,    setError]    = useState<string | null>(null)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    // Listen for Supabase auth events
    // PASSWORD_RECOVERY fires when user arrives from a reset link
    // SIGNED_IN fires when user arrives from an invite link (handled via /auth/confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) setReady(true)
      }
    })

    // Also check for an existing session immediately (invite flow sets session before redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }

    setDone(true)
    setLoading(false)

    // Sign out and back in to get a clean session, then go to portal
    setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/portal/login?message=password_set')
    }, 2000)
  }

  const inp = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-800 dark:text-white"

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 mb-4">
            {done
              ? <CheckCircle2 className="w-6 h-6 text-white" />
              : <Lock className="w-6 h-6 text-white" />
            }
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {done ? 'Password Set!' : 'Set Your Password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {done
              ? 'Redirecting you to sign in…'
              : 'Choose a secure password for your client portal'
            }
          </p>
        </div>

        {/* Loading — waiting for auth event */}
        {!ready && !done && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            <p className="text-sm text-slate-400">Verifying your link…</p>
          </div>
        )}

        {/* Password form */}
        {ready && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoFocus autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className={`${inp} pr-10`}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Confirm Password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required autoComplete="new-password"
                placeholder="Re-enter your password"
                className={inp}
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Set Password & Sign In
            </button>
          </form>
        )}

        {/* Done state */}
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