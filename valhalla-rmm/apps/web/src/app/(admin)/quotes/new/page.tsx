// @ts-nocheck
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, CheckCircle2,
  AlertTriangle, DollarSign, Users, Monitor, Eye, EyeOff,
  LayoutList, Layers, AlignJustify, ChevronDown, Edit3,
  Shield, Package, Clock, RefreshCw, X, Paperclip,
} from 'lucide-react'
import QuoteAttachments from '@/components/QuoteAttachments'

// ── Types ─────────────────────────────────────────────────────────────────────
const SECTIONS = {
  support:    { label: 'Support Tier',    color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/20',  border: 'border-amber-200 dark:border-amber-800' },
  security:   { label: 'Security',        color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/20',    border: 'border-blue-200 dark:border-blue-800' },
  other:      { label: 'Other Offerings', color: 'text-violet-600',  bg: 'bg-violet-50 dark:bg-violet-950/20',border: 'border-violet-200 dark:border-violet-800' },
  onboarding: { label: 'Onboarding',      color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-800' },
}

const PLAN_LABELS = { core: 'Core', advanced: 'Advanced', elite: 'Elite', flex: 'Flex' }

const MULTIPLIERS = [
  { value: 1.00, label: 'Simple (1.00×)',         sub: 'Email, standard PCs, basic router' },
  { value: 1.15, label: 'Moderate (1.15×)',        sub: 'Cloud SaaS mix, multi-site, more admin' },
  { value: 1.30, label: 'Complex (1.30×)',         sub: 'Servers, compliance, legacy systems' },
  { value: 1.45, label: 'High complexity (1.45×)', sub: 'Regulated, high ticket volume' },
  { value: 1.60, label: 'High complexity (1.60×)', sub: 'Multi-server, complex integrations' },
]

const DISPLAY_MODES = [
  { value: 'full',      icon: LayoutList,   label: 'Full Detail', sub: 'Every line item shown' },
  { value: 'sectioned', icon: Layers,       label: 'Sectioned',   sub: 'Grouped by category' },
  { value: 'summary',   icon: AlignJustify, label: 'Summary',     sub: 'Section totals only' },
]

const inp     = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const fmtCur  = (n) => n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Quote Preview ─────────────────────────────────────────────────────────────
function QuotePreview({ lineItems, displayMode, clientName, quoteNumber, showMargin }) {
  const sections = useMemo(() => {
    const map = {}
    for (const item of lineItems) {
      if (!map[item.section]) map[item.section] = []
      map[item.section].push(item)
    }
    return map
  }, [lineItems])

  const recurringItems = lineItems.filter(i => !i.is_one_time)
  const oneTimeItems   = lineItems.filter(i => i.is_one_time)
  const recurringTotal = recurringItems.reduce((s, i) => s + i.total, 0)
  const oneTimeTotal   = oneTimeItems.reduce((s, i) => s + i.total, 0)
  const totalCost      = lineItems.reduce((s, i) => s + (i.internal_cost_total || 0), 0)
  const grossMargin    = recurringTotal - totalCost
  const marginPct      = recurringTotal > 0 ? (grossMargin / recurringTotal) * 100 : 0

  if (lineItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <DollarSign className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
        <p className="text-sm">Configure your quote on the left to see a preview</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Quote Preview</p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{clientName || 'Client Name'}</h3>
            {quoteNumber && <p className="text-xs text-slate-400 mt-0.5">{quoteNumber}</p>}
          </div>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {DISPLAY_MODES.map(m => (
              <div key={m.value} className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${displayMode === m.value ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'}`}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full mode */}
      {displayMode === 'full' && (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <div>Description</div><div className="text-right">Qty</div><div className="text-right">Rate</div><div className="text-right">Total</div>
          </div>
          {recurringItems.map(item => (
            <div key={item.id} className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 text-sm">
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-200">{item.description}</p>
                {item.sub && <p className="text-xs text-slate-400">{item.sub}</p>}
              </div>
              <div className="text-right text-slate-600 dark:text-slate-400">{item.quantity}</div>
              <div className="text-right text-slate-600 dark:text-slate-400">{fmtCur(item.unit_price)}</div>
              <div className="text-right font-semibold text-slate-900 dark:text-white">{fmtCur(item.total)}</div>
            </div>
          ))}
          {oneTimeItems.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100 dark:border-slate-800 mt-2">One-Time</div>
              {oneTimeItems.map(item => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-2 py-2 rounded-lg text-sm">
                  <div><p className="font-medium text-slate-800 dark:text-slate-200">{item.description}</p></div>
                  <div className="text-right text-slate-600 dark:text-slate-400">{item.quantity}</div>
                  <div className="text-right text-slate-600 dark:text-slate-400">{fmtCur(item.unit_price)}</div>
                  <div className="text-right font-semibold text-slate-900 dark:text-white">{fmtCur(item.total)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Sectioned mode */}
      {displayMode === 'sectioned' && (
        <div className="space-y-3">
          {Object.entries(sections).map(([sectionKey, items]) => {
            const cfg      = SECTIONS[sectionKey] ?? SECTIONS.other
            const oneTime  = items.filter(i => i.is_one_time)
            const total    = items.reduce((s, i) => s + i.total, 0)
            return (
              <div key={sectionKey} className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-current border-opacity-20">
                  <p className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</p>
                  <p className={`text-sm font-bold ${cfg.color}`}>{fmtCur(total)}{oneTime.length === items.length ? ' one-time' : '/mo'}</p>
                </div>
                <div className="px-4 py-2 space-y-1.5">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{item.description}</span>
                      <span className="font-medium text-slate-900 dark:text-white flex-shrink-0 ml-4">
                        {fmtCur(item.total)}{item.is_one_time ? '' : '/mo'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary mode */}
      {displayMode === 'summary' && (
        <div className="space-y-2">
          {Object.entries(sections).map(([sectionKey, items]) => {
            const cfg     = SECTIONS[sectionKey] ?? SECTIONS.other
            const total   = items.reduce((s, i) => s + i.total, 0)
            const oneTime = items.every(i => i.is_one_time)
            return (
              <div key={sectionKey} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${cfg.color.replace('text-', 'bg-').replace('-600', '-400')}`} />
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{cfg.label}</p>
                </div>
                <p className="font-bold text-slate-900 dark:text-white">
                  {fmtCur(total)}{oneTime ? ' one-time' : '/mo'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Monthly recurring</span>
          <span className="font-bold text-slate-900 dark:text-white text-base">{fmtCur(recurringTotal)}/mo</span>
        </div>
        {oneTimeTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">One-time</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtCur(oneTimeTotal)}</span>
          </div>
        )}
      </div>

      {/* Internal margin */}
      {showMargin && totalCost > 0 && (
        <div className="border-t border-dashed border-amber-300 dark:border-amber-700 pt-3 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Internal — not shown to client</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Your cost</span>
            <span className="text-slate-700 dark:text-slate-300">{fmtCur(totalCost)}/mo</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Gross margin</span>
            <span className={`font-semibold ${grossMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {fmtCur(grossMargin)}/mo ({marginPct.toFixed(0)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QuoteBuilderPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [settings,   setSettings]   = useState(null)
  const [orgId,      setOrgId]      = useState(null)
  const [customers,  setCustomers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState(null)

  // ── Post-save state: once a quote is saved we hold its ID here
  // and reveal the attachments panel instead of routing away
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null)
  const [savedQuoteNumber, setSavedQuoteNumber] = useState<string | null>(null)

  // ── Quote meta
  const [customerId,    setCustomerId]    = useState('')
  const [clientName,    setClientName]    = useState('')
  const [contactEmail,  setContactEmail]  = useState('')
  const [contactName,   setContactName]   = useState('')
  const [title,         setTitle]         = useState('')
  const [validUntil,    setValidUntil]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [msgToClient,   setMsgToClient]   = useState('')

  // ── Quote config
  const [selectedPlan,      setSelectedPlan]      = useState('advanced')
  const [userCount,         setUserCount]          = useState(5)
  const [deviceCount,       setDeviceCount]        = useState(5)
  const [domainCount,       setDomainCount]        = useState(1)
  const [multiplier,        setMultiplier]         = useState(1.00)
  const [includeOnboarding, setIncludeOnboarding]  = useState(true)

  const [addons, setAddons] = useState({
    security: { enabled: false, qty: 5 },
    backup:   { enabled: false, qty: 5 },
    m365:     { enabled: false, qty: 5 },
    dns:      { enabled: false, qty: 5 },
    training: { enabled: false, qty: 5 },
    darkweb:  { enabled: false, qty: 1 },
  })

  const [customItems, setCustomItems] = useState([])
  const [displayMode, setDisplayMode] = useState('sectioned')
  const [showMargin,  setShowMargin]  = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (!member) return
      setOrgId(member.organization_id)

      const [{ data: sett }, { data: custs }] = await Promise.all([
        supabase.from('pricing_settings').select('*').eq('organization_id', member.organization_id).single(),
        supabase.from('customers').select('id, name, contact_name, contact_email').eq('organization_id', member.organization_id).eq('status', 'active').order('name'),
      ])

      if (sett) setSettings(sett)
      setCustomers(custs ?? [])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    setAddons(prev => ({
      ...prev,
      security: { ...prev.security, qty: deviceCount },
      backup:   { ...prev.backup,   qty: deviceCount },
      dns:      { ...prev.dns,      qty: deviceCount },
      m365:     { ...prev.m365,     qty: userCount },
      training: { ...prev.training, qty: userCount },
    }))
  }, [userCount, deviceCount])

  const handleCustomerSelect = (id) => {
    setCustomerId(id)
    const c = customers.find(c => c.id === id)
    if (c) {
      setClientName(c.name)
      setContactEmail(c.contact_email || '')
      setContactName(c.contact_name || '')
    }
  }

  // ── Computed line items
  const lineItems = useMemo(() => {
    if (!settings || !selectedPlan) return []
    const items = []

    const planRateRaw = {
      core:     settings.core_per_user,
      advanced: settings.advanced_per_user,
      elite:    settings.elite_per_user,
    }[selectedPlan]

    if (selectedPlan === 'flex') {
      const blockRate  = settings.flex_hourly || 150
      const blockHours = settings.flex_block_hours || 10
      items.push({
        id: 'flex-block', description: `Flex Support — ${blockHours}-Hour Prepaid Block`,
        sub: 'Business-hours reactive support, remote troubleshooting',
        quantity: 1, unit_price: blockRate * blockHours, total: blockRate * blockHours,
        section: 'support', type: 'plan', is_one_time: false, internal_cost_total: 0,
      })
    } else if (planRateRaw && userCount > 0) {
      const adjustedRate = parseFloat((planRateRaw * multiplier).toFixed(2))
      const planTotal    = adjustedRate * userCount
      const minFee       = { core: settings.core_monthly_min, advanced: settings.advanced_monthly_min, elite: settings.elite_monthly_min }[selectedPlan] || 0

      items.push({
        id: 'plan',
        description: `${PLAN_LABELS[selectedPlan]} Managed Services — ${userCount} user${userCount !== 1 ? 's' : ''}`,
        sub: multiplier > 1 ? `Base rate ${fmtCur(planRateRaw)} × ${multiplier}× complexity = ${fmtCur(adjustedRate)}/user` : undefined,
        quantity: userCount, unit_price: adjustedRate,
        total: Math.max(planTotal, minFee),
        section: 'support', type: 'plan', is_one_time: false, internal_cost_total: 0,
      })

      if (planTotal < minFee) {
        items.push({
          id: 'min-adj',
          description: `Monthly minimum adjustment (${PLAN_LABELS[selectedPlan]} min: ${fmtCur(minFee)})`,
          quantity: 1, unit_price: minFee - planTotal, total: minFee - planTotal,
          section: 'support', type: 'minimum', is_one_time: false, internal_cost_total: 0,
        })
      }
    }

    const securityAddons = [
      { key: 'security', label: 'Endpoint Security (Bitdefender GravityZone)', sub: 'AV, Advanced Threat Security, EDR — per device/mo', rate: settings.addon_security, unit: 'device', section: 'security', cost: 2.86 },
      { key: 'dns',      label: 'DNS Filtering & Web Content Control',          sub: 'Per device/mo', rate: settings.addon_dns, unit: 'device', section: 'security', cost: 0 },
      { key: 'training', label: 'Security Awareness Training',                  sub: 'Per user/year — billed monthly', rate: (settings.addon_training || 0) / 12, unit: 'user', section: 'security', cost: 0 },
      { key: 'darkweb',  label: 'Dark Web Monitoring',                          sub: 'Per domain/mo', rate: settings.addon_darkweb, unit: 'domain', section: 'security', cost: 0 },
    ]

    for (const a of securityAddons) {
      if (!addons[a.key]?.enabled) continue
      const qty   = addons[a.key].qty || 1
      const rate  = a.rate || 0
      items.push({
        id: a.key, description: `${a.label} — ${qty} ${a.unit}${qty !== 1 ? 's' : ''}`,
        sub: a.sub, quantity: qty, unit_price: parseFloat(rate.toFixed(2)),
        total: parseFloat((qty * rate).toFixed(2)),
        section: a.section, type: 'addon', is_one_time: false, internal_cost_total: a.cost * qty,
      })
    }

    const otherAddons = [
      { key: 'backup', label: 'Managed Backup Administration', sub: 'Per device/mo', rate: settings.addon_backup, unit: 'device', section: 'other' },
      { key: 'm365',   label: 'Microsoft 365 License Management', sub: 'Per user/mo', rate: settings.addon_m365, unit: 'user', section: 'other' },
    ]

    for (const a of otherAddons) {
      if (!addons[a.key]?.enabled) continue
      const qty  = addons[a.key].qty || 1
      const rate = a.rate || 0
      items.push({
        id: a.key, description: `${a.label} — ${qty} ${a.unit}${qty !== 1 ? 's' : ''}`,
        sub: a.sub, quantity: qty, unit_price: parseFloat(rate.toFixed(2)),
        total: parseFloat((qty * rate).toFixed(2)),
        section: a.section, type: 'addon', is_one_time: false, internal_cost_total: 0,
      })
    }

    for (const ci of customItems) {
      if (!ci.description || !ci.total) continue
      items.push({
        id: ci.id, description: ci.description,
        quantity: ci.quantity || 1, unit_price: ci.unit_price || ci.total, total: ci.total,
        section: ci.section || 'other', type: 'custom',
        is_one_time: ci.is_one_time || false, internal_cost_total: 0,
      })
    }

    if (includeOnboarding) {
      items.push({
        id: 'onboarding', description: 'Onboarding & Initial Setup',
        sub: 'Agent deployment, documentation, portal setup, onboarding call',
        quantity: 1, unit_price: settings.onboarding_fee_default || 500,
        total: settings.onboarding_fee_default || 500,
        section: 'onboarding', type: 'onboarding', is_one_time: true, internal_cost_total: 0,
      })
    }

    return items
  }, [settings, selectedPlan, userCount, deviceCount, domainCount, multiplier, addons, customItems, includeOnboarding])

  const recurringTotal = lineItems.filter(i => !i.is_one_time).reduce((s, i) => s + i.total, 0)
  const oneTimeTotal   = lineItems.filter(i => i.is_one_time).reduce((s, i) => s + i.total, 0)
  const grandTotal     = recurringTotal + oneTimeTotal

  const addCustomItem = () => {
    setCustomItems(prev => [...prev, {
      id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0, section: 'other', is_one_time: false,
    }])
  }

  const updateCustomItem = (id, key, val) => {
    setCustomItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const updated = { ...i, [key]: val }
      if (key === 'quantity' || key === 'unit_price') {
        updated.total = (updated.quantity || 1) * (updated.unit_price || 0)
      }
      return updated
    }))
  }

  const removeCustomItem = (id) => setCustomItems(prev => prev.filter(i => i.id !== id))

  // ── Save
  const handleSave = async (status = 'draft') => {
    if (!orgId) return
    if (!clientName.trim()) { setErr('Client name is required'); return }
    setSaving(true); setErr(null)

    const { data: latest } = await supabase
      .from('quotes').select('quote_number')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()

    const lastNum    = latest?.quote_number ? parseInt(latest.quote_number.replace(/\D/g, '')) || 0 : 0
    const quoteNumber = `Q-${String(lastNum + 1).padStart(4, '0')}`

    const payload = {
      organization_id: orgId, customer_id: customerId || null,
      customer_name: clientName.trim(), contact_email: contactEmail || null,
      contact_name: contactName || null, quote_number: quoteNumber,
      title: title.trim() || `${PLAN_LABELS[selectedPlan] || 'Managed Services'} — ${clientName}`,
      status, line_items: lineItems, subtotal: grandTotal, total: grandTotal,
      display_mode: displayMode, valid_until: validUntil || null,
      expiry_date: validUntil || null, notes: notes || null,
      internal_notes: internalNotes || null, message_to_client: msgToClient || null,
      issue_date: new Date().toISOString().slice(0, 10),
    }

    const { data: saved, error } = await supabase.from('quotes').insert(payload).select('id, quote_number').single()
    if (error) { setErr(error.message); setSaving(false); return }

    // Stay on page and reveal attachments panel
    setSavedQuoteId(saved.id)
    setSavedQuoteNumber(saved.quote_number)
    setSaving(false)
  }

  if (loading) return (
    <div className="max-w-7xl space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-2 gap-6">
        <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    </div>
  )

  if (!settings) return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
      <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Pricing not configured</h2>
      <p className="text-slate-500 text-sm mb-6">Set up your rates before building quotes.</p>
      <button onClick={() => router.push('/pricing-settings')}
        className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
        Go to Pricing Settings
      </button>
    </div>
  )

  // ── POST-SAVE: show attachments panel ─────────────────────────────────────
  if (savedQuoteId) {
    return (
      <div className="max-w-3xl space-y-5">
        {/* Success banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Quote {savedQuoteNumber} saved for {clientName}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              Add any supporting documents below, then head to Quotes when done.
            </p>
          </div>
          <button onClick={() => router.push('/quotes')}
            className="flex-shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors">
            Done → Quotes
          </button>
        </div>

        {/* Attachments */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Attachments</h3>
            <span className="text-xs text-slate-400 ml-1">— optional supporting documents for this quote</span>
          </div>

          <div className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <strong>Client visible</strong> — shown on the quote approval page
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
              <strong>Internal only</strong> — visible to you, never sent to the client
            </div>
          </div>

          <QuoteAttachments quoteId={savedQuoteId} orgId={orgId} />
        </div>
      </div>
    )
  }

  // ── BUILDER ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/quotes')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quote Builder</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMargin(m => !m)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${showMargin ? 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {showMargin ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showMargin ? 'Margin visible' : 'Show margin'}
          </button>
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save as Draft
          </button>
          <button onClick={() => handleSave('sent')} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save & Mark Sent
          </button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{err}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">

        {/* ── LEFT: Builder ── */}
        <div className="space-y-4">

          {/* Client details */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" /> Client Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</label>
                <select value={customerId} onChange={e => handleCustomerSelect(e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="">Select existing or type below</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Name *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Company name" className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Name</label>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Primary contact" className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact Email</label>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@company.com" className={`mt-1 ${inp}`} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quote Title (optional)</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Advanced Managed Services Proposal" className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valid Until</label>
                <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message to Client</label>
                <input value={msgToClient} onChange={e => setMsgToClient(e.target.value)} placeholder="Optional intro message" className={`mt-1 ${inp}`} />
              </div>
            </div>
          </div>

          {/* Plan & counts */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-slate-400" /> Service Plan
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(PLAN_LABELS).map(([key, label]) => {
                const rate = key === 'flex'
                  ? `${fmtCur(settings.flex_hourly)}/hr`
                  : `${fmtCur({ core: settings.core_per_user, advanced: settings.advanced_per_user, elite: settings.elite_per_user }[key])}/user`
                return (
                  <button key={key} onClick={() => setSelectedPlan(key)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${selectedPlan === key ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                    <span>{label}</span>
                    <span className="text-[10px] font-normal opacity-70">{rate}</span>
                  </button>
                )
              })}
            </div>

            {selectedPlan !== 'flex' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Users className="w-3 h-3" /> Covered Users
                  </label>
                  <input type="number" min={1} value={userCount} onChange={e => setUserCount(Math.max(1, parseInt(e.target.value) || 1))} className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> Devices
                  </label>
                  <input type="number" min={0} value={deviceCount} onChange={e => setDeviceCount(Math.max(0, parseInt(e.target.value) || 0))} className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Domains
                  </label>
                  <input type="number" min={1} value={domainCount} onChange={e => setDomainCount(Math.max(1, parseInt(e.target.value) || 1))} className={`mt-1 ${inp}`} />
                </div>
              </div>
            )}

            {selectedPlan !== 'flex' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Complexity Multiplier</label>
                <select value={multiplier} onChange={e => setMultiplier(parseFloat(e.target.value))} className={`mt-1 ${inp}`}>
                  {MULTIPLIERS.map(m => (
                    <option key={m.value} value={m.value}>{m.label} — {m.sub}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Add-ons */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-400" /> Add-On Services
            </h3>
            <div className="space-y-2">
              {[
                { key: 'security', label: 'Endpoint Security (Bitdefender)', rate: settings.addon_security, unit: 'device', qtyField: deviceCount },
                { key: 'dns',      label: 'DNS Filtering',                   rate: settings.addon_dns,      unit: 'device', qtyField: deviceCount },
                { key: 'training', label: 'Security Awareness Training',      rate: settings.addon_training / 12, unit: 'user/mo', qtyField: userCount },
                { key: 'darkweb',  label: 'Dark Web Monitoring',              rate: settings.addon_darkweb,  unit: 'domain', qtyField: domainCount },
                { key: 'backup',   label: 'Managed Backup',                   rate: settings.addon_backup,   unit: 'device', qtyField: deviceCount },
                { key: 'm365',     label: 'M365 License Management',          rate: settings.addon_m365,     unit: 'user',   qtyField: userCount },
              ].map(({ key, label, rate, unit, qtyField }) => (
                <div key={key} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${addons[key].enabled ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="checkbox" checked={addons[key].enabled}
                    onChange={e => setAddons(p => ({ ...p, [key]: { ...p[key], enabled: e.target.checked } }))}
                    className="w-4 h-4 accent-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                    <p className="text-xs text-slate-400">{fmtCur(rate)} / {unit} · {fmtCur(rate * (addons[key].qty || qtyField))}/mo total</p>
                  </div>
                  {addons[key].enabled && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <label className="text-xs text-slate-400">Qty</label>
                      <input type="number" min={1} value={addons[key].qty}
                        onChange={e => setAddons(p => ({ ...p, [key]: { ...p[key], qty: Math.max(1, parseInt(e.target.value) || 1) } }))}
                        className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-sm text-center bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* One-time & custom */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-400" /> One-Time & Custom
            </h3>

            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${includeOnboarding ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="checkbox" checked={includeOnboarding} onChange={e => setIncludeOnboarding(e.target.checked)} className="w-4 h-4 accent-amber-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Onboarding & Setup Fee</p>
                <p className="text-xs text-slate-400">{fmtCur(settings.onboarding_fee_default)} one-time</p>
              </div>
            </div>

            {customItems.map((ci, idx) => (
              <div key={ci.id} className="grid grid-cols-[1fr_70px_80px_90px_32px] gap-2 items-end">
                <div>
                  {idx === 0 && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</label>}
                  <input value={ci.description} onChange={e => updateCustomItem(ci.id, 'description', e.target.value)} placeholder="Custom line item" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</label>}
                  <input type="number" min={1} value={ci.quantity} onChange={e => updateCustomItem(ci.id, 'quantity', parseInt(e.target.value) || 1)} className={`mt-1 ${inp} text-center`} />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</label>}
                  <input type="number" min={0} step="0.01" value={ci.unit_price} onChange={e => updateCustomItem(ci.id, 'unit_price', parseFloat(e.target.value) || 0)} className={`mt-1 ${inp} text-right`} />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Section</label>}
                  <select value={ci.section || 'other'} onChange={e => updateCustomItem(ci.id, 'section', e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="support">Support</option>
                    <option value="security">Security</option>
                    <option value="other">Other</option>
                    <option value="onboarding">Onboarding</option>
                  </select>
                </div>
                <div className={idx === 0 ? 'mt-5' : ''}>
                  <button onClick={() => removeCustomItem(ci.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <button onClick={addCustomItem} className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add custom line item
            </button>
          </div>

          {/* Display mode + notes */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Quote Presentation</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">How the client sees this quote</label>
              <div className="grid grid-cols-3 gap-2">
                {DISPLAY_MODES.map(m => (
                  <button key={m.value} onClick={() => setDisplayMode(m.value)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-sm transition-all ${displayMode === m.value ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}>
                    <m.icon className="w-4 h-4" />
                    <span className="font-semibold">{m.label}</span>
                    <span className="text-[10px] opacity-70">{m.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client-Facing Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Notes visible to the client…" className={`mt-1 ${inp} resize-none`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Internal Notes</label>
                <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={3} placeholder="Private notes — never shown to client…" className={`mt-1 ${inp} resize-none`} />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Live Preview ── */}
        <div className="xl:sticky xl:top-6 self-start space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Live Preview</h3>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Client view</span>
            </div>
            <QuotePreview
              lineItems={lineItems}
              displayMode={displayMode}
              clientName={clientName}
              quoteNumber={null}
              showMargin={showMargin}
            />
          </div>

          {lineItems.length > 0 && (
            <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quote Summary</p>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400 text-sm">Monthly recurring</span>
                <span className="text-2xl font-bold text-white">{fmtCur(recurringTotal)}</span>
              </div>
              {oneTimeTotal > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-400 text-sm">One-time</span>
                  <span className="text-lg font-semibold text-slate-300">{fmtCur(oneTimeTotal)}</span>
                </div>
              )}
              <div className="border-t border-slate-700 pt-2 flex justify-between items-baseline">
                <span className="text-slate-400 text-sm">First month total</span>
                <span className="text-xl font-bold text-amber-400">{fmtCur(grandTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}