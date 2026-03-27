// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, DollarSign, User, Phone, Mail,
  Calendar, Trash2, Pencil, TrendingUp, Loader2, X,
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

const STAGES = [
  { key: 'new',           label: 'New',           top: 'border-t-slate-400',   bg: 'bg-slate-50 dark:bg-slate-900/60' },
  { key: 'contacted',     label: 'Contacted',     top: 'border-t-blue-400',    bg: 'bg-blue-50/30 dark:bg-blue-950/10' },
  { key: 'qualified',     label: 'Qualified',     top: 'border-t-violet-400',  bg: 'bg-violet-50/30 dark:bg-violet-950/10' },
  { key: 'proposal_sent', label: 'Proposal Sent', top: 'border-t-amber-400',   bg: 'bg-amber-50/30 dark:bg-amber-950/10' },
  { key: 'negotiating',   label: 'Negotiating',   top: 'border-t-orange-400',  bg: 'bg-orange-50/30 dark:bg-orange-950/10' },
  { key: 'won',           label: 'Won ✓',         top: 'border-t-emerald-400', bg: 'bg-emerald-50/30 dark:bg-emerald-950/10' },
  { key: 'lost',          label: 'Lost',          top: 'border-t-rose-400',    bg: 'bg-rose-50/30 dark:bg-rose-950/10' },
]

const STAGE_BADGE = {
  new:           'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  contacted:     'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  qualified:     'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  proposal_sent: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  negotiating:   'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  won:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  lost:          'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
}

const SOURCE_LABELS = {
  referral: 'Referral', website: 'Website', cold_outreach: 'Cold Outreach',
  event: 'Event', social: 'Social Media', other: 'Other',
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const BLANK = {
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'other', stage: 'new', estimated_value: '', notes: '', next_follow_up: '', assigned_to: '',
}

function fmtDate(d) {
  if (!d) return null
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return d }
}

// ── Lead Form Dialog ──────────────────────────────────────────────────────────
function LeadDialog({ open, onClose, onSaved, editing, orgId, defaultStage }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        company_name:    editing.company_name    || '',
        contact_name:    editing.contact_name    || '',
        contact_email:   editing.contact_email   || '',
        contact_phone:   editing.contact_phone   || '',
        source:          editing.source          || 'other',
        stage:           editing.stage           || 'new',
        estimated_value: editing.estimated_value != null ? String(editing.estimated_value) : '',
        notes:           editing.notes           || '',
        next_follow_up:  editing.next_follow_up  || '',
        assigned_to:     editing.assigned_to     || '',
      })
    } else {
      setForm({ ...BLANK, stage: defaultStage || 'new' })
    }
    setErr(null)
  }, [open, editing, defaultStage])

  const handleSave = async () => {
    if (!form.company_name.trim()) { setErr('Company name is required'); return }
    if (!orgId) { setErr('Organization not found'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id: orgId,
      company_name:    form.company_name.trim(),
      contact_name:    form.contact_name  || null,
      contact_email:   form.contact_email || null,
      contact_phone:   form.contact_phone || null,
      source:          form.source        || 'other',
      stage:           form.stage         || 'new',
      estimated_value: form.estimated_value ? Number(form.estimated_value) : 0,
      notes:           form.notes           || null,
      next_follow_up:  form.next_follow_up  || null,
      assigned_to:     form.assigned_to     || null,
    }
    const { error } = editing
      ? await supabase.from('leads').update(payload).eq('id', editing.id)
      : await supabase.from('leads').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Name *</label>
              <input value={form.company_name} onChange={e => s('company_name', e.target.value)} placeholder="Acme Corp" className={`mt-1 ${inp}`} autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</label>
              <select value={form.stage} onChange={e => s('stage', e.target.value)} className={`mt-1 ${inp}`}>
                {STAGES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</label>
              <select value={form.source} onChange={e => s('source', e.target.value)} className={`mt-1 ${inp}`}>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
              <input value={form.contact_name} onChange={e => s('contact_name', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={e => s('contact_email', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</label>
              <input type="tel" value={form.contact_phone} onChange={e => s('contact_phone', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Est. Monthly Value ($)</label>
              <input type="number" min={0} value={form.estimated_value} onChange={e => s('estimated_value', e.target.value)} placeholder="0" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Follow-up</label>
              <input type="date" value={form.next_follow_up} onChange={e => s('next_follow_up', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned To</label>
              <input value={form.assigned_to} onChange={e => s('assigned_to', e.target.value)} placeholder="tech@company.com" className={`mt-1 ${inp}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={3}
                placeholder="Meeting notes, requirements, next steps..." className={`mt-1 ${inp} resize-none`} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.company_name.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const supabase = createSupabaseBrowserClient()
  const [leads,      setLeads]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [orgId,      setOrgId]      = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [defaultStage, setDefaultStage] = useState('new')
  const [dragging,   setDragging]   = useState(null)
  const [dragOver,   setDragOver]   = useState(null)

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
    const { data } = await supabase.from('leads').select('*').order('updated_at', { ascending: false }).limit(200)
    setLeads(data ?? [])
    setLoading(false)
  }

  useRealtimeRefresh(['leads'], loadAll)



  const moveStage = async (lead, newStage) => {
    if (lead.stage === newStage) return
    // Optimistic update — move card immediately in UI
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l))
    const { error } = await supabase.from('leads').update({ stage: newStage }).eq('id', lead.id)
    if (error) {
      console.error('Move stage failed:', error.message)
      // Revert on failure
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: lead.stage } : l))
    }
  }

  const deleteLead = async (id) => {
    if (!confirm('Delete this lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    loadAll()
  }

  // Use a ref for dragging so it's always current in async handlers
  const draggingRef = useRef(null)

  const handleDragStart = (e, lead) => {
    draggingRef.current = lead
    setDragging(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id)
  }

  const handleDragEnd = () => {
    draggingRef.current = null
    setDragging(null)
    setDragOver(null)
  }

  // Use a per-column enter counter to reliably track whether cursor is inside
  // (avoids dragLeave false-firing when crossing child elements)
  const dragCounters = useRef({})

  const handleColumnDragEnter = (e, stageKey) => {
    e.preventDefault()
    dragCounters.current[stageKey] = (dragCounters.current[stageKey] || 0) + 1
    setDragOver(stageKey)
  }

  const handleColumnDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleColumnDragLeave = (e, stageKey) => {
    dragCounters.current[stageKey] = (dragCounters.current[stageKey] || 1) - 1
    if (dragCounters.current[stageKey] <= 0) {
      dragCounters.current[stageKey] = 0
      setDragOver(prev => prev === stageKey ? null : prev)
    }
  }

  const handleColumnDrop = (e, stageKey) => {
    e.preventDefault()
    dragCounters.current[stageKey] = 0
    const lead = draggingRef.current
    if (lead) moveStage(lead, stageKey)
    setDragging(null)
    setDragOver(null)
  }

  const pipelineValue = leads.filter(l => !['won','lost'].includes(l.stage)).reduce((s, l) => s + (l.estimated_value || 0), 0)
  const wonValue      = leads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.estimated_value || 0), 0)
  const convRate      = leads.length ? Math.round((leads.filter(l => l.stage === 'won').length / leads.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sales Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track leads from prospect to closed customer</p>
        </div>
        <button onClick={() => { setEditing(null); setDefaultStage('new'); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Leads',       value: leads.length,                             color: 'text-blue-500',    icon: User },
          { label: 'Pipeline Value',    value: '$' + pipelineValue.toLocaleString(),     color: 'text-amber-500',   icon: TrendingUp },
          { label: 'Won (MRR)',         value: '$' + wonValue.toLocaleString(),          color: 'text-emerald-500', icon: DollarSign },
          { label: 'Conversion Rate',   value: convRate + '%',                           color: 'text-violet-500',  icon: TrendingUp },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <Icon className={`w-6 h-6 flex-shrink-0 ${color}`} />
            <div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 272}px` }}>
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.key)
            const stageValue = stageLeads.reduce((s, l) => s + (l.estimated_value || 0), 0)
            const isOver     = dragOver === stage.key
            return (
              <div
                key={stage.key}
                className={`w-64 flex-shrink-0 rounded-xl border-t-4 border border-slate-200 dark:border-slate-700 flex flex-col transition-all ${stage.top} ${stage.bg} ${isOver ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                onDragEnter={e => handleColumnDragEnter(e, stage.key)}
                onDragOver={handleColumnDragOver}
                onDragLeave={e => handleColumnDragLeave(e, stage.key)}
                onDrop={e => handleColumnDrop(e, stage.key)}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{stage.label}</span>
                      <span className="text-xs text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                    <button onClick={() => { setEditing(null); setDefaultStage(stage.key); setDialogOpen(true) }}
                      className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {stageValue > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">${stageValue.toLocaleString()}/mo</p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-[180px]">
                  {loading && stage.key === 'new' && (
                    Array(2).fill(0).map((_, i) => <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />)
                  )}
                  {stageLeads.map(lead => {
                    const today   = new Date().toISOString().split('T')[0]
                    const overdue = lead.next_follow_up && lead.next_follow_up < today
                    const isDraggingThis = dragging?.id === lead.id
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${isDraggingThis ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{lead.company_name}</p>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => { setEditing(lead); setDialogOpen(true) }}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteLead(lead.id)}
                              className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {lead.contact_name && (
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> {lead.contact_name}
                          </p>
                        )}
                        {lead.contact_email && (
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                            <Mail className="w-2.5 h-2.5 flex-shrink-0" /> {lead.contact_email}
                          </p>
                        )}
                        {(lead.estimated_value || 0) > 0 && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium flex items-center gap-1">
                            <DollarSign className="w-2.5 h-2.5" /> ${(lead.estimated_value || 0).toLocaleString()}/mo
                          </p>
                        )}
                        {lead.source && (
                          <span className="inline-block text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded mt-1.5">
                            {SOURCE_LABELS[lead.source] || lead.source}
                          </span>
                        )}
                        {lead.next_follow_up && (
                          <p className={`text-[10px] mt-1.5 flex items-center gap-1 font-medium ${overdue ? 'text-rose-500' : 'text-slate-400'}`}>
                            <Calendar className="w-2.5 h-2.5" />
                            {overdue ? 'Overdue: ' : 'Follow-up: '}{fmtDate(lead.next_follow_up)}
                          </p>
                        )}
                        {lead.assigned_to && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">→ {lead.assigned_to.split('@')[0]}</p>
                        )}

                        {/* Quick stage buttons */}
                        <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                          {STAGES
                            .filter(s => s.key !== stage.key && s.key !== 'lost')
                            .slice(0, stage.key === 'negotiating' ? 1 : 2)
                            .map(s => (
                              <button key={s.key} onClick={() => moveStage(lead, s.key)}
                                className="text-[10px] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                → {s.label}
                              </button>
                            ))}
                          {stage.key !== 'won' && (
                            <button onClick={() => moveStage(lead, 'won')}
                              className="text-[10px] px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors ml-auto">
                              Won ✓
                            </button>
                          )}
                          {stage.key !== 'lost' && (
                            <button onClick={() => moveStage(lead, 'lost')}
                              className="text-[10px] px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
                              Lost
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <LeadDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId} defaultStage={defaultStage}
      />
    </div>
  )
}