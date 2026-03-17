'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency, getSlaState } from '@valhalla/utils'
import { Ticket, DollarSign, Users, Clock, AlertTriangle } from 'lucide-react'
import type { Ticket as TicketType, Invoice, TimeEntry, Customer } from '@valhalla/types'

export const metadata = { title: 'Dashboard' }

function StatCard({
  title, value, icon: Icon, color, sub,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient()

  const { data: tickets = [], isError: tErr } = useQuery<TicketType[]>({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })

  const { data: timeEntries = [] } = useQuery<TimeEntry[]>({
    queryKey: ['timeEntries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries').select('*').order('date', { ascending: false }).limit(200)
      if (error) throw error
      return data
    },
  })

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers').select('*').limit(100)
      if (error) throw error
      return data
    },
  })

  const stats = useMemo(() => {
    const openTickets    = tickets.filter(t => !['resolved','closed'].includes(t.status))
    const breachedSlas   = openTickets.filter(t => getSlaState(t.sla_due_date, t.status) === 'breached')
    const activeCustomers = customers.filter(c => c.status === 'active')
    const paidInvoices   = invoices.filter(i => i.status === 'paid')
    const monthRevenue   = paidInvoices.reduce((s, i) => s + (i.total ?? 0), 0)
    const billableHours  = Math.round(
      timeEntries.filter(e => e.billable).reduce((s, e) => s + e.minutes, 0) / 60
    )
    return { openTickets, breachedSlas, activeCustomers, monthRevenue, billableHours }
  }, [tickets, invoices, timeEntries, customers])

  const recentTickets = tickets.slice(0, 8)

  const priorityBadge: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high:     'bg-orange-100 text-orange-700',
    medium:   'bg-amber-100 text-amber-700',
    low:      'bg-emerald-100 text-emerald-700',
  }
  const statusBadge: Record<string, string> = {
    open:        'bg-blue-100 text-blue-700',
    in_progress: 'bg-violet-100 text-violet-700',
    waiting:     'bg-amber-100 text-amber-700',
    resolved:    'bg-emerald-100 text-emerald-700',
    closed:      'bg-slate-100 text-slate-600',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Welcome back — here's what needs attention.</p>
      </div>

      {tErr && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          Failed to load dashboard data. Check your connection and refresh.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Open Tickets" value={stats.openTickets.length}
          icon={Ticket} color="bg-amber-100 dark:bg-amber-950/40 text-amber-600"
          sub={`${stats.openTickets.filter(t => t.status === 'in_progress').length} in progress`}
        />
        <StatCard
          title="SLA Breached" value={stats.breachedSlas.length}
          icon={AlertTriangle}
          color={stats.breachedSlas.length > 0 ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}
          sub="need immediate attention"
        />
        <StatCard
          title="Active Customers" value={stats.activeCustomers.length}
          icon={Users} color="bg-blue-100 dark:bg-blue-950/40 text-blue-600"
          sub={`${customers.length} total`}
        />
        <StatCard
          title="Billable Hours" value={stats.billableHours}
          icon={Clock} color="bg-violet-100 dark:bg-violet-950/40 text-violet-600"
          sub={formatCurrency(stats.monthRevenue) + ' logged'}
        />
      </div>

      {/* Recent tickets */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Recent Tickets</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentTickets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No tickets yet</p>
          ) : (
            recentTickets.map(ticket => (
              <div key={ticket.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ticket.title}</p>
                  <p className="text-xs text-slate-400 truncate">{ticket.customer_name ?? '—'}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityBadge[ticket.priority]}`}>
                  {ticket.priority}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadge[ticket.status]}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
