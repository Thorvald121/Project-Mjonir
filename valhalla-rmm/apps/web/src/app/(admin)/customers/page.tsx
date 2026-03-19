// @ts-nocheck
'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Search, LayoutGrid, List, Building2, Phone, Mail, Edit, X } from 'lucide-react'

function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) ref.current()
    }
    window.addEventListener("supabase:change", h)
    return () => window.removeEventListener("supabase:change", h)
  }, [tables.join(",")]) // eslint-disable-line
}

const STATUS_CLS = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  prospect: 'bg-blue-100 text-blue-700',
}
const CONTRACT_LABELS = {
  managed:            'Managed',
  time_and_materials: 'T&M',
  block_hours:        'Block Hours',
  project:            'Project',
}
const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

function CustomerDialog({ open, onClose, onSaved, customer, orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const [form,   setForm]   = useState({
    name:'', status:'active', contract_type:'managed', industry:'',
    contact_name:'', contact_email:'', contact_phone:'',
    monthly_rate:'', hourly_rate:'', after_hours_rate:'', notes:'',
  })
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (customer) {
      setForm({
        name:             customer.name             ?? '',
        status:           customer.status           ?? 'active',
        contract_type:    customer.contract_type    ?? 'managed',
        industry:         customer.industry         ?? '',
        contact_name:     customer.contact_name     ?? '',
        contact_email:    customer.contact_email    ?? '',
        contact_phone:    customer.contact_phone    ?? '',
        monthly_rate:     customer.monthly_rate     ?? '',
        hourly_rate:      customer.hourly_rate      ?? '',
        after_hours_rate: customer.after_hours_rate ?? '',
        notes:            customer.notes            ?? '',
      })
    } else {
      setForm({ name:'',status:'active',contract_type:'managed',industry:'',contact_name:'',contact_email:'',contact_phone:'',monthly_rate:'',hourly_rate:'',after_hours_rate:'',notes:'' })
    }
  }, [customer, open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!orgId) { setErr('Organization not found — please refresh'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id:  orgId,
      name:             form.name.trim(),
      status:           form.status,
      contract_type:    form.contract_type    || null,
      industry:         form.industry         || null,
      contact_name:     form.contact_name     || null,
      contact_email:    form.contact_email    || null,
      contact_phone:    form.contact_phone    || null,
      monthly_rate:     form.monthly_rate     ? parseFloat(form.monthly_rate)     : null,
      hourly_rate:      form.hourly_rate      ? parseFloat(form.hourly_rate)      : null,
      after_hours_rate: form.after_hours_rate ? parseFloat(form.after_hours_rate) : null,
      notes:            form.notes            || null,
    }
    const { error } = customer
      ? await supabase.from('customers').update(payload).eq('id', customer.id)
      : await supabase.from('customers').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const handleDelete = async () => {
    if (!confirm(`Delete ${customer.name}? This cannot be undone.`)) return
    await supabase.from('customers').delete().eq('id', customer.id)
    onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{customer ? 'Edit Organization' : 'New Organization'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Name *</label>
            <input value={form.name} onChange={e => s('name',e.target.value)} required placeholder="Acme Corp" className={`mt-1 ${inp}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <select value={form.status} onChange={e => s('status',e.target.value)} className={`mt-1 ${inp}`}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="prospect">Prospect</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract Type</label>
              <select value={form.contract_type} onChange={e => s('contract_type',e.target.value)} className={`mt-1 ${inp}`}>
                <option value="managed">Managed</option>
                <option value="time_and_materials">Time & Materials</option>
                <option value="block_hours">Block Hours</option>
                <option value="project">Project</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</label>
            <input value={form.industry} onChange={e => s('industry',e.target.value)} placeholder="e.g. Healthcare, Finance" className={`mt-1 ${inp}`} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Rate</label>
              <input type="number" value={form.monthly_rate} onChange={e => s('monthly_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hourly Rate</label>
              <input type="number" value={form.hourly_rate} onChange={e => s('hourly_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">After Hours</label>
              <input type="number" value={form.after_hours_rate} onChange={e => s('after_hours_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Primary Contact</p>
            <div className="space-y-3">
              <input value={form.contact_name}  onChange={e => s('contact_name',e.target.value)}  placeholder="Contact name"       className={inp} />
              <input type="email" value={form.contact_email} onChange={e => s('contact_email',e.target.value)} placeholder="contact@company.com" className={inp} />
              <input value={form.contact_phone} onChange={e => s('contact_phone',e.target.value)} placeholder="Phone number"        className={inp} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => s('notes',e.target.value)} rows={3} placeholder="Internal notes..." className={`mt-1 ${inp} resize-none`} />
          </div>
          <div className="flex gap-2 pt-2">
            {customer && (
              <button type="button" onClick={handleDelete} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">Delete</button>
            )}
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : customer ? 'Save Changes' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [customers,      setCustomers]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [contractFilter, setContractFilter] = useState('all')
  const [view,           setView]           = useState('table')
  const [dialogOpen,     setDialogOpen]     = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [orgId,          setOrgId]          = useState(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadCustomers()
    }
    init()
  }, [])

  useRealtimeRefresh(['customers'], loadCustomers)

  const loadCustomers = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name').limit(200)
    setCustomers(data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => customers.filter(c => {
    const q = search.toLowerCase()
    if (q && !c.name?.toLowerCase().includes(q) && !c.contact_name?.toLowerCase().includes(q)) return false
    if (statusFilter   !== 'all' && c.status        !== statusFilter)   return false
    if (contractFilter !== 'all' && c.contract_type !== contractFilter) return false
    return true
  }), [customers, search, statusFilter, contractFilter])

  const totalMRR    = customers.filter(c => c.status === 'active').reduce((s, c) => s + (c.monthly_rate || 0), 0)
  const activeCount = customers.filter(c => c.status === 'active').length
  const prospects   = customers.filter(c => c.status === 'prospect').length
  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Organizations', value: customers.length },
          { label: 'Active',              value: activeCount },
          { label: 'Monthly MRR',         value: `$${totalMRR.toLocaleString()}` },
          { label: 'Prospects',           value: prospects },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={sel}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="prospect">Prospect</option>
          </select>
          <select value={contractFilter} onChange={e => setContractFilter(e.target.value)} className={sel}>
            <option value="all">All Contracts</option>
            <option value="managed">Managed</option>
            <option value="time_and_materials">T&M</option>
            <option value="block_hours">Block Hours</option>
            <option value="project">Project</option>
          </select>
          <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button onClick={() => setView('table')} className={`px-3 py-2 transition-colors ${view === 'table' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setView('grid')} className={`px-3 py-2 transition-colors ${view === 'grid' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> Add Organization
        </button>
      </div>

      {view === 'table' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  {['Company','Contact','Contract','Monthly Rate','Hourly Rate','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No organizations found</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/customers/${c.id}`)}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{c.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{CONTRACT_LABELS[c.contract_type] || c.contract_type || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.monthly_rate ? `$${c.monthly_rate.toLocaleString()}/mo` : '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.hourly_rate ? `$${c.hourly_rate}/hr` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CLS[c.status] ?? ''}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setEditing(c); setDialogOpen(true) }}
                        className="px-3 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} onClick={() => router.push(`/customers/${c.id}`)}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 cursor-pointer hover:shadow-md transition-shadow space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                    <p className="text-xs text-slate-400">{CONTRACT_LABELS[c.contract_type] || '—'}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_CLS[c.status] ?? ''}`}>{c.status}</span>
              </div>
              {c.contact_name && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Mail className="w-3.5 h-3.5" />{c.contact_name}</div>}
              {c.contact_phone && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Phone className="w-3.5 h-3.5" />{c.contact_phone}</div>}
              <div className="flex gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-400">Monthly</p>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{c.monthly_rate ? `$${c.monthly_rate.toLocaleString()}` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Hourly</p>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{c.hourly_rate ? `$${c.hourly_rate}/hr` : '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CustomerDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadCustomers() }}
        customer={editing}
        orgId={orgId}
      />
    </div>
  )
}