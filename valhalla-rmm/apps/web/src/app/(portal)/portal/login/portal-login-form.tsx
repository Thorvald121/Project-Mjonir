'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'

type Mode = 'login' | 'set-password' | 'forgot' | 'sent' | 'done'

export default function PortalLoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createSupabaseBrowserClient()

  const [mode,      setMode]      = useState<Mode>('login')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [tokenType, setTokenType] = useState<string | null>(null)

  // ── Detect Supabase token in URL on mount ──────────────────────────────────
  useEffect(() => {
    const hash   = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))

    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type         = params.get('type') // 'invite' | 'recovery' | 'signup'

    if (accessToken && (type === 'invite' || type === 'recovery' || type === 'signup')) {
      // Exchange the tokens to establish a session, then prompt for new password
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' })
        .then(({ error }) => {
          if (error) {
            setError('This link has expired or is invalid. Please request a new one.')
            return
          }
          setTokenType(type)
          setMode('set-password')
          // Clear the hash from the URL so it's not bookmarked with the token
          window.history.replaceState(null, '', window.location.pathname)
        })
      return
    }

    // Also handle token_hash query param (PKCE flow)
    const tokenHash = searchParams.get('token_hash')
    const qType     = searchParams.get('type')
    if (tokenHash && qType) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: qType as any })
        .then(({ error }) => {
          if (error) {
            setError('This link has expired or is invalid. Please request a new one.')
            return
          }
          setTokenType(qType)
          setMode('set-password')
          window.history.replaceState(null, '', window.location.pathname)
        })
    }
  }, [])

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/portal')
    router.refresh()
  }

  // ── Set / update password (after invite or reset link) ────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setMode('done')
    setLoading(false)
    // Auto-redirect to portal after 2 seconds
    setTimeout(() => { router.push('/portal'); router.refresh() }, 2000)
  }

  // ── Send password reset email ──────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email address'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/portal/login`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setMode('sent')
    setLoading(false)
  }

  const inpCls = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-slate-800 dark:text-white"

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo / header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500 mb-4">
            <span className="text-white font-bold text-xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {mode === 'set-password' ? (tokenType === 'recovery' ? 'Reset Your Password' : 'Welcome! Set Your Password') :
             mode === 'forgot'       ? 'Forgot Password' :
             mode === 'sent'         ? 'Check Your Email' :
             mode === 'done'         ? 'All Set!' :
             'Client Portal'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'set-password' ? 'Choose a secure password to access your portal' :
             mode === 'forgot'       ? 'Enter your email and we\'ll send a reset link' :
             mode === 'sent'         ? `We sent a reset link to ${email}` :
             mode === 'done'         ? 'Redirecting you to the portal…' :
             'Sign in to view your tickets and invoices'}
          </p>
        </div>

        {/* ── SIGN IN ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="you@company.com" className={inpCls} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                <button type="button" onClick={() => { setMode('forgot'); setError(null) }}
                  className="text-xs text-amber-500 hover:underline">Forgot password?</button>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••" className={`${inpCls} pr-10`} />
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

        {/* ── SET PASSWORD (invite or reset) ── */}
        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required autoFocus autoComplete="new-password" placeholder="At least 8 characters"
                  className={`${inpCls} pr-10`} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm Password</label>
              <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                required autoComplete="new-password" placeholder="Re-enter your password" className={inpCls} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {tokenType === 'recovery' ? 'Reset Password' : 'Set Password & Sign In'}
            </button>
          </form>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus autoComplete="email" placeholder="you@company.com" className={inpCls} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Reset Link
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null) }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── EMAIL SENT ── */}
        {mode === 'sent' && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Check your inbox for <strong>{email}</strong> and click the reset link. It may take a minute to arrive.
            </p>
            <button onClick={() => { setMode('login'); setError(null) }}
              className="text-sm text-amber-500 hover:underline">Back to sign in</button>
          </div>
        )}

        {/* ── DONE ── */}
        {mode === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your password has been set. Taking you to the portal now…
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-amber-500 mx-auto" />
          </div>
        )}

        {/* Staff link */}
        {(mode === 'login' || mode === 'forgot') && (
          <p className="text-center text-xs text-slate-400">
            Are you a technician?{' '}
            <a href="/login" className="text-amber-500 hover:underline">Staff login →</a>
          </p>
        )}

      </div>
    </div>
  )
}