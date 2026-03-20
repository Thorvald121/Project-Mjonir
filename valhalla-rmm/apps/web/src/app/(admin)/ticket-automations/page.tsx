// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Zap, Pencil, Trash2, ChevronRight, Loader2, X } from 'lucide-react'

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

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const lbl = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''

const TRIGGER_TYPES = [
  { value: 'status_change',        label: 'Status changes to' },
  { value: 'priority_set',         label: 'Priority is set to' },
  { value: 'created',              label: 'Ticket is created' },
  { value: 'unassigned_duration',  label: 'Unassigned for X minutes' },
  { value: 'sla_breach_imminent',  label: 'SLA breach imminent' },
]
const ACTION_TYPES = [
  { value: 'assign_to',               label: 'Assign to technician' },
  { value: 'set_priority',            label: 'Set priority' },
  { value: 'set_status',              label: 'Set status' },
  { value: 'add_tag',                 label: 'Add tag' },
  { value: 'send_email_notification', label: 'Send email notification' },
  { value: 'send_email_client',       label: 'Send email to client' },
]
const STATUSES   = ['open','in_progress','waiting','resolved','closed']
const PRIORITIES = ['critical','high','medium','low']
const CATEGORIES = ['hardware','software','network','security','account','email','printing','other']

const BLANK = {
  name: '', is_active: true,
  trigger_type: 'status_change', trigger_status: 'open', trigger_priority: 'critical',
  condition_category: '', condition_customer_id: '', condition_unassigned_minutes: '60',
  action_type: 'assign_to', action_assign_to: '', action_priority: 'high',
  action_status: 'in_progress', action_tag: '', action_email_to: '',
  action_email_subject: '', action_email_body: '',
}

function triggerText(rule) {
  switch (rule.trigger_type) {
    case 'status_change':       return `Status changes to "${lbl(rule.trigger_status)}"`
    case 'priority_set':        return `Priority set to "${lbl(rule.trigger_priority)}"`
    case 'created':             return 'When ticket is created'
    case 'unassigned_duration': return `Unassigned for ${rule.condition_unassigned_minutes || 60} min`
    case 'sla_breach_imminent': return 'SLA breach imminent'
    default: return rule.trigger_type
  }
}

function actionText(rule) {
  switch (rule.action_type) {
    case 'assign_to':               return `Assign to ${rule.action_assign_to}`
    case 'set_priority':            return `Set priority → ${lbl(rule.action_priority)}`
    case 'set_status':              return `Set status → ${lbl(rule.action_status)}`
    case 'add_tag':                 return `Add tag "${rule.action_tag}"`
    case 'send_email_notification': return `Notify ${rule.action_email_to}`
    case 'send_email_client':       return 'Email the client'
    default: return rule.action_type
  }
}

// ── Rule Form Dialog ──────────────────────────────────────────────────────────
function RuleDialog({ open, onClose, onSaved, editing, orgId, customers, techs }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm(editing ? {
      name:                         editing.name || '',
      is_active:                    editing.is_active ?? true,
      trigger_type:                 editing.trigger_type || 'status_change',
      trigger_status:               editing.trigger_status || 'open',
      trigger_priority:             editing.trigger_priority || 'critical',
      condition_category:           editing.condition_category || '',
      condition_customer_id:        editing.condition_customer_id || '',
      condition_unassigned_minutes: String(editing.condition_unassigned_minutes || 60),
      action_type:                  editing.action_type || 'assign_to',
      action_assign_to:             editing.action_assign_to || '',
      action_priority:              editing.action_priority || 'high',
      action_status:                editing.action_status || 'in_progress',
      action_tag:                   editing.action_tag || '',
      action_email_to:              editing.action_email_to || '',
      action_email_subject:         editing.action_email_subject || '',
      action_email_body:            editing.action_email_body || '',
    } : { ...BLANK })
    setErr(null)
  }, [editing, open])

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Rule name is required'); return }
    if (!orgId) { setErr('Organization not found'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id:              orgId,
      name:                         form.name.trim(),
      is_active:                    form.is_active,
      trigger_type:                 form.trigger_type,
      trigger_status:               form.trigger_type === 'status_change'        ? form.trigger_status    : null,
      trigger_priority:             form.trigger_type === 'priority_set'         ? form.trigger_priority  : null,
      condition_category:           form.condition_category    || null,
      condition_customer_id:        form.condition_customer_id || null,
      condition_unassigned_minutes: form.trigger_type === 'unassigned_duration'  ? Number(form.condition_unassigned_minutes) || 60 : null,
      action_type:                  form.action_type,
      action_assign_to:             form.action_type === 'assign_to'               ? form.action_assign_to   || null : null,
      action_priority:              form.action_type === 'set_priority'            ? form.action_priority              : null,
      action_status:                form.action_type === 'set_status'              ? form.action_status                : null,
      action_tag:                   form.action_type === 'add_tag'                 ? form.action_tag         || null : null,
      action_email_to:              form.action_type === 'send_email_notification' ? form.action_email_to    || null : null,
      action_email_subject:         ['send_email_notification','send_email_client'].includes(form.action_type) ? form.action_email_subject || null : null,
      action_email_body:            ['send_email_notification','send_email_client'].includes(form.action_type) ? form.action_email_body    || null : null,
    }
    const { error } = editing
      ? await supabase.from('ticket_automation_rules').update(payload).eq('id', editing.id)
      : await supabase.from('ticket_automation_rules').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Automation Rule' : 'New Automation Rule'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}

          {/* Name + Active toggle */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rule Name *</label>
              <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Auto-assign critical tickets" className={`mt-1 ${inp}`} />
            </div>
            <div className="flex flex-col items-center gap-1 pt-5">
              <button onClick={() => s('is_active', !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs text-slate-400">{form.is_active ? 'Active' : 'Paused'}</span>
            </div>
          </div>

          {/* Trigger */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">When (Trigger)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Trigger Type</label>
                <select value={form.trigger_type} onChange={e => s('trigger_type', e.target.value)} className={`mt-1 ${inp}`}>
                  {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.trigger_type === 'status_change' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status Value</label>
                  <select value={form.trigger_status} onChange={e => s('trigger_status', e.target.value)} className={`mt-1 ${inp}`}>
                    {STATUSES.map(st => <option key={st} value={st}>{lbl(st)}</option>)}
                  </select>
                </div>
              )}
              {form.trigger_type === 'priority_set' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority Value</label>
                  <select value={form.trigger_priority} onChange={e => s('trigger_priority', e.target.value)} className={`mt-1 ${inp}`}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{lbl(p)}</option>)}
                  </select>
                </div>
              )}
              {form.trigger_type === 'unassigned_duration' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Minutes Unassigned</label>
                  <input type="number" min={5} value={form.condition_unassigned_minutes} onChange={e => s('condition_unassigned_minutes', e.target.value)} className={`mt-1 ${inp}`} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter: Category <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                <select value={form.condition_category || 'any'} onChange={e => s('condition_category', e.target.value === 'any' ? '' : e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="any">Any category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter: Customer <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                <select value={form.condition_customer_id || 'any'} onChange={e => s('condition_customer_id', e.target.value === 'any' ? '' : e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="any">Any customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Then Do (Action)</p>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Action Type</label>
              <select value={form.action_type} onChange={e => s('action_type', e.target.value)} className={`mt-1 ${inp}`}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            {form.action_type === 'assign_to' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To</label>
                <select value={form.action_assign_to || '__none__'} onChange={e => s('action_assign_to', e.target.value === '__none__' ? '' : e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="__none__">Select technician</option>
                  {techs.map(t => <option key={t.id} value={t.user_email}>{t.user_email}</option>)}
                </select>
              </div>
            )}
            {form.action_type === 'set_priority' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
                <select value={form.action_priority} onChange={e => s('action_priority', e.target.value)} className={`mt-1 ${inp}`}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{lbl(p)}</option>)}
                </select>
              </div>
            )}
            {form.action_type === 'set_status' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                <select value={form.action_status} onChange={e => s('action_status', e.target.value)} className={`mt-1 ${inp}`}>
                  {STATUSES.map(st => <option key={st} value={st}>{lbl(st)}</option>)}
                </select>
              </div>
            )}
            {form.action_type === 'add_tag' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tag Name</label>
                <input value={form.action_tag} onChange={e => s('action_tag', e.target.value)} placeholder="e.g. escalated" className={`mt-1 ${inp}`} />
              </div>
            )}
            {['send_email_notification','send_email_client'].includes(form.action_type) && (
              <div className="space-y-3">
                {form.action_type === 'send_email_notification' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient Email</label>
                    <input type="email" value={form.action_email_to} onChange={e => s('action_email_to', e.target.value)} placeholder="tech@company.com" className={`mt-1 ${inp}`} />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</label>
                  <input value={form.action_email_subject} onChange={e => s('action_email_subject', e.target.value)} placeholder="Re: {{ticket_title}}" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Body</label>
                  <textarea value={form.action_email_body} onChange={e => s('action_email_body', e.target.value)} rows={4}
                    placeholder="Supports: {{ticket_title}}, {{customer_name}}, {{priority}}, {{assigned_to}}"
                    className={`mt-1 ${inp} resize-none`} />
                  <p className="text-xs text-slate-400 mt-1">Variables: {'{{ticket_title}}'}, {'{{customer_name}}'}, {'{{priority}}'}, {'{{assigned_to}}'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.name.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TicketAutomationsPage() {
  const supabase = createSupabaseBrowserClient()

  const [rules,      setRules]      = useState([])
  const [customers,  setCustomers]  = useState([])
  const [techs,      setTechs]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadAll()
    }
    init()
  }, [])

  useRealtimeRefresh(['ticket_automation_rules'], loadAll)

  async function loadAll() {
    setLoading(true)
    const [r, c, t] = await Promise.all([
      supabase.from('ticket_automation_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
      supabase.from('organization_members').select('id,user_email').in('role',['owner','admin','technician']),
    ])
    setRules(r.data ?? [])
    setCustomers(c.data ?? [])
    setTechs(t.data ?? [])
    setLoading(false)
  }

  const toggleActive = async (rule) => {
    await supabase.from('ticket_automation_rules').update({ is_active: !rule.is_active }).eq('id', rule.id)
    loadAll()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this rule?')) return
    await supabase.from('ticket_automation_rules').delete().eq('id', id)
    loadAll()
  }

  const activeCount   = rules.filter(r => r.is_active).length
  const inactiveCount = rules.filter(r => !r.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Ticket Automations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Rules that fire automatically when ticket conditions are met — assign, escalate, tag, or notify.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Rules', value: rules.length,    color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Active',      value: activeCount,     color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Paused',      value: inactiveCount,   color: 'text-slate-400',   bg: 'bg-slate-50 dark:bg-slate-800' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <Zap className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))
        ) : rules.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-7 h-7 text-amber-500" />
            </div>
            <p className="font-semibold text-slate-900 dark:text-white mb-1">No automation rules yet</p>
            <p className="text-sm text-slate-400 mb-5">Create rules to automatically assign tickets, escalate priority, add tags, or send notifications.</p>
            <button onClick={() => { setEditing(null); setDialogOpen(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Plus className="w-4 h-4" /> Create First Rule
            </button>
          </div>
        ) : rules.map(rule => (
          <div key={rule.id} className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 transition-opacity ${rule.is_active ? '' : 'opacity-55'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">{rule.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {rule.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-medium border border-blue-200 dark:border-blue-900/40">
                      {triggerText(rule)}
                    </span>
                    {(rule.condition_category || rule.condition_customer_id) && (
                      <span className="text-slate-400">+filter</span>
                    )}
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-900/40">
                      {actionText(rule)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(rule)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${rule.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <button onClick={() => { setEditing(rule); setDialogOpen(true) }}
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(rule.id)}
                  className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <RuleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId} customers={customers} techs={techs}
      />
    </div>
  )
}