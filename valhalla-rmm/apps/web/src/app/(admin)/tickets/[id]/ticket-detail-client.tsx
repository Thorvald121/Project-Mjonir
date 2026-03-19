// @ts-nocheck
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import {
  ArrowLeft, Clock, User, Building2, Loader2,
  Lock, Mail, MessageSquare, Send, AlertTriangle,
  Tag, ChevronDown, Paperclip, Play, Square, Timer,
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
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
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

export default function TicketDetailClient() {
  const params   = useParams()
  const router   = useRouter()
  const id       = params?.id
  const supabase = createSupabaseBrowserClient()

  const [ticket,    setTicket]    = useState(null)
  const [comments,  setComments]  = useState([])
  const [techUsers, setTechUsers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [updating,  setUpdating]  = useState(false)

  const [noteMode,   setNoteMode]   = useState('internal')
  const [noteText,   setNoteText]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const fileInputRef = useRef(null)

  const [editFields, setEditFields] = useState({
    contact_name: '', contact_email: '', sla_due_date: '', assigned_to: '',
  })
  const [techSearch, setTechSearch] = useState('')
  const [techOpen,   setTechOpen]   = useState(false)

  const [timerSaving, setTimerSaving] = useState(false)
  const [orgId,       setOrgId]       = useState(null)
  const [myEmail,     setMyEmail]     = useState(null)

  useEffect(() => {
    if (!id) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMyEmail(user?.email ?? null)
      const { data: member } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user?.id).single()
      if (member) setOrgId(member.organization_id)
    }
    init()
    loadTicket()
    loadComments()
    loadTechs()
  }, [id])

  // Auto-refresh when ticket or comments change
  useRealtimeRefresh(['tickets', 'ticket_comments', 'time_entries'], () => {
    loadTicket()
    loadComments()
  })

  const loadTicket = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single()
    if (error) { setError(error.message); setLoading(false); return }
    setTicket(data)
    setEditFields({
      contact_name:  data.contact_name  ?? '',
      contact_email: data.contact_email ?? '',
      sla_due_date:  data.sla_due_date  ? data.sla_due_date.slice(0, 16) : '',
      assigned_to:   data.assigned_to   ?? '',
    })
    setLoading(false)
  }

  const loadComments = async () => {
    const { data } = await supabase
      .from('ticket_comments').select('*').eq('ticket_id', id).order('created_at', { ascending: true })
    setComments(data ?? [])
  }

  const loadTechs = async () => {
    const { data } = await supabase
      .from('organization_members').select('id,user_email').in('role', ['owner','admin','technician'])
    setTechUsers(data ?? [])
  }

  const updateField = async (field, value) => {
    setUpdating(true)
    await supabase.from('tickets').update({ [field]: value }).eq('id', id)
    await loadTicket()
    setUpdating(false)
  }

  const saveEditField = (field) => {
    if (!ticket) return
    const value = editFields[field]
    if (field === 'sla_due_date') {
      const iso = value ? new Date(value).toISOString() : null
      if (iso !== (ticket.sla_due_date ?? null)) updateField(field, iso)
    } else {
      if (value !== (ticket[field] ?? '')) updateField(field, value || null)
    }
  }

  const startTimer = async () => {
    const now = new Date().toISOString()
    await supabase.from('tickets').update({
      timer_started: now,
      status: ticket.status === 'open' ? 'in_progress' : ticket.status,
    }).eq('id', id)
    await loadTicket()
  }

  const stopTimer = async () => {
    if (!ticket?.timer_started) return
    setTimerSaving(true)
    const mins = Math.max(1, Math.round((Date.now() - new Date(ticket.timer_started).getTime()) / 60000))
    await supabase.from('tickets').update({ timer_started: null }).eq('id', id)
    if (orgId) {
      await supabase.from('time_entries').insert({
        organization_id: orgId,
        ticket_id:       id,
        ticket_title:    ticket.title,
        customer_id:     ticket.customer_id  || null,
        customer_name:   ticket.customer_name || null,
        technician:      myEmail,
        description:     `Time on: ${ticket.title}`,
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
    if (!noteText.trim() || submitting || !ticket) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    let attachment_url = null
    let attachment_name = null
    if (attachment) {
      const ext  = attachment.name.split('.').pop()
      const path = `ticket-attachments/${id}/${Date.now()}.${ext}`
      const { data: up } = await supabase.storage.from('attachments').upload(path, attachment)
      if (up) {
        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
        attachment_url  = publicUrl
        attachment_name = attachment.name
      }
    }
    await supabase.from('ticket_comments').insert({
      ticket_id:       id,
      organization_id: ticket.organization_id,
      author_name:     user?.email ?? 'Unknown',
      author_email:    user?.email ?? '',
      content:         noteText.trim(),
      is_staff:        noteMode === 'internal',
      attachment_url,
      attachment_name,
    })
    if (noteMode === 'reply' && !ticket.first_response_at) {
      await supabase.from('tickets').update({ first_response_at: new Date().toISOString() }).eq('id', id)
    }
    setNoteText(''); setAttachment(null)
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
  const filteredTechs  = techUsers.filter(t => !techSearch || t.user_email.toLowerCase().includes(techSearch.toLowerCase()))
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
            {ticket.tags?.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200">#{tag}</span>
            ))}
          </div>
        </div>
        <select value={ticket.status} onChange={e => updateField('status', e.target.value)} disabled={updating}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-44 flex-shrink-0">
          {['open','in_progress','waiting','resolved','closed'].map(s => <option key={s} value={s}>{lbl(s)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {ticket.description && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-3">Description</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>
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
                      <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap text-xs leading-relaxed">{comment.content}</p>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input type="file" ref={fileInputRef} className="hidden" onChange={e => setAttachment(e.target.files?.[0] ?? null)} />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 h-7 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <Paperclip className="w-3.5 h-3.5" />{attachment ? attachment.name : 'Attach'}
                      </button>
                      {attachment && <button onClick={() => setAttachment(null)} className="text-[11px] text-rose-500 hover:underline">Remove</button>}
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
        </div>

        <div className="space-y-4">
          {/* Timer card */}
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
                <p className="text-[10px] text-slate-400">
                  Started at {new Date(ticket.timer_started).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
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

          {/* Ticket details */}
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
                    value={techOpen ? techSearch : (editFields.assigned_to || '')}
                    onChange={e => { setTechSearch(e.target.value); setTechOpen(true); setEditFields(p => ({ ...p, assigned_to: e.target.value })) }}
                    onFocus={() => { setTechSearch(editFields.assigned_to || ''); setTechOpen(true) }}
                    onBlur={() => setTimeout(() => { setTechOpen(false); saveEditField('assigned_to') }, 150)}
                    placeholder="Unassigned"
                    className={`${inp} pr-6`}
                  />
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                {techOpen && filteredTechs.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredTechs.map(t => (
                      <button key={t.id} type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onMouseDown={() => { setEditFields(p => ({ ...p, assigned_to: t.user_email })); setTechOpen(false); updateField('assigned_to', t.user_email) }}>
                        {t.user_email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Customer</p>
                <p className="text-sm text-slate-900 dark:text-white mt-0.5">{ticket.customer_name || '—'}</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}