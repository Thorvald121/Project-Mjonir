// @ts-nocheck
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Calendar, Building2, FileText, Save, Send,
  Loader2, Sparkles, Ticket, Clock, CheckCircle2, Activity,
  DollarSign, User, EyeOff, Eye,
} from 'lucide-react'

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

function fmtHrs(mins) {
  if (mins == null) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtResponseTime(mins) {
  if (mins == null) return '—'
  if (mins < 60)   return Math.round(mins) + ' min'
  if (mins < 1440) return (mins / 60).toFixed(1) + ' hr'
  return (mins / 1440).toFixed(1) + ' days'
}

const STATUS_CFG = {
  open:        { label: 'Open',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  in_progress: { label: 'In Progress', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  waiting:     { label: 'Waiting',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  resolved:    { label: 'Resolved',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  closed:      { label: 'Closed',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}

function getPresets() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const last30Start    = new Date(); last30Start.setDate(now.getDate() - 30)
  const thisQStart     = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const thisQEnd       = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0)
  const lastQMonth     = Math.floor(now.getMonth() / 3) * 3 - 3
  const lastQStart     = new Date(now.getFullYear(), lastQMonth, 1)
  const lastQEnd       = new Date(now.getFullYear(), lastQMonth + 3, 0)
  const ytdStart       = new Date(now.getFullYear(), 0, 1)

  return [
    { id: 'last_month', label: 'Last month',     start: isoDate(lastMonthStart), end: isoDate(lastMonthEnd)   },
    { id: 'this_month', label: 'This month',     start: isoDate(thisMonthStart), end: isoDate(thisMonthEnd)   },
    { id: 'last_30',    label: 'Last 30 days',   start: isoDate(last30Start),    end: isoDate(now)            },
    { id: 'this_q',     label: 'This quarter',   start: isoDate(thisQStart),     end: isoDate(thisQEnd)       },
    { id: 'last_q',     label: 'Last quarter',   start: isoDate(lastQStart),     end: isoDate(lastQEnd)       },
    { id: 'ytd',        label: 'Year to date',   start: isoDate(ytdStart),       end: isoDate(now)            },
  ]
}

export default function NewServiceReportPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [orgId,       setOrgId]       = useState(null)
  const [userEmail,   setUserEmail]   = useState('')
  const [customers,   setCustomers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [previewing,  setPreviewing]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [clientView,  setClientView]  = useState(false)

  const presets = useMemo(() => getPresets(), [])

  // Single form state — all updates go through setForm to ensure batching
  const [form, setForm] = useState({
    customer_id:    '',
    customer_name:  '',
    period_start:   presets[0].start,  // default: last month
    period_end:     presets[0].end,
    title:          '',
    intro_message:  '',
  })

  const [tickets,      setTickets]      = useState([])
  const [timeEntries,  setTimeEntries]  = useState([])

  // Track in-flight requests so older results can't overwrite newer ones
  const requestIdRef = useRef(0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Atomic preset selection — both dates in ONE state update
  const selectPreset = (preset) => {
    setForm(f => ({
      ...f,
      period_start: preset.start,
      period_end:   preset.end,
    }))
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email || '')
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (!member) return
      setOrgId(member.organization_id)

      const { data: cust } = await supabase
        .from('customers')
        .select('id, name, contact_email')
        .eq('organization_id', member.organization_id)
        .order('name')
        .limit(500)
      setCustomers(cust ?? [])
      setLoading(false)
    }
    init()
  }, [])

  // Auto-generate title when customer/dates change
  useEffect(() => {
    if (!form.customer_name || !form.period_start || !form.period_end) return
    const start = new Date(form.period_start + 'T00:00:00')
    const end   = new Date(form.period_end + 'T00:00:00')
    let periodLabel
    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth()    === end.getMonth() &&
      start.getDate()     === 1
    ) {
      periodLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else {
      periodLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    set('title', `${periodLabel} Service Summary`)
  }, [form.customer_name, form.period_start, form.period_end])

  // ── Preview generator (race-condition safe) ─────────────────────────────
  // Re-runs whenever customer or date range changes. Uses a request ID
  // counter so that if a slow query finishes after a newer one, its result
  // is discarded.
  useEffect(() => {
    if (!form.customer_id || !form.period_start || !form.period_end || !orgId) {
      setTickets([])
      setTimeEntries([])
      return
    }

    const myRequestId = ++requestIdRef.current
    const customerId = form.customer_id
    const startISO   = form.period_start + 'T00:00:00.000Z'
    const endISO     = form.period_end   + 'T23:59:59.999Z'

    setPreviewing(true)

    const run = async () => {
      // Tickets: include any ticket created OR resolved within the period
      const tkRes = await supabase
        .from('tickets')
        .select('*')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .or(`and(created_at.gte.${startISO},created_at.lte.${endISO}),and(resolved_at.gte.${startISO},resolved_at.lte.${endISO})`)
        .order('created_at', { ascending: true })

      if (tkRes.error) console.error('Tickets fetch error:', tkRes.error)

      // Time entries during the period
      const teRes = await supabase
        .from('time_entries')
        .select('*')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .gte('created_at', startISO)
        .lte('created_at', endISO)

      if (teRes.error) console.error('Time entries fetch error:', teRes.error)

      // Discard if a newer request has been fired
      if (myRequestId !== requestIdRef.current) return

      setTickets(tkRes.data ?? [])
      setTimeEntries(teRes.data ?? [])
      setPreviewing(false)
    }

    // Tiny debounce so rapidly clicking presets doesn't fire 10 queries
    const t = setTimeout(run, 200)
    return () => clearTimeout(t)
  }, [form.customer_id, form.period_start, form.period_end, orgId])

  const stats = useMemo(() => {
    const totalMinutes  = timeEntries.reduce((s, e) => s + (e.minutes || 0), 0)
    const billableMinutes = timeEntries.filter(e => e.billable).reduce((s, e) => s + (e.minutes || 0), 0)
    const totalRevenue = timeEntries
      .filter(e => e.billable && e.hourly_rate)
      .reduce((s, e) => s + ((e.hourly_rate || 0) * (e.minutes || 0)) / 60, 0)

    const periodStart = new Date(form.period_start + 'T00:00:00')
    const periodEnd   = new Date(form.period_end   + 'T23:59:59.999')

    // Count by status — many systems mark tickets resolved/closed without
    // populating resolved_at, so filtering on resolved_at alone undercounts.
    // The DB query already scoped tickets to this period.
    const ticketsResolved = tickets.filter(t =>
      ['resolved', 'closed'].includes(t.status)
    ).length

    const ticketsOpened = tickets.filter(t => {
      if (!t.created_at) return false
      const c = new Date(t.created_at)
      return c >= periodStart && c <= periodEnd
    }).length

    const responseTimes = tickets
      .filter(t => t.first_response_at && t.created_at)
      .map(t => (new Date(t.first_response_at) - new Date(t.created_at)) / 60000)
    const avgResponseMin = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

    const technicians = [...new Set(timeEntries.map(e => e.technician).filter(Boolean))]

    return {
      total_minutes:    totalMinutes,
      billable_minutes: billableMinutes,
      total_revenue:    totalRevenue,
      tickets_resolved: ticketsResolved,
      tickets_opened:   ticketsOpened,
      avg_response_min: avgResponseMin,
      time_entry_count: timeEntries.length,
      ticket_count:     tickets.length,
      technicians,
    }
  }, [tickets, timeEntries, form.period_start, form.period_end])

  const handleSave = async (sendNow = false) => {
    if (!form.customer_id) return alert('Please select a customer')
    if (!form.title.trim()) return alert('Please give the report a title')
    if (!form.period_start || !form.period_end) return alert('Please choose a date range')
    if (new Date(form.period_end) < new Date(form.period_start)) return alert('End date must be after start date')

    setSaving(true)

    const ticketSnapshot = tickets.map(t => ({
      id:                 t.id,
      title:              t.title,
      description:        t.description,
      status:             t.status,
      priority:           t.priority,
      category:           t.category,
      created_at:         t.created_at,
      resolved_at:        t.resolved_at,
      first_response_at:  t.first_response_at,
      time_spent_minutes: t.time_spent_minutes || 0,
      resolution_notes:   t.resolution_notes,
    }))

    const timeEntrySnapshot = timeEntries.map(e => ({
      id:          e.id,
      ticket_id:   e.ticket_id,
      minutes:     e.minutes,
      description: e.description,
      created_at:  e.created_at,
    }))

    const clientSafeStats = {
      total_minutes:    stats.total_minutes,
      tickets_resolved: stats.tickets_resolved,
      tickets_opened:   stats.tickets_opened,
      avg_response_min: stats.avg_response_min,
      time_entry_count: stats.time_entry_count,
      ticket_count:     stats.ticket_count,
    }

    const report_data = {
      ...clientSafeStats,
      tickets:      ticketSnapshot,
      time_entries: timeEntrySnapshot,
      generated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('service_reports')
      .insert({
        organization_id: orgId,
        customer_id:     form.customer_id,
        customer_name:   form.customer_name,
        title:           form.title.trim(),
        period_start:    form.period_start,
        period_end:      form.period_end,
        intro_message:   form.intro_message.trim() || null,
        report_data,
        status:          'draft',
        created_by:      userEmail,
      })
      .select()
      .single()

    if (error) {
      alert('Save failed: ' + error.message)
      setSaving(false)
      return
    }

    setSaving(false)

    if (sendNow) {
      router.push(`/service-reports/${data.id}?send=1`)
    } else {
      router.push(`/service-reports/${data.id}`)
    }
  }

  if (loading) return (
    <div className="max-w-5xl space-y-4 animate-pulse">
      <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-40 bg-slate-100 dark:bg-slate-800 rounded-xl" />
    </div>
  )

  // Determine which preset is active (if any)
  const activePresetId = presets.find(p =>
    p.start === form.period_start && p.end === form.period_end
  )?.id || null

  return (
    <div className="max-w-5xl space-y-5">

      <button onClick={() => router.push('/service-reports')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </button>

      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">New Service Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate a summary of work performed for a client during a given period</p>
      </div>

      {/* Setup card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Client *
          </label>
          <select
            value={form.customer_id}
            onChange={e => {
              const c = customers.find(c => c.id === e.target.value)
              setForm(f => ({
                ...f,
                customer_id:   e.target.value,
                customer_name: c?.name || '',
              }))
            }}
            className={`mt-1 ${inp}`}
          >
            <option value="">Select a client…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Period *
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {presets.map(p => {
              const active = activePresetId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
            {!activePresetId && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 border border-violet-500/30 text-violet-600 dark:text-violet-400">
                Custom range
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-slate-400">Start</label>
              <input type="date" value={form.period_start}
                onChange={e => set('period_start', e.target.value)}
                className={`mt-1 ${inp} [color-scheme:dark]`} />
            </div>
            <div>
              <label className="text-xs text-slate-400">End</label>
              <input type="date" value={form.period_end}
                onChange={e => set('period_end', e.target.value)}
                className={`mt-1 ${inp} [color-scheme:dark]`} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Currently selected: <strong>{fmt(form.period_start)} – {fmt(form.period_end)}</strong>
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <FileText className="w-3 h-3" /> Report Title
          </label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. March 2026 Service Summary"
            className={`mt-1 ${inp}`} />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            Intro Message <span className="text-slate-400 normal-case font-normal text-[10px] tracking-normal">(optional — appears at top of report)</span>
          </label>
          <textarea
            value={form.intro_message}
            onChange={e => set('intro_message', e.target.value)}
            rows={3}
            placeholder="Hi Bob — here's the recap of everything we did for you in March…"
            className={`mt-1 ${inp} resize-none`}
          />
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Live Preview</h2>
            {previewing && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setClientView(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  !clientView
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Eye className="w-3 h-3" /> Internal
              </button>
              <button
                onClick={() => setClientView(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  clientView
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <EyeOff className="w-3 h-3" /> Client View
              </button>
            </div>
            {form.customer_id && (
              <span className="text-xs text-slate-400">
                {fmt(form.period_start)} – {fmt(form.period_end)}
              </span>
            )}
          </div>
        </div>

        {!form.customer_id ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Select a client to preview the report</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">

            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
              clientView
                ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}>
              {clientView ? <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              <span>
                {clientView
                  ? 'Client view — internal data (rates, technician, billable status) is hidden as it would appear on the sent report.'
                  : 'Internal view — showing all data including rates, revenue, billable status, and technician names. None of this is included when sent to the client.'}
              </span>
            </div>

            <div className={`grid gap-3 ${clientView ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-500">{stats.tickets_resolved}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Resolved</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
                  <Ticket className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-500">{stats.tickets_opened}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Opened</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-500">{fmtHrs(stats.total_minutes)}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total Hours</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center flex-shrink-0">
                  <Activity className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-violet-500">{fmtResponseTime(stats.avg_response_min)}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Response</p>
                </div>
              </div>

              {!clientView && (
                <>
                  <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">${stats.total_revenue.toFixed(2)}</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 uppercase tracking-wide font-semibold">Billable Revenue</p>
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">{fmtHrs(stats.billable_minutes)}</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 uppercase tracking-wide font-semibold">Billable Hours</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!clientView && stats.technicians.length > 0 && (
              <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" /> Technicians Involved (internal only)
                </p>
                <div className="flex flex-wrap gap-2">
                  {stats.technicians.map(tech => {
                    const techMins = timeEntries.filter(e => e.technician === tech).reduce((s, e) => s + (e.minutes || 0), 0)
                    return (
                      <span key={tech} className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-slate-700 dark:text-slate-300">
                        <strong>{tech}</strong> · {fmtHrs(techMins)}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Tickets in period ({tickets.length})
              </h3>
              {tickets.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  No tickets found for this client in this period
                </p>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {clientView ? (
                    <>
                      <div className="grid grid-cols-[1fr_90px_90px_60px] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                        <div>Title</div>
                        <div className="text-center">Status</div>
                        <div className="text-right">Resolved</div>
                        <div className="text-right">Time</div>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                        {tickets.map(t => {
                          const cfg = STATUS_CFG[t.status] || STATUS_CFG.open
                          return (
                            <div key={t.id} className="grid grid-cols-[1fr_90px_90px_60px] gap-2 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                                {t.category && <p className="text-[10px] text-slate-400 uppercase">{t.category}</p>}
                              </div>
                              <div className="text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                              </div>
                              <div className="text-right text-xs text-slate-500">{fmt(t.resolved_at)}</div>
                              <div className="text-right text-xs text-slate-500">{fmtHrs(t.time_spent_minutes)}</div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[28rem] overflow-y-auto">
                      {tickets.map(t => {
                        const cfg = STATUS_CFG[t.status] || STATUS_CFG.open
                        const ticketTime = timeEntries
                          .filter(e => e.ticket_id === t.id)
                          .reduce((s, e) => s + (e.minutes || 0), 0)
                        const ticketRevenue = timeEntries
                          .filter(e => e.ticket_id === t.id && e.billable && e.hourly_rate)
                          .reduce((s, e) => s + (e.hourly_rate * e.minutes) / 60, 0)
                        const tech = [...new Set(timeEntries.filter(e => e.ticket_id === t.id).map(e => e.technician).filter(Boolean))].join(', ')
                        return (
                          <div key={t.id} className="px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t.title}</p>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls} shrink-0`}>{cfg.label}</span>
                                {t.priority && <span className="text-[10px] text-slate-500 uppercase shrink-0">{t.priority}</span>}
                              </div>
                              <div className="text-right shrink-0 text-xs">
                                <span className="text-slate-500">{fmt(t.created_at)}</span>
                                {t.resolved_at && <span className="text-emerald-500 ml-2">→ {fmt(t.resolved_at)}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs flex-wrap">
                              {tech && (
                                <span className="flex items-center gap-1 text-slate-500">
                                  <User className="w-3 h-3" /> {tech}
                                </span>
                              )}
                              {ticketTime > 0 && (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                  <Clock className="w-3 h-3" /> {fmtHrs(ticketTime)}
                                </span>
                              )}
                              {ticketRevenue > 0 && (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <DollarSign className="w-3 h-3" /> ${ticketRevenue.toFixed(2)}
                                </span>
                              )}
                              {t.category && <span className="text-slate-400 uppercase">{t.category}</span>}
                            </div>
                            {t.resolution_notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">
                                <strong>Resolution:</strong> {t.resolution_notes}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 italic">
              Internal data (hourly rates, technician names, billable status, revenue) is automatically stripped when the report is saved and sent to the client.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => router.push('/service-reports')}
          disabled={saving}
          className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={!form.customer_id || saving}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save as Draft
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={!form.customer_id || saving}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Save & Continue to Send
        </button>
      </div>
    </div>
  )
}