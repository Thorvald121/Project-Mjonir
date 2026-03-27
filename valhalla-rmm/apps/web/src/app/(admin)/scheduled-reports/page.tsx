// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, X, Loader2, FileBarChart, Pencil, Trash2,
  Play, Mail, CheckCircle2, Clock,
} from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => { if (!tables.length || tables.includes(e.detail?.table)) ref.current() }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Report Dialog ─────────────────────────────────────────────────────────────
function ReportDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form,    setForm]    = useState({ name: '', recipients: '', frequency: 'monthly', is_active: true })
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    setErr(null)
    setForm(editing ? {
      name:       editing.name       || '',
      recipients: Array.isArray(editing.recipients) ? editing.recipients.join(', ') : (editing.recipients || ''),
      frequency:  editing.frequency  || 'monthly',
      is_active:  editing.is_active  ?? true,
    } : { name: '', recipients: '', frequency: 'monthly', is_active: true })
  }, [open, editing])

  const handleSave = async () => {
    if (!form.name.trim())       { setErr('Name is required'); return }
    if (!form.recipients.trim()) { setErr('At least one recipient is required'); return }
    const recipients = form.recipients.split(',').map(e => e.trim()).filter(e => e.includes('@'))
    if (!recipients.length) { setErr('Enter valid email addresses separated by commas'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id: orgId,
      name:        form.name.trim(),
      recipients,
      frequency:   form.frequency,
      is_active:   form.is_active,
    }
    const { error } = editing
      ? await supabase.from('scheduled_reports').update(payload).eq('id', editing.id)
      : await supabase.from('scheduled_reports').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Report' : 'New Scheduled Report'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Report Name *</label>
            <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Monthly Client Summary" className={`mt-1 ${inp}`} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipients *</label>
            <p className="text-xs text-slate-400 mt-0.5 mb-1">Comma-separated email addresses</p>
            <input value={form.recipients} onChange={e => s('recipients', e.target.value)}
              placeholder="client@example.com, manager@yourmsp.com" className={`mt-1 ${inp}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Frequency</label>
            <select value={form.frequency} onChange={e => s('frequency', e.target.value)} className={`mt-1 ${inp}`}>
              <option value="weekly">Weekly (every 7 days)</option>
              <option value="monthly">Monthly (every 30 days)</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={() => s('is_active', !form.is_active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ScheduledReportsPage() {
  const supabase   = createSupabaseBrowserClient()
  const [reports,  setReports]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [orgId,    setOrgId]    = useState(null)
  const [dialogOpen,setDialogOpen] = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [sending,  setSending]  = useState(null)
  const [sent,     setSent]     = useState(null)

  const loadAll = async () => {
    const { data } = await supabase.from('scheduled_reports').select('*').order('created_at')
    setReports(data ?? [])
    setLoading(false)
  }

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

  useRealtimeRefresh(['scheduled_reports'], loadAll)

  const handleDelete = async (id) => {
    if (!confirm('Delete this scheduled report?')) return
    await supabase.from('scheduled_reports').delete().eq('id', id)
    loadAll()
  }

  const handleToggle = async (report) => {
    await supabase.from('scheduled_reports').update({ is_active: !report.is_active }).eq('id', report.id)
    loadAll()
  }

  const sendNow = async (report) => {
    setSending(report.id)
    setSent(null)
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      await fetch('https://yetrdrgagfovphrerpie.supabase.co/functions/v1/send-scheduled-report', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ report_id: report.id }),
      })
      setSent(report.id)
      setTimeout(() => setSent(null), 4000)
      loadAll()
    } catch {}
    setSending(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-violet-500" /> Scheduled Reports
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-email performance summaries to clients and stakeholders.</p>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Report
        </button>
      </div>

      {/* What's included callout */}
      <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl px-5 py-4">
        <p className="text-sm font-semibold text-violet-800 dark:text-violet-300 mb-1">Each report includes:</p>
        <p className="text-xs text-violet-600 dark:text-violet-400">
          Tickets created, resolved &amp; open · SLA breaches · Average first response time · Billable hours · Revenue collected · Outstanding balance · Critical open tickets · Monitor uptime status
        </p>
      </div>

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-violet-50 dark:bg-violet-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileBarChart className="w-7 h-7 text-violet-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No scheduled reports yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Set up weekly or monthly email reports to keep clients informed without any manual effort.</p>
          <button onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Create First Report
          </button>
        </div>
      )}

      {/* Report list */}
      {reports.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {reports.map(r => {
            const recipients = Array.isArray(r.recipients) ? r.recipients : [r.recipients]
            return (
              <div key={r.id} className={`flex items-center gap-4 px-5 py-4 ${!r.is_active ? 'opacity-50' : ''}`}>
                {/* Status indicator */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{r.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      r.frequency === 'weekly' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                        : 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400'
                    }`}>{r.frequency}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Mail className="w-3 h-3" />
                      {recipients.join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {r.last_sent_at ? `Last sent ${fmtDate(r.last_sent_at)}` : 'Never sent'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Send now */}
                  <button onClick={() => sendNow(r)} disabled={!!sending}
                    title="Send now"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sent === r.id
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-600 hover:border-violet-300'
                    } disabled:opacity-60`}>
                    {sending === r.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : sent === r.id
                        ? <CheckCircle2 className="w-3.5 h-3.5" />
                        : <Play className="w-3.5 h-3.5" />
                    }
                    {sent === r.id ? 'Sent!' : 'Send Now'}
                  </button>

                  {/* Toggle active */}
                  <button onClick={() => handleToggle(r)} title={r.is_active ? 'Pause' : 'Resume'}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.is_active ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${r.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </button>

                  <button onClick={() => { setEditing(r); setDialogOpen(true) }}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(r.id)}
                    className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cron setup reminder */}
      {reports.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Automation setup</p>
          <p>Reports run automatically via a daily cron job. You can also click <strong>Send Now</strong> to preview any report immediately.</p>
        </div>
      )}

      <ReportDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing}
        orgId={orgId}
      />
    </div>
  )
}