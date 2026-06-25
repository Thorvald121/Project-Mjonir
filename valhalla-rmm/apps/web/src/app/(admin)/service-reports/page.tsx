// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Plus, FileText, Send, CheckCircle2, Trash2,
  Eye, Clock, Building2, Calendar, Loader2,
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

const STATUS_CFG = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  sent:  { label: 'Sent',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
}

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function fmtPeriod(start, end) {
  if (!start || !end) return '—'
  try {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === 1) {
      return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  } catch { return `${start} – ${end}` }
}

export default function ServiceReportsPage() {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()

  const [reports,    setReports]    = useState([])
  const [customers,  setCustomers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [customerFilter, setCustomerFilter] = useState('all')
  const [deleting,   setDeleting]   = useState(null)

  const loadAll = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    if (!member) { setLoading(false); return }

    const [r, c] = await Promise.all([
      supabase
        .from('service_reports')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('customers')
        .select('id, name')
        .eq('organization_id', member.organization_id)
        .order('name')
        .limit(500),
    ])
    setReports(r.data ?? [])
    setCustomers(c.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])
  useRealtimeRefresh(['service_reports'], loadAll)

  const handleDelete = async (report) => {
    if (!confirm(`Delete "${report.title}"? This cannot be undone.`)) return
    setDeleting(report.id)
    const { error } = await supabase.from('service_reports').delete().eq('id', report.id)
    if (error) alert('Delete failed: ' + error.message)
    setDeleting(null)
    loadAll()
  }

  const filtered = customerFilter === 'all'
    ? reports
    : reports.filter(r => r.customer_id === customerFilter)

  const totalReports  = reports.length
  const sentReports   = reports.filter(r => r.status === 'sent').length
  const draftReports  = reports.filter(r => r.status === 'draft').length

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Service Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Client-facing summaries of work performed during any period</p>
        </div>
        <button onClick={() => router.push('/service-reports/new')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Reports', value: totalReports,  icon: FileText,     color: 'text-slate-500',   bg: 'bg-slate-50 dark:bg-slate-800' },
          { label: 'Sent',          value: sentReports,   icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Drafts',        value: draftReports,  icon: Clock,        color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter by client:</label>
        <select
          value={customerFilter}
          onChange={e => setCustomerFilter(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All clients ({reports.length})</option>
          {customers.map(c => {
            const count = reports.filter(r => r.customer_id === c.id).length
            return <option key={c.id} value={c.id}>{c.name} ({count})</option>
          })}
        </select>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-48" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium mb-1">
              {customerFilter === 'all' ? 'No reports yet' : 'No reports for this client'}
            </p>
            <p className="text-sm text-slate-400 mb-4">
              {customerFilter === 'all'
                ? 'Generate a service summary to send to a client'
                : 'Switch filter or create a new report'}
            </p>
            <button onClick={() => router.push('/service-reports/new')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
              <Plus className="w-4 h-4" /> New Report
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(r => {
              const cfg = STATUS_CFG[r.status] || STATUS_CFG.draft
              const data = r.report_data || {}
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">

                  {/* Info */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/service-reports/${r.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-semibold text-slate-900 dark:text-white">{r.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{r.customer_name}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtPeriod(r.period_start, r.period_end)}</span>
                      {typeof data.ticket_count === 'number' && (
                        <span className="text-slate-400">{data.ticket_count} ticket{data.ticket_count === 1 ? '' : 's'}</span>
                      )}
                      {typeof data.total_minutes === 'number' && (
                        <span className="text-slate-400">{(data.total_minutes / 60).toFixed(1)}h</span>
                      )}
                      {r.sent_at && <span className="text-emerald-500">Sent {fmt(r.sent_at)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => router.push(`/service-reports/${r.id}`)}
                      title="View / Send"
                      className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(r)}
                      title="Delete report"
                      disabled={deleting === r.id}
                      className="p-1.5 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors disabled:opacity-40">
                      {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}