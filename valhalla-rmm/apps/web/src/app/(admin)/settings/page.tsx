// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Loader2, Save, Shield, User, Clock,
  Building2, Zap, ChevronRight, CheckCircle2,
  AlertCircle, Settings2, Mail, Users,
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

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const NAV = [
  { id: 'org',          label: 'Organization', icon: Building2 },
  { id: 'sla',          label: 'SLA & Alerts',  icon: Clock },
  { id: 'integrations', label: 'Integrations',  icon: Zap },
  { id: 'team',         label: 'Team Members',  icon: Users },
  { id: 'account',      label: 'My Account',    icon: User },
]

function Section({ title, description, children }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-5">{children}</div>
    </div>
  )
}

function FieldRow({ label, hint, children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 items-start">
      <div className="md:pt-2">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  )
}

function OrgSection({ org, onSaved }) {
  const supabase = createSupabaseBrowserClient()
  const [form,   setForm]   = useState({ name: '', company_email: '', app_url: '', ai_provider: 'claude', logo_url: '', brand_color: '#f59e0b' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (org) setForm({
      name:          org.name          || '',
      company_email: org.company_email || '',
      app_url:       org.app_url       || (typeof window !== 'undefined' ? window.location.origin : ''),
      ai_provider:   org.ai_provider   || 'claude',
      logo_url:      org.logo_url      || '',
      brand_color:   org.brand_color   || '#f59e0b',
    })
  }, [org])

  const save = async () => {
    setSaving(true)
    await supabase.from('organizations').update(form).eq('id', org.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  return (
    <Section title="Organization" description="Core company info used across the platform.">
      <FieldRow label="Company Name">
        <input value={form.name} onChange={e => sf('name', e.target.value)} className={inp} />
      </FieldRow>
      <FieldRow label="Support Email" hint="Used for notifications and admin alerts.">
        <input type="email" value={form.company_email} onChange={e => sf('company_email', e.target.value)} placeholder="support@yourcompany.com" className={inp} />
      </FieldRow>
      <FieldRow label="App URL" hint="Public URL — used in CSAT links and email footers.">
        <input value={form.app_url} onChange={e => sf('app_url', e.target.value)} placeholder="https://valhalla-rmm.com" className={inp} />
      </FieldRow>
      <FieldRow label="Client Portal URL" hint="Share with clients.">
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 truncate text-slate-600 dark:text-slate-400">
            {form.app_url || 'https://your-app.vercel.app'}/portal
          </code>
          <button onClick={() => navigator.clipboard.writeText(`${form.app_url}/portal`)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            Copy
          </button>
        </div>
      </FieldRow>
      <FieldRow label="AI Triage Provider" hint="Which AI model to use for ticket triage.">
        <select value={form.ai_provider} onChange={e => sf('ai_provider', e.target.value)} className={inp}>
          <option value="claude">Claude (Haiku) — Anthropic</option>
          <option value="openai">GPT-4o Mini — OpenAI</option>
        </select>
      </FieldRow>
      <FieldRow label="Portal Logo URL" hint="Public image URL shown in the client portal header. Recommended: 64×64px PNG or SVG.">
        <div className="space-y-2">
          <input value={form.logo_url} onChange={e => sf('logo_url', e.target.value)} placeholder="https://..." className={inp} />
          {form.logo_url && (
            <div className="flex items-center gap-2">
              <img src={form.logo_url} alt="Logo preview" className="w-8 h-8 rounded object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <span className="text-xs text-slate-400">Preview</span>
            </div>
          )}
        </div>
      </FieldRow>
      <FieldRow label="Portal Brand Color" hint="Accent color used in the client portal for buttons and highlights.">
        <div className="flex items-center gap-3">
          <input type="color" value={form.brand_color} onChange={e => sf('brand_color', e.target.value)}
            className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer bg-white p-0.5" />
          <input value={form.brand_color} onChange={e => sf('brand_color', e.target.value)} placeholder="#f59e0b" className={`w-28 ${inp}`} />
          <span className="text-xs text-slate-400">Default: amber #f59e0b</span>
        </div>
      </FieldRow>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </Section>
  )
}

function SlaSection({ org, onSaved }) {
  const supabase = createSupabaseBrowserClient()
  const [sla,         setSla]         = useState({ critical: 1, high: 4, medium: 24, low: 72 })
  const [notif,       setNotif]       = useState({ ticket_assigned_email: true, sla_breach_email: true, customer_reply_push: true })
  const [savingSla,   setSavingSla]   = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)
  const [savedSla,    setSavedSla]    = useState(false)
  const [savedNotif,  setSavedNotif]  = useState(false)

  useEffect(() => {
    if (org?.sla_config) { try { setSla(typeof org.sla_config === 'string' ? JSON.parse(org.sla_config) : org.sla_config) } catch {} }
    if (org?.notification_config) { try { setNotif(typeof org.notification_config === 'string' ? JSON.parse(org.notification_config) : org.notification_config) } catch {} }
  }, [org])

  const saveSla = async () => {
    setSavingSla(true)
    await supabase.from('organizations').update({ sla_config: sla }).eq('id', org.id)
    setSavingSla(false); setSavedSla(true)
    setTimeout(() => setSavedSla(false), 2000); onSaved()
  }

  const saveNotif = async () => {
    setSavingNotif(true)
    await supabase.from('organizations').update({ notification_config: notif }).eq('id', org.id)
    setSavingNotif(false); setSavedNotif(true)
    setTimeout(() => setSavedNotif(false), 2000); onSaved()
  }

  const PCLS = { critical: 'text-rose-500', high: 'text-orange-500', medium: 'text-amber-500', low: 'text-emerald-500' }
  return (
    <Section title="SLA & Alerts" description="Response time targets and notification preferences.">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">SLA Response Targets (hours)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['critical','high','medium','low'].map(p => (
            <div key={p} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${PCLS[p]}`}>{p}</p>
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} value={sla[p] || ''} onChange={e => setSla(s => ({ ...s, [p]: Number(e.target.value) }))}
                  className="w-16 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <span className="text-xs text-slate-400">hrs</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={saveSla} disabled={savingSla}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {savingSla ? <Loader2 className="w-4 h-4 animate-spin" /> : savedSla ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedSla ? 'Saved!' : 'Save SLA'}
          </button>
        </div>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
        <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">Notification Preferences</p>
        <div className="space-y-3">
          {[
            { key: 'ticket_assigned_email', label: 'Ticket assigned to me',  hint: 'Email when a ticket is assigned to you' },
            { key: 'sla_breach_email',      label: 'SLA breach / at risk',   hint: 'Email when a ticket is near or past SLA' },
            { key: 'customer_reply_push',   label: 'Customer reply',         hint: 'Push notification when a client replies' },
          ].map(({ key, label, hint }) => (
            <div key={key} className="flex items-start justify-between gap-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
              </div>
              <button onClick={() => setNotif(n => ({ ...n, [key]: !n[key] }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${notif[key] ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${notif[key] ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={saveNotif} disabled={savingNotif}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {savingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : savedNotif ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedNotif ? 'Saved!' : 'Save Notifications'}
          </button>
        </div>
      </div>
    </Section>
  )
}

function IntegrationsSection({ org }) {
  const items = [
    { name: 'Gmail', icon: Mail, description: 'Inbound email → automatic ticket creation.', hint: 'The Gmail account must match your Support Email in Organization settings.', status: org?.company_email ? 'configured' : 'not_configured', statusLabel: org?.company_email ? `Configured (${org.company_email})` : 'No email configured' },
    { name: 'Stripe', icon: Zap, description: 'Invoice payment links and MSP subscription billing.', hint: 'Add STRIPE_SECRET_KEY in Supabase Dashboard → Settings → Edge Function Secrets.', status: 'manual', statusLabel: 'Via Supabase secrets' },
    { name: 'Resend', icon: Mail, description: 'Transactional email delivery for invoices and notifications.', hint: 'RESEND_API_KEY is configured in Supabase Edge Function Secrets.', status: 'configured', statusLabel: 'Configured via secrets' },
    { name: 'Anthropic AI', icon: Zap, description: 'AI-powered ticket triage — auto-assigns priority and category.', hint: 'ANTHROPIC_API_KEY is configured in Supabase Edge Function Secrets.', status: 'configured', statusLabel: 'Configured via secrets' },
  ]
  const SCLS = { configured: 'bg-emerald-100 text-emerald-700', not_configured: 'bg-amber-100 text-amber-700', manual: 'bg-blue-100 text-blue-700' }
  return (
    <Section title="Integrations" description="External services connected to Valhalla RMM.">
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.name} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${SCLS[item.status]}`}>
                  {item.status === 'configured'     && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {item.status === 'not_configured' && <AlertCircle  className="w-2.5 h-2.5" />}
                  {item.status === 'manual'         && <Settings2    className="w-2.5 h-2.5" />}
                  {item.statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500">{item.description}</p>
              <p className="text-xs text-slate-400 mt-1 italic">{item.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function TeamSection({ orgId }) {
  const supabase = createSupabaseBrowserClient()
  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [invEmail,    setInvEmail]    = useState('')
  const [invRole,     setInvRole]     = useState('technician')
  const [invCustomer, setInvCustomer] = useState('')
  const [customers,   setCustomers]   = useState([])
  const [contactLinks,setContactLinks]= useState({}) // email → [customer_id]
  const [inviting,    setInviting]    = useState(false)
  const [err,      setErr]      = useState(null)
  const [success,  setSuccess]  = useState(null)

  useEffect(() => { if (orgId) { loadMembers(); loadCustomers() } }, [orgId])

  const loadMembers = async () => {
    setLoading(true)
    const { data } = await supabase.from('organization_members').select('id,user_email,role,display_name').eq('organization_id', orgId).order('created_at')
    setMembers(data ?? [])
    setLoading(false)
  }

  const loadCustomers = async () => {
    const [custRes, contactRes] = await Promise.all([
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
      supabase.from('customer_contacts').select('id,customer_id,email,name').not('email', 'is', null),
    ])
    setCustomers(custRes.data ?? [])
    // Build a map of email → [customer_id, ...] from customer_contacts
    const linkMap = {}
    for (const c of (contactRes.data ?? [])) {
      if (!c.email) continue
      if (!linkMap[c.email]) linkMap[c.email] = []
      linkMap[c.email].push(c.customer_id)
    }
    setContactLinks(linkMap)
  }

  useRealtimeRefresh(['organization_members'], loadMembers)


  const inviteMember = async () => {
    if (!invEmail.trim()) return
    setInviting(true); setErr(null); setSuccess(null)
    try {
      const redirectTo = invRole === 'client'
        ? `${window.location.origin}/portal`
        : `${window.location.origin}/invite`
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: invEmail.trim(), role: invRole, organization_id: orgId, redirect_to: redirectTo }
      })
      if (error) { setErr(error.message); return }
      if (data?.error) { setErr(data.error); return }

      // If inviting a client and a customer is selected, add to customer_contacts
      if (invRole === 'client' && invCustomer) {
        const cust = customers.find(c => c.id === invCustomer)
        await supabase.from('customer_contacts').upsert({
          organization_id: orgId,
          customer_id:     invCustomer,
          email:           invEmail.trim(),
          name:            invEmail.trim().split('@')[0],
          role:            'contact',
        }, { onConflict: 'customer_id,email', ignoreDuplicates: true })
      }

      setSuccess(`Invite sent to ${invEmail.trim()}`)
      setInvEmail(''); setInvCustomer('')
      loadMembers()
    } catch (e) { setErr(e.message) }
    finally { setInviting(false) }
  }

  const updateRole = async (memberId, role) => {
    await supabase.from('organization_members').update({ role }).eq('id', memberId)
    loadMembers()
  }

  const removeMember = async (memberId) => {
    if (!confirm('Remove this team member?')) return
    await supabase.from('organization_members').delete().eq('id', memberId)
    loadMembers()
  }

  const ROLE_CLS = { owner: 'bg-amber-100 text-amber-700', admin: 'bg-violet-100 text-violet-700', technician: 'bg-blue-100 text-blue-700', client: 'bg-slate-100 text-slate-600' }

  return (
    <Section title="Team Members" description="Manage who has access to your Valhalla RMM account.">
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
        <p className="text-sm font-medium text-slate-900 dark:text-white">Invite Team Member or Client</p>
        <p className="text-xs text-slate-400">They will receive an email with a link to set their password. <strong>Clients</strong> will be directed to the client portal at <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/portal</code> — they must use a separate browser or incognito window to log in there.</p>
        <div className="flex gap-2 flex-wrap">
          <input value={invEmail} onChange={e => setInvEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && inviteMember()}
            placeholder="email@company.com" type="email"
            className="flex-1 min-w-48 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <select value={invRole} onChange={e => setInvRole(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="technician">Technician</option>
            <option value="admin">Admin</option>
            <option value="client">Client</option>
          </select>
          <button onClick={inviteMember} disabled={!invEmail.trim() || inviting}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Invite'}
          </button>
        </div>
        {invRole === 'client' && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Link to Customer (optional)</label>
            <select value={invCustomer} onChange={e => setInvCustomer(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— No customer linked</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.contact_email ? ` (${c.contact_email})` : ''}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">Sets this email as the contact email on the selected customer so their portal shows linked tickets, invoices and devices.</p>
          </div>
        )}
        {err     && <p className="text-xs text-rose-600">{err}</p>}
        {success && <p className="text-xs text-emerald-600">✓ {success}</p>}
      </div>
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No team members yet</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map(member => (
              <div key={member.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600 font-semibold text-xs">{(member.display_name || member.user_email)?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      defaultValue={member.display_name || ''}
                      onBlur={async (e) => {
                        const val = e.target.value.trim()
                        if (val !== (member.display_name || '')) {
                          await supabase.from('organization_members').update({ display_name: val || null }).eq('id', member.id)
                          loadMembers()
                        }
                      }}
                      placeholder={member.user_email}
                      className="w-full text-sm font-medium text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-amber-400 focus:outline-none pb-0.5 transition-colors"
                    />
                    <p className="text-xs text-slate-400 truncate">{member.user_email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select value={member.role} onChange={e => updateRole(member.id, e.target.value)}
                      className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none">
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="technician">Technician</option>
                      <option value="client">Client</option>
                    </select>
                    <button
                      title="Send password reset email"
                      onClick={async () => {
                        if (!confirm(`Send password reset email to ${member.user_email}?`)) return
                        const { error } = await supabase.auth.resetPasswordForEmail(member.user_email, {
                          redirectTo: member.role === 'client'
                            ? `${window.location.origin}/portal`
                            : `${window.location.origin}/invite`,
                        })
                        if (error) alert('Error: ' + error.message)
                        else alert(`Password reset email sent to ${member.user_email}`)
                      }}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors text-xs"
                    >✉</button>
                    {member.role !== 'owner' && (
                      <button onClick={() => removeMember(member.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors text-xs">✕</button>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 pl-11">
                  <span className="text-xs text-slate-400 flex-shrink-0 pt-1.5">Customers:</span>
                  <div className="flex-1 space-y-1">
                    {/* Currently linked customers */}
                    {(contactLinks[member.user_email] || []).map(custId => {
                      const cust = customers.find(c => c.id === custId)
                      if (!cust) return null
                      return (
                        <div key={custId} className="flex items-center gap-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">{cust.name}</span>
                          <button
                            onClick={async () => {
                              await supabase.from('customer_contacts').delete().eq('customer_id', custId).eq('email', member.user_email)
                              loadCustomers()
                            }}
                            className="text-slate-300 hover:text-rose-500 transition-colors text-xs leading-none">✕</button>
                        </div>
                      )
                    })}
                    {/* Add another customer */}
                    <select
                      value=""
                      onChange={async (e) => {
                        const custId = e.target.value
                        if (!custId) return
                        await supabase.from('customer_contacts').upsert({
                          organization_id: orgId,
                          customer_id:     custId,
                          email:           member.user_email,
                          name:            member.display_name || member.user_email.split('@')[0],
                          role:            'contact',
                        }, { onConflict: 'customer_id,email', ignoreDuplicates: true })
                        loadCustomers()
                      }}
                      className="px-2 py-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">+ Link a customer…</option>
                      {customers
                        .filter(c => !(contactLinks[member.user_email] || []).includes(c.id))
                        .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                      }
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

function AccountSection({ user }) {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()

  const [signature,     setSignature]     = useState('')
  const [sigSaving,     setSigSaving]     = useState(false)
  const [sigSaved,      setSigSaved]      = useState(false)

  const [mfaStatus,  setMfaStatus]  = useState<'loading'|'enrolled'|'none'>('loading')
  const [enrolling,  setEnrolling]  = useState(false)
  const [qrCode,     setQrCode]     = useState<string|null>(null)
  const [secret,     setSecret]     = useState<string|null>(null)
  const [factorId,   setFactorId]   = useState<string|null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyErr,  setVerifyErr]  = useState<string|null>(null)
  const [removing,   setRemoving]   = useState(false)
  const [confirmed,  setConfirmed]  = useState(false)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const has = data?.totp && data.totp.length > 0
      setMfaStatus(has ? 'enrolled' : 'none')
    })
    // Load saved signature
    if (user?.id) {
      supabase.from('organization_members').select('signature')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data?.signature) setSignature(data.signature) })
    }
  }, [user?.id])

  const startEnroll = async () => {
    setEnrolling(true); setVerifyErr(null)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Valhalla RMM' })
    if (error) { setVerifyErr(error.message); setEnrolling(false); return }
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setFactorId(data.id)
  }

  const confirmEnroll = async () => {
    if (!factorId || verifyCode.length !== 6) return
    setVerifyErr(null)
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) { setVerifyErr(cErr.message); return }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode })
    if (vErr) { setVerifyErr('Invalid code — try again'); return }
    setConfirmed(true)
    setMfaStatus('enrolled')
    setQrCode(null); setSecret(null); setFactorId(null); setVerifyCode('')
    setEnrolling(false)
  }

  const cancelEnroll = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId })
    setQrCode(null); setSecret(null); setFactorId(null); setVerifyCode('')
    setEnrolling(false); setVerifyErr(null)
  }

  const removeMfa = async () => {
    if (!confirm('Remove 2FA from your account? You will only need your password to log in.')) return
    setRemoving(true)
    const { data } = await supabase.auth.mfa.listFactors()
    for (const f of (data?.totp ?? [])) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    setMfaStatus('none'); setRemoving(false)
  }

  const saveSignature = async () => {
    if (!user?.id) return
    setSigSaving(true)
    await supabase.from('organization_members')
      .update({ signature: signature.trim() || null })
      .eq('user_id', user.id)
    setSigSaving(false)
    setSigSaved(true)
    setTimeout(() => setSigSaved(false), 2500)
  }

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login') }

  const ROLE_CLS = {
    owner: 'bg-amber-100 text-amber-700',
    admin: 'bg-violet-100 text-violet-700',
    technician: 'bg-blue-100 text-blue-700',
    client: 'bg-slate-100 text-slate-600'
  }

  return (
    <Section title="My Account" description="Your personal account details and security settings.">
      <FieldRow label="Email" hint="Email cannot be changed here.">
        <input value={user?.email || ''} disabled className={`${inp} opacity-60`} />
      </FieldRow>
      <FieldRow label="Role">
        <div className="flex items-center gap-2 pt-1">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${ROLE_CLS[user?.role] ?? 'bg-slate-100 text-slate-600'}`}>
            <Shield className="w-3 h-3" />
            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Unknown'}
          </span>
        </div>
      </FieldRow>

      {/* 2FA Section */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-500" /> Two-Factor Authentication
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {mfaStatus === 'enrolled'
                ? 'Your account is protected with TOTP 2FA.'
                : 'Add an extra layer of security with an authenticator app.'}
            </p>
          </div>
          {mfaStatus === 'loading' && <div className="w-16 h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />}
          {mfaStatus === 'enrolled' && !removing && (
            <button onClick={removeMfa} disabled={removing}
              className="flex-shrink-0 px-3 py-1.5 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors">
              Remove 2FA
            </button>
          )}
          {mfaStatus === 'none' && !enrolling && (
            <button onClick={startEnroll}
              className="flex-shrink-0 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors">
              Enable 2FA
            </button>
          )}
        </div>

        {/* Confirmed banner */}
        {confirmed && (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            <Shield className="w-4 h-4 flex-shrink-0" />
            2FA enabled successfully. You'll need your authenticator on next login.
          </div>
        )}

        {/* Enrollment flow */}
        {enrolling && qrCode && (
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Scan with your authenticator app</p>
            <p className="text-xs text-slate-500">Use Google Authenticator, Authy, 1Password, or any TOTP app.</p>
            {/* QR code as image */}
            <div className="flex justify-center">
              <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 border-4 border-white rounded-lg shadow" />
            </div>
            {/* Manual entry secret */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Or enter manually:</p>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all select-all">{secret}</p>
            </div>
            {/* Verify code */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enter the 6-digit code to confirm</p>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={verifyCode} onChange={e => { setVerifyCode(e.target.value.replace(/\D/g,'').slice(0,6)); setVerifyErr(null) }}
                placeholder="000000"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-center text-xl font-mono tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 dark:text-white"
                autoFocus
              />
              {verifyErr && <p className="text-xs text-rose-600">{verifyErr}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={cancelEnroll} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                <button onClick={confirmEnroll} disabled={verifyCode.length !== 6}
                  className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
                  Confirm & Enable
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            Email Signature
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Automatically appended to every client reply you send. Plain text only.</p>
        </div>
        <textarea
          value={signature}
          onChange={e => { setSignature(e.target.value); setSigSaved(false) }}
          rows={4}
          placeholder={`e.g.\n\nBest regards,\nJohn Smith\nValhalla IT | +1 (555) 123-4567`}
          className={`w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-mono`}
        />
        <div className="flex items-center gap-3">
          <button onClick={saveSignature} disabled={sigSaving}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
            {sigSaving ? 'Saving…' : sigSaved ? '✓ Saved' : 'Save Signature'}
          </button>
          {signature && (
            <button onClick={() => { setSignature(''); setSigSaved(false) }}
              className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
              Clear
            </button>
          )}
        </div>
        {signature && (
          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1.5 font-medium">Preview</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono">{signature}</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
        <button onClick={handleSignOut} className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Sign Out
        </button>
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  const supabase = createSupabaseBrowserClient()
  const [user,    setUser]    = useState(null)
  const [org,     setOrg]     = useState(null)
  const [orgId,   setOrgId]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('org')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id,role').eq('user_id', user.id).single()
      if (member) {
        setOrgId(member.organization_id)
        setUser({ ...user, role: member.role })
        const { data: orgData } = await supabase.from('organizations').select('*').eq('id', member.organization_id).single()
        setOrg(orgData)
      }
      setLoading(false)
    }
    init()
  }, [])

  const loadOrg = async () => {
    if (!orgId) return
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).single()
    setOrg(data)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your organization and account preferences.</p>
      </div>
      <div className="flex gap-6 items-start">
        <aside className="w-48 flex-shrink-0 sticky top-4">
          <nav className="space-y-0.5">
            {NAV.map(item => {
              const active = section === item.id
              return (
                <button key={item.id} onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${active ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                  {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />}
                </button>
              )
            })}
          </nav>
        </aside>
        <main className="flex-1 min-w-0">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            {section === 'org'          && <OrgSection          org={org} onSaved={loadOrg} />}
            {section === 'sla'          && <SlaSection          org={org} onSaved={loadOrg} />}
            {section === 'integrations' && <IntegrationsSection org={org} />}
            {section === 'team'         && <TeamSection         orgId={orgId} />}
            {section === 'account'      && <AccountSection      user={user} />}
          </div>
        </main>
      </div>
    </div>
  )
}