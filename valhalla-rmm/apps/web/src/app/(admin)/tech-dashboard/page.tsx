// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  User, Ticket, AlertTriangle, CheckCircle2,
  ChevronRight, Flame, Clock,
} from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) ref.current()
    }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
const PRIORITY_DOT   = { critical: 'bg-rose-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-slate-300' }
const STATUS_CLS     = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  waiting:     'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
}

function slaState(sla_due_date) {
  if (!sla_due_date) return 'ok'
  const diff = new Date(sla_due_date).getTime() - Date.now()
  if (diff < 0) return 'breached'
  if (diff < 4 * 3600 * 1000) return 'warning'
  return 'ok'
}

function SlaChip({ sla_due_date }) {
  const state = slaState(sla_due_date)
  if (state === 'ok') return null
  const diff     = new Date(sla_due_date).getTime() - Date.now()
  const hoursLeft = Math.abs(Math.floor(diff / 3600000))
  if (state === 'breached') return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
      <Flame className="w-2.5 h-2.5" /> Breached
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
      <AlertTriangle className="w-2.5 h-2.5" /> {hoursLeft}h left
    </span>
  )
}

function TechCard({ tech, tickets, onTicketClick }) {
  const breached  = tickets.filter(t => slaState(t.sla_due_date) === 'breached')
  const warning   = tickets.filter(t => slaState(t.sla_due_date) === 'warning')
  const critical  = tickets.filter(t => t.priority === 'critical')
  const riskLevel = breached.length > 0 ? 'high' : warning.length > 0 ? 'medium' : 'ok'

  const initials = tech === 'Unassigned' ? '?' : tech.split('@')[0].slice(0, 2).toUpperCase()
  const displayName = tech === 'Unassigned' ? 'Unassigned' : tech.split('@')[0]

  const borderCls = riskLevel === 'high'
    ? 'border-rose-400 dark:border-rose-700'
    : riskLevel === 'medium'
    ? 'border-amber-400 dark:border-amber-700'
    : 'border-slate-200 dark:border-slate-800'

  const avatarBg = riskLevel === 'high'
    ? 'bg-rose-100 dark:bg-rose-950/40'
    : riskLevel === 'medium'
    ? 'bg-amber-100 dark:bg-amber-950/40'
    : 'bg-slate-100 dark:bg-slate-800'

  const avatarColor = riskLevel === 'high'
    ? 'text-rose-600'
    : riskLevel === 'medium'
    ? 'text-amber-600'
    : 'text-slate-500'

  const sortedTickets = [...tickets].sort((a, b) => {
    const aB = slaState(a.sla_due_date) === 'breached'
    const bB = slaState(b.sla_due_date) === 'breached'
    if (aB && !bB) return -1
    if (!aB && bB) return 1
    return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  })

  const loadPct = Math.min(100, Math.round((tickets.length / 12) * 100))
  const loadColor = tickets.length >= 10 ? 'bg-rose-500' : tickets.length >= 6 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border ${borderCls} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${avatarBg} flex items-center justify-center flex-shrink-0`}>
              <span className={`text-sm font-bold ${avatarColor}`}>{initials}</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">{displayName}</p>
              <p className="text-xs text-slate-400">{tickets.length} active ticket{tickets.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {breached.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <Flame className="w-3 h-3" /> {breached.length} breached
              </span>
            )}
            {warning.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" /> {warning.length} at risk
              </span>
            )}
            {critical.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-800">
                {critical.length} critical
              </span>
            )}
          </div>
        </div>

        {/* Load bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Load</span>
            <span>{tickets.length} / 12 capacity</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${loadColor}`} style={{ width: loadPct + '%' }} />
          </div>
        </div>
      </div>

      {/* Ticket list */}
      <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-72 overflow-y-auto">
        {sortedTickets.map(t => (
          <button key={t.id} onClick={() => onTicketClick(t.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-slate-300'}`} />
            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate group-hover:text-amber-600 transition-colors">{t.title}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SlaChip sla_due_date={t.sla_due_date} />
              {STATUS_CLS[t.status] && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_CLS[t.status]}`}>
                  {t.status.replace('_', ' ')}
                </span>
              )}
              {t.customer_name && (
                <span className="text-[10px] text-slate-400 hidden sm:inline truncate max-w-[80px]">{t.customer_name}</span>
              )}
              <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-amber-500 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function TechDashboardPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)

  const loadAll = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('id,title,status,priority,assigned_to,customer_name,sla_due_date,created_at')
      .not('status', 'in', '("resolved","closed")')
      .order('created_at', { ascending: false })
      .limit(500)
    setTickets(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  useRealtimeRefresh(['tickets'], loadAll)

  // Group by assigned_to, sort by most tickets
  const grouped = Object.entries(
    tickets.reduce((map, t) => {
      const key = t.assigned_to || 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(t)
      return map
    }, {})
  ).sort((a, b) => b[1].length - a[1].length)

  const totalBreached = tickets.filter(t => slaState(t.sla_due_date) === 'breached').length
  const totalWarning  = tickets.filter(t => slaState(t.sla_due_date) === 'warning').length
  const totalCritical = tickets.filter(t => t.priority === 'critical').length
  const techCount     = grouped.filter(([k]) => k !== 'Unassigned').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tech Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Live view of all active tickets by technician</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Tickets',   value: tickets.length,  icon: Ticket,       color: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Technicians',      value: techCount,        icon: User,         color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'SLA Breached',     value: totalBreached,   icon: Flame,        color: 'text-rose-600',  bg: 'bg-rose-50 dark:bg-rose-950/30' },
          { label: 'SLA At Risk (4h)', value: totalWarning,    icon: AlertTriangle,color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Technician cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="font-semibold text-slate-900 dark:text-white">All clear</p>
          <p className="text-sm text-slate-400 mt-1">No active tickets right now.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(([tech, techTickets]) => (
            <TechCard
              key={tech}
              tech={tech}
              tickets={techTickets}
              onTicketClick={(id) => router.push(`/tickets/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}