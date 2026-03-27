'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2, Shield, KeyRound } from 'lucide-react'

export default function VerifyTwoFAForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectTo   = searchParams.get('redirectTo') ?? '/dashboard'
  const supabase     = createSupabaseBrowserClient()

  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setLoading(true); setError(null)

    // Get the current MFA challenge
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session expired. Please log in again.'); setLoading(false); return }

    // List enrolled factors
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totp = factors?.totp?.[0]
    if (!totp) { router.push(redirectTo); return } // No factor enrolled, let them through

    // Create challenge and verify
    const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
    if (chalErr) { setError(chalErr.message); setLoading(false); return }

    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId:    totp.id,
      challengeId: challenge.id,
      code:        code.trim(),
    })

    if (verErr) {
      setError('Invalid code. Please try again.')
      setCode('')
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  // Auto-submit when 6 digits entered
  const handleChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-600 mb-4">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Two-Factor Auth</h1>
          <p className="text-sm text-slate-500 mt-1">Enter the code from your authenticator app</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Authentication Code</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={code}
              onChange={e => handleChange(e.target.value)}
              maxLength={6}
              className="w-full px-3 py-3 border border-slate-200 rounded-lg text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Verify
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Lost access to your authenticator?{' '}
          <a href="/login" className="text-violet-500 hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  )
}