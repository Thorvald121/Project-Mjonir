// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Calendar, Building2, FileText, Save, Send,
  Loader2, Sparkles, Ticket, Clock, CheckCircle2, Activity,
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

// ── Date range presets ────────────────────────────────────────────────────────
function getPresets() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const last30Start    = new Date(); last30Start.setDate(now.getDate() - 30)
  const thisQStart     = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const thisQEnd       = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0)
  const ytdStart       = new Date(now.getFullYear(), 0, 1)

  return [
    { id: 'last_month', label: 'Last month',   start: isoDate(lastMonthStart), end: isoDate(lastMonthEnd)   },
    { id: 'this_month', label: 'This month',   start: isoDate(thisMonthStart), end: isoDate(thisMonthEnd)   },
    { id: 'last_30',    label: 'Last 30 days', start: isoDate(last30Start),    end: isoDate(now)            },
    { id: 'this_q',     label: 'This quarter', start: isoDate(thisQStart),     end: isoDate(thisQEnd)       },
    { id: 'ytd',        label: 'Year to date', start: isoDate(ytdStart),       end: isoDate(now)            },
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

  const presets = useMemo(() => getPresets(), [])

  const [form, setForm] = useState({
    customer_id:    '',
    customer_name:  '',
    period_start:   presets[0].start,  // default: last month
    period_end:     presets[0].end,
    title:          '',
    intro_message:  '',
  })

  // Loaded preview data
  const [tickets,      setTickets]      = useState([])
  const [timeEntries,  setTimeEntries]  = useState([])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Bootstrap ───────────────────────────────────────────────────────────────
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

  // ── Auto-set title when customer / dates change ────────────────────────────
  useEffect(() => {
    if (!form.customer_name || !form.period_start || !form.period_end) return
    const start = new Date(form.period_start + 'T00:00:00')
    const end   = new Date(form.period_end + 'T00:00:00')
    let periodLabel
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === 1) {
      periodLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else {
      periodLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    set('title', `${periodLabel} Service Summary`)
  }, [form.customer_name, form.period_start, form.period_end])

  // ── Generate preview ────────────────────────────────────────────────────────
  const generatePreview = async () => {
    if (!form.customer_id || !form.period_start || !form.period_end) return
    setPreviewing(true)

    const startISO = form.period_start
    const endISO   = form.period_end + 'T23:59:59.999Z'

    // Tickets: include tickets created OR resolved during the period
    const { data: tkData, error: tkErr } = await supabase
      .from('tickets')
      .select('id, title, description, status, priority, category, created_at, resolved_at, first_response_at, time_spent_minutes, resolution_notes')
      .eq('organization_id', orgId)
      .eq('customer_id', form.customer_id)
      .or(`and(created_at.gte.${startISO},created_at.lte.${endISO}),and(resolved_at.gte.${startISO},resolved_at.lte.${endISO})`)
      .order('created_at', { ascending: true })

    if (tkErr) console.error('Tickets fetch error:', tkErr)
    setTickets(tkData ?? [])

    // Time entries during the period
    const { data: teData, error: teErr } = await supabase
      .from('time_entries')
      .select('id, ticket_id, minutes, billable, description, technician, created_at')
      .eq('organization_id', orgId)
      .eq('customer_id', form.customer_id)
      .gte('created_at', startISO)
      .lte('created_at', endISO)

    if (teErr) console.error('Time entries fetch error:', teErr)
    setTimeEntries(teData ?? [])

    setPreviewing(false)
  }

  // Auto-generate preview when inputs change
  useEffect(() => {
    if (form.customer_id && form.period_start && form.period_end && orgId) {
      const t = setTimeout(generatePreview, 400)
      return () => clearTimeout(t)
    }
  }, [form.customer_id, form.period_start, form.period_end, orgId])

  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalMinutes  = timeEntries.reduce((s, e) => s + (e.minutes || 0), 0)
    const ticketsResolved = tickets.filter(t => t.resolved_at &&
      new Date(t.resolved_at) >= new Date(form.period_start) &&
      new Date(t.resolved_at) <= new Date(form.period_end + 'T23:59:59.999Z')
    ).length
    const ticketsOpened   = tickets.filter(t => t.created_at &&
      new Date(t.created_at) >= new Date(form.period_start) &&
      new Date(t.created_at) <= new Date(form.period_end + 'T23:59:59.999Z')
    ).length

    // Average first response time (in minutes) for tickets in this set with first_response_at
    const responseTimes = tickets
      .filter(t => t.first_response_at && t.created_at)
      .map(t => (new Date(t.first_response_at) - new Date(t.created_at)) / 60000)
    const avgResponseMin = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

    return {
      total_minutes:    totalMinutes,
      tickets_resolved: ticketsResolved,
      tickets_opened:   ticketsOpened,
      avg_response_min: avgResponseMin,
      time_entry_count: timeEntries.length,
      ticket_count:     tickets.length,
    }
  }, [tickets, timeEntries, form.period_start, form.period_end])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (sendNow = false) => {
    if (!form.customer_id) return alert('Please select a customer')
    if (!form.title.trim()) return alert('Please give the report a title')
    if (!form.period_start || !form.period_end) return alert('Please choose a date range')
    if (new Date(form.period_end) < new Date(form.period_start)) return alert('End date must be after start date')

    setSaving(true)

    // Snapshot data — strip everything client-unsafe
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
      // Intentionally omit: billable, hourly_rate, technician
    }))

    const report_data = {
      ...stats,
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

  const fmtHrs = (mins) => mins == null ? '—' : (mins / 60).toFixed(1) + 'h'
  const fmtResponseTime = (mins) => {
    if (mins == null) return '—'
    if (mins < 60) return Math.round(mins) + ' min'
    if (mins < 1440) return (mins / 60).toFixed(1) + ' hr'
    return (mins / 1440).toFixed(1) + ' days'
  }

  return (
    <div className="max-w-5xl space-y-5">

      {/* Back */}
      <button onClick={() => router.push('/service-reports')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </button>

      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">New Service Report</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate a summary of work performed for a client during a given period</p>
      </div>

      {/* Setup card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">

        {/* Customer */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Client *
          </label>
          <select
            value={form.customer_id}
            onChange={e => {
              const c = customers.find(c => c.id === e.target.value)
              set('customer_id', e.target.value)
              set('customer_name', c?.name || '')
            }}
            className={`mt-1 ${inp}`}
          >
            <option value="">Select a client…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Date presets */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Period *
          </label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {presets.map(p => {
              const active = form.period_start === p.start && form.period_end === p.end
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { set('period_start', p.start); set('period_end', p.end) }}
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
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-slate-400">Start</label>
              <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)}
                className={`mt-1 ${inp} [color-scheme:dark]`} />
            </div>
            <div>
              <label className="text-xs text-slate-400">End</label>
              <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)}
                className={`mt-1 ${inp} [color-scheme:dark]`} />
            </div>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <FileText className="w-3 h-3" /> Report Title
          </label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. March 2026 Service Summary"
            className={`mt-1 ${inp}`} />
        </div>

        {/* Intro message */}
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
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Live Preview</h2>
            {previewing && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          </div>
          {form.customer_id && (
            <span className="text-xs text-slate-400">
              {fmt(form.period_start)} – {fmt(form.period_end)}
            </span>
          )}
        </div>

        {!form.customer_id ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Select a client to preview the report</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Tickets Resolved', value: stats.tickets_resolved,           icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                { label: 'Tickets Opened',   value: stats.tickets_opened,             icon: Ticket,       color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
                { label: 'Total Hours',      value: fmtHrs(stats.total_minutes),      icon: Clock,        color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
                { label: 'Avg Response',     value: fmtResponseTime(stats.avg_response_min), icon: Activity, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tickets in report */}
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
                  <div className="grid grid-cols-[1fr_90px_90px_60px] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                    <div>Title</div>
                    <div className="text-center">Status</div>
                    <div className="text-right">Resolved</div>
                    <div className="text-right">Time</div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {tickets.map(t => (
                      <div key={t.id} className="grid grid-cols-[1fr_90px_90px_60px] gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                          {t.category && <p className="text-[10px] text-slate-400 uppercase">{t.category}</p>}
                        </div>
                        <div className="text-center text-xs text-slate-500 capitalize">{(t.status || '').replace('_', ' ')}</div>
                        <div className="text-right text-xs text-slate-500">{fmt(t.resolved_at)}</div>
                        <div className="text-right text-xs text-slate-500">{fmtHrs(t.time_spent_minutes)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 italic">
              Internal data (hourly rates, technician names, internal notes) is automatically stripped when sending to the client.
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
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