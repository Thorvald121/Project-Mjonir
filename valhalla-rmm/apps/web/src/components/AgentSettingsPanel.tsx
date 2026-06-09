// @ts-nocheck
// apps/web/src/components/AgentSettingsPanel.tsx
// Add this to Settings → Integrations section

'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import {
  Monitor, Copy, CheckCircle2, RefreshCw, Download,
  Terminal, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'

export default function AgentSettingsPanel() {
  const supabase            = createSupabaseBrowserClient()
  const { data: orgData }   = useOrg()
  const orgId               = orgData?.orgId ?? null

  const [apiKey,       setApiKey]       = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [copied,       setCopied]       = useState(false)
  const [rotating,     setRotating]     = useState(false)
  const [deviceCount,  setDeviceCount]  = useState<number>(0)
  const [showWindows,  setShowWindows]  = useState(false)
  const [showMac,      setShowMac]      = useState(false)

  useEffect(() => {
    if (!orgId) return
    loadKey()
    supabase.from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('source', 'agent')
      .then(({ count }) => setDeviceCount(count ?? 0))
  }, [orgId])

  const loadKey = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('organizations')
      .select('agent_api_key')
      .eq('id', orgId)
      .single()
    setApiKey(data?.agent_api_key ?? null)
    setLoading(false)
  }

  const copyKey = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const rotateKey = async () => {
    if (!confirm('Rotate API key? All existing agent installations will stop checking in until updated with the new key.')) return
    setRotating(true)
    const newKey = crypto.randomUUID()
    await supabase.from('organizations').update({ agent_api_key: newKey }).eq('id', orgId)
    setApiKey(newKey)
    setRotating(false)
  }

  const windowsInstall = apiKey
    ? `.\\valhalla-agent.ps1 -ApiKey "${apiKey}" -CustomerName "Client Name Here" -Install`
    : ''

  const macInstall = apiKey
    ? `bash valhalla-agent.sh --api-key "${apiKey}" --customer "Client Name Here" --install`
    : ''

  const Code = ({ children }: { children: string }) => (
    <div className="relative group">
      <pre className="bg-slate-900 dark:bg-black text-emerald-400 text-xs p-3 rounded-xl overflow-x-auto font-mono leading-relaxed">
        {children}
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(children)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-all"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center flex-shrink-0">
            <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Asset Agent</h3>
            <p className="text-xs text-slate-400">Daily device check-ins for Windows, macOS, and Linux</p>
          </div>
        </div>
        {deviceCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            {deviceCount} device{deviceCount !== 1 ? 's' : ''} reporting
          </span>
        )}
      </div>

      <p className="text-sm text-slate-500 mb-5">
        Install the agent on client machines to get daily hardware inventory, disk usage, and online status — completely independent of Xcitium. The agent runs silently in the background and checks in every morning at 8am.
      </p>

      {/* API Key */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Organization API Key</label>
        <div className="flex items-center gap-2 mt-2">
          {loading ? (
            <div className="flex-1 h-9 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ) : (
            <code className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 truncate">
              {apiKey}
            </code>
          )}
          <button onClick={copyKey} disabled={!apiKey}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={rotateKey} disabled={rotating}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:border-rose-200 dark:hover:text-rose-400 rounded-lg transition-colors disabled:opacity-50"
            title="Rotate key — all agents will need to be updated">
            {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rotate
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">Keep this key private. Rotate it if a device is decommissioned or the key is exposed.</p>
      </div>

      {/* Windows instructions */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-3">
        <button onClick={() => setShowWindows(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">Windows — PowerShell</span>
          </div>
          {showWindows ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showWindows && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-slate-500">Download the PowerShell script, then run as Administrator to install as a daily scheduled task. Replace <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">Client Name Here</code> with the actual customer name in Valhalla.</p>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Install command (run as Administrator)</p>
              <Code>{windowsInstall}</Code>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">One-time check-in (no install)</p>
              <Code>{`.\\valhalla-agent.ps1 -ApiKey "${apiKey ?? 'YOUR_API_KEY'}" -CustomerName "Client Name Here"`}</Code>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <span className="text-xs text-amber-700 dark:text-amber-400">Administrator rights required for the -Install flag. Regular check-ins don't need admin.</span>
            </div>
          </div>
        )}
      </div>

      {/* macOS / Linux instructions */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <button onClick={() => setShowMac(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">macOS / Linux — Bash</span>
          </div>
          {showMac ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showMac && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-slate-500">Download the bash script, make it executable, then run with --install. On macOS it installs as a LaunchAgent; on Linux it installs as a cron job.</p>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Install command</p>
              <Code>{`chmod +x valhalla-agent.sh\n${macInstall}`}</Code>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">One-time check-in (no install)</p>
              <Code>{`bash valhalla-agent.sh --api-key "${apiKey ?? 'YOUR_API_KEY'}" --customer "Client Name Here"`}</Code>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}