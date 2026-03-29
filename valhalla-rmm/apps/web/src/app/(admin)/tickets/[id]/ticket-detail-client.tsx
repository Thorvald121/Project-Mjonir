// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Clock, User, Building2, Loader2,
  Lock, Mail, MessageSquare, Send, AlertTriangle,
  Tag, ChevronDown, Paperclip, Play, Square, Timer,
  BookOpen, Search, X, Sparkles, HardDrive, GitMerge, Activity,
} from 'lucide-react'

const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  high:     'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
}
const STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  in_progress: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  waiting:     'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  resolved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const lbl = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '—' }
}

function LiveTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  const pad = (n) => String(n).padStart(2, '0')
  return (
    <span className="font-mono text-sm font-semibold text-violet-600 dark:text-violet-400">
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  )
}

// ── Watchers / CC Field ───────────────────────────────────────────────────────
function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const supabase  = createSupabaseBrowserClient()
  const [events,  setEvents]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ticketId) return
    const load = async () => {
      setLoading(true)
      // Pull from audit_log for this ticket
      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('*')
        .eq('table_name', 'tickets')
        .eq('record_id', ticketId)
        .order('created_at', { ascending: true })
        .limit(100)

      // Pull time entries
      const { data: timeRows } = await supabase
        .from('time_entries')
        .select('id,technician,minutes,description,billable,created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
        .limit(50)

      // Build unified event list
      const events: any[] = []

      for (const row of auditRows ?? []) {
        if (row.action === 'INSERT') {
          events.push({ id: row.id, type: 'created', at: row.created_at, actor: row.actor_name || row.actor_email || 'System', detail: 'Ticket created' })
        } else if (row.action === 'UPDATE' && row.changed_fields) {
          const fields = Object.keys(row.changed_fields)
          for (const field of fields) {
            const { from: f, to: t } = row.changed_fields[field]
            const detail = (() => {
              if (field === 'status')      return `Status changed from "${f}" to "${t}"`
              if (field === 'priority')    return `Priority changed from "${f}" to "${t}"`
              if (field === 'assigned_to') return t ? `Assigned to ${t}` : 'Unassigned'
              if (field === 'category')    return `Category set to "${t}"`
              if (field === 'sla_due_date')return `SLA due date set to ${t ? new Date(t).toLocaleDateString() : 'cleared'}`
              if (field === 'title')       return `Title updated`
              if (field === 'customer_name') return `Customer linked: ${t}`
              return `${field.replace(/_/g,' ')} updated`
            })()
            events.push({ id: `${row.id}-${field}`, type: 'update', field, at: row.created_at, actor: row.actor_name || row.actor_email || 'System', detail })
          }
        }
      }

      for (const row of timeRows ?? []) {
        const hrs = Math.floor((row.minutes || 0) / 60)
        const mins = (row.minutes || 0) % 60
        const dur = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
        events.push({
          id: `time-${row.id}`, type: 'time', at: row.created_at,
          actor: row.technician || 'Unknown',
          detail: `${dur} logged${row.description ? ` — ${row.description}` : ''}${row.billable ? '' : ' (non-billable)'}`,
        })
      }

      events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      setEvents(events)
      setLoading(false)
    }
    load()
  }, [ticketId])

  const ICON_CFG = {
    created: { dot: 'bg-emerald-500',  label: 'Created'  },
    update:  { dot: 'bg-blue-500',     label: 'Updated'  },
    time:    { dot: 'bg-violet-500',   label: 'Time'     },
  }

  const fmtAgo = (d: string) => {
    const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000)
    if (secs < 3600)  return `${Math.floor(secs/60)}m ago`
    if (secs < 86400) return `${Math.floor(secs/3600)}h ago`
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-4" />
      {[1,2,3].map(i => <div key={i} className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-2.5" />)}
    </div>
  )

  if (!events.length) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-400" /> Activity Timeline
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-100 dark:bg-slate-800" />
        <div className="space-y-3">
          {events.map(ev => {
            const cfg = ICON_CFG[ev.type] ?? ICON_CFG.update
            return (
              <div key={ev.id} className="flex items-start gap-3 pl-4 relative">
                <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot} ring-2 ring-white dark:ring-slate-900`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 dark:text-slate-300 break-words leading-relaxed">{ev.detail}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ev.actor} · {fmtAgo(ev.at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WatchersField({ ticket, onUpdate }) {
  const supabase = createSupabaseBrowserClient()
  const [input,  setInput]  = useState('')
  const [saving, setSaving] = useState(false)

  const watchers: string[] = Array.isArray(ticket?.watchers) ? ticket.watchers : []

  const add = async () => {
    const email = input.trim().toLowerCase()
    if (!email || !email.includes('@')) return
    if (watchers.includes(email)) { setInput(''); return }
    setSaving(true)
    await supabase.from('tickets').update({ watchers: [...watchers, email] }).eq('id', ticket.id)
    setSaving(false); setInput(''); onUpdate()
  }

  const remove = async (email: string) => {
    await supabase.from('tickets').update({ watchers: watchers.filter(w => w !== email) }).eq('id', ticket.id)
    onUpdate()
  }

  return (
    <div className="space-y-1.5">
      {watchers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {watchers.map(w => (
            <div key={w} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-600 dark:text-slate-300 max-w-[120px] truncate">{w}</span>
              <button onClick={() => remove(w)} className="text-slate-300 hover:text-rose-500 transition-colors"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add email & press Enter"
          className="flex-1 px-2 py-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-transparent placeholder:text-slate-300 focus:outline-none focus:border-amber-400" />
        {input && (
          <button onClick={add} disabled={saving}
            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs transition-colors">
            {saving ? '…' : '+'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Merge Ticket Dialog ───────────────────────────────────────────────────────
function MergeTicketDialog({ ticket, open, onClose, onMerged }) {
  const supabase  = createSupabaseBrowserClient()
  const [tickets, setTickets] = useState([])
  const [search,  setSearch]  = useState('')
  const [target,  setTarget]  = useState(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(null); setSearch('')
    supabase.from('tickets')
      .select('id,title,status,priority,customer_name,created_at')
      .not('id', 'eq', ticket.id)
      .not('status', 'in', '("closed")')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setTickets(data ?? []))
  }, [open])

  const filtered = tickets.filter(t =>
    !search ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.customer_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleMerge = async () => {
    if (!target) return
    setMerging(true)
    // Move all comments from this ticket to the target
    await supabase.from('ticket_comments').update({ ticket_id: target.id }).eq('ticket_id', ticket.id)
    // Move time entries
    await supabase.from('time_entries').update({ ticket_id: target.id }).eq('ticket_id', ticket.id)
    // Add a merge note to target
    await supabase.from('ticket_comments').insert({
      ticket_id:       target.id,
      organization_id: ticket.organization_id,
      author_name:     'System',
      content:         `Merged ticket: "${ticket.title}" (#${ticket.id.slice(-6).toUpperCase()})`,
      is_staff:        true,
      source:          'admin',
    })
    // Close this ticket
    await supabase.from('tickets').update({ status: 'closed' }).eq('id', ticket.id)
    setMerging(false)
    onMerged(target.id)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Merge Ticket</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-500">Select the ticket to merge <strong className="text-slate-700 dark:text-slate-300">into</strong>. All comments and time entries from <em>{ticket.title}</em> will be moved there, then this ticket will be closed.</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No tickets found</p>
            ) : filtered.map(t => (
              <button key={t.id} onClick={() => setTarget(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${target?.id === t.id ? 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.customer_name || 'No customer'} · {t.status}</p>
              </button>
            ))}
          </div>
          {target && (
            <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2 text-sm text-violet-700 dark:text-violet-300">
              Will merge into: <strong>{target.title}</strong>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleMerge} disabled={!target || merging}
              className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
              {merging ? 'Merging…' : 'Merge Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Asset Picker ──────────────────────────────────────────────────────────────
function AssetPicker({ ticket, orgId, onLinked }) {
  const supabase    = createSupabaseBrowserClient()
  const btnRef      = useRef(null)
  const [assets,    setAssets]    = useState([])
  const [search,    setSearch]    = useState('')
  const [open,      setOpen]      = useState(false)
  const [linked,    setLinked]    = useState(ticket?.linked_asset_id || null)
  const [assetName, setAssetName] = useState(null)
  const [dropPos,   setDropPos]   = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (linked) {
      supabase.from('inventory_items').select('name,model,vendor').eq('id', linked).single()
        .then(({ data }) => { if (data) setAssetName([data.name, data.vendor, data.model].filter(Boolean).join(' · ')) })
    }
  }, [linked])

  // Load assets when dropdown opens — fetch all for the org, filter client-side
  useEffect(() => {
    if (!open) return
    let query = supabase.from('inventory_items')
      .select('id,name,vendor,model,serial_number,asset_tag,status,category,customer_id,customer_name')
      .order('name').limit(200)
    // If ticket has a customer, prefer their assets but don't exclude others
    query.then(({ data }) => setAssets(data ?? []))
  }, [open])

  const openDropdown = () => {
    if (btnRef.current) {
      const rect       = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropHeight = 280
      const goUp       = spaceBelow < dropHeight && rect.top > dropHeight
      setDropPos({
        top:   goUp ? rect.top + window.scrollY - dropHeight - 4 : rect.bottom + window.scrollY + 4,
        left:  rect.left + window.scrollX,
        width: Math.max(rect.width, 300),
      })
    }
    setOpen(true)
  }

  const link = async (assetId, name) => {
    await supabase.from('tickets').update({ linked_asset_id: assetId }).eq('id', ticket.id)
    setLinked(assetId)
    setAssetName(name)
    setOpen(false)
    setSearch('')
    onLinked?.()
  }

  const unlink = async () => {
    await supabase.from('tickets').update({ linked_asset_id: null }).eq('id', ticket.id)
    setLinked(null)
    setAssetName(null)
    onLinked?.()
  }

  if (linked && assetName) return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0 overflow-hidden">
      <HardDrive className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">{assetName}</span>
      <button onClick={unlink} className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0 ml-auto">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  return (
    <>
      <button ref={btnRef} onClick={openDropdown}
        className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-400 hover:border-amber-400 hover:text-amber-500 transition-colors">
        <HardDrive className="w-3.5 h-3.5" />
        {linked ? 'Loading…' : 'Link an asset…'}
      </button>
      {open && typeof window !== 'undefined' && window.document.body && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 280), zIndex: 9999 }}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search assets…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {(() => {
                const q = search.trim().toLowerCase()
                const filtered = assets.filter(a =>
                  !q ||
                  a.name?.toLowerCase().includes(q) ||
                  a.vendor?.toLowerCase().includes(q) ||
                  a.model?.toLowerCase().includes(q) ||
                  a.serial_number?.toLowerCase().includes(q) ||
                  a.asset_tag?.toLowerCase().includes(q)
                )
                // Sort: customer's assets first
                const sorted = [...filtered].sort((a, b) => {
                  const aMatch = a.customer_id === ticket?.customer_id ? -1 : 0
                  const bMatch = b.customer_id === ticket?.customer_id ? -1 : 0
                  return aMatch - bMatch
                })
                if (sorted.length === 0) return (
                  <div className="px-4 py-5 text-center text-xs text-slate-400">
                    {assets.length === 0 ? 'No assets in inventory yet.' : 'No assets match your search.'}
                  </div>
                )
                return sorted.map(a => {
                  const label = [a.vendor, a.model].filter(Boolean).join(' ')
                  const isCustomerAsset = a.customer_id === ticket?.customer_id
                  return (
                    <button key={a.id} onClick={() => link(a.id, [a.name, label].filter(Boolean).join(' · '))}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{a.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {label}{a.serial_number ? ` · S/N: ${a.serial_number}` : ''}
                            {a.customer_name && !isCustomerAsset ? ` · ${a.customer_name}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isCustomerAsset && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">this customer</span>}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 capitalize">{a.status?.replace('_',' ')}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              })()}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── AI Triage Panel ───────────────────────────────────────────────────────────
function AiTriagePanel({ ticket, onTriageComplete }) {
  const supabase = createSupabaseBrowserClient()
  const [loading,    setLoading]    = useState(false)
  const [triage,     setTriage]     = useState(() => {
    if (ticket?.ai_triage) { try { return JSON.parse(ticket.ai_triage) } catch {} }
    return null
  })
  const [expanded,   setExpanded]   = useState(false)
  const [kbArticles, setKbArticles] = useState([])

  const PRIORITY_CLS = {
    critical: 'bg-rose-100 text-rose-700',
    high:     'bg-orange-100 text-orange-700',
    medium:   'bg-amber-100 text-amber-700',
    low:      'bg-emerald-100 text-emerald-700',
  }

  const runTriage = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        'https://yetrdrgagfovphrerpie.supabase.co/functions/v1/ai-triage-ticket',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey':        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify({
            ticket_id:       ticket.id,
            title:           ticket.title,
            description:     ticket.description || '',
            organization_id: ticket.organization_id,
          }),
        }
      )
      const data = await res.json()
      if (data.triage) {
        setTriage(data.triage)
        setExpanded(true)
        // Fetch suggested KB articles
        if (data.triage.suggested_kb_ids?.length > 0) {
          const { data: articles } = await supabase.from('knowledge_articles')
            .select('id,title,content,category')
            .in('id', data.triage.suggested_kb_ids)
          setKbArticles(articles ?? [])
        }
        onTriageComplete?.(data.triage)
      }
    } catch (err) { console.error('Triage error:', err) }
    setLoading(false)
  }

  if (!triage && !loading) return (
    <button onClick={runTriage}
      className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors font-medium">
      <Sparkles className="w-3.5 h-3.5" /> Run AI Triage
    </button>
  )

  if (loading) return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-violet-600 dark:text-violet-400">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing ticket…
    </div>
  )

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20 overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 text-sm"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="font-medium text-violet-700 dark:text-violet-300">AI Triage</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_CLS[triage?.priority] ?? ''}`}>{triage?.priority}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 capitalize">{triage?.category?.replace('_',' ')}</span>
          <span className="text-[10px] text-violet-500">{triage?.confidence}% confidence</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-violet-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-violet-200 dark:border-violet-800/50 pt-3">
          <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{triage?.reasoning}</p>
          {kbArticles.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> Suggested KB Articles
              </p>
              <div className="space-y-2">
                {kbArticles.map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <BookOpen className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{a.title}</p>
                      <p className="text-slate-400 line-clamp-1">{a.content?.replace(/[#*`]/g,'').slice(0,80)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={runTriage} className="text-[11px] text-violet-500 hover:text-violet-700 hover:underline">
            Re-run triage
          </button>
        </div>
      )}
    </div>
  )
}

// ── Canned Replies Picker ─────────────────────────────────────────────────────
function CannedRepliesPicker({ ticket, onSelect }) {
  const supabase = createSupabaseBrowserClient()
  const [open,    setOpen]    = useState(false)
  const [search,  setSearch]  = useState('')
  const [replies, setReplies] = useState([])

  useEffect(() => {
    supabase.from('canned_replies').select('*').eq('is_active', true).order('category').order('name')
      .then(({ data }) => setReplies(data ?? []))
  }, [])

  const filtered = replies.filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.body.toLowerCase().includes(search.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(filtered.map(r => r.category || 'General'))].sort()

  const apply = (reply) => {
    let body = reply.body
    if (ticket) {
      body = body
        .replace(/\{\{contact_name\}\}/g, ticket.contact_name || '')
        .replace(/\{\{ticket_title\}\}/g, ticket.title || '')
        .replace(/\{\{customer_name\}\}/g, ticket.customer_name || '')
    }
    onSelect(body)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 h-7 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <BookOpen className="w-3.5 h-3.5" /> Templates
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 bottom-full mb-2 left-0 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  {replies.length === 0 ? 'No canned replies yet. Create some in Settings → Canned Replies.' : 'No matches found.'}
                </div>
              ) : categories.map(cat => (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700">
                    {cat}
                  </div>
                  {filtered.filter(r => (r.category || 'General') === cat).map(reply => (
                    <button key={reply.id} onClick={() => apply(reply)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white">{reply.name}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{reply.body.slice(0, 80)}…</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function TicketDetailClient() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  // All state first
  const [ticketId,    setTicketId]    = useState(null)
  const [ticket,      setTicket]      = useState(null)
  const [comments,    setComments]    = useState([])
  const [techUsers,   setTechUsers]   = useState([])
  const [customers,   setCustomers]   = useState([])
  const [custSearch,  setCustSearch]  = useState('')
  const [custOpen,    setCustOpen]    = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [updating,    setUpdating]    = useState(false)
  const [noteMode,    setNoteMode]    = useState('internal')
  const [noteText,    setNoteText]    = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [attachment,  setAttachment]  = useState(null)
  const [signature,   setSignature]   = useState('')

  // Load tech signature once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('organization_members').select('signature')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data?.signature) setSignature(data.signature) })
    })
  }, [])
  const [editFields,  setEditFields]  = useState({ contact_name: '', contact_email: '', sla_due_date: '', assigned_to: '', customer_id: '', customer_name: '' })
  const [techSearch,  setTechSearch]  = useState('')
  const [techOpen,    setTechOpen]    = useState(false)
  const [timerSaving, setTimerSaving] = useState(false)
  const [mergeOpen,   setMergeOpen]   = useState(false)

  // Refs — immune to TDZ and component teardown
  const idRef          = useRef(null)
  const orgIdRef       = useRef(null)
  const myEmailRef     = useRef(null)
  const ticketRef      = useRef(null)
  const fileInputRef   = useRef(null)
  const refreshRef     = useRef(null)

  // Sync id from params into ref immediately
  const id = params?.id
  idRef.current = id

  // All data functions as const (NOT hoisted) — they use refs, never state
  const loadTicket = useCallback(async () => {
    const currentId = idRef.current
    if (!currentId) return
    setLoading(true)
    const { data, error: err } = await supabase.from('tickets').select('*').eq('id', currentId).single()
    if (err) { setError(err.message); setLoading(false); return }
    setTicket(data)
    ticketRef.current = data
    setEditFields({
      contact_name:  data.contact_name  ?? '',
      contact_email: data.contact_email ?? '',
      sla_due_date:  data.sla_due_date  ? data.sla_due_date.slice(0, 16) : '',
      assigned_to:   data.assigned_to   ?? '',
      customer_id:   data.customer_id   ?? '',
      customer_name: data.customer_name ?? '',
    })
    setLoading(false)
  }, [])

  const loadComments = useCallback(async () => {
    const currentId = idRef.current
    if (!currentId) return
    const { data } = await supabase.from('ticket_comments').select('*').eq('ticket_id', currentId).order('created_at', { ascending: true })
    setComments(data ?? [])
  }, [])

  const loadTechs = useCallback(async () => {
    const { data } = await supabase.from('organization_members').select('id,user_email,display_name').in('role', ['owner','admin','technician'])
    setTechUsers(data ?? [])
  }, [])

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200)
    setCustomers(data ?? [])
  }, [])

  // Real-time refresh using stable ref
  refreshRef.current = () => { loadTicket(); loadComments() }
  useEffect(() => {
    const tables = ['tickets', 'ticket_comments', 'time_entries']
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) refreshRef.current()
    }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [])

  // Init
  useEffect(() => {
    if (!id) return
    idRef.current = id

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      myEmailRef.current = user?.email ?? null
      const { data: member } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user?.id).single()
      if (member) orgIdRef.current = member.organization_id
    }

    init()
    loadTicket()
    loadComments()
    loadTechs()
    loadCustomers()
  }, [id])

  const updateField = async (field, value) => {
    const currentId = idRef.current
    if (!currentId) return
    setUpdating(true)
    await supabase.from('tickets').update({ [field]: value }).eq('id', currentId)
    await loadTicket()
    setUpdating(false)
  }

  const saveEditField = (field) => {
    const t = ticketRef.current
    if (!t) return
    const value = editFields[field]
    if (field === 'sla_due_date') {
      const iso = value ? new Date(value).toISOString() : null
      if (iso !== (t.sla_due_date ?? null)) updateField(field, iso)
    } else {
      if (value !== (t[field] ?? '')) updateField(field, value || null)
    }
  }

  const startTimer = async () => {
    const t = ticketRef.current
    const currentId = idRef.current
    if (!t || !currentId) return
    const now = new Date().toISOString()
    await supabase.from('tickets').update({
      timer_started: now,
      status: t.status === 'open' ? 'in_progress' : t.status,
    }).eq('id', currentId)
    await loadTicket()
  }

  const stopTimer = async () => {
    const t = ticketRef.current
    const currentId = idRef.current
    if (!t?.timer_started || !currentId) return
    setTimerSaving(true)
    const mins = Math.max(1, Math.round((Date.now() - new Date(t.timer_started).getTime()) / 60000))
    await supabase.from('tickets').update({ timer_started: null }).eq('id', currentId)
    if (orgIdRef.current) {
      await supabase.from('time_entries').insert({
        organization_id: orgIdRef.current,
        ticket_id:       currentId,
        ticket_title:    t.title,
        customer_id:     t.customer_id   || null,
        customer_name:   t.customer_name || null,
        technician:      myEmailRef.current,
        description:     'Time on: ' + t.title,
        minutes:         mins,
        billable:        true,
        hourly_rate:     null,
        date:            new Date().toISOString().split('T')[0],
      })
    }
    setTimerSaving(false)
    await loadTicket()
  }

  const submitNote = async () => {
    const t = ticketRef.current
    const currentId = idRef.current
    if (!noteText.trim() || submitting || !t || !currentId) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    let attachment_url = null
    let attachment_name = null
    if (attachment) {
      const ext  = attachment.name.split('.').pop()
      const path = `ticket-attachments/${currentId}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('attachments').upload(path, attachment)
      if (upErr) {
        console.error('Attachment upload failed:', upErr.message)
        // Continue without attachment rather than blocking the reply
      } else if (up) {
        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
        attachment_url = publicUrl
        attachment_name = attachment.name
      }
    }
    await supabase.from('ticket_comments').insert({
      ticket_id:       currentId,
      organization_id: t.organization_id,
      author_name:     user?.email ?? 'Unknown',
      author_email:    user?.email ?? '',
      content:         noteText.trim(),
      is_staff:        noteMode === 'internal',
      attachment_url,
      attachment_name,
    })

    // Send actual email to client when replying
    if (noteMode === 'reply' && t.contact_email) {
      const subject  = `Re: ${t.title} [#${currentId}]`
      const bodyText = noteText.trim()
      const signatureHtml = signature
        ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="color:#64748b;font-size:13px;white-space:pre-wrap;line-height:1.6;">${signature.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`
        : ''
      const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:10px 10px 0 0;">
    <h2 style="color:#f59e0b;margin:0;font-size:16px;">Reply from Valhalla IT</h2>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">${t.title}</p>
  </div>
  <div style="background:#ffffff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-wrap;">${bodyText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
    ${attachment_url ? `<p style="margin-top:16px;"><a href="${attachment_url}" style="color:#f59e0b;">${attachment_name || 'Attachment'}</a></p>` : ''}
    ${signatureHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">
      Reply to this email to respond. Your message will be added to your support ticket automatically.
    </p>
    <!-- TICKET_ID:${currentId} -->
  </div>
</div>`

      await supabase.functions.invoke('send-invoice-email', {
        body: {
          from:     'Valhalla IT Support <support@valhalla-rmm.com>',
          reply_to: `support+${currentId}@valhalla-rmm.com`,
          to:       t.contact_email,
          subject,
          html,
        }
      })
    }

    if (noteMode === 'reply' && !t.first_response_at) {
      await supabase.from('tickets').update({ first_response_at: new Date().toISOString() }).eq('id', currentId)
    }
    setNoteText('')
    setAttachment(null)
    await loadComments()
    setSubmitting(false)
  }

  if (loading) return (
    <div className="max-w-5xl space-y-4 animate-pulse">
      <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-10 w-2/3 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    </div>
  )

  if (error || !ticket) return (
    <div className="text-center py-20 text-slate-400">
      <p className="text-lg font-medium mb-2">{error || 'Ticket not found'}</p>
      <button onClick={() => router.push('/tickets')} className="text-amber-500 hover:underline text-sm">← Back to Tickets</button>
    </div>
  )

  const canEmailClient = !!ticket.contact_email
  const filteredTechs  = techUsers.filter(t => {
    const name = t.display_name || t.user_email.split('@')[0]
    return !techSearch || name.toLowerCase().includes(techSearch.toLowerCase()) || t.user_email.toLowerCase().includes(techSearch.toLowerCase())
  })
  // Helper to get display label for an email
  const techLabel = (email) => {
    const t = techUsers.find(t => t.user_email === email)
    return t ? (t.display_name || t.user_email.split('@')[0]) : email
  }
  const isTimerRunning = !!ticket.timer_started
  const inp = "w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="max-w-5xl space-y-4">
      <button onClick={() => router.push('/tickets')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Tickets
      </button>

      <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{ticket.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PRIORITY_CLS[ticket.priority] ?? ''}`}>{ticket.priority}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[ticket.status] ?? ''}`}>{lbl(ticket.status)}</span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 capitalize">{ticket.category}</span>
            {ticket.customer_name && <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">{ticket.customer_name}</span>}
            {ticket.source && ticket.source !== 'admin' && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                ticket.source === 'portal' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                ticket.source === 'email'  ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' :
                'bg-slate-100 text-slate-600'
              }`}>via {ticket.source}</span>
            )}
            {ticket.tags?.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200">#{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setMergeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500 hover:text-violet-600 hover:border-violet-300 transition-colors">
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </button>
          <select value={ticket.status} onChange={e => updateField('status', e.target.value)} disabled={updating}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-44">
            {['open','in_progress','waiting','resolved','closed'].map(s => <option key={s} value={s}>{lbl(s)}</option>)}
          </select>
        </div>

        <MergeTicketDialog
          ticket={ticket}
          open={mergeOpen}
          onClose={() => setMergeOpen(false)}
          onMerged={(targetId) => { setMergeOpen(false); router.push(`/tickets/${targetId}`) }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {ticket.description && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-3">Description</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words leading-relaxed">{ticket.description}</p>
            </div>
          )}

          {ticket && (
            <AiTriagePanel key={ticket.id} ticket={ticket} onTriageComplete={async (result) => {
              if (result.priority) await updateField('priority', result.priority)
              if (result.category) await updateField('category', result.category)
            }} />
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Notes &amp; Replies</h3>
              <span className="text-xs text-slate-400 ml-auto">{comments.length} entries</span>
            </div>
            <div className="p-5 space-y-4">
              {comments.length > 0 && (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {comments.map(comment => (
                    <div key={comment.id} className={`rounded-lg border p-3 ${comment.is_staff ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40' : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {comment.is_staff ? <Lock className="w-3 h-3 text-amber-600" /> : <Mail className="w-3 h-3 text-blue-600" />}
                        <span className="font-medium text-slate-900 dark:text-white text-xs">{comment.author_name || comment.author_email}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${comment.is_staff ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {comment.is_staff ? 'Internal' : 'Client Reply'}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">{fmtDate(comment.created_at)}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words text-xs leading-relaxed">{comment.content}</p>
                      {comment.attachment_url && (
                        <a href={comment.attachment_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <Paperclip className="w-3 h-3" />{comment.attachment_name || 'Attachment'}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <button onClick={() => setNoteMode('internal')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-r border-slate-200 dark:border-slate-700 ${noteMode === 'internal' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    <Lock className="w-3.5 h-3.5" /> Internal Note
                  </button>
                  <button onClick={() => setNoteMode('reply')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${noteMode === 'reply' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    <Mail className="w-3.5 h-3.5" /> Reply to Client
                    {!canEmailClient && <span className="ml-1 text-[10px] text-rose-500">(no email)</span>}
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {noteMode === 'reply' && !canEmailClient && (
                    <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded border border-rose-200">No contact email — add one in the sidebar.</p>
                  )}
                  {noteMode === 'reply' && canEmailClient && (
                    <p className="text-xs text-blue-600">Will be emailed to <strong>{ticket.contact_email}</strong></p>
                  )}
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
                    placeholder={noteMode === 'internal' ? 'Add an internal note...' : 'Type your reply to the client...'}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote() }}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
                  {noteMode === 'reply' && signature && (
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 border-t-0 rounded-b-lg -mt-1">
                      <p className="text-[10px] text-slate-400 mb-0.5">— Signature</p>
                      <p className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{signature}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input type="file" ref={fileInputRef} className="hidden" onChange={e => setAttachment(e.target.files?.[0] ?? null)} />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 h-7 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <Paperclip className="w-3.5 h-3.5" />{attachment ? attachment.name : 'Attach'}
                      </button>
                      {attachment && <button onClick={() => setAttachment(null)} className="text-[11px] text-rose-500 hover:underline">Remove</button>}
                      <CannedRepliesPicker ticket={ticket} onSelect={(body) => setNoteText(body)} />
                    </div>
                    <button onClick={submitNote}
                      disabled={!noteText.trim() || submitting || (noteMode === 'reply' && !canEmailClient)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors ${noteMode === 'internal' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {noteMode === 'internal' ? <><Lock className="w-3.5 h-3.5" /> Add Note</> : <><Send className="w-3.5 h-3.5" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ActivityTimeline ticketId={ticket?.id} />
        </div>

        <div className="space-y-4">
          <div className={`rounded-xl border shadow-sm p-4 ${isTimerRunning ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/40' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Timer className={`w-4 h-4 ${isTimerRunning ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Time Tracker</p>
            </div>
            {isTimerRunning ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                  <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">Timer running</span>
                </div>
                <LiveTimer startedAt={ticket.timer_started} />
                <p className="text-[10px] text-slate-400">Started at {new Date(ticket.timer_started).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                <button onClick={stopTimer} disabled={timerSaving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors">
                  {timerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-white" />}
                  {timerSaving ? 'Saving time entry…' : 'Stop & Log Time'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {ticket.time_spent_minutes > 0 && (
                  <p className="text-xs text-slate-500">{Math.floor(ticket.time_spent_minutes / 60)}h {ticket.time_spent_minutes % 60}m logged so far</p>
                )}
                <button onClick={startTimer}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                  <Play className="w-3.5 h-3.5 fill-white" /> Start Timer
                </button>
                <p className="text-[10px] text-slate-400 text-center">Auto-creates a time entry when stopped</p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Created</p>
                <p className="text-sm text-slate-900 dark:text-white mt-0.5">{fmtDate(ticket.created_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Priority</p>
                <select value={ticket.priority} onChange={e => updateField('priority', e.target.value)} disabled={updating} className={inp}>
                  {['critical','high','medium','low'].map(p => <option key={p} value={p}>{lbl(p)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Tag className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Category</p>
                <select value={ticket.category} onChange={e => updateField('category', e.target.value)} disabled={updating} className={inp}>
                  {['hardware','software','network','security','account','email','printing','other'].map(c => <option key={c} value={c}>{lbl(c)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1 relative">
                <p className="text-xs text-slate-400 mb-1">Assigned To</p>
                <div className="relative">
                  <input
                    value={techOpen ? techSearch : (editFields.assigned_to ? techLabel(editFields.assigned_to) : '')}
                    onChange={e => { setTechSearch(e.target.value); setTechOpen(true) }}
                    onFocus={() => { setTechSearch(''); setTechOpen(true) }}
                    onBlur={() => setTimeout(() => { setTechOpen(false) }, 150)}
                    placeholder="Unassigned"
                    className={`${inp} pr-6`}
                  />
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                {techOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    <button type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 italic"
                      onMouseDown={() => { setEditFields(p => ({ ...p, assigned_to: '' })); setTechOpen(false); updateField('assigned_to', null) }}>
                      — Unassigned
                    </button>
                    {filteredTechs.map(t => (
                      <button key={t.id} type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onMouseDown={() => { setEditFields(p => ({ ...p, assigned_to: t.user_email })); setTechOpen(false); updateField('assigned_to', t.user_email) }}>
                        <span className="font-medium">{t.display_name || t.user_email.split('@')[0]}</span>
                        <span className="text-slate-400 ml-1">{t.display_name ? `(${t.user_email})` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1 relative">
                <p className="text-xs text-slate-400 mb-1">Customer</p>
                <div className="relative">
                  <input
                    value={custOpen ? custSearch : (editFields.customer_name || '')}
                    onChange={e => { setCustSearch(e.target.value); setCustOpen(true); setEditFields(p => ({ ...p, customer_name: e.target.value })) }}
                    onFocus={() => { setCustSearch(editFields.customer_name || ''); setCustOpen(true) }}
                    onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                    placeholder="No customer assigned"
                    className={`${inp} pr-6`}
                  />
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                {custOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    <button type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors italic"
                      onMouseDown={() => {
                        setEditFields(p => ({ ...p, customer_id: '', customer_name: '' }))
                        setCustOpen(false)
                        updateField('customer_id', null)
                        updateField('customer_name', null)
                      }}>
                      — No customer
                    </button>
                    {customers
                      .filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()))
                      .map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          onMouseDown={() => {
                            setEditFields(p => ({ ...p, customer_id: c.id, customer_name: c.name }))
                            setCustOpen(false)
                            updateField('customer_id', c.id)
                            updateField('customer_name', c.name)
                          }}>
                          {c.name}
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Contact Name</p>
                <input value={editFields.contact_name}
                  onChange={e => setEditFields(p => ({ ...p, contact_name: e.target.value }))}
                  onBlur={() => saveEditField('contact_name')}
                  placeholder="Contact name" className={inp} />
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Contact Email</p>
                <input type="email" value={editFields.contact_email}
                  onChange={e => setEditFields(p => ({ ...p, contact_email: e.target.value }))}
                  onBlur={() => saveEditField('contact_email')}
                  placeholder="email@client.com" className={inp} />
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">SLA Due Date</p>
                <input type="datetime-local" value={editFields.sla_due_date}
                  onChange={e => setEditFields(p => ({ ...p, sla_due_date: e.target.value }))}
                  onBlur={() => saveEditField('sla_due_date')}
                  className={inp} />
              </div>
            </div>
            {/* Linked Asset */}
            <div className="flex items-start gap-2.5">
              <HardDrive className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Linked Asset</p>
                <AssetPicker ticket={ticket} orgId={orgIdRef.current} onLinked={() => loadTicket()} />
              </div>
            </div>
            {/* CC / Watchers */}
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">CC / Watchers</p>
                <WatchersField ticket={ticket} onUpdate={() => loadTicket()} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}