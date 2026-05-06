// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  DollarSign, Clock, Shield, Package, Save, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  RefreshCw, Plus, Trash2, GripVertical, Eye, EyeOff,
} from 'lucide-react'

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const DEFAULTS = {
  core_per_user:          75,
  core_monthly_min:       300,
  advanced_per_user:      110,
  advanced_monthly_min:   450,
  elite_per_user:         160,
  elite_monthly_min:      650,
  flex_hourly:            150,
  flex_block_hours:       10,
  rate_standard:          150,
  rate_after_hours:       200,
  rate_emergency:         275,
  rate_onsite:            175,
  rate_project:           150,
  addon_security:         3.50,
  addon_backup:           8.00,
  addon_m365:             5.00,
  addon_dns:              4.00,
  addon_training:         25.00,
  addon_darkweb:          15.00,
  onboarding_fee_default: 500,
}

const DEFAULT_OFFERINGS = [
  { key: 'security', label: 'Endpoint Security',                description: 'AV, Advanced Threat Security, EDR',       unit: 'device', section: 'security', rate: 3.50,  enabled: true },
  { key: 'dns',      label: 'DNS Filtering & Web Content Control', description: 'Per device/mo',                         unit: 'device', section: 'security', rate: 4.00,  enabled: true },
  { key: 'training', label: 'Security Awareness Training',      description: 'Per user/year — billed monthly',           unit: 'user',   section: 'security', rate: 25.00, enabled: true },
  { key: 'darkweb',  label: 'Dark Web Monitoring',              description: 'Per domain/mo',                            unit: 'domain', section: 'security', rate: 15.00, enabled: true },
  { key: 'backup',   label: 'Managed Backup Administration',    description: 'Per device/mo',                            unit: 'device', section: 'other',    rate: 8.00,  enabled: true },
  { key: 'm365',     label: 'Microsoft 365 License Management', description: 'Per user/mo',                              unit: 'user',   section: 'other',    rate: 5.00,  enabled: true },
]

const SECTION_OPTIONS = ['security', 'other', 'support', 'onboarding']
const UNIT_OPTIONS    = ['device', 'user', 'domain', 'month', 'license', 'mailbox', 'site']

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({ title, icon: Icon, color = 'text-amber-500', bg = 'bg-amber-50 dark:bg-amber-950/30', children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white text-sm">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

// ── Rate row ──────────────────────────────────────────────────────────────────
function RateRow({ label, sub, fieldKey, form, setForm, prefix = '$', suffix = '', step = '1', min = '0' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="relative w-36 flex-shrink-0">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">{prefix}</span>}
        <input
          type="number" min={min} step={step}
          value={form[fieldKey] ?? ''}
          onChange={e => setForm(p => ({ ...p, [fieldKey]: e.target.value === '' ? '' : Number(e.target.value) }))}
          className={`${inp} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''} text-right`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>}
      </div>
    </div>
  )
}

// ── Offering row — editable inline ────────────────────────────────────────────
function OfferingRow({ offering, idx, onChange, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-xl border transition-colors ${offering.enabled ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-60'}`}>
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-700 flex-shrink-0 cursor-grab" />

        {/* Toggle enabled */}
        <button onClick={() => onToggle(idx)}
          title={offering.enabled ? 'Disable offering' : 'Enable offering'}
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${offering.enabled ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
          {offering.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {/* Label (editable inline) */}
        <input
          value={offering.label}
          onChange={e => onChange(idx, 'label', e.target.value)}
          placeholder="Offering name"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 dark:text-white focus:outline-none border-b border-transparent focus:border-amber-400 py-0.5"
        />

        {/* Rate */}
        <div className="relative flex-shrink-0 w-24">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
          <input
            type="number" min={0} step="0.01"
            value={offering.rate ?? ''}
            onChange={e => onChange(idx, 'rate', parseFloat(e.target.value) || 0)}
            className="w-full pl-6 pr-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">/{offering.unit || 'unit'}</span>

        {/* Expand for more fields */}
        <button onClick={() => setExpanded(e => !e)}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors flex-shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Delete */}
        <button onClick={() => onDelete(idx)}
          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Description</label>
            <input
              value={offering.description || ''}
              onChange={e => onChange(idx, 'description', e.target.value)}
              placeholder="Shown to client in quotes"
              className={`mt-1 ${inp} text-xs`}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Unit</label>
            <select
              value={offering.unit || 'device'}
              onChange={e => onChange(idx, 'unit', e.target.value)}
              className={`mt-1 ${inp} text-xs`}>
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Section in quote</label>
            <select
              value={offering.section || 'other'}
              onChange={e => onChange(idx, 'section', e.target.value)}
              className={`mt-1 ${inp} text-xs`}>
              {SECTION_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PricingSettingsPage() {
  const supabase  = createSupabaseBrowserClient()
  const [form,    setForm]    = useState({ ...DEFAULTS })
  const [offerings, setOfferings] = useState(DEFAULT_OFFERINGS)
  const [orgId,   setOrgId]   = useState(null)
  const [settId,  setSettId]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [err,     setErr]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (!member) return
      setOrgId(member.organization_id)

      const { data: existing } = await supabase
        .from('pricing_settings')
        .select('*')
        .eq('organization_id', member.organization_id)
        .single()

      if (existing) {
        setSettId(existing.id)
        const loaded = {}
        Object.keys(DEFAULTS).forEach(k => { loaded[k] = existing[k] ?? DEFAULTS[k] })
        setForm(loaded)
        // Load offerings from DB or fall back to defaults
        if (existing.offerings && Array.isArray(existing.offerings)) {
          setOfferings(existing.offerings)
        }
      }
      setLoading(false)
    }
    init()
  }, [])

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true); setErr(null); setSaved(false)
    const payload = { organization_id: orgId, ...form, offerings }
    const { error } = settId
      ? await supabase.from('pricing_settings').update(payload).eq('id', settId)
      : await supabase.from('pricing_settings').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const resetDefaults = () => {
    setForm({ ...DEFAULTS })
    setOfferings(DEFAULT_OFFERINGS)
  }

  // ── Offering CRUD ────────────────────────────────────────────────────────────
  const updateOffering = (idx, key, val) => {
    setOfferings(prev => prev.map((o, i) => i === idx ? { ...o, [key]: val } : o))
  }

  const toggleOffering = (idx) => {
    setOfferings(prev => prev.map((o, i) => i === idx ? { ...o, enabled: !o.enabled } : o))
  }

  const deleteOffering = (idx) => {
    if (!confirm('Remove this offering?')) return
    setOfferings(prev => prev.filter((_, i) => i !== idx))
  }

  const addOffering = () => {
    setOfferings(prev => [...prev, {
      key:         `custom_${Date.now()}`,
      label:       '',
      description: '',
      unit:        'device',
      section:     'other',
      rate:        0,
      enabled:     true,
    }])
  }

  if (loading) return (
    <div className="max-w-3xl space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
      {Array(4).fill(0).map((_, i) => <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}
    </div>
  )

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pricing Settings</h1>
          <p className="text-sm text-slate-500 mt-1">All rates set here auto-populate into new quotes. Change once — every new quote reflects it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetDefaults}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Rates'}
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{err}</p>
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-700 dark:text-emerald-400">Pricing saved — all new quotes will use these rates.</p>
        </div>
      )}

      {/* Service Plans */}
      <Section title="Service Plan Rates" icon={DollarSign} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/30">
        <p className="text-xs text-slate-400 mb-4">Per-user monthly rates and monthly minimums for each managed service plan.</p>
        <div className="grid grid-cols-1 gap-6">
          {[
            { plan: 'Core',     keyRate: 'core_per_user',      keyMin: 'core_monthly_min',     sub: 'Very small offices, stability + business-hours support' },
            { plan: 'Advanced', keyRate: 'advanced_per_user',  keyMin: 'advanced_monthly_min', sub: 'Most SMBs — recommended default plan' },
            { plan: 'Elite',    keyRate: 'elite_per_user',     keyMin: 'elite_monthly_min',    sub: 'Higher-touch clients, managed backup + strategy' },
          ].map(({ plan, keyRate, keyMin, sub }) => (
            <div key={plan} className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">{plan}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </div>
              <div className="px-4">
                <RateRow label="Per user / month" fieldKey={keyRate} form={form} setForm={setForm} step="0.01" />
                <RateRow label="Monthly minimum" sub="Enforced if user count × rate falls below this" fieldKey={keyMin} form={form} setForm={setForm} step="1" />
              </div>
            </div>
          ))}

          {/* Flex */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Flex Support</p>
              <p className="text-xs text-slate-400">Prepaid block hours — not a managed plan</p>
            </div>
            <div className="px-4">
              <RateRow label="Prepaid block rate" sub="Hourly rate for prepaid blocks" fieldKey="flex_hourly" form={form} setForm={setForm} step="0.01" />
              <RateRow label="Minimum block size" sub="Hours" prefix="" suffix="hrs" fieldKey="flex_block_hours" form={form} setForm={setForm} min="1" />
            </div>
          </div>
        </div>
      </Section>

      {/* Hourly Rates */}
      <Section title="Hourly & Project Rates" icon={Clock} color="text-violet-500" bg="bg-violet-50 dark:bg-violet-950/30">
        <p className="text-xs text-slate-400 mb-4">Applied to out-of-scope work, after-hours, emergencies, and projects for all plan types.</p>
        <RateRow label="Standard business hours" sub="Out-of-scope work Mon–Fri 8am–5pm ET" fieldKey="rate_standard" form={form} setForm={setForm} step="0.01" />
        <RateRow label="After-hours" sub="Any request outside standard business hours" fieldKey="rate_after_hours" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Emergency / same-day" sub="Same-day after-hours response" fieldKey="rate_emergency" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Onsite service" sub="Per hour — travel billed separately" fieldKey="rate_onsite" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Project rate" sub="Scoped project work billed separately" fieldKey="rate_project" form={form} setForm={setForm} step="0.01" />
      </Section>

      {/* Onboarding */}
      <Section title="Onboarding & Setup" icon={Package} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30">
        <p className="text-xs text-slate-400 mb-4">Default onboarding fee auto-populated into quotes. Can be overridden per quote.</p>
        <RateRow label="Default onboarding fee" sub="One-time — covers initial setup, deployment, and documentation" fieldKey="onboarding_fee_default" form={form} setForm={setForm} step="1" />
      </Section>

      {/* ── Service Offerings — fully editable ── */}
      <Section title="Service Offerings & Add-Ons" icon={Shield} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-950/30" defaultOpen={true}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400 leading-relaxed">
                These are your add-on service offerings. Edit names and descriptions freely — they appear on quotes and the quote builder exactly as written here.
                Toggle the eye icon to show or hide an offering from the quote builder without deleting it.
              </p>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[32px_32px_1fr_100px_60px_32px_32px] gap-2 px-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <div />
            <div />
            <div>Offering name</div>
            <div className="text-right">Sell rate</div>
            <div className="text-center">/unit</div>
            <div />
            <div />
          </div>

          {/* Offering rows */}
          {offerings.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
              <p className="text-sm">No offerings yet — add one below</p>
            </div>
          ) : (
            <div className="space-y-2">
              {offerings.map((offering, idx) => (
                <OfferingRow
                  key={offering.key + idx}
                  offering={offering}
                  idx={idx}
                  onChange={updateOffering}
                  onDelete={deleteOffering}
                  onToggle={toggleOffering}
                />
              ))}
            </div>
          )}

          {/* Add new offering */}
          <button onClick={addOffering}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-500 hover:border-amber-400 hover:text-amber-600 dark:hover:border-amber-700 dark:hover:text-amber-400 transition-colors">
            <Plus className="w-4 h-4" /> Add New Offering
          </button>

          <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
            <strong>Tip:</strong> When you add Action1, Bitdefender, or any other new tool — add it here first, set your sell rate, and it will automatically appear in the Quote Builder's add-on section.
          </p>
        </div>
      </Section>

      {/* Save button at bottom */}
      <div className="flex justify-end pb-4">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save All Rates'}
        </button>
      </div>
    </div>
  )
}