// @ts-nocheck
// apps/web/src/components/QboSettingsPanel.tsx
// Drop this component into your Settings page wherever you want the QBO connect section.
// It reads ?qbo=connected|error from the URL after the OAuth callback.

'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import {
  CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Unlink, Loader2,
} from 'lucide-react'

export default function QboSettingsPanel() {
  const supabase     = createSupabaseBrowserClient()
  const { data: orgData } = useOrg()
  const orgId        = orgData?.orgId ?? null
  const searchParams = useSearchParams()

  const [status,     setStatus]     = useState<'loading' | 'connected' | 'disconnected'>('loading')
  const [lastSync,   setLastSync]   = useState<string | null>(null)
  const [realmId,    setRealmId]    = useState<string | null>(null)
  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  // Show toast if redirected back from OAuth
  const qboParam = searchParams.get('qbo')

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organizations')
      .select('qbo_realm_id, qbo_connected_at, qbo_last_sync_at, qbo_token_expiry')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.qbo_realm_id) {
          setStatus('connected')
          setRealmId(data.qbo_realm_id)
          setLastSync(data.qbo_last_sync_at)
        } else {
          setStatus('disconnected')
        }
      })
  }, [orgId])

  const handleConnect = () => {
    window.location.href = '/api/qbo/connect'
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect QuickBooks? This will stop syncing but will not delete any data.')) return
    await supabase.from('organizations').update({
      qbo_realm_id:      null,
      qbo_access_token:  null,
      qbo_refresh_token: null,
      qbo_token_expiry:  null,
      qbo_connected_at:  null,
    }).eq('id', orgId)
    setStatus('disconnected')
    setRealmId(null)
  }

  const handleManualSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-quickbooks`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      )
      const json = await res.json()
      setSyncResult(json)
      // Update last sync time
      const { data } = await supabase
        .from('organizations')
        .select('qbo_last_sync_at')
        .eq('id', orgId)
        .single()
      if (data?.qbo_last_sync_at) setLastSync(data.qbo_last_sync_at)
    } catch (e) {
      setSyncResult({ error: String(e) })
    }
    setSyncing(false)
  }

  const fmtAgo = (d: string | null) => {
    if (!d) return 'Never'
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
    if (s < 60)    return 'Just now'
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
              <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z" fill="#2CA01C"/>
              <path d="M10 16.5l4 4 8-9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">QuickBooks Online</h3>
            <p className="text-xs text-slate-400">Two-way sync for customers, invoices, and payments</p>
          </div>
        </div>
        {status === 'connected' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> Connected
          </span>
        )}
      </div>

      {/* OAuth redirect feedback */}
      {qboParam === 'connected' && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">QuickBooks connected successfully. First sync will run tonight.</p>
        </div>
      )}
      {qboParam?.startsWith('error') && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">Connection failed. Please try again or check that your QBO credentials are set in Vercel.</p>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
        </div>
      )}

      {status === 'disconnected' && (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            Connect Valhalla RMM to your QuickBooks Online account. Customers, invoices, and payments will sync automatically every night.
          </p>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Connect QuickBooks Online
          </button>
        </div>
      )}

      {status === 'connected' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
              <p className="text-xs text-slate-400">Company ID</p>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5">{realmId}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
              <p className="text-xs text-slate-400">Last Synced</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5">{fmtAgo(lastSync)}</p>
            </div>
          </div>

          {/* Sync result */}
          {syncResult && (
            <div className={`p-3 rounded-xl text-xs font-mono ${syncResult.error ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
              {syncResult.error
                ? `Error: ${syncResult.error}`
                : JSON.stringify(syncResult.summary?.[0] ?? syncResult, null, 2)
              }
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-200 rounded-xl text-sm font-medium transition-colors"
            >
              <Unlink className="w-4 h-4" /> Disconnect
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Automatic sync runs nightly at 2am. Use <strong>Sync Now</strong> for an immediate push.
          </p>
        </div>
      )}
    </div>
  )
}
