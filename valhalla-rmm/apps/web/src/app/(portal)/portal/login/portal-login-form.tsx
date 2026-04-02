'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'

type Mode = 'login' | 'forgot' | 'sent'

export default function PortalLoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createSupabaseBrowserClient()

  const [mode,     setMode]     = useState<Mode>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  useEffect(() => {
    // Show success message after password was set
    if (searchParams.get('message') === 'password_set') {
      setSuccess('Password set successfully. Please sign in.')
      window.history.replaceState(null, '', '/portal/login')
    }
    // Show error if link expired
    if (searchParams.get('error') === 'link_expired') {
      setError('This link has expired. Please request a new one.')
      window.history.replaceState(null, '', '/portal/login')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setSuccess(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/portal')
    router.refresh()
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setLoading(true); setError(null)
    // Redirect directly to /portal/set-password so onAuthStateChange can detect PASSWORD_RECOVERY
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/portal/set-password`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setMode('sent')
    setLoading(false)
  }

  const inp = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-800 dark:text-white"

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 mb-4">
            <span className="text-white font-bold text-xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'forgot' ? 'Forgot Password' :
             mode === 'sent'   ? 'Check Your Email' :
             'Client Portal'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'forgot' ? "We'll send you a link to reset your password" :
             mode === 'sent'   ? `Reset link sent to ${email}` :
             'Sign in to view your tickets and invoices'}
          </p>
        </div>

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="you@company.com" className={inp} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                <button type="button" onClick={() => { setMode('forgot'); setError(null); setSuccess(null) }}
                  className="text-xs text-amber-500 hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••"
                  className={`${inp} pr-10`} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>
        )}

        {/* ── FORGOT ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus autoComplete="email" placeholder="you@company.com" className={inp} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Reset Link
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null) }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-center">
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── SENT ── */}
        {mode === 'sent' && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="text-sm text-slate-500">
              Check your inbox — click the link in the email to set your password.
              It may take a minute to arrive.
            </p>
            <button onClick={() => { setMode('login'); setError(null) }}
              className="text-sm text-amber-500 hover:underline">
              Back to sign in
            </button>
          </div>
        )}

        {/* Staff link */}
        {mode !== 'sent' && (
          <p className="text-center text-xs text-slate-400">
            Are you a technician?{' '}
            <a href="/login" className="text-amber-500 hover:underline">Staff login →</a>
          </p>
        )}

      </div>
    </div>
  )
}