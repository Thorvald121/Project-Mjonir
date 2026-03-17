'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, Clock, User, Building2, Loader2,
  Lock, Mail, MessageSquare, Send, AlertTriangle,
  Tag, ChevronDown, Paperclip, X,
} from 'lucide-react'

function formatDate(date: string | null | undefined, fmt = 'MMM d, yyyy') {
  if (!date) return '—'
  try { return format(parseISO(date), fmt) } catch { return '—' }
}

const PRIORITY_CLS: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
  high:     'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  low:      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
}
const STATUS_CLS: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  in_progress: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  waiting:     'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  resolved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const lbl = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const inp = "w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

export default function TicketDetailClient() {
  const params   = useParams()
  const router   = useRouter()
  const id       = params.id as string
  const qc       = useQueryClient()
  const supabase = createSupabaseBrowserClient()

  const [updating,   setUpdating]   = useState(false)
  const [noteMode,   setNoteMode]   = useState<'internal' | 'reply'>('internal')
  const [noteText,   setNoteText]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [techSearch, setTechSearch] = useState('')
  const [techOpen,   setTechOpen]   = useState(false)
  const [editFields, setEditFields] = useState({
    contact_name: '', contact_email: '', sla_due_date: '', assigned_to: '',
  })

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: ticket, isLoading } = useQuery<any>({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: comments = [], refetch: refetchComments } = useQuery<any[]>({
    queryKey: ['ticket-comments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_comments').select('*').eq('ticket_id', id).order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!id,
  })

  const { data: techUsers = [] } = useQuery<any[]>({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_members')
        .select('id,user_email')
        .in('role', ['owner', 'admin', 'technician'])
      return data ?? []
    },
  })

  useEffect(() => {
    if (ticket) {
      setEditFields({
        contact_name:  ticket.contact_name  ?? '',
        contact_email: ticket.contact_email ?? '',
        sla_due_date:  ticket.sla_due_date  ? ticket.sla_due_date.slice(0, 16) : '',
        assigned_to:   ticket.assigned_to   ?? '',
      })
    }
  }, [ticket?.id])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateField = async (field: string, value: unknown) => {
    setUpdating(true)
    try {
      const { error } = await supabase.from('tickets').update({ [field]: value }).eq('id', id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    } catch (err) {
      console.error('[TicketDetail] update failed:', err)
    } finally {
      setUpdating(false)
    }
  }

  const saveEditField = (field: string) => {
    if (!ticket) return
    const value = editFields[field as keyof typeof editFields]
    if (field === 'sla_due_date') {
      const iso = value ? new Date(value).toISOString() : null
      if (iso !== (ticket.sla_due_date ?? null)) updateField(field, iso)
    } else {
      if (value !== (ticket[field] ?? '')) updateField(field, value || null)
    }
  }

  const submitNote = async () => {
    if (!noteText.trim() || submitting || !ticket) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    let attachment_url: string | null = null
    let attachment_name: string | null = null
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

    const { error } = await supabase.from('ticket_comments').insert({
      ticket_id:      id,
      organization_id: ticket.organization_id,
      author_name:    user?.email ?? 'Unknown',
      author_email:   user?.email ?? '',
      content:        noteText.trim(),
      is_staff:       noteMode === 'internal',
      attachment_url,
      attachment_name,
    })

    if (!error) {
      if (noteMode === 'reply' && !ticket.first_response_at) {
        await supabase.from('tickets').update({ first_response_at: new Date().toISOString() }).eq('id', id)
      }
      setNoteText(''); setAttachment(null)
      refetchComments()
    }
    setSubmitting(false)
  }

  // ── Loading / not found ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl animate-pulse">
        <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="h-10 w-2/3 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p className="text-lg font-medium mb-2">Ticket not found</p>
        <button onClick={() => router.push('/tickets')} className="text-amber-500 hover:underline text-sm">← Back to Tickets</button>
      </div>
    )
  }

  const canEmailClient = !!ticket.contact_email
  const filteredTechs  = techUsers.filter((t: any) => {
    const q = techSearch.toLowerCase()
    return !q || t.user_email.toLowerCase().includes(q)
  })

  return (
    <div className="max-w-5xl space-y-4">
      {/* Back */}
      <button onClick={() => router.push('/tickets')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Tickets
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{ticket.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PRIORITY_CLS[ticket.priority] ?? ''}`}>{ticket.priority}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[ticket.status] ?? ''}`}>{lbl(ticket.status)}</span>
            <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 capitalize">{ticket.category}</span>
            {ticket.customer_name && (
              <span className="text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">{ticket.customer_name}</span>
            )}
            {ticket.tags?.map((tag: string) => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-900/40">#{tag}</span>
            ))}
          </div>
        </div>
        <select value={ticket.status} onChange={e => updateField('status', e.target.value)} disabled={updating}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-44 flex-shrink-0">
          {['open','in_progress','waiting','resolved','closed'].map(s => <option key={s} value={s}>{lbl(s)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">

          {/* Description */}
          {ticket.description && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-3">Description</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>
          )}

          {/* Notes & Replies */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Notes &amp; Replies</h3>
              <span className="text-xs text-slate-400 ml-auto">{comments.length} entries</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Comment list */}
              {comments.length > 0 && (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {comments.map((comment: any) => (
                    <div key={comment.id} className={`rounded-lg border p-3 ${
                      comment.is_staff
                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40'
                        : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {comment.is_staff
                          ? <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          : <Mail className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                        <span className="font-medium text-slate-900 dark:text-white text-xs">{comment.author_name || comment.author_email}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          comment.is_staff
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}>
                          {comment.is_staff ? 'Internal' : 'Client Reply'}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">{formatDate(comment.created_at, 'MMM d, h:mm a')}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed text-xs">{comment.content}</p>
                      {comment.attachment_url && (
                        <a href={comment.attachment_url} target="_blank" rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <Paperclip className="w-3 h-3" />{comment.attachment_name || 'Attachment'}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Compose */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <button onClick={() => setNoteMode('internal')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-r border-slate-200 dark:border-slate-700 ${
                      noteMode === 'internal'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}>
                    <Lock className="w-3.5 h-3.5" /> Internal Note
                  </button>
                  <button onClick={() => setNoteMode('reply')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                      noteMode === 'reply'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}>
                    <Mail className="w-3.5 h-3.5" /> Reply to Client
                    {!canEmailClient && <span className="ml-1 text-[10px] text-rose-500">(no email)</span>}
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  {noteMode === 'reply' && !canEmailClient && (
                    <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 rounded border border-rose-200 dark:border-rose-900/40">
                      No contact email on this ticket. Add one in the sidebar to enable client replies.
                    </p>
                  )}
                  {noteMode === 'reply' && canEmailClient && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Will be emailed to <strong>{ticket.contact_email}</strong>
                    </p>
                  )}
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={4}
                    placeholder={noteMode === 'internal' ? 'Add an internal work note...' : 'Type your reply to the client...'}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote() }}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input type="file" ref={fileInputRef} className="hidden"
                        onChange={e => setAttachment(e.target.files?.[0] ?? null)} />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 h-7 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <Paperclip className="w-3.5 h-3.5" />
                        {attachment ? attachment.name : 'Attach'}
                      </button>
                      {attachment && (
                        <button onClick={() => setAttachment(null)} className="text-[11px] text-rose-500 hover:underline">Remove</button>
                      )}
                    </div>
                    <button onClick={submitNote}
                      disabled={!noteText.trim() || submitting || (noteMode === 'reply' && !canEmailClient)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-colors ${
                        noteMode === 'internal' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                      }`}>
                      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {noteMode === 'internal'
                        ? <><Lock className="w-3.5 h-3.5" /> Add Note</>
                        : <><Send className="w-3.5 h-3.5" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4">

            {/* Created */}
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Created</p>
                <p className="text-sm text-slate-900 dark:text-white mt-0.5">{formatDate(ticket.created_at, 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Priority</p>
                <select value={ticket.priority} onChange={e => updateField('priority', e.target.value)} disabled={updating} className={inp}>
                  {['critical','high','medium','low'].map(p => <option key={p} value={p}>{lbl(p)}</option>)}
                </select>
              </div>
            </div>

            {/* Category */}
            <div className="flex items-start gap-2.5">
              <Tag className="w-4 h-4 text-slate-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Category</p>
                <select value={ticket.category} onChange={e => updateField('category', e.target.value)} disabled={updating} className={inp}>
                  {['hardware','software','network','security','account','email','printing','other'].map(c => <option key={c} value={c}>{lbl(c)}</option>)}
                </select>
              </div>
            </div>

            {/* Assigned To */}
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
                    {filteredTechs.map((t: any) => (
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

            {/* Customer */}
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Customer</p>
                <p className="text-sm text-slate-900 dark:text-white mt-0.5">{ticket.customer_name || '—'}</p>
              </div>
            </div>

            {/* Contact Name */}
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

            {/* Contact Email */}
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

            {/* SLA Due Date */}
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

            {/* Time logged */}
            {ticket.time_spent_minutes > 0 && (
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Time Logged</p>
                  <p className="text-sm text-slate-900 dark:text-white mt-0.5">
                    {Math.floor(ticket.time_spent_minutes / 60)}h {ticket.time_spent_minutes % 60}m
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}