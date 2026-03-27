// @ts-nocheck
// Public agent download page — no auth required.
// URL: /agent?org=ORG_UUID
// Clients visit this URL, see their org-specific install commands, and download scripts.
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Terminal, Download, Copy, CheckCircle2,
  Monitor, Apple, Server, Loader2, AlertCircle,
  RefreshCw, Clock,
} from 'lucide-react'

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const FUNCTION_URL = 'https://yetrdrgagfovphrerpie.supabase.co/functions/v1/register-agent'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <button onClick={copy}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        copied ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
      }`}>
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="flex items-start justify-between gap-3 bg-slate-950 rounded-xl p-4 font-mono text-sm text-emerald-400 break-all">
        <span className="flex-1">{code}</span>
        <CopyButton text={code} />
      </div>
    </div>
  )
}

function AgentPageContent() {
  const searchParams = useSearchParams()
  const orgId        = searchParams.get('org') || ''
  const customerId   = searchParams.get('customer') || ''
  const customerName = searchParams.get('name') || ''
  const supabase     = createSupabaseBrowserClient()

  const [org,      setOrg]      = useState<any>(null)
  const [loading,  setLoading]  = useState(!!orgId)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<'windows'|'mac'|'linux'>('windows')

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    supabase.from('organizations').select('id,name,logo_url,brand_color')
      .eq('id', orgId).single()
      .then(({ data }) => {
        if (data) setOrg(data)
        else setNotFound(true)
        setLoading(false)
      })
  }, [orgId])

  const brandColor = org?.brand_color || '#f59e0b'

  // Build customer suffix for commands
  const custSuffix = customerId
    ? ` -CustomerId "${customerId}" -CustomerName "${customerName}"`
    : ''
  const custSuffixUnix = customerId
    ? ` --customer-id "${customerId}" --customer-name "${customerName}"`
    : ''

  const winCmd  = `Invoke-WebRequest -Uri "https://valhalla-rmm.com/agent/register-windows.ps1" -OutFile register-windows.ps1; .\register-windows.ps1 -OrgId "${orgId}" -ApiKey "${ANON_KEY}"${custSuffix}`
  const macCmd  = `curl -fsSL "https://valhalla-rmm.com/agent/register-macos-linux.sh" | bash -s -- --org-id "${orgId}" --api-key "${ANON_KEY}"${custSuffixUnix}`
  const linuxCmd = macCmd

  const scheduleWin   = `$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NonInteractive -Command \\"${winCmd}\\""\n$trigger = New-ScheduledTaskTrigger -Daily -At 8am\nRegister-ScheduledTask -TaskName "Valhalla RMM Agent" -Action $action -Trigger $trigger -RunLevel Highest`
  const scheduleMac   = `(crontab -l 2>/dev/null; echo "0 8 * * * curl -fsSL \\"https://valhalla-rmm.com/agent/register-macos-linux.sh\\" | bash -s -- --org-id \\"${orgId}\\" --api-key \\"${ANON_KEY}\\"${custSuffixUnix}") | crontab -`

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )

  if (notFound || (!loading && !orgId)) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
      <div>
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Invalid Link</h1>
        <p className="text-slate-400">This agent download link is invalid or has expired. Contact your IT provider for a new link.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="logo" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
              style={{ background: brandColor }}>
              {org?.name?.[0] ?? 'V'}
            </div>
          )}
          <div>
            <p className="font-bold text-white text-sm">{org?.name}</p>
            <p className="text-xs text-slate-500">Device Registration Agent</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-2"
            style={{ background: brandColor }}>
            <Terminal className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Register Your Device</h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Run the one-line command below to register this computer with {org?.name}.
            It takes about 5 seconds and collects basic hardware info to help your IT team support you better.
          </p>
          {customerName && (
            <div className="inline-flex items-center gap-2 bg-slate-800 rounded-full px-4 py-1.5 text-sm text-slate-300">
              <Server className="w-3.5 h-3.5 text-amber-400" />
              Registering under: <strong className="text-white">{customerName}</strong>
            </div>
          )}
        </div>

        {/* What it collects */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-300 mb-3">What gets collected</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              'Computer name', 'Operating system', 'CPU model',
              'RAM amount', 'Disk size & free space', 'IP address',
              'MAC address', 'Serial number', 'Logged-in username',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-3">No files are read. No passwords are collected. No software is installed.</p>
        </div>

        {/* OS tabs */}
        <div className="space-y-4">
          <div className="flex gap-2">
            {[
              { id: 'windows', label: 'Windows',      icon: Monitor },
              { id: 'mac',     label: 'macOS',         icon: Apple  },
              { id: 'linux',   label: 'Linux',         icon: Server },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
                style={activeTab === id ? { background: brandColor } : {}}>
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Windows */}
          {activeTab === 'windows' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                  Open PowerShell as Administrator
                </p>
                <p className="text-xs text-slate-500">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Win + X</kbd> then click <strong className="text-slate-300">Terminal (Admin)</strong> or <strong className="text-slate-300">Windows PowerShell (Admin)</strong></p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                  Paste and run this command
                </p>
                <CodeBlock code={winCmd} />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-violet-400" />
                  Optional: Schedule daily updates
                </p>
                <p className="text-xs text-slate-500">Run this to keep your device info up to date automatically:</p>
                <CodeBlock code={scheduleWin} />
              </div>
            </div>
          )}

          {/* macOS */}
          {activeTab === 'mac' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                  Open Terminal
                </p>
                <p className="text-xs text-slate-500">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Cmd + Space</kbd>, type <strong className="text-slate-300">Terminal</strong>, press Enter</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                  Paste and run this command
                </p>
                <CodeBlock code={macCmd} />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-violet-400" />
                  Optional: Schedule daily updates
                </p>
                <CodeBlock code={scheduleMac} />
              </div>
            </div>
          )}

          {/* Linux */}
          {activeTab === 'linux' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300">Open a terminal and run:</p>
                <CodeBlock code={linuxCmd} />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-violet-400" />
                  Optional: Schedule daily updates
                </p>
                <CodeBlock code={scheduleMac} />
              </div>
            </div>
          )}
        </div>

        {/* Success indicator */}
        <div className="bg-emerald-950/40 border border-emerald-800 rounded-2xl p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">After running the command</p>
            <p className="text-xs text-emerald-700 mt-1">Your device will appear in {org?.name}'s inventory within a few seconds. You can close this window once it says "Success".</p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-700 pb-4">Powered by Valhalla RMM</p>
      </div>
    </div>
  )
}

export default function AgentPage() {
  return <Suspense><AgentPageContent /></Suspense>
}