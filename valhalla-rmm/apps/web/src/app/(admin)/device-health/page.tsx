// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Monitor, AlertTriangle, CheckCircle2, Clock, HardDrive,
  Cpu, MemoryStick, Wifi, RefreshCw, WifiOff, Search,
  ArrowUpRight, Users, Package,
} from 'lucide-react'

function fmtAgo(d) {
  if (!d) return 'Never'
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

function diskPct(item) {
  if (!item.disk_gb || !item.disk_free_gb) return null
  return Math.round(((item.disk_gb - item.disk_free_gb) / item.disk_gb) * 100)
}

function getDeviceStatus(item) {
  if (!item.last_seen_at) return 'unregistered'
  const daysSince = (Date.now() - new Date(item.last_seen_at).getTime()) / 86400000
  if (daysSince > 7)  return 'offline'
  if (daysSince > 1)  return 'stale'
  const used = diskPct(item)
  if (used !== null && used >= 90) return 'critical'
  if (used !== null && used >= 75) return 'warning'
  return 'online'
}

const STATUS_CFG = {
  online:       { label: 'Online',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
  warning:      { label: 'Disk Warning', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',   dot: 'bg-amber-500'   },
  critical:     { label: 'Disk Critical',cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',       dot: 'bg-rose-500'    },
  stale:        { label: 'Stale',        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',   dot: 'bg-amber-400'   },
  offline:      { label: 'Offline',      cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',      dot: 'bg-slate-400'   },
  unregistered: { label: 'No Agent',     cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',      dot: 'bg-slate-300'   },
}

function DiskBar({ item }) {
  const pct = diskPct(item)
  if (pct === null) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className={pct >= 75 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-400'}>{pct}%</span>
        <span className="text-slate-400">{item.disk_free_gb}GB free</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden w-24">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function DeviceHealthPage() {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()
  const [devices,   setDevices]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [stFilter,  setStFilter]  = useState('all')
  const [custFilter,setCustFilter]= useState('all')
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_items')
      .select('id,name,hostname,os,cpu,ram_gb,disk_gb,disk_free_gb,ip_address,last_seen_at,agent_version,customer_name,customer_id,status,category,manufacturer,model')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(500)
    setDevices(data ?? [])
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const allCustomers = useMemo(() => [...new Set(devices.map(d => d.customer_name).filter(Boolean))].sort(), [devices])

  const filtered = useMemo(() => devices.filter(d => {
    const st = getDeviceStatus(d)
    if (stFilter   !== 'all' && st !== stFilter)                   return false
    if (custFilter !== 'all' && d.customer_name !== custFilter)    return false
    if (search) {
      const q = search.toLowerCase()
      return (d.name||'').toLowerCase().includes(q) ||
             (d.hostname||'').toLowerCase().includes(q) ||
             (d.os||'').toLowerCase().includes(q) ||
             (d.customer_name||'').toLowerCase().includes(q) ||
             (d.ip_address||'').toLowerCase().includes(q)
    }
    return true
  }), [devices, stFilter, custFilter, search])

  const stats = useMemo(() => {
    const all = devices.map(d => ({ ...d, st: getDeviceStatus(d) }))
    return {
      total:       all.length,
      online:      all.filter(d => d.st === 'online').length,
      warning:     all.filter(d => d.st === 'warning').length,
      critical:    all.filter(d => d.st === 'critical').length,
      offline:     all.filter(d => d.st === 'offline' || d.st === 'stale').length,
      unregistered:all.filter(d => d.st === 'unregistered').length,
      diskAlerts:  all.filter(d => { const p = diskPct(d); return p !== null && p >= 75 }).length,
    }
  }, [devices])

  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-5 h-5 text-violet-500" /> Device Health
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time status of all registered endpoints · Last refresh: {fmtAgo(lastRefresh.toISOString())}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Devices',  value: stats.total,        color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/50',        filter: 'all' },
          { label: 'Online',         value: stats.online,       color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', filter: 'online' },
          { label: 'Disk Alerts',    value: stats.diskAlerts,   color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-950/30',     filter: 'warning' },
          { label: 'Offline / Stale',value: stats.offline,      color: 'text-slate-500 dark:text-slate-400',     bg: 'bg-slate-100 dark:bg-slate-800',       filter: 'offline' },
          { label: 'No Agent',       value: stats.unregistered, color: 'text-slate-400',                          bg: 'bg-slate-50 dark:bg-slate-800/50',     filter: 'unregistered' },
        ].map(k => (
          <button key={k.label} onClick={() => setStFilter(stFilter === k.filter ? 'all' : k.filter)}
            className={`${k.bg} rounded-xl border p-4 text-left transition-all ${
              stFilter === k.filter ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'
            }`}>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
          </button>
        ))}
      </div>

      {/* Alerts banner */}
      {(stats.critical > 0 || stats.diskAlerts > 0) && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">
            {stats.critical > 0 && <strong>{stats.critical} device{stats.critical > 1 ? 's' : ''} with critical disk usage (&gt;90%)</strong>}
            {stats.critical > 0 && stats.diskAlerts > stats.critical && ' · '}
            {stats.diskAlerts > stats.critical && `${stats.diskAlerts - stats.critical} device${stats.diskAlerts - stats.critical > 1 ? 's' : ''} with high disk usage (&gt;75%)`}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, hostname, OS, IP…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={stFilter} onChange={e => setStFilter(e.target.value)} className={sel}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="warning">Disk Warning</option>
          <option value="critical">Disk Critical</option>
          <option value="stale">Stale</option>
          <option value="offline">Offline</option>
          <option value="unregistered">No Agent</option>
        </select>
        <select value={custFilter} onChange={e => setCustFilter(e.target.value)} className={sel}>
          <option value="all">All Customers</option>
          {allCustomers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} device{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Device table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array(8).fill(0).map((_,i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-40" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-24" />
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-24" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Monitor className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{devices.length === 0 ? 'No devices registered yet' : 'No devices match your filters'}</p>
            {devices.length === 0 && (
              <button onClick={() => router.push('/inventory')}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
                <Package className="w-4 h-4" /> Set up Agent
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold w-3"></th>
                  <th className="px-4 py-3 text-left font-semibold">Device</th>
                  <th className="px-4 py-3 text-left font-semibold">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold">OS</th>
                  <th className="px-4 py-3 text-left font-semibold">CPU / RAM</th>
                  <th className="px-4 py-3 text-left font-semibold">Disk Usage</th>
                  <th className="px-4 py-3 text-left font-semibold">IP</th>
                  <th className="px-4 py-3 text-left font-semibold">Last Seen</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(device => {
                  const st  = getDeviceStatus(device)
                  const cfg = STATUS_CFG[st]
                  const daysSince = device.last_seen_at
                    ? (Date.now() - new Date(device.last_seen_at).getTime()) / 86400000
                    : null
                  return (
                    <tr key={device.id}
                      onClick={() => router.push(`/inventory`)}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors cursor-pointer">
                      {/* Status dot */}
                      <td className="px-4 py-3">
                        <span className={`block w-2.5 h-2.5 rounded-full ${cfg.dot} ${st === 'online' ? 'shadow-[0_0_6px_1px]  shadow-emerald-400/60' : ''}`} />
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{device.hostname || device.name}</p>
                        {device.model && <p className="text-xs text-slate-400">{device.manufacturer ? `${device.manufacturer} ` : ''}{device.model}</p>}
                      </td>
                      {/* Customer */}
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {device.customer_name || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      {/* OS */}
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                        {device.os || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      {/* CPU / RAM */}
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {device.ram_gb && <p>{device.ram_gb}GB RAM</p>}
                        {device.cpu && <p className="truncate max-w-[140px] text-slate-400">{device.cpu}</p>}
                      </td>
                      {/* Disk */}
                      <td className="px-4 py-3">
                        <DiskBar item={device} />
                      </td>
                      {/* IP */}
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                        {device.ip_address || <span className="text-slate-300 dark:text-slate-600 font-sans">—</span>}
                      </td>
                      {/* Last seen */}
                      <td className="px-4 py-3 text-xs">
                        <span className={
                          daysSince === null       ? 'text-slate-300 dark:text-slate-600' :
                          daysSince > 7            ? 'text-rose-500 font-semibold' :
                          daysSince > 1            ? 'text-amber-500 font-semibold' :
                          'text-slate-500 dark:text-slate-400'
                        }>
                          {fmtAgo(device.last_seen_at)}
                        </span>
                      </td>
                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}