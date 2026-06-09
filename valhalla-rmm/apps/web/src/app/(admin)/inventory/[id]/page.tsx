// @ts-nocheck
// apps/web/src/app/(admin)/inventory/[id]/page.tsx
// Device detail page — shows full hardware info and remote terminal.

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import dynamic from 'next/dynamic'
import {
  ArrowLeft, Monitor, Cpu, HardDrive, MemoryStick,
  Network, Shield, Clock, Tag, MapPin, User,
  CheckCircle2, AlertTriangle, WifiOff, Wifi,
  Calendar, DollarSign, Package,
} from 'lucide-react'

// Load RemoteTerminal client-side only (xterm.js requires browser)
const RemoteTerminal = dynamic(
  () => import('@/components/RemoteTerminal'),
  { ssr: false, loading: () => <div className="h-64 rounded-2xl bg-slate-950 animate-pulse" /> }
)

function fmtAgo(d: string | null) {
  if (!d) return 'Never'
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)    return 'Just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function InfoRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 flex-shrink-0 w-28">{label}</span>
      <span className={`text-sm text-slate-900 dark:text-white text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4">
        <Icon className="w-4 h-4 text-slate-400" />
        {title}
      </h3>
      <div>{children}</div>
    </div>
  )
}

export default function DeviceDetailPage() {
  const params  = useParams()
  const router  = useRouter()
  const id      = params?.id as string
  const supabase = createSupabaseBrowserClient()
  const { data: orgData } = useOrg()
  const orgId = orgData?.orgId ?? null

  const [device,  setDevice]  = useState<any>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('inventory_items').select('*').eq('id', id).single(),
      supabase.from('tickets').select('id,title,status,priority,created_at')
        .eq('linked_asset_id', id).order('created_at', { ascending: false }).limit(10),
    ]).then(([{ data: dev }, { data: tix }]) => {
      setDevice(dev)
      setTickets(tix ?? [])
      setLoading(false)
    })
  }, [id])

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-2 gap-4">
        {Array(4).fill(0).map((_,i) => <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-2xl" />)}
      </div>
    </div>
  )

  if (!device) return (
    <div className="max-w-5xl mx-auto text-center py-24">
      <p className="text-slate-400">Device not found</p>
      <button onClick={() => router.back()} className="mt-4 text-amber-600 hover:underline text-sm">← Back</button>
    </div>
  )

  const lastSeenMs   = device.last_seen_at ? Date.now() - new Date(device.last_seen_at).getTime() : null
  const isOnline     = lastSeenMs !== null && lastSeenMs < 2 * 3600 * 1000  // seen in last 2 hours
  const isStale      = lastSeenMs !== null && lastSeenMs >= 2 * 3600 * 1000 && lastSeenMs < 7 * 86400 * 1000
  const isOffline    = lastSeenMs === null || lastSeenMs >= 7 * 86400 * 1000
  const hasAgent     = device.source === 'agent' || !!device.hostname

  const statusColor = isOnline ? 'text-emerald-600' : isStale ? 'text-amber-600' : 'text-slate-400'
  const statusBg    = isOnline ? 'bg-emerald-500' : isStale ? 'bg-amber-400' : 'bg-slate-400'

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()}
          className="mt-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{device.name}</h1>
            {hasAgent && (
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}>
                <div className={`w-2 h-2 rounded-full ${statusBg} ${isOnline ? 'animate-pulse' : ''}`} />
                {isOnline ? 'Online' : isStale ? 'Stale' : 'Offline'}
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {[device.vendor || device.manufacturer, device.model].filter(Boolean).join(' · ')}
            {device.customer_name && ` · ${device.customer_name}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Hardware info */}
        <Section title="Hardware" icon={Monitor}>
          <InfoRow label="Hostname"     value={device.hostname}     mono />
          <InfoRow label="OS"           value={[device.os, device.os_version].filter(Boolean).join(' ')} />
          <InfoRow label="CPU"          value={device.cpu} />
          <InfoRow label="RAM"          value={device.ram_gb ? `${device.ram_gb} GB` : null} />
          <InfoRow label="Disk"         value={device.disk_gb ? `${device.disk_free_gb ?? '?'} GB free / ${device.disk_gb} GB total` : null} />
          <InfoRow label="Manufacturer" value={device.manufacturer || device.vendor} />
          <InfoRow label="Model"        value={device.model} />
          <InfoRow label="Serial"       value={device.serial_number} mono />
          <InfoRow label="Asset Tag"    value={device.asset_tag} mono />
        </Section>

        {/* Network & agent */}
        <Section title="Network & Agent" icon={Network}>
          <InfoRow label="IP Address"  value={device.ip_address}  mono />
          <InfoRow label="MAC Address" value={device.mac_address} mono />
          <InfoRow label="Last Seen"   value={device.last_seen_at ? fmtAgo(device.last_seen_at) : null} />
          <InfoRow label="Agent Ver."  value={device.agent_version} />
          <InfoRow label="Source"      value={device.source} />
          <InfoRow label="AV State"    value={device.av_state} />
          <InfoRow label="Patch Status" value={device.patch_status} />
          <InfoRow label="Online Status" value={device.online_status} />
        </Section>

        {/* Asset & ownership */}
        <Section title="Asset Details" icon={Package}>
          <InfoRow label="Category"     value={device.category} />
          <InfoRow label="Status"       value={device.status} />
          <InfoRow label="Customer"     value={device.customer_name} />
          <InfoRow label="Location"     value={device.location} />
          <InfoRow label="Quantity"     value={device.quantity} />
          <InfoRow label="Unit Cost"    value={device.unit_cost != null ? `$${device.unit_cost}` : null} />
          <InfoRow label="Purchase Date" value={fmtDate(device.purchase_date)} />
          <InfoRow label="Warranty"     value={device.warranty_expiry ? (() => {
            const days = Math.round((new Date(device.warranty_expiry).getTime() - Date.now()) / 86400000)
            return days < 0 ? `Expired (${fmtDate(device.warranty_expiry)})` : days <= 30 ? `Expiring in ${days} days` : fmtDate(device.warranty_expiry)
          })() : null} />
          {device.notes && <InfoRow label="Notes" value={device.notes} />}
        </Section>

        {/* Linked tickets */}
        <Section title="Linked Tickets" icon={Tag}>
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No tickets linked to this device</p>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => {
                const isDone  = ['resolved','closed'].includes(t.status)
                const pColors = { critical: 'bg-rose-500', high: 'bg-orange-400', medium: 'bg-amber-400', low: 'bg-emerald-400' }
                return (
                  <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${pColors[t.priority] ?? 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isDone ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>{t.title}</p>
                      <p className="text-xs text-slate-400">{t.status.replace('_',' ')} · {fmtAgo(t.created_at)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Remote Terminal — only for agent-installed devices */}
      {hasAgent && orgId ? (
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            Remote Terminal
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
              BETA
            </span>
          </h2>
          <RemoteTerminal
            deviceId={device.id}
            deviceHostname={device.hostname || device.name}
            orgId={orgId}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center">
          <Monitor className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Remote access not available</p>
          <p className="text-slate-400 text-sm mt-1">Install the Valhalla agent on this device to enable remote terminal access.</p>
        </div>
      )}
    </div>
  )
}
