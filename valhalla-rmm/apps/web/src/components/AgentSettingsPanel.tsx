// @ts-nocheck
// apps/web/src/components/AgentSettingsPanel.tsx

'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import {
  Monitor, Copy, CheckCircle2, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Trash2, Download,
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
  const [showLinux,   setShowLinux]   = useState(true)   // open by default

  useEffect(() => {
    if (!orgId) return
    supabase.from('organizations').select('agent_api_key').eq('id', orgId).single()
      .then(({ data }) => { setApiKey(data?.agent_api_key ?? null); setLoading(false) })
    supabase.from('inventory_items').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('source', 'agent')
      .then(({ count }) => setDeviceCount(count ?? 0))
    supabase.from('customers').select('id,name').eq('status', 'active')
      .eq('organization_id', orgId).order('name').limit(200)
      .then(({ data }) => setCustomers(data ?? []))
  }, [orgId])

  const copyKey = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const rotateKey = async () => {
    if (!confirm('Rotate API key?\n\nAll existing agents will stop checking in until you re-deploy their scripts.')) return
    setRotating(true)
    const newKey = crypto.randomUUID()
    await supabase.from('organizations').update({ agent_api_key: newKey }).eq('id', orgId)
    setApiKey(newKey); setRotating(false)
  }

  const downloadScript = (platform: 'linux' | 'mac' | 'windows') => {
    const params = new URLSearchParams({ platform, customer })
    window.open(`/api/agent/download?${params}`, '_blank')
  }

  // ── Reusable code block ───────────────────────────────────────────────────
  const CodeBlock = ({ code }: { code: string }) => {
    const [c, setC] = useState(false)
    return (
      <div className="relative group">
        <pre className="bg-slate-900 dark:bg-black text-emerald-400 text-xs p-3 rounded-xl overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all select-all">{code}</pre>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setC(true); setTimeout(() => setC(false), 2000) }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-all text-[10px] flex items-center gap-1">
          {c ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {c ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  // ── Platform section ──────────────────────────────────────────────────────
  const PlatformSection = ({ label, open, onToggle, platform, installCmd, uninstallCmd, note }) => (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
        <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">

          {/* Customer picker + download */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={customer} onChange={e => setCustomer(e.target.value)}
              className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— No customer (unassigned) —</option>
              {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={() => downloadScript(platform)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
              <Download className="w-4 h-4" /> Download Script
            </button>
          </div>

          {note && <p className="text-xs text-slate-400">{note}</p>}

          {/* Install */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Install — agent + remote access daemon
            </p>
            <CodeBlock code={installCmd} />
          </div>

          {/* Uninstall */}
          <div>
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Uninstall
            </p>
            <CodeBlock code={uninstallCmd} />
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
            <p className="text-xs text-slate-400 mt-0.5">
              Daily inventory check-ins + remote terminal — Windows, macOS, Linux
            </p>
          </div>
        </div>
        {deviceCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 flex-shrink-0">
            {deviceCount} device{deviceCount !== 1 ? 's' : ''} reporting
          </span>
        )}
      </div>

      {/* How it works */}
      <div className="mb-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">How it works</p>
        <ol className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <li><span className="font-semibold text-slate-700 dark:text-slate-300">1.</span> Select a customer, click <strong>Download Script</strong></li>
          <li><span className="font-semibold text-slate-700 dark:text-slate-300">2.</span> Copy the script to the device and run the install command below</li>
          <li><span className="font-semibold text-slate-700 dark:text-slate-300">3.</span> The script registers the device, saves config, and installs the remote access daemon — automatically</li>
          <li><span className="font-semibold text-slate-700 dark:text-slate-300">4.</span> Device appears in Inventory. Click it to open a remote terminal</li>
        </ol>
      </div>

      {/* API Key */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Organization API Key</label>
        <div className="flex items-center gap-2 mt-2">
          {loading
            ? <div className="flex-1 h-9 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            : <code className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{apiKey}</code>
          }
          <button onClick={copyKey} disabled={!apiKey}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={rotateKey} disabled={rotating} title="Rotate key — existing agents will need re-deployed scripts"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-50">
            {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rotate
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Embedded automatically in downloaded scripts. Only rotate if compromised.
        </p>
      </div>

      {/* Platform sections */}
      <div className="space-y-3">
        <PlatformSection
          label="Linux — Bash"
          open={showLinux}
          onToggle={() => setShowLinux(p => !p)}
          platform="linux"
          note="Download the script to the device, then run the command below as root. Handles everything in one step."
          installCmd={`sudo bash valhalla-agent-linux.sh --install`}
          uninstallCmd={`sudo bash /usr/local/valhalla-it/valhalla-agent.sh --uninstall`}
        />

        <PlatformSection
          label="macOS — Bash"
          open={showMac}
          onToggle={() => setShowMac(p => !p)}
          platform="mac"
          note="Download the script, then run the command below in Terminal."
          installCmd={`sudo bash valhalla-agent-mac.sh --install`}
          uninstallCmd={`sudo bash /usr/local/valhalla-it/valhalla-agent.sh --uninstall`}
        />

        <PlatformSection
          label="Windows — PowerShell"
          open={showWindows}
          onToggle={() => setShowWindows(p => !p)}
          platform="windows"
          note="Download the script, right-click it and choose Run as Administrator. Or run the command below in an admin PowerShell."
          installCmd={`.\\valhalla-agent.ps1 -Install`}
          uninstallCmd={`.\\valhalla-agent.ps1 -Uninstall`}
        />
      </div>
    </div>
  )
}
