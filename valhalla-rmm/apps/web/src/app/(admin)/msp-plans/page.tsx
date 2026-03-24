// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, Pencil, Trash2, Loader2, X, CheckCircle2,
  ChevronDown, Users, Star, Save, Zap, Shield,
  Building2, Package, Tag,
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

const COLOR_OPTIONS = [
  { id: 'blue',   label: 'Blue',   ring: 'ring-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200',   badge: 'bg-blue-100 text-blue-700',   btn: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'amber',  label: 'Amber',  ring: 'ring-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-300', badge: 'bg-amber-100 text-amber-700',  btn: 'bg-amber-600 hover:bg-amber-700' },
  { id: 'violet', label: 'Violet', ring: 'ring-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/20 border-violet-200', badge: 'bg-violet-100 text-violet-700', btn: 'bg-violet-600 hover:bg-violet-700' },
  { id: 'emerald',label: 'Green',  ring: 'ring-emerald-400',bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  { id: 'rose',   label: 'Rose',   ring: 'ring-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200',   badge: 'bg-rose-100 text-rose-700',   btn: 'bg-rose-600 hover:bg-rose-700' },
  { id: 'slate',  label: 'Slate',  ring: 'ring-slate-400',  bg: 'bg-slate-50 dark:bg-slate-950/20 border-slate-200', badge: 'bg-slate-100 text-slate-700',  btn: 'bg-slate-700 hover:bg-slate-800' },
]
const getColor = (id) => COLOR_OPTIONS.find(c => c.id === id) || COLOR_OPTIONS[0]

const BILLING_LABELS = { monthly: '/mo', yearly: '/yr', one_time: ' one-time', weekly: '/wk' }

const BLANK_PLAN = { name: '', description: '', price: '', billing_cycle: 'monthly', features: [], color: 'blue', badge_text: '', is_highlighted: false, is_active: true }

// ── Plan Form Dialog ──────────────────────────────────────────────────────────
function PlanDialog({ open, onClose, onSaved, editing, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [form,         setForm]         = useState({ ...BLANK_PLAN })
  const [featureInput, setFeatureInput] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name:           editing.name           || '',
        description:    editing.description    || '',
        price:          String(editing.price   ?? ''),
        billing_cycle:  editing.billing_cycle  || 'monthly',
        features:       editing.features       || [],
        color:          editing.color          || 'blue',
        badge_text:     editing.badge_text     || '',
        is_highlighted: editing.is_highlighted || false,
        is_active:      editing.is_active !== false,
      })
    } else {
      setForm({ ...BLANK_PLAN })
    }
    setFeatureInput('')
    setErr(null)
  }, [open, editing])

  const addFeature = () => {
    const f = featureInput.trim()
    if (!f) return
    s('features', [...form.features, f])
    setFeatureInput('')
  }

  const removeFeature = (i) => s('features', form.features.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Plan name is required'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { setErr('Price must be a valid number'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id: orgId,
      name:           form.name.trim(),
      description:    form.description.trim() || null,
      price,
      billing_cycle:  form.billing_cycle,
      features:       form.features,
      color:          form.color,
      badge_text:     form.badge_text.trim() || null,
      is_highlighted: form.is_highlighted,
      is_active:      form.is_active,
    }
    const { error } = editing
      ? await supabase.from('msp_plans').update(payload).eq('id', editing.id)
      : await supabase.from('msp_plans').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  const col = getColor(form.color)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Plan' : 'New Service Plan'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}

          {/* Name + billing cycle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan Name *</label>
              <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Professional" className={`mt-1 ${inp}`} autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Cycle</label>
              <select value={form.billing_cycle} onChange={e => s('billing_cycle', e.target.value)} className={`mt-1 ${inp}`}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="weekly">Weekly</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
          </div>

          {/* Price + badge */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Price ($) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => s('price', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Badge Text <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={form.badge_text} onChange={e => s('badge_text', e.target.value)} placeholder="e.g. Most Popular" className={`mt-1 ${inp}`} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={form.description} onChange={e => s('description', e.target.value)} rows={2} className={`mt-1 ${inp} resize-none`} placeholder="What's included in this plan?" />
          </div>

          {/* Features */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Features</label>
            <div className="flex gap-2 mt-1">
              <input value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                placeholder="Add a feature and press Enter" className={`flex-1 ${inp}`} />
              <button onClick={addFeature} className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {form.features.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{f}</span>
                    <button onClick={() => removeFeature(i)} className="text-slate-300 hover:text-rose-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Color Theme</label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c.id} onClick={() => s('color', c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${form.color === c.id ? `${c.ring} ring-2 ring-offset-1 ${c.badge}` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => s('is_highlighted', !form.is_highlighted)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_highlighted ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.is_highlighted ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">Highlighted (ring border)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <button onClick={() => s('is_active', !form.is_active)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">Active</span>
            </label>
          </div>

          {/* Preview */}
          <div className={`rounded-xl border-2 p-4 ${col.bg} ${form.is_highlighted ? `ring-2 ${col.ring}` : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{form.name || 'Plan Name'}</p>
                {form.badge_text && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.badge}`}>{form.badge_text}</span>}
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">${parseFloat(form.price || 0).toLocaleString()}</span>
                <span className="text-xs text-slate-400">{BILLING_LABELS[form.billing_cycle]}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Update Plan' : 'Create Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Assign Plan Dialog ────────────────────────────────────────────────────────
function AssignDialog({ open, onClose, onSaved, plan, orgId }) {
  const supabase   = createSupabaseBrowserClient()
  const [customers, setCustomers] = useState([])
  const [custId,    setCustId]    = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState(null)

  useEffect(() => {
    if (!open) return
    setCustId(''); setNotes(''); setErr(null)
    supabase.from('customers').select('id,name,contact_email').eq('status','active').order('name').limit(200)
      .then(({ data }) => setCustomers(data ?? []))
  }, [open])

  const handleAssign = async () => {
    if (!custId) { setErr('Select a customer'); return }
    setSaving(true); setErr(null)
    const cust = customers.find(c => c.id === custId)
    const { error } = await supabase.from('customer_plans').insert({
      organization_id: orgId,
      customer_id:     custId,
      plan_id:         plan.id,
      plan_name:       plan.name,
      plan_price:      plan.price,
      status:          'active',
      start_date:      new Date().toISOString().slice(0, 10),
      notes:           notes.trim() || null,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open || !plan) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Assign Plan to Customer</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`rounded-xl border p-3 ${getColor(plan.color).bg}`}>
            <p className="font-semibold text-slate-900 dark:text-white">{plan.name}</p>
            <p className="text-sm text-slate-500">${plan.price?.toLocaleString()}{BILLING_LABELS[plan.billing_cycle]}</p>
          </div>
          {err && <p className="text-rose-600 text-xs">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer *</label>
            <select value={custId} onChange={e => setCustId(e.target.value)} className={`mt-1 ${inp}`}>
              <option value="">Select a customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.contact_email ? ` — ${c.contact_email}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. 12-month contract" className={`mt-1 ${inp}`} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleAssign} disabled={!custId || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MSPPlansPage() {
  const supabase      = createSupabaseBrowserClient()
  const [plans,       setPlans]       = useState([])
  const [subs,        setSubs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [orgId,       setOrgId]       = useState(null)
  const [planDialog,  setPlanDialog]  = useState(false)
  const [assignDialog,setAssignDialog]= useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [assignPlan,  setAssignPlan]  = useState(null)

  const loadAll = async () => {
    const [p, s] = await Promise.all([
      supabase.from('msp_plans').select('*').order('price'),
      supabase.from('customer_plans').select('*, customers(id,name,contact_email)').order('created_at', { ascending: false }),
    ])
    setPlans(p.data ?? [])
    setSubs(s.data ?? [])
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

  useRealtimeRefresh(['msp_plans', 'customer_plans'], loadAll)

  const handleDeletePlan = async (plan) => {
    const activeSubs = subs.filter(s => s.plan_id === plan.id && s.status === 'active')
    if (activeSubs.length > 0) {
      alert(`Cannot delete — ${activeSubs.length} active subscription(s) use this plan. Cancel them first.`)
      return
    }
    if (!confirm(`Delete "${plan.name}" plan?`)) return
    await supabase.from('msp_plans').delete().eq('id', plan.id)
    loadAll()
  }

  const cancelSub = async (sub) => {
    if (!confirm(`Cancel ${sub.customers?.name}'s "${sub.plan_name}" subscription?`)) return
    await supabase.from('customer_plans').update({ status: 'cancelled', end_date: new Date().toISOString().slice(0,10) }).eq('id', sub.id)
    loadAll()
  }

  const activeSubs = subs.filter(s => s.status === 'active')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-500" /> MSP Service Plans
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage your service tiers. Assign plans to customers so they can see their coverage in the portal.</p>
        </div>
        <button onClick={() => { setEditingPlan(null); setPlanDialog(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {/* Plan cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="h-56 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-14 text-center">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-amber-500" />
          </div>
          <p className="font-semibold text-slate-900 dark:text-white mb-1">No service plans yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Create your first plan to start assigning managed service tiers to customers.</p>
          <button onClick={() => { setEditingPlan(null); setPlanDialog(true) }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Create First Plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map(plan => {
            const col  = getColor(plan.color)
            const count = activeSubs.filter(s => s.plan_id === plan.id).length
            return (
              <div key={plan.id} className={`relative rounded-xl border-2 p-5 ${col.bg} ${plan.is_highlighted ? `ring-2 ${col.ring}` : ''} ${!plan.is_active ? 'opacity-60' : ''}`}>
                {plan.badge_text && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`text-[10px] font-semibold px-3 py-1 rounded-full ${col.badge}`}>{plan.badge_text}</span>
                  </div>
                )}
                {!plan.is_active && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Inactive</span>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{plan.name}</h3>
                    {plan.description && <p className="text-xs text-slate-500 mt-0.5">{plan.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingPlan(plan); setPlanDialog(true) }}
                      className="p-1.5 rounded hover:bg-white/60 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeletePlan(plan)}
                      className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">${Number(plan.price).toLocaleString()}</span>
                  <span className="text-sm text-slate-400">{BILLING_LABELS[plan.billing_cycle]}</span>
                </div>
                {plan.features?.length > 0 && (
                  <ul className="space-y-1.5 mb-4">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/40 dark:border-slate-700/50">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {count} active
                  </span>
                  <button onClick={() => { setAssignPlan(plan); setAssignDialog(true) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${col.btn}`}>
                    Assign to Customer
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Active subscriptions */}
      {activeSubs.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" /> Active Subscriptions
            <span className="text-xs font-normal text-slate-400">({activeSubs.length})</span>
          </h2>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {activeSubs.map((sub, i) => {
              const col = getColor(plans.find(p => p.id === sub.plan_id)?.color || 'blue')
              return (
                <div key={sub.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{sub.customers?.name || 'Unknown customer'}</p>
                    <p className="text-xs text-slate-400">{sub.customers?.contact_email || ''}{sub.notes ? ` · ${sub.notes}` : ''}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${col.badge}`}>{sub.plan_name}</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white flex-shrink-0">
                    ${Number(sub.plan_price || 0).toLocaleString()}{BILLING_LABELS[plans.find(p => p.id === sub.plan_id)?.billing_cycle || 'monthly']}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0">Since {sub.start_date}</span>
                  <button onClick={() => cancelSub(sub)}
                    className="text-xs text-rose-400 hover:text-rose-600 hover:underline flex-shrink-0 transition-colors">
                    Cancel
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <PlanDialog
        open={planDialog}
        onClose={() => { setPlanDialog(false); setEditingPlan(null) }}
        onSaved={() => { setPlanDialog(false); setEditingPlan(null); loadAll() }}
        editing={editingPlan} orgId={orgId}
      />
      <AssignDialog
        open={assignDialog}
        onClose={() => { setAssignDialog(false); setAssignPlan(null) }}
        onSaved={() => { setAssignDialog(false); setAssignPlan(null); loadAll() }}
        plan={assignPlan} orgId={orgId}
      />
    </div>
  )
}