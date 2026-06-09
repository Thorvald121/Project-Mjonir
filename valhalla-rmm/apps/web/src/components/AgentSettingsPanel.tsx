// @ts-nocheck
// apps/web/src/components/AgentSettingsPanel.tsx

'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import {
  Monitor, Copy, CheckCircle2, RefreshCw,
  Download, ChevronDown, ChevronUp, Loader2,
  AlertTriangle, Trash2,
} from 'lucide-react'

export default function AgentSettingsPanel() {
  const supabase          = createSupabaseBrowserClient()
  const { data: orgData } = useOrg()
  const orgId             = orgData?.orgId ?? null

  const [apiKey,      setApiKey]      = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [copied,      setCopied]      = useState(false)
  const [rotating,    setRotating]    = useState(false)
  const [deviceCount, setDeviceCount] = useState(0)
  const [customers,   setCustomers]   = useState<any[]>([])
  const [customer,    setCustomer]    = useState('')
  const [showWindows, setShowWindows] = useState(false)
  const [showMac,     setShowMac]     = useState(false)
  const [showLinux,   setShowLinux]   = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase.from('organizations').select('agent_api_key').eq('id', orgId).single()
      .then(({ data }) => { setApiKey(data?.agent_api_key ?? null); setLoading(false) })
    supabase.from('inventory_items').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('source', 'agent')
      .then(({ count }) => setDeviceCount(count ?? 0))
    supabase.from('customers').select('id,name').eq('status', 'active').eq('organization_id', orgId).order('name').limit(200)
      .then(({ data }) => setCustomers(data ?? []))
  }, [orgId])

  const copyKey = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const rotateKey = async () => {
    if (!confirm('Rotate API key?\n\nAll existing agent installations will stop checking in until you re-deploy updated scripts.')) return
    setRotating(true)
    const newKey = crypto.randomUUID()
    await supabase.from('organizations').update({ agent_api_key: newKey }).eq('id', orgId)
    setApiKey(newKey); setRotating(false)
  }

  const downloadScript = (platform: 'windows' | 'mac' | 'linux') => {
    const params = new URLSearchParams({ platform, customer })
    window.open(`/api/agent/download?${params}`, '_blank')
  }

  // ── Reusable code block ───────────────────────────────────────────────────
  const CodeBlock = ({ code }: { code: string }) => {
    const [copiedCode, setCopiedCode] = useState(false)
    return (
      <div className="relative group">
        <pre className="bg-slate-900 dark:bg-black text-emerald-400 text-xs p-3 rounded-xl overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
          {code}
        </pre>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-all text-[10px] flex items-center gap-1">
          {copiedCode ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copiedCode ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  // ── Per-platform section ──────────────────────────────────────────────────
  const PlatformSection = ({
    label, open, onToggle, platform, installNote, installCmd, uninstallCmd,
  }: {
    label: string; open: boolean; onToggle: () => void
    platform: 'windows' | 'mac' | 'linux'
    installNote: string; installCmd: string; uninstallCmd: string
  }) => (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
        <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">

          {/* Customer picker + download */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={customer} onChange={e => setCustomer(e.target.value)}
              className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— No customer (unassigned) —</option>
              {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={() => downloadScript(platform)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
              <Download className="w-4 h-4" /> Download Script
            </button>
          </div>

          <p className="text-xs text-slate-400">{installNote}</p>

          {/* Install */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Install (run once)</p>
            <CodeBlock code={installCmd} />
          </div>

          {/* Uninstall */}
          <div>
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Uninstall / Remove
            </p>
            <CodeBlock code={uninstallCmd} />
            <p className="text-xs text-slate-400 mt-1.5">
              Removes the scheduled task from the device. The device record stays in Valhalla until you manually delete it from Inventory.
            </p>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center flex-shrink-0">
            <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Asset Agent</h3>
            <p className="text-xs text-slate-400">Daily device check-ins — Windows, macOS, and Linux</p>
          </div>
        </div>
        {deviceCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            {deviceCount} device{deviceCount !== 1 ? 's' : ''} reporting
          </span>
        )}
      </div>

      <p className="text-sm text-slate-500 mb-5">
        Install the agent on client machines to get daily hardware inventory, disk usage, and online/offline status — independent of Xcitium. The agent runs silently and checks in every morning at 8am.
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
          <button onClick={rotateKey} disabled={rotating} title="Rotate key — existing agents will need re-deployed scripts"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-50">
            {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rotate
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">The key is embedded in downloaded scripts automatically. Rotate it only if compromised.</p>
      </div>

      {/* Platform sections */}
      <div className="space-y-3">

        <PlatformSection
          label="Windows — PowerShell"
          open={showWindows}
          onToggle={() => setShowWindows(p => !p)}
          platform="windows"
          installNote="Download the script, right-click it, and choose Run as Administrator. It will install itself as a daily scheduled task automatically."
          installCmd={`# Right-click the downloaded valhalla-agent.ps1 → Run as Administrator\n# Or from an admin PowerShell terminal:\n.\\valhalla-agent.ps1 -Install`}
          uninstallCmd={`# From any PowerShell terminal on the device:\n.\\valhalla-agent.ps1 -Uninstall\n\n# Or if the script has been removed, unregister directly:\nUnregister-ScheduledTask -TaskName "ValhallaIT-AssetAgent" -Confirm:$false`}
        />

        <PlatformSection
          label="macOS — Bash"
          open={showMac}
          onToggle={() => setShowMac(p => !p)}
          platform="mac"
          installNote="Download the script, then run the install command below in Terminal. It installs as a LaunchAgent that runs daily at 8am."
          installCmd={`# In Terminal:\nchmod +x ~/Downloads/valhalla-agent-mac.sh\nsudo bash ~/Downloads/valhalla-agent-mac.sh --install`}
          uninstallCmd={`bash /usr/local/valhalla-it/valhalla-agent.sh --uninstall`}
        />

        <PlatformSection
          label="Linux — Bash"
          open={showLinux}
          onToggle={() => setShowLinux(p => !p)}
          platform="linux"
          installNote="Download the script, then run the install command below as root. It installs as a daily cron job."
          installCmd={`# In terminal as root or with sudo:\nchmod +x valhalla-agent-linux.sh\nsudo bash valhalla-agent-linux.sh --install`}
          uninstallCmd={`sudo bash /usr/local/valhalla-it/valhalla-agent.sh --uninstall`}
        />
      </div>

      {/* Remote access roadmap note */}
      <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
        <AlertTriangle className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-violet-700 dark:text-violet-400">
          <strong>Remote access coming soon.</strong> The agent is being extended to support browser-based SSH and remote terminal access directly from the device detail page.
        </p>
      </div>
    </div>
  )
}
