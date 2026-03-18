// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Building2, Phone, Mail, DollarSign,
  Clock, Ticket, FileText, Plus, Edit, Trash2, User, Loader2, X
} from 'lucide-react'

const STATUS_CLS = {
  active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-600',
  prospect: 'bg-blue-100 text-blue-700',
}
const TICKET_STATUS_CLS = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-violet-100 text-violet-700',
  waiting:     'bg-amber-100 text-amber-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-slate-100 text-slate-600',
}
const PRIORITY_CLS = {
  critical: 'bg-rose-100 text-rose-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-emerald-100 text-emerald-700',
}
const INVOICE_CLS = {
  draft:   'bg-slate-100 text-slate-600',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-rose-100 text-rose-700',
  void:    'bg-slate-100 text-slate-400',
}

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
const lbl = (s) => s?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
const fmt = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch { return '—' } }

export default function CustomerDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const id       = params.id
  const supabase = createSupabaseBrowserClient()

  const [customer,     setCustomer]     = useState(null)
  const [tickets,      setTickets]      = useState([])
  const [timeEntries,  setTimeEntries]  = useState([])
  const [invoices,     setInvoices]     = useState([])
  const [contacts,     setContacts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('tickets')
  const [editOpen,     setEditOpen]     = useState(false)
  const [contactOpen,  setContactOpen]  = useState(false)
  const [editContact,  setEditContact]  = useState(null)
  const [orgId,        setOrgId]        = useState(null)

  // Edit customer form
  const [form, setForm] = useState({})
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  // Contact form
  const [cForm, setCForm] = useState({ name:'', email:'', phone:'', role:'contact', notes:'' })
  const sc = (k, v) => setCForm(p => ({ ...p, [k]: v }))
  const [cSaving, setCSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
        if (member) setOrgId(member.organization_id)
      }
      loadAll()
    }
    init()
  }, [id])

  const loadAll = async () => {
    setLoading(true)
    const [cust, tick, time, inv, cont] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.from('tickets').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('time_entries').select('*').eq('customer_id', id).order('date', { ascending: false }),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('customer_contacts').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    setCustomer(cust.data)
    setTickets(tick.data ?? [])
    setTimeEntries(time.data ?? [])
    setInvoices(inv.data ?? [])
    setContacts(cont.data ?? [])
    setLoading(false)
  }

  const openEdit = () => {
    if (!customer) return
    setForm({
      name:             customer.name             ?? '',
      status:           customer.status           ?? 'active',
      contract_type:    customer.contract_type    ?? '',
      industry:         customer.industry         ?? '',
      contact_name:     customer.contact_name     ?? '',
      contact_email:    customer.contact_email    ?? '',
      contact_phone:    customer.contact_phone    ?? '',
      monthly_rate:     customer.monthly_rate     ?? '',
      hourly_rate:      customer.hourly_rate      ?? '',
      after_hours_rate: customer.after_hours_rate ?? '',
      notes:            customer.notes            ?? '',
    })
    setEditOpen(true)
  }

  const saveCustomer = async (e) => {
    e.preventDefault()
    setSaving(true); setErr(null)
    const { error } = await supabase.from('customers').update({
      name:             form.name,
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
    }).eq('id', id)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); setEditOpen(false); loadAll()
  }

  const deleteCustomer = async () => {
    if (!confirm(`Delete ${customer.name}? This cannot be undone.`)) return
    await supabase.from('customers').delete().eq('id', id)
    router.push('/customers')
  }

  const openContactDialog = (contact = null) => {
    setEditContact(contact)
    setCForm(contact
      ? { name: contact.name||'', email: contact.email||'', phone: contact.phone||'', role: contact.role||'contact', notes: contact.notes||'' }
      : { name:'', email:'', phone:'', role:'contact', notes:'' }
    )
    setContactOpen(true)
  }

  const saveContact = async () => {
    if (!cForm.name.trim()) return
    setCSaving(true)
    if (editContact) {
      await supabase.from('customer_contacts').update(cForm).eq('id', editContact.id)
    } else {
      await supabase.from('customer_contacts').insert({ ...cForm, customer_id: id, organization_id: orgId })
    }
    setCSaving(false); setContactOpen(false); loadAll()
  }

  const deleteContact = async (contactId) => {
    if (!confirm('Remove this contact?')) return
    await supabase.from('customer_contacts').delete().eq('id', contactId)
    loadAll()
  }

  if (loading) return (
    <div className="max-w-5xl space-y-4 animate-pulse">
      <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-4 gap-3">{Array(4).fill(0).map((_,i) => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl" />)}</div>
    </div>
  )

  if (!customer) return (
    <div className="text-center py-20 text-slate-400">
      <p className="text-lg font-medium mb-2">Organization not found</p>
      <button onClick={() => router.push('/customers')} className="text-amber-500 hover:underline text-sm">← Back to Organizations</button>
    </div>
  )

  const openTickets     = tickets.filter(t => !['resolved','closed'].includes(t.status)).length
  const totalMinutes    = timeEntries.reduce((s, e) => s + (e.minutes || 0), 0)
  const outstanding     = invoices.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0)
  const totalBilled     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
  const CONTRACT_LABELS = { managed:'Managed', time_and_materials:'T&M', block_hours:'Block Hours', project:'Project' }

  const TabBtn = ({ id: tabId, label }) => (
    <button onClick={() => setActiveTab(tabId)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === tabId ? 'bg-amber-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
      {label}
    </button>
  )

  return (
    <div className="max-w-5xl space-y-4">
      {/* Back */}
      <button onClick={() => router.push('/customers')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Organizations
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_CLS[customer.status] ?? ''}`}>{customer.status}</span>
              {customer.contract_type && <span className="text-sm text-slate-500">{CONTRACT_LABELS[customer.contract_type] || customer.contract_type}</span>}
            </div>
          </div>
        </div>
        <button onClick={openEdit}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <Edit className="w-4 h-4" /> Edit
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Open Tickets',    value: openTickets,                                         icon: Ticket,    color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Time Logged',     value: `${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`, icon: Clock,     color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Outstanding',     value: `$${outstanding.toFixed(2)}`,                         icon: DollarSign,color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Total Collected', value: `$${totalBilled.toFixed(2)}`,                         icon: FileText,  color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Primary Contact</p>
          {customer.contact_name && <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><User className="w-4 h-4 text-slate-400" />{customer.contact_name}</div>}
          {customer.contact_email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-slate-400" /><a href={`mailto:${customer.contact_email}`} className="text-blue-600 hover:underline truncate">{customer.contact_email}</a></div>}
          {customer.contact_phone && <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><Phone className="w-4 h-4 text-slate-400" />{customer.contact_phone}</div>}
          {!customer.contact_name && !customer.contact_email && !customer.contact_phone && <p className="text-sm text-slate-400">No contact info set.</p>}
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Contract & Billing</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><p className="text-slate-400 text-xs">Contract</p><p className="font-medium text-slate-900 dark:text-white">{CONTRACT_LABELS[customer.contract_type] || '—'}</p></div>
            <div><p className="text-slate-400 text-xs">Monthly</p><p className="font-medium text-slate-900 dark:text-white">{customer.monthly_rate ? `$${customer.monthly_rate.toLocaleString()}/mo` : '—'}</p></div>
            <div><p className="text-slate-400 text-xs">Hourly</p><p className="font-medium text-slate-900 dark:text-white">{customer.hourly_rate ? `$${customer.hourly_rate}/hr` : '—'}</p></div>
            {customer.after_hours_rate && <div><p className="text-slate-400 text-xs">After Hours</p><p className="font-medium text-slate-900 dark:text-white">${customer.after_hours_rate}/hr</p></div>}
            <div><p className="text-slate-400 text-xs">Industry</p><p className="font-medium text-slate-900 dark:text-white">{customer.industry || '—'}</p></div>
          </div>
        </div>
        {customer.notes && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Notes</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">{customer.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <TabBtn id="tickets"  label={`Tickets (${tickets.length})`} />
        <TabBtn id="time"     label={`Time (${timeEntries.length})`} />
        <TabBtn id="invoices" label={`Invoices (${invoices.length})`} />
        <TabBtn id="contacts" label={`Contacts (${contacts.length})`} />
      </div>

      {/* Tickets tab */}
      {activeTab === 'tickets' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Tickets</h3>
            <button onClick={() => router.push(`/tickets?customer=${customer.name}`)}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tickets.length === 0 ? (
              <p className="px-4 py-10 text-center text-slate-400 text-sm">No tickets for this organization.</p>
            ) : tickets.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                onClick={() => router.push(`/tickets/${t.id}`)}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 capitalize">{t.category} · {t.assigned_to || 'Unassigned'}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_CLS[t.priority] ?? ''}`}>{t.priority}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TICKET_STATUS_CLS[t.status] ?? ''}`}>{lbl(t.status)}</span>
                <span className="text-xs text-slate-400 hidden sm:block whitespace-nowrap">{fmt(t.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time tab */}
      {activeTab === 'time' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Time Entries</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {timeEntries.length === 0 ? (
              <p className="px-4 py-10 text-center text-slate-400 text-sm">No time entries recorded.</p>
            ) : timeEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{e.description || e.ticket_title || 'Time entry'}</p>
                  <p className="text-xs text-slate-400">{e.technician ? `${e.technician} · ` : ''}{e.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{Math.floor(e.minutes/60)}h {e.minutes%60}m</p>
                  <p className="text-xs text-slate-400">{e.billable ? `$${((e.minutes/60)*(e.hourly_rate||0)).toFixed(2)}` : 'Non-billable'}</p>
                </div>
                {e.invoice_id && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Invoiced</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices tab */}
      {activeTab === 'invoices' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Invoices</h3>
            <button onClick={() => router.push('/invoices')}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoices.length === 0 ? (
              <p className="px-4 py-10 text-center text-slate-400 text-sm">No invoices for this organization.</p>
            ) : invoices.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-400">Issued {fmt(inv.issue_date)} · Due {fmt(inv.due_date)}</p>
                </div>
                <p className="font-bold text-slate-900 dark:text-white">${(inv.total||0).toFixed(2)}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${INVOICE_CLS[inv.status] ?? ''}`}>{inv.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts tab */}
      {activeTab === 'contacts' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Contacts</h3>
            <button onClick={() => openContactDialog()}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
              <Plus className="w-3.5 h-3.5" /> Add Contact
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {contacts.length === 0 ? (
              <p className="px-4 py-10 text-center text-slate-400 text-sm">No contacts yet. Add team members for this client.</p>
            ) : contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{c.name}</p>
                  <p className="text-xs text-slate-400">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 capitalize hidden sm:inline">{c.role?.replace('_',' ')}</span>
                <button onClick={() => openContactDialog(c)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Customer Dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">Edit Organization</h2>
              <button onClick={() => setEditOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={saveCustomer} className="p-5 space-y-4">
              {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Name *</label>
                <input value={form.name} onChange={e => sf('name',e.target.value)} required className={`mt-1 ${inp}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => sf('status',e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract</label>
                  <select value={form.contract_type} onChange={e => sf('contract_type',e.target.value)} className={`mt-1 ${inp}`}>
                    <option value="managed">Managed</option>
                    <option value="time_and_materials">T&M</option>
                    <option value="block_hours">Block Hours</option>
                    <option value="project">Project</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</label>
                <input value={form.industry} onChange={e => sf('industry',e.target.value)} className={`mt-1 ${inp}`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Rate</label>
                  <input type="number" value={form.monthly_rate} onChange={e => sf('monthly_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hourly Rate</label>
                  <input type="number" value={form.hourly_rate} onChange={e => sf('hourly_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">After Hours</label>
                  <input type="number" value={form.after_hours_rate} onChange={e => sf('after_hours_rate',e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Primary Contact</p>
                <input value={form.contact_name}  onChange={e => sf('contact_name',e.target.value)}  placeholder="Contact name"       className={inp} />
                <input value={form.contact_email} onChange={e => sf('contact_email',e.target.value)} placeholder="contact@company.com" type="email" className={inp} />
                <input value={form.contact_phone} onChange={e => sf('contact_phone',e.target.value)} placeholder="Phone number"        className={inp} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => sf('notes',e.target.value)} rows={3} className={`mt-1 ${inp} resize-none`} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={deleteCustomer} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">Delete</button>
                <button type="button" onClick={() => setEditOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Dialog */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">{editContact ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={() => setContactOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name *</label>
                <input value={cForm.name} onChange={e => sc('name',e.target.value)} placeholder="Jane Smith" className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</label>
                <input type="email" value={cForm.email} onChange={e => sc('email',e.target.value)} className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</label>
                <input value={cForm.phone} onChange={e => sc('phone',e.target.value)} className={`mt-1 ${inp}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</label>
                <select value={cForm.role} onChange={e => sc('role',e.target.value)} className={`mt-1 ${inp}`}>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="billing">Billing</option>
                  <option value="technical">Technical</option>
                  <option value="contact">General Contact</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
                <textarea value={cForm.notes} onChange={e => sc('notes',e.target.value)} rows={2} className={`mt-1 ${inp} resize-none`} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setContactOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button onClick={saveContact} disabled={!cForm.name.trim() || cSaving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
                  {cSaving ? 'Saving…' : 'Save Contact'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}