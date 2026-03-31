// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Package, Plus, Search, Edit, Trash2, X, Loader2,
  AlertTriangle, CheckCircle2, ExternalLink, Calendar,
  DollarSign, Building2, Key, ChevronDown, RefreshCw,
} from 'lucide-react'

const CATEGORIES = ['software', 'hardware', 'saas', 'subscription', 'support', 'domain', 'ssl', 'other']
const STATUS_CFG = {
  active:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  expiring: { label: 'Expiring', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  expired:  { label: 'Expired',  cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' },
  cancelled:{ label: 'Cancelled',cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

const BLANK = {
  name: '', vendor: '', category: 'software', status: 'active',
  license_key: '', seats: '', cost: '', billing_cycle: 'annual',
  renewal_date: '', purchase_date: '', contact_name: '', contact_email: '',
  contact_phone: '', website: '', notes: '', customer_id: '', customer_name: '',
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(d) {
  if (!d) return null
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

function getStatus(license) {
  if (license.status === 'cancelled') return 'cancelled'
  if (!license.renewal_date) return license.status || 'active'
  const days = daysUntil(license.renewal_date)
  if (days < 0)  return 'expired'
  if (days <= 30) return 'expiring'
  return 'active'
}

export default function VendorLicensesPage() {
  const supabase  = createSupabaseBrowserClient()
  const [licenses,  setLicenses]  = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [orgId,     setOrgId]     = useState(null)
  const [open,      setOpen]      = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState({ ...BLANK })
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [stFilter,  setStFilter]  = useState('all')
  const [activeKey, setActiveKey] = useState(null) // which license key is visible
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: m } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (!m) return
      setOrgId(m.organization_id)
      const [lic, cust] = await Promise.all([
        supabase.from('vendor_licenses').select('*').eq('organization_id', m.organization_id).order('renewal_date', { ascending: true, nullsFirst: false }),
        supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
      ])
      setLicenses(lic.data ?? [])
      setCustomers(cust.data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const filtered = useMemo(() => licenses.filter(l => {
    const computed = getStatus(l)
    if (stFilter  !== 'all' && computed !== stFilter)                                   return false
    if (catFilter !== 'all' && l.category !== catFilter)                                return false
    if (search) {
      const q = search.toLowerCase()
      return (l.name||'').toLowerCase().includes(q) ||
             (l.vendor||'').toLowerCase().includes(q) ||
             (l.customer_name||'').toLowerCase().includes(q) ||
             (l.notes||'').toLowerCase().includes(q)
    }
    return true
  }), [licenses, search, catFilter, stFilter])

  const totals = useMemo(() => {
    const annual = licenses.filter(l => l.cost && l.status !== 'cancelled')
      .reduce((s, l) => {
        const c = Number(l.cost) || 0
        return s + (l.billing_cycle === 'monthly' ? c * 12 : c)
      }, 0)
    return {
      total:    licenses.length,
      active:   licenses.filter(l => getStatus(l) === 'active').length,
      expiring: licenses.filter(l => getStatus(l) === 'expiring').length,
      expired:  licenses.filter(l => getStatus(l) === 'expired').length,
      annual,
    }
  }, [licenses])

  const openNew = () => {
    setEditing(null)
    setForm({ ...BLANK })
    setOpen(true)
  }

  const openEdit = (l) => {
    setEditing(l)
    setForm({
      name:          l.name          || '',
      vendor:        l.vendor        || '',
      category:      l.category      || 'software',
      status:        l.status        || 'active',
      license_key:   l.license_key   || '',
      seats:         l.seats         ?? '',
      cost:          l.cost          ?? '',
      billing_cycle: l.billing_cycle || 'annual',
      renewal_date:  l.renewal_date  || '',
      purchase_date: l.purchase_date || '',
      contact_name:  l.contact_name  || '',
      contact_email: l.contact_email || '',
      contact_phone: l.contact_phone || '',
      website:       l.website       || '',
      notes:         l.notes         || '',
      customer_id:   l.customer_id   || '',
      customer_name: l.customer_name || '',
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim() || !orgId) return
    setSaving(true)
    const cust = customers.find(c => c.id === form.customer_id)
    const payload = {
      ...form,
      organization_id: orgId,
      customer_name: cust?.name || form.customer_name || null,
      seats:  form.seats  ? Number(form.seats)  : null,
      cost:   form.cost   ? Number(form.cost)   : null,
      renewal_date:  form.renewal_date  || null,
      purchase_date: form.purchase_date || null,
      customer_id:   form.customer_id   || null,
    }
    if (editing) {
      await supabase.from('vendor_licenses').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('vendor_licenses').insert(payload)
    }
    const { data } = await supabase.from('vendor_licenses').select('*').eq('organization_id', orgId).order('renewal_date', { ascending: true, nullsFirst: false })
    setLicenses(data ?? [])
    setOpen(false); setSaving(false)
  }

  const remove = async (id) => {
    if (!confirm('Delete this license? This cannot be undone.')) return
    await supabase.from('vendor_licenses').delete().eq('id', id)
    setLicenses(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-violet-500" /> Vendor & Licenses
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Track software licenses, subscriptions, renewals, and vendor contacts.</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Add License
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total',    value: totals.total,    color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-800/50' },
          { label: 'Active',   value: totals.active,   color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Expiring', value: totals.expiring, color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Expired',  value: totals.expired,  color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/30' },
          { label: 'Annual Cost', value: `$${totals.annual.toLocaleString('en-US', { minimumFractionDigits: 0 })}`, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl border border-slate-200 dark:border-slate-700 p-4`}>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, vendor, customer…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={stFilter} onChange={e => setStFilter(e.target.value)} className={sel}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={sel}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
        </select>
      </div>

      {/* License list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Array(5).fill(0).map((_,i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-48" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Key className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">{licenses.length === 0 ? 'No licenses yet' : 'No licenses match your filters'}</p>
            {licenses.length === 0 && (
              <p className="text-slate-400 text-sm mt-1">Add your software licenses, SaaS subscriptions, and vendor contracts to track renewals and costs.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(l => {
              const computed = getStatus(l)
              const cfg = STATUS_CFG[computed] || STATUS_CFG.active
              const days = daysUntil(l.renewal_date)
              const keyVisible = activeKey === l.id
              return (
                <div key={l.id} className="px-5 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      computed === 'expired'  ? 'bg-rose-100 dark:bg-rose-950/40' :
                      computed === 'expiring' ? 'bg-amber-100 dark:bg-amber-950/40' :
                      'bg-violet-100 dark:bg-violet-950/40'
                    }`}>
                      {computed === 'expired'  ? <AlertTriangle className="w-5 h-5 text-rose-600" /> :
                       computed === 'expiring' ? <AlertTriangle className="w-5 h-5 text-amber-600" /> :
                       <Key className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 dark:text-white">{l.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 capitalize">{l.category}</span>
                      </div>
                      {l.vendor && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{l.vendor}</p>}
                      {l.customer_name && <p className="text-xs text-slate-400 mt-0.5">Client: {l.customer_name}</p>}

                      <div className="flex flex-wrap gap-4 mt-2">
                        {l.renewal_date && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className={`w-3.5 h-3.5 ${days !== null && days <= 30 ? 'text-rose-500' : 'text-slate-400'}`} />
                            <span className={`text-xs ${days !== null && days <= 30 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                              Renews {fmtDate(l.renewal_date)}
                              {days !== null && days >= 0 && days <= 60 && ` (${days}d)`}
                              {days !== null && days < 0 && ` (${Math.abs(days)}d ago)`}
                            </span>
                          </div>
                        )}
                        {l.cost && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">${Number(l.cost).toLocaleString()} / {l.billing_cycle || 'year'}</span>
                          </div>
                        )}
                        {l.seats && (
                          <span className="text-xs text-slate-400">{l.seats} seat{l.seats !== 1 ? 's' : ''}</span>
                        )}
                      </div>

                      {/* License key - toggle visibility */}
                      {l.license_key && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-400">License key:</span>
                          <button onClick={() => setActiveKey(keyVisible ? null : l.id)}
                            className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                            {keyVisible ? l.license_key : '••••••••••••'}
                          </button>
                          <span className="text-[10px] text-slate-400">{keyVisible ? 'click to hide' : 'click to reveal'}</span>
                        </div>
                      )}

                      {/* Vendor contact */}
                      {(l.contact_name || l.contact_email) && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          {l.contact_name  && <span>Contact: {l.contact_name}</span>}
                          {l.contact_email && <a href={`mailto:${l.contact_email}`} className="text-blue-500 hover:underline">{l.contact_email}</a>}
                          {l.contact_phone && <span>{l.contact_phone}</span>}
                        </div>
                      )}

                      {l.notes && <p className="text-xs text-slate-400 mt-1.5 italic">{l.notes}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {l.website && (
                        <a href={l.website.startsWith('http') ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => openEdit(l)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
              <h2 className="font-bold text-slate-900 dark:text-white">{editing ? 'Edit License' : 'Add License / Vendor'}</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name *</label>
                  <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Microsoft 365 Business" className={`mt-1 ${inp}`} autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</label>
                  <input value={form.vendor} onChange={e => s('vendor', e.target.value)} placeholder="e.g. Microsoft" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                  <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => s('status', e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seats</label>
                  <input type="number" min={1} value={form.seats} onChange={e => s('seats', e.target.value)} placeholder="e.g. 25" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost ($)</label>
                  <input type="number" min={0} step="0.01" value={form.cost} onChange={e => s('cost', e.target.value)} placeholder="e.g. 299.00" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Cycle</label>
                  <select value={form.billing_cycle} onChange={e => s('billing_cycle', e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-time</option>
                    <option value="multi_year">Multi-year</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Renewal Date</label>
                  <input type="date" value={form.renewal_date} onChange={e => s('renewal_date', e.target.value)} className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Purchase Date</label>
                  <input type="date" value={form.purchase_date} onChange={e => s('purchase_date', e.target.value)} className={`mt-1 ${inp}`} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">License Key</label>
                  <input value={form.license_key} onChange={e => s('license_key', e.target.value)} placeholder="XXXXX-XXXXX-XXXXX" className={`mt-1 ${inp} font-mono`} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer (optional)</label>
                  <select value={form.customer_id} onChange={e => s('customer_id', e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="">Internal / No specific customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Vendor Contact</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={form.contact_name} onChange={e => s('contact_name', e.target.value)} placeholder="Name" className={inp} />
                    <input value={form.contact_email} onChange={e => s('contact_email', e.target.value)} placeholder="Email" className={inp} />
                    <input value={form.contact_phone} onChange={e => s('contact_phone', e.target.value)} placeholder="Phone" className={inp} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Website / Portal URL</label>
                  <input value={form.website} onChange={e => s('website', e.target.value)} placeholder="https://portal.vendor.com" className={`mt-1 ${inp}`} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
                  <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={2} placeholder="Any additional notes…" className={`mt-1 ${inp} resize-none`} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.name.trim() || saving}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add License'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}