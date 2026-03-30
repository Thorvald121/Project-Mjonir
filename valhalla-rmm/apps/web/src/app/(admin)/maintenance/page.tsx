// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, Repeat, Trash2, Edit, Play, X, Loader2, CheckCircle2, Clock } from 'lucide-react'

const FREQ_LABELS = { daily:'Daily', weekly:'Weekly', biweekly:'Every 2 Weeks', monthly:'Monthly', quarterly:'Quarterly', annually:'Annually' }
const PRIORITY_CLS = { critical:'bg-rose-100 text-rose-700', high:'bg-orange-100 text-orange-700', medium:'bg-amber-100 text-amber-700', low:'bg-slate-100 text-slate-600' }

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function nextRunDate(lastRun, frequency) {
  const base = lastRun ? new Date(lastRun) : new Date()
  const d = new Date(base)
  switch(frequency) {
    case 'daily':     d.setDate(d.getDate() + 1); break
    case 'weekly':    d.setDate(d.getDate() + 7); break
    case 'biweekly':  d.setDate(d.getDate() + 14); break
    case 'monthly':   d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'annually':  d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().slice(0, 10)
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MaintenancePage() {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()
  const [schedules, setSchedules] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [orgId,     setOrgId]     = useState(null)
  const [open,      setOpen]      = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [running,   setRunning]   = useState(null)
  const BLANK = { title:'', description:'', priority:'medium', category:'maintenance', frequency:'monthly', customer_id:'', customer_name:'', assigned_to:'', next_run_date: new Date().toISOString().slice(0,10) }
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) {
        setOrgId(member.organization_id)
        const [sch, cust] = await Promise.all([
          supabase.from('maintenance_schedules').select('*').eq('organization_id', member.organization_id).order('next_run_date'),
          supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
        ])
        setSchedules(sch.data ?? [])
        setCustomers(cust.data ?? [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const openNew = () => { setEditing(null); setForm({ ...BLANK }); setOpen(true) }
  const openEdit = (sch) => {
    setEditing(sch)
    setForm({ title: sch.title, description: sch.description || '', priority: sch.priority, category: sch.category, frequency: sch.frequency, customer_id: sch.customer_id || '', customer_name: sch.customer_name || '', assigned_to: sch.assigned_to || '', next_run_date: sch.next_run_date || '' })
    setOpen(true)
  }

  const save = async () => {
    if (!form.title.trim() || !orgId) return
    setSaving(true)
    const cust = customers.find(c => c.id === form.customer_id)
    const payload = { ...form, organization_id: orgId, customer_name: cust?.name || form.customer_name || null, is_active: true }
    if (editing) {
      await supabase.from('maintenance_schedules').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('maintenance_schedules').insert(payload)
    }
    const { data } = await supabase.from('maintenance_schedules').select('*').eq('organization_id', orgId).order('next_run_date')
    setSchedules(data ?? [])
    setOpen(false); setSaving(false)
  }

  const remove = async (id) => {
    if (!confirm('Delete this maintenance schedule?')) return
    await supabase.from('maintenance_schedules').delete().eq('id', id)
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  const runNow = async (sch) => {
    setRunning(sch.id)
    // Create a real ticket from this schedule
    const { data: ticket } = await supabase.from('tickets').insert({
      organization_id: orgId,
      title:           sch.title,
      description:     sch.description || `Scheduled maintenance: ${sch.title}`,
      priority:        sch.priority,
      category:        sch.category,
      status:          'open',
      customer_id:     sch.customer_id || null,
      customer_name:   sch.customer_name || null,
      assigned_to:     sch.assigned_to || null,
      source:          'scheduled',
    }).select('id').single()
    // Stamp last run and compute next
    const nextRun = nextRunDate(new Date().toISOString(), sch.frequency)
    await supabase.from('maintenance_schedules').update({ last_run_at: new Date().toISOString(), next_run_date: nextRun }).eq('id', sch.id)
    setSchedules(prev => prev.map(s => s.id === sch.id ? { ...s, last_run_at: new Date().toISOString(), next_run_date: nextRun } : s))
    setRunning(null)
    if (ticket?.id) router.push(`/tickets/${ticket.id}`)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Repeat className="w-5 h-5 text-violet-500" /> Maintenance Schedules
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-create recurring tickets for patch windows, reviews, and routine tasks.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <Repeat className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No schedules yet</p>
          <p className="text-slate-400 text-sm mt-1">Create recurring maintenance tasks like monthly patch reviews, quarterly security audits, or weekly backups.</p>
          <button onClick={openNew} className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors mx-auto">
            <Plus className="w-4 h-4" /> Create First Schedule
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {schedules.map(sch => {
              const overdue = sch.next_run_date && sch.next_run_date < today
              return (
                <div key={sch.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{sch.title}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${PRIORITY_CLS[sch.priority] ?? ''}`}>{sch.priority}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">{FREQ_LABELS[sch.frequency]}</span>
                    </div>
                    {sch.customer_name && <p className="text-xs text-slate-400 mt-0.5">{sch.customer_name}</p>}
                    <div className="flex items-center gap-4 mt-1">
                      <div className={`flex items-center gap-1 text-xs ${overdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                        <Calendar className="w-3 h-3" />
                        {overdue ? 'Overdue · ' : 'Next: '}{fmtDate(sch.next_run_date)}
                      </div>
                      {sch.last_run_at && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          Last run {fmtDate(sch.last_run_at)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => runNow(sch)} disabled={running === sch.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${overdue ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'} disabled:opacity-50`}>
                      {running === sch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {running === sch.id ? 'Creating…' : 'Run Now'}
                    </button>
                    <button onClick={() => openEdit(sch)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(sch.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-bold text-slate-900 dark:text-white">{editing ? 'Edit Schedule' : 'New Maintenance Schedule'}</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title *</label>
                <input value={form.title} onChange={e => s('title', e.target.value)} placeholder="Monthly Patch Review" className={`mt-1 ${inp}`} autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>
                <textarea value={form.description} onChange={e => s('description', e.target.value)} rows={2} placeholder="What needs to be done…" className={`mt-1 ${inp} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Frequency</label>
                  <select value={form.frequency} onChange={e => s('frequency', e.target.value)} className={`mt-1 ${inp}`}>
                    {Object.entries(FREQ_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
                  <select value={form.priority} onChange={e => s('priority', e.target.value)} className={`mt-1 ${inp}`}>
                    {['critical','high','medium','low'].map(p => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                  <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                    {['maintenance','network','hardware','software','security','other'].map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Run Date</label>
                  <input type="date" value={form.next_run_date} onChange={e => s('next_run_date', e.target.value)} className={`mt-1 ${inp}`} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer (optional)</label>
                <select value={form.customer_id} onChange={e => s('customer_id', e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="">All / No specific customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assign To (optional)</label>
                <input value={form.assigned_to} onChange={e => s('assigned_to', e.target.value)} placeholder="tech@example.com" className={`mt-1 ${inp}`} />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.title.trim() || saving}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}