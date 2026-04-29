// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Monitor, AlertTriangle, CheckCircle2, Clock, Shield,
  ShieldAlert, ShieldCheck, RefreshCw, Search, Wifi,
  WifiOff, Package, ChevronDown,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAgo(d) {
  if (!d) return 'Never'
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60)    return 'Just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtOs(osType) {
  const map = {
    windows: 'Windows', macos: 'macOS', linux: 'Linux',
    ios: 'iOS', android: 'Android', apple_tv: 'Apple TV', unknown: 'Unknown',
  }
  return map[osType] ?? osType ?? '—'
}

// Compute a display status from Xcitium fields
function getStatus(item) {
  const isOnline = item.online_status === 'online'
  const av       = item.av_state
  const patch    = item.patch_status

  if (!item.xcitium_synced_at && !item.online_status) return 'no_data'
  if (!isOnline) return 'offline'
  if (av === 'inactive' || av === 'not_installed') return 'av_issue'
  if (patch === 'failed') return 'patch_failed'
  if (patch === 'pending') return 'patch_pending'
  return 'healthy'
}

const STATUS_CFG = {
  healthy:      { label: 'Healthy',       dot: 'bg-emerald-500', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  offline:      { label: 'Offline',       dot: 'bg-slate-400',   cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  av_issue:     { label: 'AV Issue',      dot: 'bg-rose-500',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  patch_failed: { label: 'Patch Failed',  dot: 'bg-rose-500',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  patch_pending:{ label: 'Patches Pending',dot: 'bg-amber-500',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  no_data:      { label: 'No Data',       dot: 'bg-slate-300',   cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
}

const AV_CFG = {
  active:        { label: 'Active',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  inactive:      { label: 'Inactive',      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  not_installed: { label: 'Not Installed', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  unknown:       { label: '—',             cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
}

const PATCH_CFG = {
  up_to_date: { label: 'Up to date', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  failed:     { label: 'Failed',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  unknown:    { label: '—',          cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' },
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, bg, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all w-full
        ${active
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 shadow-md'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
        }`}>
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeviceHealthPage() {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()

  const [devices,    setDevices]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [lastSync,   setLastSync]   = useState(null)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')   // all | healthy | offline | av_issue | patch_issue
  const [customerF,  setCustomerF]  = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('inventory_items')
      .select('id, name, customer_id, customer_name, os_type, online_status, av_state, patch_status, last_seen_xcitium, xcitium_synced_at, model, serial_number, category, source')
      .order('name')
    setDevices(data ?? [])
    const latest = (data ?? []).reduce((m, d) => d.xcitium_synced_at > (m ?? '') ? d.xcitium_synced_at : m, null)
    setLastSync(latest)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const enriched = useMemo(() => devices.map(d => ({ ...d, _status: getStatus(d) })), [devices])

  const customers = useMemo(() => {
    const names = [...new Set(enriched.map(d => d.customer_name).filter(Boolean))]
    return names.sort()
  }, [enriched])

  const filtered = useMemo(() => {
    return enriched.filter(d => {
      const matchSearch  = !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.customer_name?.toLowerCase().includes(search.toLowerCase())
      const matchCustomer = customerF === 'all' || d.customer_name === customerF
      const matchFilter  =
        filter === 'all'         ? true
        : filter === 'healthy'   ? d._status === 'healthy'
        : filter === 'offline'   ? d._status === 'offline'
        : filter === 'av_issue'  ? (d._status === 'av_issue')
        : filter === 'patch_issue' ? (d._status === 'patch_failed' || d._status === 'patch_pending')
        : true
      return matchSearch && matchCustomer && matchFilter
    })
  }, [enriched, search, filter, customerF])

  // KPI counts
  const total       = enriched.length
  const online      = enriched.filter(d => d.online_status === 'online').length
  const offline     = enriched.filter(d => d.online_status === 'offline').length
  const avIssues    = enriched.filter(d => d.av_state === 'inactive' || d.av_state === 'not_installed').length
  const patchIssues = enriched.filter(d => d.patch_status === 'failed' || d.patch_status === 'pending').length

  if (loading) return (
    <div className="max-w-6xl space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-5 gap-3">
        {Array(5).fill(0).map((_, i) => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
      </div>
      <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Device Health</h1>
          {lastSync && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last synced from Xcitium: {fmtAgo(lastSync)}
            </p>
          )}
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={Monitor}     label="Total Devices"  value={total}       color="text-slate-600 dark:text-slate-300"  bg="bg-slate-100 dark:bg-slate-800"          active={filter === 'all'}          onClick={() => setFilter('all')} />
        <KpiCard icon={Wifi}        label="Online"         value={online}      color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/30"  active={filter === 'healthy'}      onClick={() => setFilter('healthy')} />
        <KpiCard icon={WifiOff}     label="Offline"        value={offline}     color="text-slate-500"   bg="bg-slate-100 dark:bg-slate-800"          active={filter === 'offline'}      onClick={() => setFilter('offline')} />
        <KpiCard icon={ShieldAlert} label="AV Issues"      value={avIssues}    color="text-rose-600"    bg="bg-rose-50 dark:bg-rose-950/30"          active={filter === 'av_issue'}     onClick={() => setFilter('av_issue')} />
        <KpiCard icon={Package}     label="Patch Issues"   value={patchIssues} color="text-amber-600"   bg="bg-amber-50 dark:bg-amber-950/30"        active={filter === 'patch_issue'}  onClick={() => setFilter('patch_issue')} />
      </div>

      {/* Alert banners */}
      {avIssues > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
            {avIssues} device{avIssues > 1 ? 's' : ''} with AV not active — review immediately
          </p>
        </div>
      )}
      {patchIssues > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {patchIssues} device{patchIssues > 1 ? 's' : ''} with pending or failed patches
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search devices or customers…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={customerF}
          onChange={e => setCustomerF(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="all">All Customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Device Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_1fr_120px_120px_120px_140px] gap-4 px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <div className="w-3" />
          <div>Device</div>
          <div>Customer</div>
          <div>OS</div>
          <div>AV</div>
          <div>Patches</div>
          <div>Last Seen</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Monitor className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No devices match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(device => {
              const st      = STATUS_CFG[device._status] ?? STATUS_CFG.no_data
              const avCfg   = AV_CFG[device.av_state]   ?? AV_CFG.unknown
              const paCfg   = PATCH_CFG[device.patch_status] ?? PATCH_CFG.unknown
              const isOnline = device.online_status === 'online'

              return (
                <div key={device.id}
                  onClick={() => router.push(`/inventory`)}
                  className="grid grid-cols-[auto_1fr_1fr_120px_120px_120px_140px] gap-4 items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors">

                  {/* Status dot */}
                  <div className="flex items-center justify-center w-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${st.dot} ${isOnline ? 'shadow-[0_0_6px_currentColor]' : ''}`} />
                  </div>

                  {/* Device name + model */}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{device.name}</p>
                    {device.model && <p className="text-xs text-slate-400 truncate">{device.model}</p>}
                  </div>

                  {/* Customer */}
                  <div className="min-w-0">
                    {device.customer_name ? (
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{device.customer_name}</p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Unassigned</p>
                    )}
                  </div>

                  {/* OS */}
                  <div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {fmtOs(device.os_type)}
                    </span>
                  </div>

                  {/* AV state */}
                  <div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${avCfg.cls}`}>
                      {avCfg.label}
                    </span>
                  </div>

                  {/* Patch status */}
                  <div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${paCfg.cls}`}>
                      {paCfg.label}
                    </span>
                  </div>

                  {/* Last seen */}
                  <div className="text-xs text-slate-500">
                    {device.last_seen_xcitium ? fmtAgo(device.last_seen_xcitium) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Showing {filtered.length} of {total} devices</span>
            <span>
              {online} online · {offline} offline
            </span>
          </div>
        )}
      </div>
    </div>
  )
}