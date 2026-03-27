// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, X, Loader2, CheckCircle2, AlertCircle, Clock,
  ExternalLink, RefreshCw, Trash2, Globe, Shield,
  Activity, ChevronDown, ChevronUp,
} from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => { if (!tables.length || tables.includes(e.detail?.table)) ref.current() }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function statusColor(s) {
  if (s === 'up')      return 'text-emerald-600 dark:text-emerald-400'
  if (s === 'down')    return 'text-rose-600 dark:text-rose-400'
  return 'text-slate-400'
}
function statusBg(s) {
  if (s === 'up')   return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
  if (s === 'down') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}
function fmtMs(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms/1000).toFixed(1)}s`
}
function sslDays(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

// ── Add Monitor Dialog ────────────────────────────────────────────────────────
function AddMonitorDialog({ open, onClose, onSaved, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [form,   setForm]   = useState({ name: '', url: '', type: 'http', check_interval: '5', customer_id: '' })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm({ name: '', url: '', type: 'http', check_interval: '5', customer_id: '' })
    setErr(null)
  }, [open])

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) { setErr('Name and URL are required'); return }
    let url = form.url.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === form.customer_id)
    const { error } = await supabase.from('monitors').insert({
      organization_id: orgId,
      customer_id:     form.customer_id || null,
      customer_name:   cust?.name || null,
      name:            form.name.trim(),
      url,
      type:            form.type,
      check_interval:  parseInt(form.check_interval) || 5,
      status:          'active',
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Add Monitor</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name *</label>
            <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Acme Corp Website" className={`mt-1 ${inp}`} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">URL *</label>
            <input value={form.url} onChange={e => s('url', e.target.value)} placeholder="https://example.com" className={`mt-1 ${inp}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</label>
              <select value={form.type} onChange={e => s('type', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="http">HTTP/HTTPS</option>
                <option value="keyword">Keyword check</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Interval (min)</label>
              <select value={form.check_interval} onChange={e => s('check_interval', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer <span className="font-normal text-slate-400">(optional)</span></label>
            <select value={form.customer_id} onChange={e => s('customer_id', e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">— No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Monitor
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Uptime Chart (24h sparkline) ──────────────────────────────────────────────
function UptimeBar({ monitorId }) {
  const supabase = createSupabaseBrowserClient()
  const [checks, setChecks] = useState([])

  useEffect(() => {
    supabase.from('monitor_checks')
      .select('status,checked_at')
      .eq('monitor_id', monitorId)
      .gte('checked_at', new Date(Date.now() - 24 * 3600000).toISOString())
      .order('checked_at', { ascending: true })
      .then(({ data }) => setChecks(data ?? []))
  }, [monitorId])

  if (checks.length === 0) return <span className="text-xs text-slate-400">No data yet</span>

  const upCount   = checks.filter(c => c.status === 'up').length
  const uptime    = Math.round((upCount / checks.length) * 100)
  const segments  = checks.slice(-60)

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-px">
        {segments.map((c, i) => (
          <div key={i} className={`w-1.5 h-5 rounded-sm ${c.status === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        ))}
      </div>
      <span className={`text-xs font-semibold ${uptime === 100 ? 'text-emerald-600' : uptime >= 99 ? 'text-amber-600' : 'text-rose-600'}`}>
        {uptime}%
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MonitoringPage() {
  const supabase    = createSupabaseBrowserClient()
  const [monitors,  setMonitors]  = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [orgId,     setOrgId]     = useState(null)
  const [addOpen,   setAddOpen]   = useState(false)
  const [checking,  setChecking]  = useState(false)
  const [expanded,  setExpanded]  = useState(null)
  const [checks,    setChecks]    = useState({})

  const loadAll = async () => {
    const [m, c] = await Promise.all([
      supabase.from('monitors').select('*').order('customer_name').order('name'),
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
    ])
    setMonitors(m.data ?? [])
    setCustomers(c.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadAll()
    }
    init()
  }, [])

  useRealtimeRefresh(['monitors', 'monitor_checks'], loadAll)

  const runChecks = async () => {
    setChecking(true)
    await fetch(
      'https://yetrdrgagfovphrerpie.supabase.co/functions/v1/run-monitors',
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({}),
      }
    )
    await loadAll()
    setChecking(false)
  }

  const deleteMonitor = async (id) => {
    if (!confirm('Delete this monitor?')) return
    await supabase.from('monitors').delete().eq('id', id)
    loadAll()
  }

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!checks[id]) {
      const { data } = await supabase.from('monitor_checks')
        .select('status,response_ms,status_code,error,checked_at')
        .eq('monitor_id', id)
        .order('checked_at', { ascending: false })
        .limit(20)
      setChecks(p => ({ ...p, [id]: data ?? [] }))
    }
  }

  // Stats
  const up   = monitors.filter(m => m.last_status === 'up').length
  const down = monitors.filter(m => m.last_status === 'down').length
  const pending = monitors.filter(m => !m.last_status).length

  // Group by customer
  const grouped = useMemo(() => {
    const map = {}
    for (const m of monitors) {
      const key = m.customer_name || '— No customer'
      if (!map[key]) map[key] = []
      map[key].push(m)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [monitors])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" /> Uptime Monitoring
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Track website and service availability for your clients.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runChecks} disabled={checking}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking…' : 'Check Now'}
          </button>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Add Monitor
          </button>
        </div>
      </div>

      {/* Stats row */}
      {monitors.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Up',      value: up,      icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40' },
            { label: 'Down',    value: down,    icon: AlertCircle,  color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/40' },
            { label: 'Pending', value: pending, icon: Clock,        color: 'text-slate-400',   bg: 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`rounded-xl border ${bg} p-4 text-center`}>
              <div className={`flex items-center justify-center w-9 h-9 rounded-xl border ${bg} mx-auto mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Monitor list */}
      {loading ? (
        Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)
      ) : monitors.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No monitors yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Add websites and services to monitor. You'll be alerted immediately when something goes down.</p>
          <button onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Add First Monitor
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([group, groupMonitors]) => (
            <div key={group}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{group}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {groupMonitors.map(m => {
                  const ssl  = sslDays(m.ssl_expiry_date)
                  const isEx = expanded === m.id
                  return (
                    <div key={m.id}>
                      <div className="flex items-center gap-3 px-5 py-3.5">
                        {/* Status dot */}
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.last_status === 'up' ? 'bg-emerald-500' : m.last_status === 'down' ? 'bg-rose-500' : 'bg-slate-300'}`} />

                        {/* Name + URL */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{m.name}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBg(m.last_status)}`}>
                              {m.last_status || 'Pending'}
                            </span>
                            {down > 0 && m.consecutive_failures >= 2 && m.last_status === 'down' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                {m.consecutive_failures} fails
                              </span>
                            )}
                            {ssl !== null && ssl <= 30 && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ssl <= 7 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                SSL {ssl <= 0 ? 'expired' : `${ssl}d`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <a href={m.url} target="_blank" rel="noreferrer"
                              className="text-xs text-slate-400 hover:text-amber-500 truncate flex items-center gap-1 max-w-xs" onClick={e => e.stopPropagation()}>
                              <Globe className="w-3 h-3 flex-shrink-0" />{m.url}
                            </a>
                            {m.url.startsWith('https') && <Shield className="w-3 h-3 text-emerald-500 flex-shrink-0" title="HTTPS" />}
                          </div>
                        </div>

                        {/* Response time */}
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className={`text-xs font-semibold ${m.last_response_ms < 500 ? 'text-emerald-600' : m.last_response_ms < 2000 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {fmtMs(m.last_response_ms)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {m.last_checked_at ? new Date(m.last_checked_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Never'}
                          </p>
                        </div>

                        {/* 24h uptime bar */}
                        <div className="hidden md:block flex-shrink-0">
                          <UptimeBar monitorId={m.id} />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => toggleExpand(m.id)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                            {isEx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button onClick={() => deleteMonitor(m.id)}
                            className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded: recent checks */}
                      {isEx && (
                        <div className="px-5 pb-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-3 mb-2">Recent Checks</p>
                          {!checks[m.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          ) : checks[m.id].length === 0 ? (
                            <p className="text-xs text-slate-400">No checks yet — click "Check Now" to run the first check.</p>
                          ) : (
                            <div className="space-y-1">
                              {checks[m.id].map((c, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs">
                                  <span className={`font-semibold w-12 ${c.status === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>{c.status.toUpperCase()}</span>
                                  <span className="text-slate-400 w-16">{fmtMs(c.response_ms)}</span>
                                  <span className="text-slate-400 w-16">{c.status_code ? `HTTP ${c.status_code}` : '—'}</span>
                                  <span className="text-slate-400 flex-1 truncate">{c.error || ''}</span>
                                  <span className="text-slate-300 flex-shrink-0">{new Date(c.checked_at).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddMonitorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); loadAll() }}
        orgId={orgId}
        customers={customers}
      />
    </div>
  )
}