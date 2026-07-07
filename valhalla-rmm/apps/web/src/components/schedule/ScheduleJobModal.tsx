// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  X, MapPin, Monitor, Phone, Users, Calendar,
  Clock, User, FileText, Bell, BellOff, Loader2,
  ChevronDown, Search, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

const JOB_TYPES = [
  { value: 'on_site',  label: 'On-Site Visit',    icon: MapPin    },
  { value: 'remote',   label: 'Remote Session',   icon: Monitor   },
  { value: 'phone',    label: 'Phone Call',        icon: Phone     },
  { value: 'meeting',  label: 'Meeting',           icon: Users     },
]

const STATUS_OPTIONS = [
  { value: 'scheduled',  label: 'Scheduled',  color: 'bg-blue-500'   },
  { value: 'en_route',   label: 'En Route',   color: 'bg-yellow-500' },
  { value: 'on_site',    label: 'On-Site',    color: 'bg-amber-500'  },
  { value: 'completed',  label: 'Completed',  color: 'bg-green-500'  },
  { value: 'cancelled',  label: 'Cancelled',  color: 'bg-slate-500'  },
]

function toLocalDateTimeValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalDateTimeValue(val) {
  if (!val) return null
  return new Date(val).toISOString()
}

// ─── CustomerSearch ────────────────────────────────────────────────────────
function CustomerSearch({ value, onChange, supabase, orgId }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, contact_email')
        .eq('organization_id', orgId)
        .ilike('name', `%${query}%`)
        .limit(8)
      if (error) console.error('Customer search error:', error)
      setResults(data || [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, orgId])

  const select = (c) => {
    onChange(c)
    setQuery(c.name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          placeholder="Search customers…"
          value={value ? value.name : query}
          onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => select(c)}
              className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm text-white flex flex-col gap-0.5"
            >
              <span className="font-medium">{c.name}</span>
              {c.contact_email && <span className="text-slate-400 text-xs">{c.contact_email}</span>}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-xs text-slate-500">No customers found</div>
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────────────────────
export default function ScheduleJobModal({
  open,
  onClose,
  onSaved,
  initialDate,        // ISO string — pre-fills start time when triggered from calendar slot
  initialCustomerId,  // pre-fill when triggered from customer page
  initialTicketId,    // pre-fill when triggered from ticket detail
  editJob,            // full job object when editing existing
}) {
  const supabase = createSupabaseBrowserClient()

  const [orgId, setOrgId]           = useState(null)
  const [userEmail, setUserEmail]   = useState('')
  const [members, setMembers]       = useState([])
  const [tickets, setTickets]       = useState([])
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState({
    title:           '',
    description:     '',
    job_type:        'on_site',
    status:          'scheduled',
    customer:        null,
    ticket_id:       '',
    assigned_to:     '',
    assigned_name:   '',
    scheduled_start: '',
    scheduled_end:   '',
    location:        '',
    notes:           '',
    notify_client:   true,
  })

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // ── Bootstrap ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserEmail(session.user.email)

      // Get current user's org membership (with display_name for default tech name)
      const { data: mem, error: memErr } = await supabase
        .from('organization_members')
        .select('organization_id, role, display_name, user_email')
        .eq('user_id', session.user.id)
        .single()
      if (memErr || !mem) {
        console.error('Org membership fetch error:', memErr)
        return
      }

      setOrgId(mem.organization_id)

      // Get all techs in the org directly from organization_members
      // No profiles table needed — user_email and display_name live here
      const { data: allMembers, error: allErr } = await supabase
        .from('organization_members')
        .select('user_id, user_email, display_name, role')
        .eq('organization_id', mem.organization_id)
        .order('display_name', { ascending: true, nullsFirst: false })
      if (allErr) console.error('Members fetch error:', allErr)
      setMembers(allMembers || [])

      // pre-fill
      if (editJob) {
        setForm({
          title:           editJob.title           || '',
          description:     editJob.description     || '',
          job_type:        editJob.job_type         || 'on_site',
          status:          editJob.status           || 'scheduled',
          customer:        editJob.customer_id
            ? { id: editJob.customer_id, name: editJob.customer_name || '' }
            : null,
          ticket_id:       editJob.ticket_id        || '',
          assigned_to:     editJob.assigned_to      || '',
          assigned_name:   editJob.assigned_name    || '',
          scheduled_start: toLocalDateTimeValue(editJob.scheduled_start),
          scheduled_end:   toLocalDateTimeValue(editJob.scheduled_end),
          location:        editJob.location         || '',
          notes:           editJob.notes            || '',
          notify_client:   editJob.notify_client    ?? true,
        })
      } else {
        // NEW JOB — fully reset the form so nothing carries over from a
        // previously edited job (title/status/customer/notes were persisting)
        const startDefault = initialDate
          ? toLocalDateTimeValue(initialDate)
          : toLocalDateTimeValue(new Date(Math.ceil(Date.now() / 1800000) * 1800000).toISOString())

        const endDefault = (() => {
          const d = new Date(startDefault)
          d.setHours(d.getHours() + 1)
          return toLocalDateTimeValue(d.toISOString())
        })()

        setForm({
          title:           '',
          description:     '',
          job_type:        'on_site',
          status:          'scheduled',
          customer:        null,
          ticket_id:       '',
          assigned_to:     mem.user_email || session.user.email,
          assigned_name:   mem.display_name || session.user.email,
          scheduled_start: startDefault,
          scheduled_end:   endDefault,
          location:        '',
          notes:           '',
          notify_client:   true,
        })

        // pre-fill customer if triggered from customer page
        if (initialCustomerId) {
          const { data: cust } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', initialCustomerId)
            .single()
          if (cust) setForm(prev => ({ ...prev, customer: cust }))
        }

        // pre-fill ticket if triggered from ticket detail
        if (initialTicketId) {
          const { data: tkt } = await supabase
            .from('tickets')
            .select('id, title, customer_id, customers(id, name)')
            .eq('id', initialTicketId)
            .single()
          if (tkt) {
            setForm(prev => ({
              ...prev,
              ticket_id: tkt.id,
              title:     tkt.title || '',
              customer:  tkt.customers ? { id: tkt.customers.id, name: tkt.customers.name } : prev.customer,
            }))
          }
        }
      }
    }
    init()
  }, [open, editJob, initialDate, initialCustomerId, initialTicketId])

  // ── Load tickets when customer changes ────────────────────────────────
  useEffect(() => {
    if (!form.customer?.id || !orgId) { setTickets([]); return }
    const load = async () => {
      const { data } = await supabase
        .from('tickets')
        .select('id, title, status')
        .eq('organization_id', orgId)
        .eq('customer_id', form.customer.id)
        .not('status', 'in', '(resolved,closed)')
        .order('created_at', { ascending: false })
        .limit(30)
      setTickets(data || [])
    }
    load()
  }, [form.customer?.id, orgId])

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim())           return toast.error('Title is required')
    if (!form.scheduled_start)        return toast.error('Start time is required')
    if (!form.scheduled_end)          return toast.error('End time is required')
    if (!form.assigned_to)            return toast.error('Assign a technician')
    if (!form.customer)               return toast.error('Select a customer')

    const start = new Date(form.scheduled_start)
    const end   = new Date(form.scheduled_end)
    if (end <= start)                 return toast.error('End time must be after start time')

    setSaving(true)
    const payload = {
      organization_id: orgId,
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      job_type:        form.job_type,
      status:          form.status,
      customer_id:     form.customer?.id   || null,
      customer_name:   form.customer?.name || null,
      ticket_id:       form.ticket_id      || null,
      assigned_to:     form.assigned_to,
      assigned_name:   form.assigned_name,
      scheduled_start: fromLocalDateTimeValue(form.scheduled_start),
      scheduled_end:   fromLocalDateTimeValue(form.scheduled_end),
      location:        form.location.trim() || null,
      notes:           form.notes.trim()    || null,
      notify_client:   form.notify_client,
      updated_at:      new Date().toISOString(),
    }

    let error, data
    if (editJob) {
      ;({ error, data } = await supabase
        .from('scheduled_jobs')
        .update(payload)
        .eq('id', editJob.id)
        .select()
        .single())
    } else {
      payload.created_by = userEmail
      ;({ error, data } = await supabase
        .from('scheduled_jobs')
        .insert(payload)
        .select()
        .single())
    }

    if (error) {
      toast.error('Failed to save: ' + error.message)
      setSaving(false)
      return
    }

    // Trigger client notification edge function for new jobs with notify_client=true
    if (!editJob && form.notify_client && data?.id) {
      try {
        await supabase.functions.invoke('notify-scheduled-job', {
          body: { job_id: data.id },
        })
      } catch {
        // non-fatal — job saved, notification best-effort
      }
    }

    toast.success(editJob ? 'Job updated' : 'Job scheduled')
    setSaving(false)
    onSaved?.()
    onClose()
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editJob) return
    setDeleting(true)
    const { error } = await supabase
      .from('scheduled_jobs')
      .delete()
      .eq('id', editJob.id)
    if (error) {
      toast.error('Delete failed: ' + error.message)
      setDeleting(false)
      return
    }
    toast.success('Job deleted')
    setDeleting(false)
    onSaved?.()
    onClose()
  }

  if (!open) return null

  const selectedType = JOB_TYPES.find(t => t.value === form.job_type)
  const TypeIcon = selectedType?.icon || MapPin

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <TypeIcon className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-white font-semibold text-lg">
              {editJob ? 'Edit Scheduled Job' : 'Schedule a Job'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Job Title <span className="text-rose-400">*</span></label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Workstation setup, Network troubleshooting…"
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          {/* Job Type + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Job Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                {JOB_TYPES.map(t => {
                  const Icon = t.icon
                  const active = form.job_type === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set('job_type', t.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {editJob && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
                <div className="space-y-1">
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => set('status', s.value)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        form.status === s.value
                          ? 'bg-slate-700 border-slate-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${s.color}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Customer */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Customer <span className="text-rose-400">*</span></label>
            {orgId && (
              <CustomerSearch
                value={form.customer}
                onChange={c => set('customer', c)}
                supabase={supabase}
                orgId={orgId}
              />
            )}
          </div>

          {/* Ticket (optional) */}
          {form.customer && tickets.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Link to Ticket <span className="text-slate-600">(optional)</span>
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 appearance-none"
                  value={form.ticket_id}
                  onChange={e => set('ticket_id', e.target.value)}
                >
                  <option value="">— No ticket —</option>
                  {tickets.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Technician */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Assigned Technician <span className="text-rose-400">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 appearance-none"
                value={form.assigned_to}
                onChange={e => {
                  const m = members.find(m => m.user_email === e.target.value)
                  set('assigned_to', e.target.value)
                  set('assigned_name', m?.display_name || e.target.value)
                }}
              >
                <option value="">Select technician…</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_email}>
                    {m.display_name || m.user_email}
                    {m.role ? ` (${m.role})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {members.length === 0 && (
              <p className="text-xs text-rose-400 mt-1">No technicians found in this organization.</p>
            )}
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                <Clock className="inline w-3.5 h-3.5 mr-1" />
                Start <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                value={form.scheduled_start}
                onChange={e => {
                  set('scheduled_start', e.target.value)
                  // auto-advance end by 1h if end is before new start
                  if (form.scheduled_end && new Date(form.scheduled_end) <= new Date(e.target.value)) {
                    const d = new Date(e.target.value)
                    d.setHours(d.getHours() + 1)
                    set('scheduled_end', toLocalDateTimeValue(d.toISOString()))
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                <Clock className="inline w-3.5 h-3.5 mr-1" />
                End <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                value={form.scheduled_end}
                onChange={e => set('scheduled_end', e.target.value)}
              />
            </div>
          </div>

          {/* Location (on-site only) */}
          {form.job_type === 'on_site' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                <MapPin className="inline w-3.5 h-3.5 mr-1" />
                Location
              </label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                placeholder="e.g. 123 Main St, Suite 200, Raleigh NC"
                value={form.location}
                onChange={e => set('location', e.target.value)}
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <textarea
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
              placeholder="What work needs to be done?"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Notes (internal) */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Internal Notes</label>
            <textarea
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
              placeholder="Parking info, access codes, tech-only details…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* Notify client */}
          <button
            type="button"
            onClick={() => set('notify_client', !form.notify_client)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all ${
              form.notify_client
                ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {form.notify_client
              ? <Bell className="w-4 h-4 shrink-0" />
              : <BellOff className="w-4 h-4 shrink-0" />
            }
            <div className="text-left">
              <div className="text-sm font-medium">
                {form.notify_client ? 'Notify client by email' : 'No client notification'}
              </div>
              <div className="text-xs opacity-70">
                {form.notify_client
                  ? 'Client will receive a confirmation email when saved'
                  : 'Client will not be emailed about this job'
                }
              </div>
            </div>
          </button>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          {/* Delete (edit mode only) */}
          <div>
            {editJob && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-sm transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            {editJob && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">Confirm delete?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-medium hover:bg-rose-500/30 transition-all disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium hover:border-slate-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:border-slate-600 hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editJob ? 'Save Changes' : 'Schedule Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}