// @ts-nocheck
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  TrendingUp, Clock, Ticket, AlertTriangle, ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
  Legend, ReferenceLine,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#f43f5e','#06b6d4']

function getRange(key) {
  const now = new Date()
  const sub = (d) => new Date(now.getTime() - d * 86400000)
  switch (key) {
    case '7d':  return { start: sub(7),   end: now }
    case '30d': return { start: sub(30),  end: now }
    case '90d': return { start: sub(90),  end: now }
    case '6m':  return { start: sub(180), end: now }
    case '12m': return { start: sub(365), end: now }
    default:    return { start: sub(30),  end: now }
  }
}

function inRange(dateStr, range) {
  if (!dateStr) return false
  try { const d = new Date(dateStr); return d >= range.start && d <= range.end } catch { return false }
}

function fmtMins(mins) {
  if (mins < 60) return `${Math.round(mins)}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${(mins / 1440).toFixed(1)}d`
}

function fmtCurrency(n) {
  return '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function monthKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function addMonths(date, n) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

const ttStyle = {
  background: '#1e293b', border: '1px solid #334155',
  borderRadius: 8, fontSize: 12, color: '#f1f5f9',
}

const RANGE_LABELS = {
  '7d': 'Last 7 Days', '30d': 'Last 30 Days',
  '90d': 'Last 90 Days', '6m': 'Last 6 Months', '12m': 'Last 12 Months',
}

// ── Section card wrapper ───────────────────────────────────────────────────────
function Card({ title, subtitle, extra, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {title && (
        <div className="px-5 pt-4 pb-2 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold text-sm text-slate-900 dark:text-white">{title}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {extra}
        </div>
      )}
      <div className="px-5 pb-5">{children}</div>
    </div>
  )
}

// ── Ticket Volume Chart ───────────────────────────────────────────────────────
function TicketVolumeChart({ tickets, range }) {
  const data = useMemo(() => {
    const spanDays = (range.end - range.start) / 86400000
    const useWeeks = spanDays > 45
    const buckets = []

    if (useWeeks) {
      // Weekly buckets
      const d = new Date(range.start)
      d.setDate(d.getDate() - d.getDay()) // start of week
      while (d <= range.end) {
        buckets.push({ key: new Date(d).toISOString(), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), opened: 0, resolved: 0 })
        d.setDate(d.getDate() + 7)
      }
      tickets.forEach(t => {
        if (!t.created_at) return
        const cd = new Date(t.created_at)
        if (cd < range.start || cd > range.end) return
        const weekStart = new Date(cd); weekStart.setDate(cd.getDate() - cd.getDay())
        const b = buckets.find(b => Math.abs(new Date(b.key) - weekStart) < 86400000)
        if (b) b.opened++
        if (['resolved','closed'].includes(t.status) && t.updated_at) {
          const rd = new Date(t.updated_at)
          if (rd >= range.start && rd <= range.end) {
            const rw = new Date(rd); rw.setDate(rd.getDate() - rd.getDay())
            const rb = buckets.find(b => Math.abs(new Date(b.key) - rw) < 86400000)
            if (rb) rb.resolved++
          }
        }
      })
    } else {
      // Daily buckets
      const d = new Date(range.start)
      while (d <= range.end) {
        buckets.push({ key: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), opened: 0, resolved: 0 })
        d.setDate(d.getDate() + 1)
      }
      tickets.forEach(t => {
        if (!t.created_at) return
        const key = new Date(t.created_at).toISOString().split('T')[0]
        const b = buckets.find(b => b.key === key)
        if (b) b.opened++
        if (['resolved','closed'].includes(t.status) && t.updated_at) {
          const rKey = new Date(t.updated_at).toISOString().split('T')[0]
          const rb = buckets.find(b => b.key === rKey)
          if (rb) rb.resolved++
        }
      })
    }

    // Thin out labels if too many
    if (buckets.length > 30) {
      buckets.forEach((b, i) => { if (i % Math.ceil(buckets.length / 20) !== 0) b.label = '' })
    }
    return buckets
  }, [tickets, range])

  const hasData = data.some(b => b.opened > 0 || b.resolved > 0)

  return (
    <Card title="Ticket Volume Over Time">
      {!hasData ? (
        <p className="text-center text-slate-400 text-sm py-12">No ticket data in this range</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="openGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="resolveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip contentStyle={ttStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="opened" name="Opened" stroke="#f59e0b" fill="url(#openGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" fill="url(#resolveGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── Revenue Forecast ──────────────────────────────────────────────────────────
function RevenueForecast({ invoices }) {
  const { data, recurringMRR, avgVariable } = useMemo(() => {
    const now = new Date()
    const actuals = {}
    invoices.filter(i => i.status === 'paid' && (i.paid_date || i.issue_date)).forEach(i => {
      const k = monthKey(i.paid_date || i.issue_date)
      if (k) actuals[k] = (actuals[k] || 0) + (i.total || 0)
    })
    const recurringMRR = invoices
      .filter(i => i.is_recurring && i.recurrence_interval === 'monthly' && !['void','draft'].includes(i.status))
      .reduce((s, i) => s + (i.total || 0), 0)
    const last3 = [-3,-2,-1].map(n => {
      const k = monthKey(addMonths(now, n).toISOString())
      return actuals[k] || 0
    })
    const avgVariable = Math.round(last3.reduce((s, v) => s + v, 0) / 3)
    const chartData = []
    for (let i = -5; i <= 6; i++) {
      const m = addMonths(now, i)
      const k = monthKey(m.toISOString())
      const label = m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      const isActual = i <= 0
      chartData.push({
        month: label,
        actual:   isActual ? Math.round(actuals[k] || 0) : null,
        forecast: !isActual ? Math.round(recurringMRR + avgVariable) : null,
      })
    }
    return { data: chartData, recurringMRR, avgVariable }
  }, [invoices])

  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

  return (
    <Card
      title="Revenue Forecast"
      subtitle={`6-month projection — MRR ${fmtCurrency(recurringMRR)} + avg variable ${fmtCurrency(avgVariable)}`}
      extra={
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-emerald-500 rounded inline-block" /> Actual</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-violet-500 rounded inline-block" /> Forecast</span>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
          <Tooltip contentStyle={ttStyle} formatter={v => [fmtCurrency(v)]} />
          <ReferenceLine x={todayLabel} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'Today', fill: '#94a3b8', fontSize: 10 }} />
          <Area type="monotone" dataKey="actual" name="Actual" stroke="#10b981" fill="url(#aGrad)" strokeWidth={2} dot={false} connectNulls={false} />
          <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#8b5cf6" fill="url(#fGrad)" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

// ── Resolution Time by Tech ───────────────────────────────────────────────────
function ResolutionTimeByTech({ tickets, range }) {
  const data = useMemo(() => {
    const map = {}
    tickets.forEach(t => {
      if (!['resolved','closed'].includes(t.status)) return
      if (!t.assigned_to || !t.created_at || !t.updated_at) return
      const created = new Date(t.created_at)
      if (created < range.start || created > range.end) return
      const mins = Math.round((new Date(t.updated_at) - created) / 60000)
      if (mins <= 0) return
      const tech = t.assigned_to.split('@')[0]
      if (!map[tech]) map[tech] = { total: 0, count: 0 }
      map[tech].total += mins
      map[tech].count++
    })
    return Object.entries(map)
      .map(([name, s]) => ({ name, avgMinutes: Math.round(s.total / s.count), count: s.count, avgLabel: fmtMins(s.total / s.count) }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes)
  }, [tickets, range])

  return (
    <Card title="Avg Resolution Time by Technician">
      {data.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">No resolved tickets with assigned technicians in this range</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => fmtMins(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#f1f5f9' }} width={80} />
            <Tooltip contentStyle={ttStyle} formatter={v => [fmtMins(v), 'Avg Resolution']} />
            <Bar dataKey="avgMinutes" name="Avg Resolution" radius={[0,4,4,0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── Customer SLA Table ────────────────────────────────────────────────────────
function CustomerSlaTable({ tickets, range }) {
  const [sortCol, setSortCol] = useState('compliance')
  const [sortAsc, setSortAsc] = useState(false)

  const rows = useMemo(() => {
    const map = {}
    const now = new Date()
    tickets.forEach(t => {
      if (!t.customer_name) return
      const created = new Date(t.created_at)
      if (created < range.start || created > range.end) return
      const n = t.customer_name
      if (!map[n]) map[n] = { customer: n, total: 0, withSla: 0, breached: 0, met: 0, open: 0, resolved: 0 }
      map[n].total++
      const isResolved = ['resolved','closed'].includes(t.status)
      if (isResolved) map[n].resolved++; else map[n].open++
      if (!t.sla_due_date) return
      map[n].withSla++
      const due = new Date(t.sla_due_date)
      const checkTime = isResolved && t.updated_at ? new Date(t.updated_at) : now
      if (due < checkTime) map[n].breached++; else map[n].met++
    })
    return Object.values(map).map(r => ({ ...r, compliance: r.withSla > 0 ? Math.round((r.met / r.withSla) * 100) : null }))
  }, [tickets, range])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortCol] ?? -1, bv = b[sortCol] ?? -1
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc ? av - bv : bv - av
    })
  }, [rows, sortCol, sortAsc])

  const toggle = (col) => { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(false) } }
  const SortIcon = ({ col }) => sortCol === col ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null
  const compColor = (r) => r >= 90 ? 'text-emerald-500' : r >= 70 ? 'text-amber-500' : 'text-rose-500'
  const compBar   = (r) => r >= 90 ? 'bg-emerald-500' : r >= 70 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <Card title="SLA Compliance by Customer">
      {rows.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">No ticket data in this range</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                {[['customer','Customer'],['total','Total'],['open','Open'],['resolved','Resolved'],['withSla','With SLA'],['breached','Breached'],['compliance','Compliance']].map(([col, label]) => (
                  <th key={col} onClick={() => toggle(col)}
                    className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-200 select-none">
                    <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.customer} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-2 font-medium text-slate-900 dark:text-white text-xs">{row.customer}</td>
                  <td className="py-2.5 px-2 text-slate-500 text-xs">{row.total}</td>
                  <td className="py-2.5 px-2 text-blue-500 text-xs">{row.open}</td>
                  <td className="py-2.5 px-2 text-emerald-500 text-xs">{row.resolved}</td>
                  <td className="py-2.5 px-2 text-slate-500 text-xs">{row.withSla}</td>
                  <td className="py-2.5 px-2 text-xs">{row.breached > 0 ? <span className="text-rose-500 font-semibold">{row.breached}</span> : <span className="text-emerald-500">0</span>}</td>
                  <td className="py-2.5 px-2">
                    {row.compliance !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-1.5 rounded-full ${compBar(row.compliance)}`} style={{ width: row.compliance + '%' }} />
                        </div>
                        <span className={`text-xs font-semibold ${compColor(row.compliance)}`}>{row.compliance}%</span>
                      </div>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── AR Aging Table ────────────────────────────────────────────────────────────
function InvoiceAgingTable({ invoices }) {
  const BUCKETS = [
    { label: 'Current',    cls: 'bg-emerald-100 text-emerald-700', max: 0 },
    { label: '1-30 Days',  cls: 'bg-amber-100 text-amber-700',     max: 30 },
    { label: '31-60 Days', cls: 'bg-orange-100 text-orange-700',   max: 60 },
    { label: '61-90 Days', cls: 'bg-rose-100 text-rose-700',       max: 90 },
    { label: '90+ Days',   cls: 'bg-red-200 text-red-800',         max: Infinity },
  ]

  const getBucket = (due) => {
    const days = Math.floor((Date.now() - new Date(due)) / 86400000)
    if (days <= 0) return 0
    if (days <= 30) return 1
    if (days <= 60) return 2
    if (days <= 90) return 3
    return 4
  }

  const unpaid = invoices.filter(i => ['sent','overdue','partial'].includes(i.status))
  const custMap = {}
  unpaid.forEach(inv => {
    const n = inv.customer_name || 'Unknown'
    const bal = Math.max(0, (inv.total || 0) - (inv.amount_paid || 0))
    const b = getBucket(inv.due_date)
    if (!custMap[n]) custMap[n] = { name: n, buckets: [0,0,0,0,0], total: 0 }
    custMap[n].buckets[b] += bal
    custMap[n].total += bal
  })
  const rows = Object.values(custMap).sort((a, b) => b.total - a.total)
  const totals = [0,0,0,0,0]
  rows.forEach(r => r.buckets.forEach((v, i) => { totals[i] += v }))
  const grandTotal = totals.reduce((s, v) => s + v, 0)
  const bucketCounts = BUCKETS.map((_, i) => unpaid.filter(inv => getBucket(inv.due_date) === i).length)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {BUCKETS.map((b, i) => (
          <div key={b.label} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.cls} inline-block mb-2`}>{b.label}</span>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{fmtCurrency(totals[i])}</p>
            <p className="text-xs text-slate-400">{bucketCounts[i]} invoice{bucketCounts[i] !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
      <Card title="AR Aging Detail" extra={<span className="text-xs text-slate-400">Outstanding: <strong className="text-slate-700 dark:text-slate-300">{fmtCurrency(grandTotal)}</strong></span>}>
        {rows.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No outstanding invoices — all caught up!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  <th className="text-left py-2 font-medium">Customer</th>
                  {BUCKETS.map(b => <th key={b.label} className="text-right py-2 font-medium">{b.label}</th>)}
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white text-xs">{row.name}</td>
                    {row.buckets.map((v, i) => (
                      <td key={i} className={`py-2.5 text-right text-xs ${v > 0 ? (i === 0 ? 'text-emerald-600' : i <= 2 ? 'text-amber-600' : 'text-rose-600 font-semibold') : 'text-slate-300 dark:text-slate-600'}`}>
                        {v > 0 ? fmtCurrency(v) : '—'}
                      </td>
                    ))}
                    <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white text-xs">{fmtCurrency(row.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-bold text-xs">
                  <td className="py-2.5 text-slate-900 dark:text-white">Total</td>
                  {totals.map((v, i) => (
                    <td key={i} className={`py-2.5 text-right ${v > 0 ? (i === 0 ? 'text-emerald-600' : i <= 2 ? 'text-amber-600' : 'text-rose-600') : 'text-slate-300 dark:text-slate-600'}`}>
                      {v > 0 ? fmtCurrency(v) : '—'}
                    </td>
                  ))}
                  <td className="py-2.5 text-right text-slate-900 dark:text-white">{fmtCurrency(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const supabase = createSupabaseBrowserClient()
  const [tickets,     setTickets]     = useState([])
  const [invoices,    setInvoices]    = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [range,       setRange]       = useState('30d')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [t, i, te] = await Promise.all([
        supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('invoices').select('*').order('issue_date', { ascending: false }).limit(500),
        supabase.from('time_entries').select('*').order('date', { ascending: false }).limit(1000),
      ])
      setTickets(t.data ?? [])
      setInvoices(i.data ?? [])
      setTimeEntries(te.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const selectedRange = getRange(range)

  const rangeTickets  = useMemo(() => tickets.filter(t => inRange(t.created_at, selectedRange)), [tickets, range])
  const rangeEntries  = useMemo(() => timeEntries.filter(e => inRange(e.date, selectedRange)),   [timeEntries, range])

  const kpis = useMemo(() => {
    const revenue = invoices
      .filter(i => i.status === 'paid' && inRange(i.paid_date || i.issue_date, selectedRange))
      .reduce((s, i) => s + (i.total || 0), 0)
    const billableHours = Math.round(rangeEntries.filter(e => e.billable).reduce((s, e) => s + e.minutes, 0) / 60)
    const withSla = rangeTickets.filter(t => t.sla_due_date)
    const now = new Date()
    const breached = withSla.filter(t => {
      const resolved = ['resolved','closed'].includes(t.status)
      const check = resolved && t.updated_at ? new Date(t.updated_at) : now
      return new Date(t.sla_due_date) < check
    })
    const slaRate = withSla.length ? Math.round((breached.length / withSla.length) * 100) : 0
    return { revenue, billableHours, slaRate, ticketCount: rangeTickets.length }
  }, [rangeTickets, rangeEntries, invoices])

  const revenueByCustomer = useMemo(() => {
    const map = {}
    invoices.filter(i => i.status === 'paid' && inRange(i.paid_date || i.issue_date, selectedRange)).forEach(i => {
      const n = i.customer_name || 'Unknown'
      map[n] = (map[n] || 0) + (i.total || 0)
    })
    return Object.entries(map).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) })).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  }, [invoices, range])

  const ticketsByPriority = useMemo(() => {
    const map = { critical: 0, high: 0, medium: 0, low: 0 }
    rangeTickets.forEach(t => { if (map[t.priority] !== undefined) map[t.priority]++ })
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))
  }, [rangeTickets])

  const hoursByCustomer = useMemo(() => {
    const map = {}
    rangeEntries.filter(e => e.billable).forEach(e => {
      const n = e.customer_name || 'Unknown'
      map[n] = (map[n] || 0) + (e.minutes || 0)
    })
    return Object.entries(map).map(([name, mins]) => ({ name, hours: Math.round(mins / 60 * 10) / 10 })).sort((a, b) => b.hours - a.hours).slice(0, 8)
  }, [rangeEntries])

  const techPerf = useMemo(() => {
    const map = {}
    rangeTickets.forEach(t => {
      const tech = t.assigned_to || 'Unassigned'
      if (!map[tech]) map[tech] = { tickets: 0, resolved: 0, breached: 0 }
      map[tech].tickets++
      if (['resolved','closed'].includes(t.status)) map[tech].resolved++
      if (t.sla_due_date) {
        const check = ['resolved','closed'].includes(t.status) && t.updated_at ? new Date(t.updated_at) : new Date()
        if (new Date(t.sla_due_date) < check) map[tech].breached++
      }
    })
    rangeEntries.forEach(e => {
      const tech = e.technician || 'Unknown'
      if (!map[tech]) map[tech] = { tickets: 0, resolved: 0, breached: 0, mins: 0 }
      map[tech].mins = (map[tech].mins || 0) + (e.minutes || 0)
    })
    return Object.entries(map)
      .filter(([n]) => n !== 'Unassigned' && n !== 'Unknown')
      .map(([name, d]) => ({
        name,
        tickets: d.tickets,
        resolved: d.resolved,
        rate: d.tickets ? Math.round((d.resolved / d.tickets) * 100) : 0,
        hours: Math.round((d.mins || 0) / 60 * 10) / 10,
        breached: d.breached,
      }))
      .sort((a, b) => b.resolved - a.resolved)
  }, [rangeTickets, rangeEntries])

  const techUtil = useMemo(() => {
    const map = {}
    rangeEntries.forEach(e => {
      const tech = e.technician || 'Unknown'
      if (!map[tech]) map[tech] = { billable: 0, total: 0 }
      map[tech].total += e.minutes || 0
      if (e.billable) map[tech].billable += e.minutes || 0
    })
    return Object.entries(map)
      .filter(([t]) => t !== 'Unknown')
      .map(([tech, d]) => ({
        tech,
        billableHours: Math.round(d.billable / 60 * 10) / 10,
        totalHours: Math.round(d.total / 60 * 10) / 10,
        utilization: d.total > 0 ? Math.round((d.billable / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.utilization - a.utilization)
  }, [rangeEntries])

  const frtData = useMemo(() => {
    const map = {}
    tickets.filter(t => t.first_response_at && t.created_at).forEach(t => {
      const tech = t.assigned_to || 'Unassigned'
      const mins = Math.round((new Date(t.first_response_at) - new Date(t.created_at)) / 60000)
      if (!map[tech]) map[tech] = { total: 0, count: 0 }
      map[tech].total += mins; map[tech].count++
    })
    return Object.entries(map)
      .filter(([t]) => t !== 'Unassigned')
      .map(([tech, d]) => ({ tech, avgMins: Math.round(d.total / d.count), count: d.count }))
      .sort((a, b) => a.avgMins - b.avgMins)
  }, [tickets])

  const profitData = useMemo(() => {
    const map = {}
    invoices.filter(i => i.status === 'paid' && inRange(i.paid_date || i.issue_date, selectedRange)).forEach(i => {
      const n = i.customer_name || 'Unknown'
      if (!map[n]) map[n] = { revenue: 0, cost: 0 }
      map[n].revenue += i.total || 0
    })
    rangeEntries.filter(e => e.billable && e.hourly_rate).forEach(e => {
      const n = e.customer_name || 'Unknown'
      if (!map[n]) map[n] = { revenue: 0, cost: 0 }
      map[n].cost += ((e.minutes || 0) / 60) * (e.hourly_rate || 0)
    })
    return Object.entries(map)
      .map(([name, d]) => ({ name, revenue: Math.round(d.revenue), cost: Math.round(d.cost), profit: Math.round(d.revenue - d.cost) }))
      .sort((a, b) => b.profit - a.profit).slice(0, 10)
  }, [invoices, rangeEntries, range])

  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  if (loading) return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-7 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-9 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array(4).fill(0).map((_,i) => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array(4).fill(0).map((_,i) => <div key={i} className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Performance metrics for <strong>{RANGE_LABELS[range]}</strong></p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} className={sel}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="6m">Last 6 months</option>
          <option value="12m">Last 12 months</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Revenue',        value: fmtCurrency(kpis.revenue),        icon: TrendingUp,  color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Billable Hours', value: kpis.billableHours + 'h',          icon: Clock,       color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Tickets Opened', value: kpis.ticketCount,                  icon: Ticket,      color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'SLA Breach Rate',value: kpis.slaRate + '%',                icon: AlertTriangle, color: kpis.slaRate > 20 ? 'text-rose-500' : 'text-emerald-500', bg: kpis.slaRate > 20 ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket Volume */}
      <TicketVolumeChart tickets={tickets} range={selectedRange} />

      {/* Revenue Forecast */}
      <RevenueForecast invoices={invoices} />

      {/* Resolution time + Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResolutionTimeByTech tickets={tickets} range={selectedRange} />
        <div className="space-y-4">
          <Card title="Ticket Priority Breakdown">
            {ticketsByPriority.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No ticket data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={ticketsByPriority} dataKey="value" cx="50%" cy="50%" outerRadius={52} innerRadius={30}>
                      {ticketsByPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={ttStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {ticketsByPriority.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="capitalize text-slate-900 dark:text-white">{p.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card title="Billable Hours by Customer">
            {hoursByCustomer.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-4">No billable time in this range</p>
            ) : (
              <div className="space-y-2">
                {hoursByCustomer.map(({ name, hours }) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-24 truncate">{name}</span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${Math.min(100, (hours / (hoursByCustomer[0]?.hours || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-slate-900 dark:text-white w-10 text-right">{hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Customer SLA Table */}
      <CustomerSlaTable tickets={tickets} range={selectedRange} />

      {/* Revenue by Customer */}
      <Card title="Revenue by Customer">
        {revenueByCustomer.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-10">No paid invoices in this range</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueByCustomer} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => '$' + v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#f1f5f9' }} width={110} />
              <Tooltip contentStyle={ttStyle} formatter={v => [fmtCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill="#10b981" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Customer Profitability */}
      <Card title="Customer Profitability" subtitle="Revenue collected vs. time cost (billable hours × hourly rate) per customer">
        {profitData.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No profitability data in this range</p>
        ) : (
          <div className="space-y-3 mt-2">
            {profitData.map(row => (
              <div key={row.name} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-32 truncate flex-shrink-0">{row.name}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (row.revenue / (profitData[0]?.revenue || 1)) * 100))}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-rose-500/60 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (row.cost / (profitData[0]?.revenue || 1)) * 100))}%` }} />
                  </div>
                  <span className={`text-xs font-semibold w-20 text-right ${row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.profit >= 0 ? '+' : ''}{fmtCurrency(row.profit)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 w-28 text-right hidden sm:block">{fmtCurrency(row.revenue)} / {fmtCurrency(row.cost)}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Revenue</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-rose-400 inline-block" /> Time Cost</span>
              <span className="ml-auto">Profit = Revenue − Time Cost</span>
            </div>
          </div>
        )}
      </Card>

      {/* Technician Performance */}
      <Card title="Technician Performance">
        {techPerf.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No technician data in this range</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-400">
                  {['Technician','Assigned','Resolved','Resolution %','Hours Logged','SLA Breaches'].map(h => (
                    <th key={h} className="text-left py-2 font-medium last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techPerf.map(row => (
                  <tr key={row.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white text-xs">{row.name}</td>
                    <td className="py-2.5 text-slate-400 text-xs">{row.tickets}</td>
                    <td className="py-2.5 text-emerald-600 font-medium text-xs">{row.resolved}</td>
                    <td className="py-2.5 text-xs">
                      <span className={`font-semibold ${row.rate >= 80 ? 'text-emerald-600' : row.rate >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{row.rate}%</span>
                    </td>
                    <td className="py-2.5 text-slate-400 text-xs">{row.hours}h</td>
                    <td className="py-2.5 text-right text-xs">{row.breached > 0 ? <span className="text-rose-600 font-medium">{row.breached}</span> : <span className="text-emerald-600">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* First Response Time + Tech Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="First Response Time" extra={frtData.length > 0 && (() => {
          const avg = Math.round(frtData.reduce((s, r) => s + r.avgMins * r.count, 0) / frtData.reduce((s, r) => s + r.count, 0))
          return <span className={`text-sm font-bold ${avg <= 60 ? 'text-emerald-500' : avg <= 240 ? 'text-amber-500' : 'text-rose-500'}`}>Avg: {fmtMins(avg)}</span>
        })()}>
          {frtData.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-6">No first-response data yet. Tracked when technicians reply to client tickets.</p>
          ) : (
            <div className="space-y-3">
              {frtData.map(row => (
                <div key={row.tech} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-36 truncate flex-shrink-0">{row.tech}</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full ${row.avgMins <= 60 ? 'bg-emerald-500' : row.avgMins <= 240 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(100, (row.avgMins / (frtData[frtData.length-1]?.avgMins || 1)) * 100)}%` }} />
                  </div>
                  <span className={`text-xs font-semibold w-16 text-right ${row.avgMins <= 60 ? 'text-emerald-600' : row.avgMins <= 240 ? 'text-amber-600' : 'text-rose-600'}`}>{fmtMins(row.avgMins)}</span>
                  <span className="text-[11px] text-slate-400 w-14 text-right">{row.count} ticket{row.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> ≤1h</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-500 inline-block" /> 1-4h</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-rose-500 inline-block" /> &gt;4h</span>
              </div>
            </div>
          )}
        </Card>

        <Card title="Technician Utilization" subtitle="Billable ÷ total logged hours — target ≥75%">
          {techUtil.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-6">No time entries in this range</p>
          ) : (
            <div className="space-y-3">
              {techUtil.map(row => (
                <div key={row.tech} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-900 dark:text-white font-medium truncate max-w-[160px]">{row.tech}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-slate-400">{row.billableHours}h bill / {row.totalHours}h total</span>
                      <span className={`font-bold w-10 text-right ${row.utilization >= 75 ? 'text-emerald-600' : row.utilization >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{row.utilization}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-2 rounded-full ${row.utilization >= 75 ? 'bg-emerald-500' : row.utilization >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: row.utilization + '%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* AR Aging */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Accounts Receivable Aging</h2>
        <InvoiceAgingTable invoices={invoices} />
      </div>
    </div>
  )
}