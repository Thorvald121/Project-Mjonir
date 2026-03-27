// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import {
  Shield, Search, ChevronRight, User, Clock,
  Ticket, FileText, Users, DollarSign, Package,
  FileSignature, RefreshCw, Filter,
} from 'lucide-react'

const TABLE_ICONS = {
  tickets:   Ticket,
  invoices:  DollarSign,
  customers: Users,
  contracts: FileSignature,
  quotes:    FileText,
  inventory_items: Package,
  ticket_comments: Ticket,
}

const ACTION_CLS = {
  INSERT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
}

const TABLE_HREFS = {
  tickets:   (id) => `/tickets/${id}`,
  invoices:  () => `/invoices`,
  customers: (id) => `/customers/${id}`,
  contracts: () => `/contracts`,
  quotes:    () => `/quotes`,
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtRelative(d) {
  if (!d) return ''
  const secs = Math.round((Date.now() - new Date(d)) / 1000)
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// Summarise the change into a human-readable line
function summariseChange(entry) {
  const { action, table_name, record_title, changed_fields } = entry
  if (action === 'INSERT') return `Created ${singularise(table_name)} "${record_title || '—'}"`
  if (action === 'DELETE') return `Deleted ${singularise(table_name)} "${record_title || '—'}"`
  if (!changed_fields || !Object.keys(changed_fields).length) return `Updated ${singularise(table_name)}`

  const fields = Object.keys(changed_fields)
  const readable = fields.slice(0, 3).map(f => {
    const { from, to } = changed_fields[f]
    const label = f.replace(/_/g, ' ')
    if (to === null || to === '') return `cleared ${label}`
    if (from === null || from === '') return `set ${label} to "${String(to).slice(0, 40)}"`
    return `changed ${label} from "${String(from).slice(0, 20)}" to "${String(to).slice(0, 20)}"`
  })
  const extra = fields.length > 3 ? ` +${fields.length - 3} more` : ''
  return readable.join(', ') + extra
}

function singularise(table) {
  const map = {
    tickets: 'ticket', invoices: 'invoice', customers: 'customer',
    contracts: 'contract', quotes: 'quote', inventory_items: 'asset',
    ticket_comments: 'comment',
  }
  return map[table] || table.replace(/_/g, ' ')
}

export default function AuditLogPage() {
  const router    = useRouter()
  const supabase  = createSupabaseBrowserClient()
  const [log,     setLog]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [tableFilter, setTableFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [page,    setPage]    = useState(0)
  const PAGE_SIZE = 50

  const loadLog = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setLog(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLog() }, [])

  const users   = useMemo(() => [...new Set(log.map(l => l.actor_email).filter(Boolean))].sort(), [log])
  const tables  = useMemo(() => [...new Set(log.map(l => l.table_name).filter(Boolean))].sort(), [log])

  const filtered = useMemo(() => log.filter(l => {
    if (tableFilter  !== 'all' && l.table_name  !== tableFilter)  return false
    if (actionFilter !== 'all' && l.action      !== actionFilter) return false
    if (userFilter   !== 'all' && l.actor_email !== userFilter)   return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (l.record_title || '').toLowerCase().includes(q) ||
        (l.actor_email  || '').toLowerCase().includes(q) ||
        (l.actor_name   || '').toLowerCase().includes(q) ||
        (l.table_name   || '').toLowerCase().includes(q)
      )
    }
    return true
  }), [log, tableFilter, actionFilter, userFilter, search])

  const paged   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pages   = Math.ceil(filtered.length / PAGE_SIZE)

  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-500" /> Audit Log
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Complete record of who changed what and when.</p>
        </div>
        <button onClick={loadLog} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search records, users…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={tableFilter} onChange={e => { setTableFilter(e.target.value); setPage(0) }} className={sel}>
          <option value="all">All tables</option>
          {tables.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0) }} className={sel}>
          <option value="all">All actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(0) }} className={sel}>
          <option value="all">All users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* Log table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded w-64" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-40" />
                </div>
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No audit entries found</p>
            <p className="text-slate-400 text-sm mt-1">Entries appear automatically as changes are made</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paged.map(entry => {
              const Icon  = TABLE_ICONS[entry.table_name] || FileText
              const href  = TABLE_HREFS[entry.table_name]?.(entry.record_id)
              return (
                <div key={entry.id}
                  className={`flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${href ? 'cursor-pointer' : ''}`}
                  onClick={() => href && router.push(href)}>
                  {/* Table icon */}
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ACTION_CLS[entry.action] ?? ''}`}>
                        {entry.action === 'INSERT' ? 'Created' : entry.action === 'DELETE' ? 'Deleted' : 'Updated'}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">{entry.table_name?.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm text-slate-900 dark:text-white mt-0.5 break-words">{summariseChange(entry)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-400">{entry.actor_name || entry.actor_email || 'System'}</span>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{fmtRelative(entry.created_at)}</p>
                    <p className="text-[11px] text-slate-300 dark:text-slate-600 mt-0.5">{fmtDate(entry.created_at)}</p>
                  </div>

                  {href && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-2" />}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Previous
            </button>
            <span className="text-xs text-slate-400">Page {page + 1} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page === pages - 1}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}