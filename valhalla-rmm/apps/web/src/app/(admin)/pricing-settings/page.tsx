// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  DollarSign, Clock, Shield, Package, Save, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  RefreshCw,
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

function Section({ title, icon: Icon, color = 'text-amber-500', bg = 'bg-amber-50 dark:bg-amber-950/30', children }) {
  const [open, setOpen] = useState(true)
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

function RateRow({ label, sub, fieldKey, form, setForm, prefix = '$', suffix = '', step = '1', min = '0' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="relative w-36 flex-shrink-0">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">{prefix}</span>
        )}
        <input
          type="number"
          min={min}
          step={step}
          value={form[fieldKey] ?? ''}
          onChange={e => setForm(p => ({ ...p, [fieldKey]: e.target.value === '' ? '' : Number(e.target.value) }))}
          className={`${inp} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-10' : ''} text-right`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  )
}

export default function PricingSettingsPage() {
  const supabase = createSupabaseBrowserClient()
  const [form,    setForm]    = useState({ ...DEFAULTS })
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
        Object.keys(DEFAULTS).forEach(k => {
          loaded[k] = existing[k] ?? DEFAULTS[k]
        })
        setForm(loaded)
      }
      setLoading(false)
    }
    init()
  }, [])

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true); setErr(null); setSaved(false)

    const payload = { organization_id: orgId, ...form }

    const { error } = settId
      ? await supabase.from('pricing_settings').update(payload).eq('id', settId)
      : await supabase.from('pricing_settings').insert(payload)

    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const resetDefaults = () => { setForm({ ...DEFAULTS }) }

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

      {/* Add-On Rates */}
      <Section title="Add-On Service Rates" icon={Shield} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-950/30">
        <p className="text-xs text-slate-400 mb-4">What you charge clients for add-on services. These are your sell prices, not your cost.</p>
        <RateRow label="Endpoint Security (Bitdefender)" sub="Per device / month — includes AV, ATS, EDR" fieldKey="addon_security" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Managed Backup" sub="Per device / month" fieldKey="addon_backup" form={form} setForm={setForm} step="0.01" />
        <RateRow label="M365 License Management" sub="Per user / month" fieldKey="addon_m365" form={form} setForm={setForm} step="0.01" />
        <RateRow label="DNS Filtering" sub="Per device / month" fieldKey="addon_dns" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Security Awareness Training" sub="Per user / year" fieldKey="addon_training" form={form} setForm={setForm} step="0.01" />
        <RateRow label="Dark Web Monitoring" sub="Per domain / month" fieldKey="addon_darkweb" form={form} setForm={setForm} step="0.01" />
      </Section>

      {/* Onboarding */}
      <Section title="Onboarding & Setup" icon={Package} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30">
        <p className="text-xs text-slate-400 mb-4">Default onboarding fee auto-populated into quotes. Can be overridden per quote.</p>
        <RateRow label="Default onboarding fee" sub="One-time — covers initial setup, deployment, and documentation" fieldKey="onboarding_fee_default" form={form} setForm={setForm} step="1" />
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