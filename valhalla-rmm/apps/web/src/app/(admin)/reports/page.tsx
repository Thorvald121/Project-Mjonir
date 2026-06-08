// @ts-nocheck
'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useOrg } from '@/hooks/use-org'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Cell,
} from 'recharts'
import {
  TrendingUp, DollarSign, Clock, Ticket, Users,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHrs = (mins) => {
  const h = Math.floor((mins || 0) / 60)
  const m = (mins || 0) % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMonth = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, trend, trendLabel }) {
  const isUp = trend > 0
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            isUp ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                 : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
          }`}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, prefix = '$' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {prefix === '$' ? fmt$(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createSupabaseBrowserClient()
  const { data: orgData } = useOrg()
  const orgId = orgData?.orgId ?? null

  // ── Revenue by month ──────────────────────────────────────────────────────
  const { data: revenueData } = useQuery({
    queryKey:  ['reports-revenue', orgId],
    enabled:   !!orgId,
    staleTime: 5 * 60_000,
    queryFn:   async () => {
      const { data } = await supabase
        .from('invoices')
        .select('issue_date, total, amount_paid, status')
        .gte('issue_date', new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0])
        .neq('status', 'void')
      return data ?? []
    },
  })

  // ── Ticket volume by month ────────────────────────────────────────────────
  const { data: ticketData } = useQuery({
    queryKey:  ['reports-tickets', orgId],
    enabled:   !!orgId,
    staleTime: 5 * 60_000,
    queryFn:   async () => {
      const { data } = await supabase
        .from('tickets')
        .select('created_at, status, priority, assigned_to, first_response_at, sla_due_date')
        .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())
      return data ?? []
    },
  })

  // ── Time entries ──────────────────────────────────────────────────────────
  const { data: timeData } = useQuery({
    queryKey:  ['reports-time', orgId],
    enabled:   !!orgId,
    staleTime: 5 * 60_000,
    queryFn:   async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('date, minutes, billable, technician, customer_name')
        .gte('date', new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0])
      return data ?? []
    },
  })

  // ── Contracts for MRR ─────────────────────────────────────────────────────
  const { data: contractData } = useQuery({
    queryKey:  ['reports-contracts', orgId],
    enabled:   !!orgId,
    staleTime: 5 * 60_000,
    queryFn:   async () => {
      const { data } = await supabase
        .from('contracts')
        .select('value, billing_cycle, status')
        .in('status', ['signed', 'active'])
      return data ?? []
    },
  })

  // ── Customer revenue ──────────────────────────────────────────────────────
  const { data: customerRevData } = useQuery({
    queryKey:  ['reports-customers', orgId],
    enabled:   !!orgId,
    staleTime: 5 * 60_000,
    queryFn:   async () => {
      const { data } = await supabase
        .from('invoices')
        .select('customer_name, total, status')
        .eq('status', 'paid')
      return data ?? []
    },
  })

  // ── Computed metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const invoices    = revenueData ?? []
    const tickets     = ticketData  ?? []
    const time        = timeData    ?? []
    const contracts   = contractData ?? []

    // MRR from contracts
    const mrr = contracts.reduce((sum, c) => {
      const val = Number(c.value || 0)
      if (c.billing_cycle === 'monthly')   return sum + val
      if (c.billing_cycle === 'quarterly') return sum + val / 3
      if (c.billing_cycle === 'annually')  return sum + val / 12
      return sum
    }, 0)

    // Revenue
    const collected  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0)
    const outstanding = invoices.filter(i => ['sent','overdue','partial'].includes(i.status))
                                .reduce((s, i) => s + Math.max(0, Number(i.total||0) - Number(i.amount_paid||0)), 0)

    // Tickets
    const open     = tickets.filter(t => !['resolved','closed'].includes(t.status)).length
    const resolved = tickets.filter(t => t.status === 'resolved').length
    const critical = tickets.filter(t => t.priority === 'critical' && !['resolved','closed'].includes(t.status)).length
    const unassigned = tickets.filter(t => !t.assigned_to && !['resolved','closed'].includes(t.status)).length

    // SLA compliance
    const withSla   = tickets.filter(t => t.sla_due_date && t.status === 'resolved' && t.first_response_at)
    const slaMetCount = withSla.filter(t => new Date(t.first_response_at) <= new Date(t.sla_due_date)).length
    const slaRate   = withSla.length > 0 ? Math.round((slaMetCount / withSla.length) * 100) : null

    // Time
    const totalMins   = time.reduce((s, e) => s + (e.minutes || 0), 0)
    const billableMins = time.filter(e => e.billable).reduce((s, e) => s + (e.minutes || 0), 0)
    const billableRate = totalMins > 0 ? Math.round((billableMins / totalMins) * 100) : 0

    return { mrr, collected, outstanding, open, resolved, critical, unassigned, slaRate, totalMins, billableMins, billableRate }
  }, [revenueData, ticketData, timeData, contractData])

  // ── Monthly revenue chart data ────────────────────────────────────────────
  const revenueChartData = useMemo(() => {
    const invoices = revenueData ?? []
    const map: Record<string, { month: string, collected: number, outstanding: number }> = {}

    invoices.forEach(inv => {
      if (!inv.issue_date) return
      const key = inv.issue_date.slice(0, 7) // YYYY-MM
      if (!map[key]) map[key] = { month: fmtMonth(inv.issue_date), collected: 0, outstanding: 0 }
      if (inv.status === 'paid') map[key].collected += Number(inv.total || 0)
      else if (['sent','overdue','partial'].includes(inv.status)) {
        map[key].outstanding += Math.max(0, Number(inv.total||0) - Number(inv.amount_paid||0))
      }
    })

    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
  }, [revenueData])

  // ── Monthly ticket chart data ─────────────────────────────────────────────
  const ticketChartData = useMemo(() => {
    const tickets = ticketData ?? []
    const map: Record<string, { month: string, created: number, resolved: number }> = {}

    tickets.forEach(t => {
      if (!t.created_at) return
      const key = t.created_at.slice(0, 7)
      if (!map[key]) map[key] = { month: fmtMonth(t.created_at), created: 0, resolved: 0 }
      map[key].created++
      if (t.status === 'resolved') map[key].resolved++
    })

    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([,v]) => v)
  }, [ticketData])

  // ── Monthly hours chart data ──────────────────────────────────────────────
  const hoursChartData = useMemo(() => {
    const time = timeData ?? []
    const map: Record<string, { month: string, billable: number, nonBillable: number }> = {}

    time.forEach(e => {
      if (!e.date) return
      const key = e.date.slice(0, 7)
      if (!map[key]) map[key] = { month: fmtMonth(e.date), billable: 0, nonBillable: 0 }
      const hrs = (e.minutes || 0) / 60
      if (e.billable) map[key].billable += hrs
      else map[key].nonBillable += hrs
    })

    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => ({
      ...v,
      billable:    Math.round(v.billable * 10) / 10,
      nonBillable: Math.round(v.nonBillable * 10) / 10,
    }))
  }, [timeData])

  // ── Top customers ─────────────────────────────────────────────────────────
  const topCustomers = useMemo(() => {
    const data = customerRevData ?? []
    const map: Record<string, number> = {}
    data.forEach(i => {
      const name = i.customer_name || 'Unknown'
      map[name] = (map[name] || 0) + Number(i.total || 0)
    })
    return Object.entries(map)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }))
  }, [customerRevData])

  // ── Priority breakdown ────────────────────────────────────────────────────
  const priorityData = useMemo(() => {
    const tickets = (ticketData ?? []).filter(t => !['resolved','closed'].includes(t.status))
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    tickets.forEach(t => { if (counts[t.priority] !== undefined) counts[t.priority]++ })
    return [
      { name: 'Critical', value: counts.critical, color: '#f43f5e' },
      { name: 'High',     value: counts.high,     color: '#f97316' },
      { name: 'Medium',   value: counts.medium,   color: '#f59e0b' },
      { name: 'Low',      value: counts.low,      color: '#10b981' },
    ].filter(d => d.value > 0)
  }, [ticketData])

  const isLoading = !revenueData && !ticketData

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Business performance overview — last 12 months</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_,i) => (
            <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Monthly Recurring Revenue"
              value={fmt$(metrics.mrr)}
              sub={`${(contractData ?? []).length} active contract${(contractData ?? []).length !== 1 ? 's' : ''}`}
              icon={TrendingUp}
              color="bg-amber-500"
            />
            <KpiCard
              label="Revenue Collected"
              value={fmt$(metrics.collected)}
              sub="Paid invoices, last 12 months"
              icon={DollarSign}
              color="bg-emerald-500"
            />
            <KpiCard
              label="Outstanding"
              value={fmt$(metrics.outstanding)}
              sub="Sent, overdue & partial"
              icon={AlertTriangle}
              color={metrics.outstanding > 0 ? 'bg-rose-500' : 'bg-slate-400'}
            />
            <KpiCard
              label="Annualized MRR"
              value={fmt$(metrics.mrr * 12)}
              sub="Projected from current contracts"
              icon={TrendingUp}
              color="bg-violet-500"
            />
            <KpiCard
              label="Open Tickets"
              value={metrics.open}
              sub={`${metrics.critical} critical · ${metrics.unassigned} unassigned`}
              icon={Ticket}
              color={metrics.critical > 0 ? 'bg-rose-500' : 'bg-blue-500'}
            />
            <KpiCard
              label="Resolved Tickets"
              value={metrics.resolved}
              sub="Last 12 months"
              icon={CheckCircle2}
              color="bg-emerald-500"
            />
            <KpiCard
              label="SLA Compliance"
              value={metrics.slaRate !== null ? `${metrics.slaRate}%` : '—'}
              sub="First response within SLA target"
              icon={CheckCircle2}
              color={metrics.slaRate === null ? 'bg-slate-400' : metrics.slaRate >= 90 ? 'bg-emerald-500' : metrics.slaRate >= 70 ? 'bg-amber-500' : 'bg-rose-500'}
            />
            <KpiCard
              label="Hours Logged"
              value={fmtHrs(metrics.totalMins)}
              sub={`${metrics.billableRate}% billable · ${fmtHrs(metrics.billableMins)} billable`}
              icon={Clock}
              color="bg-violet-500"
            />
          </div>

          {/* Revenue + Top Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Revenue by Month</h2>
              {revenueChartData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No invoice data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="collected"   name="Collected"   fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="outstanding" name="Outstanding" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-400">Collected</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /><span className="text-xs text-slate-400">Outstanding</span></div>
              </div>
            </div>

            {/* Top Customers */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Top Customers by Revenue</h2>
              {topCustomers.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No paid invoices yet</div>
              ) : (
                <div className="space-y-3">
                  {topCustomers.map((c, i) => {
                    const maxRev = topCustomers[0].revenue
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-4">#{i+1}</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[140px]">{c.name}</span>
                          </div>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmt$(c.revenue)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${(c.revenue / maxRev) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Ticket Volume + Hours */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ticket Volume */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Ticket Volume — Last 6 Months</h2>
              {ticketChartData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No ticket data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ticketChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip prefix="" />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="created"  name="Created"  fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /><span className="text-xs text-slate-400">Created</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-xs text-slate-400">Resolved</span></div>
              </div>
            </div>

            {/* Hours Logged */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Hours Logged by Month</h2>
              {hoursChartData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No time entries yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={hoursChartData}>
                    <defs>
                      <linearGradient id="billableGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip prefix="" />} cursor={{ stroke: 'rgba(148,163,184,0.3)' }} />
                    <Area type="monotone" dataKey="billable" name="Billable hrs" stroke="#8b5cf6" strokeWidth={2} fill="url(#billableGrad)" />
                    <Area type="monotone" dataKey="nonBillable" name="Non-billable hrs" stroke="#94a3b8" strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-violet-500" /><span className="text-xs text-slate-400">Billable</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-400" /><span className="text-xs text-slate-400">Non-billable</span></div>
              </div>
            </div>
          </div>

          {/* Open tickets by priority */}
          {priorityData.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Open Tickets by Priority</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Critical', key: 'critical', color: 'bg-rose-500',   text: 'text-rose-600',   bg: 'bg-rose-50 dark:bg-rose-950/20' },
                  { label: 'High',     key: 'high',     color: 'bg-orange-400', text: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20' },
                  { label: 'Medium',   key: 'medium',   color: 'bg-amber-400',  text: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/20' },
                  { label: 'Low',      key: 'low',      color: 'bg-emerald-400',text: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
                ].map(p => {
                  const tickets = (ticketData ?? []).filter(t =>
                    t.priority === p.key && !['resolved','closed'].includes(t.status)
                  ).length
                  return (
                    <div key={p.key} className={`rounded-xl p-4 ${p.bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{p.label}</span>
                      </div>
                      <p className={`text-3xl font-bold ${p.text}`}>{tickets}</p>
                      <p className="text-xs text-slate-400 mt-0.5">open tickets</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
