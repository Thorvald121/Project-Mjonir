// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Ticket, DollarSign, Users, Clock, AlertTriangle,
  Flame, TrendingUp, Plus, ChevronRight, CheckCircle2,
  FileText, Timer,
} from 'lucide-react'

function getSlaState(sla_due_date, status) {
  if (!sla_due_date || ['resolved','closed'].includes(status)) return 'ok'
  const diff = new Date(sla_due_date).getTime() - Date.now()
  if (diff < 0) return 'breached'
  if (diff < 4 * 3600 * 1000) return 'warning'
  return 'ok'
}

const fmt$ = (n) => '$' + (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtH = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
const fmtDate = (d) => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return '' }
}

const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-slate-100 text-slate-600',
}
const STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  waiting:     'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-slate-100 text-slate-600',
}

function KpiCard({ title, value, sub, icon: Icon, iconBg, iconColor, onClick, alert }) {
  return (
    <div onClick={onClick} className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${alert ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [tickets,     setTickets]     = useState([])
  const [invoices,    setInvoices]    = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [customers,   setCustomers]   = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [t, i, te, c] = await Promise.all([
        supabase.from('tickets').select('id,title,status,priority,assigned_to,customer_name,sla_due_date,created_at,contact_email').order('created_at', { ascending: false }).limit(200),
        supabase.from('invoices').select('id,invoice_number,customer_name,total,status,due_date,amount_paid').order('created_at', { ascending: false }).limit(100),
        supabase.from('time_entries').select('id,minutes,billable,invoice_id,customer_name,hourly_rate,date').order('date', { ascending: false }).limit(300),
        supabase.from('customers').select('id,name,status,contract_type,block_hours_total,hourly_rate').limit(200),
      ])
      setTickets(t.data ?? [])
      setInvoices(i.data ?? [])
      setTimeEntries(te.data ?? [])
      setCustomers(c.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const open        = tickets.filter(t => !['resolved','closed'].includes(t.status))
    const breached    = open.filter(t => getSlaState(t.sla_due_date, t.status) === 'breached')
    const atRisk      = open.filter(t => getSlaState(t.sla_due_date, t.status) === 'warning')
    const critical    = open.filter(t => t.priority === 'critical')
    const unassigned  = open.filter(t => !t.assigned_to)
    const waiting     = open.filter(t => t.status === 'waiting')
    const inProgress  = open.filter(t => t.status === 'in_progress')

    const activeCustomers = customers.filter(c => c.status === 'active')
    const blockCustomers  = activeCustomers.filter(c => c.contract_type === 'block_hours' && c.block_hours_total)

    // Unbilled time
    const unbilledMins    = timeEntries.filter(e => e.billable && !e.invoice_id).reduce((s, e) => s + (e.minutes || 0), 0)
    const unbilledRevenue = timeEntries.filter(e => e.billable && !e.invoice_id && e.hourly_rate).reduce((s, e) => s + ((e.hourly_rate * e.minutes) / 60), 0)

    // Outstanding invoices
    const outstanding = invoices.filter(i => ['sent','overdue','partial'].includes(i.status))
    const outstandingTotal = outstanding.reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amount_paid || 0)), 0)
    const overdueInvoices  = invoices.filter(i => {
      if (!['sent','partial'].includes(i.status) || !i.due_date) return false
      return new Date(i.due_date) < new Date()
    })

    // MRR from paid invoices this month
    const now = new Date()
    const thisMonthPaid = invoices.filter(i => {
      if (i.status !== 'paid') return false
      const d = new Date(i.due_date || i.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).reduce((s, i) => s + (i.total || 0), 0)

    return {
      open, breached, atRisk, critical, unassigned, waiting, inProgress,
      activeCustomers, blockCustomers,
      unbilledMins, unbilledRevenue,
      outstanding, outstandingTotal, overdueInvoices,
      thisMonthPaid,
    }
  }, [tickets, invoices, timeEntries, customers])

  const urgentTickets = useMemo(() => {
    return [...tickets]
      .filter(t => !['resolved','closed'].includes(t.status))
      .sort((a, b) => {
        const slaA = getSlaState(a.sla_due_date, a.status)
        const slaB = getSlaState(b.sla_due_date, b.status)
        const slaScore = { breached: 0, warning: 1, ok: 2 }
        const priScore = { critical: 0, high: 1, medium: 2, low: 3 }
        if (slaScore[slaA] !== slaScore[slaB]) return slaScore[slaA] - slaScore[slaB]
        return (priScore[a.priority] ?? 2) - (priScore[b.priority] ?? 2)
      })
      .slice(0, 10)
  }, [tickets])

  const skel = 'h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Here's what needs your attention today.</p>
        </div>
        <button onClick={() => router.push('/tickets')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Open Tickets" icon={Ticket}
          value={loading ? '—' : stats.open.length}
          sub={loading ? '' : `${stats.inProgress.length} in progress · ${stats.unassigned.length} unassigned`}
          iconBg="bg-amber-50 dark:bg-amber-950/30" iconColor="text-amber-500"
          onClick={() => router.push('/tickets')}
        />
        <KpiCard
          title="SLA Issues" icon={Flame}
          value={loading ? '—' : stats.breached.length + stats.atRisk.length}
          sub={loading ? '' : `${stats.breached.length} breached · ${stats.atRisk.length} at risk`}
          iconBg={stats.breached.length > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-slate-50 dark:bg-slate-800"} iconColor={stats.breached.length > 0 ? "text-rose-500" : "text-slate-400"}
          alert={stats.breached.length > 0}
          onClick={() => router.push('/tickets')}
        />
        <KpiCard
          title="Outstanding AR" icon={DollarSign}
          value={loading ? '—' : fmt$(stats.outstandingTotal)}
          sub={loading ? '' : `${stats.outstanding.length} invoices · ${stats.overdueInvoices.length} overdue`}
          iconBg={stats.overdueInvoices.length > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"}
          iconColor={stats.overdueInvoices.length > 0 ? "text-rose-500" : "text-emerald-500"}
          alert={stats.overdueInvoices.length > 0}
          onClick={() => router.push('/invoices')}
        />
        <KpiCard
          title="Unbilled Time" icon={Clock}
          value={loading ? '—' : fmtH(stats.unbilledMins)}
          sub={loading ? '' : `~${fmt$(stats.unbilledRevenue)} at customer rates`}
          iconBg="bg-violet-50 dark:bg-violet-950/30" iconColor="text-violet-500"
          onClick={() => router.push('/time-tracking')}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="This Month Revenue" icon={TrendingUp}
          value={loading ? '—' : fmt$(stats.thisMonthPaid)}
          sub="from paid invoices"
          iconBg="bg-blue-50 dark:bg-blue-950/30" iconColor="text-blue-500"
          onClick={() => router.push('/reports')}
        />
        <KpiCard
          title="Critical Tickets" icon={AlertTriangle}
          value={loading ? '—' : stats.critical.length}
          sub="need immediate attention"
          iconBg={stats.critical.length > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-slate-50 dark:bg-slate-800"}
          iconColor={stats.critical.length > 0 ? "text-rose-500" : "text-slate-400"}
          alert={stats.critical.length > 0}
          onClick={() => router.push('/tickets')}
        />
        <KpiCard
          title="Active Customers" icon={Users}
          value={loading ? '—' : stats.activeCustomers.length}
          sub={`${customers.length} total`}
          iconBg="bg-blue-50 dark:bg-blue-950/30" iconColor="text-blue-500"
          onClick={() => router.push('/customers')}
        />
        <KpiCard
          title="Waiting on Client" icon={Timer}
          value={loading ? '—' : stats.waiting.length}
          sub="tickets awaiting response"
          iconBg="bg-amber-50 dark:bg-amber-950/30" iconColor="text-amber-500"
          onClick={() => router.push('/tickets')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Urgent tickets */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Tickets Needing Attention</h2>
            <button onClick={() => router.push('/tickets')} className="text-xs text-amber-500 hover:text-amber-600 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 space-y-1.5">
                    <div className={`${skel} w-48`} />
                    <div className={`${skel} w-24`} />
                  </div>
                  <div className={`${skel} w-14`} />
                </div>
              ))
            ) : urgentTickets.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-slate-400">All caught up — no urgent tickets</p>
              </div>
            ) : urgentTickets.map(ticket => {
              const sla = getSlaState(ticket.sla_due_date, ticket.status)
              return (
                <div key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-amber-600 transition-colors">{ticket.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ticket.customer_name || '—'} · {ticket.assigned_to || 'Unassigned'} · {fmtDate(ticket.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {sla === 'breached' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">SLA!</span>}
                    {sla === 'warning'  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">At risk</span>}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_CLS[ticket.priority] ?? ''}`}>{ticket.priority}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[ticket.status] ?? ''}`}>{ticket.status?.replace('_',' ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Block hours customers */}
          {stats.blockCustomers.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Block Hours</h2>
              </div>
              <div className="p-4 space-y-3">
                {stats.blockCustomers.map(c => {
                  const used = Math.round(timeEntries.filter(e => e.customer_name === c.name).reduce((s, e) => s + (e.minutes || 0), 0) / 60)
                  const total = c.block_hours_total
                  const pct  = Math.min(100, Math.round((used / total) * 100))
                  const remaining = Math.max(0, total - used)
                  return (
                    <div key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg p-2 -mx-2 transition-colors">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-900 dark:text-white truncate">{c.name}</span>
                        <span className={pct >= 90 ? 'text-rose-500 font-semibold' : pct >= 70 ? 'text-amber-500' : 'text-slate-400'}>
                          {remaining}h left
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-2 rounded-full ${pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: pct + '%' }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{used}h used of {total}h ({pct}%)</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Overdue invoices */}
          {stats.overdueInvoices.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-800">
              <div className="px-5 py-4 border-b border-rose-200 dark:border-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Overdue Invoices</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.overdueInvoices.slice(0, 4).map(inv => (
                  <div key={inv.id} onClick={() => router.push('/invoices')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{inv.customer_name}</p>
                      <p className="text-[10px] text-slate-400">{inv.invoice_number} · due {fmtDate(inv.due_date)}</p>
                    </div>
                    <span className="text-xs font-bold text-rose-600 flex-shrink-0 ml-2">{fmt$(Math.max(0, (inv.total || 0) - (inv.amount_paid || 0)))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Quick Stats</h2>
            {[
              { label: 'Tickets resolved today', value: tickets.filter(t => { const d = new Date(t.created_at); const n = new Date(); return ['resolved','closed'].includes(t.status) && d.toDateString() === n.toDateString() }).length },
              { label: 'Tickets opened today',   value: tickets.filter(t => { const d = new Date(t.created_at); return d.toDateString() === new Date().toDateString() }).length },
              { label: 'Unassigned tickets',     value: stats.unassigned?.length ?? 0, alert: (stats.unassigned?.length ?? 0) > 0 },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-500 text-xs">{s.label}</span>
                <span className={`font-bold text-sm ${s.alert ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}