// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Pencil, Trash2, Mail, Zap, Clock, X, Loader2, ChevronRight } from 'lucide-react'

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

const inp     = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const inpMono = inp + " font-mono text-xs"

const STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting',     label: 'Waiting' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
]
const STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  waiting:     'bg-violet-100 text-violet-700 border-violet-200',
  resolved:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed:      'bg-slate-100 text-slate-600 border-slate-200',
}
const RECIPIENTS = [
  { value: 'contact',     label: 'Ticket Contact (client)' },
  { value: 'assigned_to', label: 'Assigned Technician' },
  { value: 'custom',      label: 'Custom Email Address' },
]
const RECIPIENT_LABEL = { contact: 'Client', assigned_to: 'Technician', custom: 'Custom' }

const DEFAULT_SUBJECTS = {
  open:        'Your support ticket has been received — {{ticket_title}}',
  in_progress: "We're working on your ticket — {{ticket_title}}",
  waiting:     'We need more info on your ticket — {{ticket_title}}',
  resolved:    'Your ticket has been resolved — {{ticket_title}}',
  closed:      'Ticket closed — {{ticket_title}}',
}
const DEFAULT_BODIES = {
  open: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">
  <h2 style="color:#f59e0b">We've received your request ✓</h2>
  <p>Hi {{contact_name}},</p>
  <p>Your support ticket <strong>{{ticket_title}}</strong> has been received and is in our queue. We'll update you as soon as we start working on it.</p>
  <p style="font-size:12px;color:#94a3b8">{{customer_name}} Support Team</p>
</div>`,
  in_progress: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">
  <h2 style="color:#3b82f6">We're on it!</h2>
  <p>Hi {{contact_name}},</p>
  <p>Your ticket <strong>{{ticket_title}}</strong> is now being actively worked on by {{assigned_to}}. We'll keep you posted.</p>
  <p style="font-size:12px;color:#94a3b8">{{customer_name}} Support Team</p>
</div>`,
  waiting: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">
  <h2 style="color:#f59e0b">Action needed on your ticket</h2>
  <p>Hi {{contact_name}},</p>
  <p>We need additional information to continue working on <strong>{{ticket_title}}</strong>. Please reply to this email with any details that might help us resolve your issue faster.</p>
  <p style="font-size:12px;color:#94a3b8">{{customer_name}} Support Team</p>
</div>`,
  resolved: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">
  <h2 style="color:#10b981">Your ticket has been resolved ✓</h2>
  <p>Hi {{contact_name}},</p>
  <p>We're happy to let you know that <strong>{{ticket_title}}</strong> has been resolved. If you have any follow-up questions, please don't hesitate to reach out.</p>
  <p style="font-size:12px;color:#94a3b8">{{customer_name}} Support Team</p>
</div>`,
  closed: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">
  <h2>Ticket closed</h2>
  <p>Hi {{contact_name}},</p>
  <p>Your ticket <strong>{{ticket_title}}</strong> has been closed. Thank you for working with us!</p>
  <p style="font-size:12px;color:#94a3b8">{{customer_name}} Support Team</p>
</div>`,
}

const BLANK = {
  name: '', trigger_status: 'open', delay_hours: '0',
  recipient_type: 'contact', custom_email: '',
  subject_template: DEFAULT_SUBJECTS['open'],
  body_template:    DEFAULT_BODIES['open'],
  is_active: true,
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '—' }
}

// ── Rule Form Dialog ──────────────────────────────────────────────────────────
function RuleDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name:             editing.name             || '',
        trigger_status:   editing.trigger_status   || 'open',
        delay_hours:      String(editing.delay_hours ?? 0),
        recipient_type:   editing.recipient_type   || 'contact',
        custom_email:     editing.custom_email     || '',
        subject_template: editing.subject_template || DEFAULT_SUBJECTS['open'],
        body_template:    editing.body_template    || DEFAULT_BODIES['open'],
        is_active:        editing.is_active ?? true,
      })
    } else {
      setForm({ ...BLANK })
    }
    setErr(null)
  }, [open, editing])

  const handleStatusChange = (status) => {
    setForm(f => ({
      ...f,
      trigger_status:   status,
      // Only auto-fill if editing is null (new rule)
      subject_template: editing ? f.subject_template : (DEFAULT_SUBJECTS[status] || f.subject_template),
      body_template:    editing ? f.body_template    : (DEFAULT_BODIES[status]    || f.body_template),
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim())             { setErr('Rule name is required'); return }
    if (!form.subject_template.trim()) { setErr('Subject is required');   return }
    if (!form.body_template.trim())    { setErr('Body is required');       return }
    if (!orgId) { setErr('Organization not found'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id:  orgId,
      name:             form.name.trim(),
      trigger_status:   form.trigger_status,
      delay_hours:      parseFloat(form.delay_hours) || 0,
      recipient_type:   form.recipient_type,
      custom_email:     form.recipient_type === 'custom' ? form.custom_email || null : null,
      subject_template: form.subject_template.trim(),
      body_template:    form.body_template.trim(),
      is_active:        form.is_active,
    }
    const { error } = editing
      ? await supabase.from('email_automation_rules').update(payload).eq('id', editing.id)
      : await supabase.from('email_automation_rules').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Email Automation' : 'New Email Automation'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rule Name *</label>
            <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Send confirmation when ticket opens" className={`mt-1 ${inp}`} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Trigger — When ticket becomes</label>
              <select value={form.trigger_status} onChange={e => handleStatusChange(e.target.value)} className={`mt-1 ${inp}`}>
                {STATUSES.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay (hours after trigger)</label>
              <input type="number" min={0} step={0.5} value={form.delay_hours} onChange={e => s('delay_hours', e.target.value)} className={`mt-1 ${inp}`} />
              <p className="text-xs text-slate-400 mt-1">0 = fire immediately</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient</label>
              <select value={form.recipient_type} onChange={e => s('recipient_type', e.target.value)} className={`mt-1 ${inp}`}>
                {RECIPIENTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {form.recipient_type === 'custom' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Custom Email</label>
                <input type="email" value={form.custom_email} onChange={e => s('custom_email', e.target.value)} placeholder="alerts@company.com" className={`mt-1 ${inp}`} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject Line</label>
            <input value={form.subject_template} onChange={e => s('subject_template', e.target.value)} className={`mt-1 ${inp}`} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Body (HTML)</label>
            <textarea value={form.body_template} onChange={e => s('body_template', e.target.value)} rows={10} className={`mt-1 ${inpMono} resize-y`} />
            <p className="text-xs text-slate-400 mt-1">
              Variables: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{ticket_title}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{contact_name}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{customer_name}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{status}}'}</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{assigned_to}}'}</code>
            </p>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <button onClick={() => s('is_active', !form.is_active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">{form.is_active ? 'Rule is active' : 'Rule is paused'}</span>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.name.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmailAutomationsPage() {
  const supabase = createSupabaseBrowserClient()
  const [rules,      setRules]      = useState([])
  const [log,        setLog]        = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [tab,        setTab]        = useState('rules')
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

  const loadAll = async () => {
    setLoading(true)
    const [r, l] = await Promise.all([
      supabase.from('email_automation_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('email_automation_log').select('*').order('sent_at', { ascending: false }).limit(100),
    ])
    setRules(r.data ?? [])
    setLog(l.data ?? [])
    setLoading(false)
  }

  useRealtimeRefresh(['email_automation_rules', 'email_automation_log'], loadAll)



  const toggleActive = async (rule) => {
    await supabase.from('email_automation_rules').update({ is_active: !rule.is_active }).eq('id', rule.id)
    loadAll()
  }

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return
    await supabase.from('email_automation_rules').delete().eq('id', id)
    loadAll()
  }

  const activeCount  = rules.filter(r => r.is_active).length
  const sentCount    = log.filter(l => l.status === 'sent').length
  const failedCount  = log.filter(l => l.status === 'failed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-amber-500" /> Email Automations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-send emails when ticket status changes</p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Rules',   value: rules.length,   icon: Zap,   color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Active Rules',  value: activeCount,    icon: Zap,   color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Emails Sent',   value: sentCount,      icon: Mail,  color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Failed',        value: failedCount,    icon: Clock, color: failedCount > 0 ? 'text-rose-500' : 'text-slate-400', bg: failedCount > 0 ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-50 dark:bg-slate-800' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          {[
            { id: 'rules', label: 'Rules', count: rules.length },
            { id: 'log',   label: 'Email Log', count: log.length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.id ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Rules tab */}
        {tab === 'rules' && (
          <div className="p-4 space-y-3">
            {loading ? (
              Array(2).fill(0).map((_, i) => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)
            ) : rules.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-amber-500" />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white mb-1">No email automation rules yet</p>
                <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Create rules to automatically email clients or techs when ticket statuses change.</p>
                <button onClick={() => { setEditing(null); setDialogOpen(true) }}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Plus className="w-4 h-4" /> Create First Rule
                </button>
              </div>
            ) : rules.map(rule => (
              <div key={rule.id} className={`rounded-xl border border-slate-200 dark:border-slate-700 p-4 transition-opacity ${rule.is_active ? '' : 'opacity-55'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 dark:text-white">{rule.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {rule.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                        <span className="text-slate-400">When ticket becomes</span>
                        <span className={`font-medium px-2 py-0.5 rounded-full border ${STATUS_CLS[rule.trigger_status] ?? ''}`}>
                          {STATUSES.find(s => s.value === rule.trigger_status)?.label ?? rule.trigger_status}
                        </span>
                        {(rule.delay_hours || 0) > 0 && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3 h-3" /> after {rule.delay_hours}h
                          </span>
                        )}
                        <ChevronRight className="w-3 h-3 text-slate-300" />
                        <span className="text-slate-400">email</span>
                        <span className="font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                          {RECIPIENT_LABEL[rule.recipient_type] ?? rule.recipient_type}
                          {rule.recipient_type === 'custom' && rule.custom_email && ` (${rule.custom_email})`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-md">Subject: {rule.subject_template}</p>
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
                    <button onClick={() => deleteRule(rule.id)}
                      className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Log tab */}
        {tab === 'log' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {log.length === 0 ? (
              <div className="py-14 text-center">
                <Mail className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No emails sent yet</p>
              </div>
            ) : log.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.status === 'sent' ? 'bg-emerald-500' : entry.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{entry.subject || '—'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    To: {entry.to_email || '—'} · Rule: {entry.rule_name || '—'} · Ticket: {entry.ticket_title || '—'}
                  </p>
                  {entry.error && <p className="text-xs text-rose-500 mt-0.5">{entry.error}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${entry.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : entry.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {entry.status}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{fmtDate(entry.sent_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RuleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId}
      />
    </div>
  )
}