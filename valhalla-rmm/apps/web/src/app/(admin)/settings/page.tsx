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
  const [form,   setForm]   = useState({ name: '', company_email: '', app_url: '' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (org) setForm({
      name:          org.name          || '',
      company_email: org.company_email || '',
      app_url:       org.app_url       || (typeof window !== 'undefined' ? window.location.origin : ''),
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
  const [invEmail, setInvEmail] = useState('')
  const [invRole,  setInvRole]  = useState('technician')
  const [inviting, setInviting] = useState(false)
  const [err,      setErr]      = useState(null)
  const [success,  setSuccess]  = useState(null)

  useEffect(() => { if (orgId) loadMembers() }, [orgId])

  useRealtimeRefresh(['organization_members'], loadMembers)

  const loadMembers = async () => {
    setLoading(true)
    const { data } = await supabase.from('organization_members').select('*').eq('organization_id', orgId).order('created_at')
    setMembers(data ?? [])
    setLoading(false)
  }

  const inviteMember = async () => {
    if (!invEmail.trim()) return
    setInviting(true); setErr(null); setSuccess(null)
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: invEmail.trim(), role: invRole, organization_id: orgId, redirect_to: `${window.location.origin}/invite` }
      })
      if (error) { setErr(error.message); return }
      if (data?.error) { setErr(data.error); return }
      setSuccess(`Invite sent to ${invEmail.trim()}`)
      setInvEmail('')
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
        <p className="text-sm font-medium text-slate-900 dark:text-white">Invite Team Member</p>
        <p className="text-xs text-slate-400">They will receive an email with a link to set their password and sign in.</p>
        <div className="flex gap-2">
          <input value={invEmail} onChange={e => setInvEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && inviteMember()}
            placeholder="email@company.com" type="email"
            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
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
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-amber-600 font-semibold text-xs">{member.user_email?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{member.user_email}</p>
                </div>
                <select value={member.role} onChange={e => updateRole(member.id, e.target.value)}
                  className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none">
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="technician">Technician</option>
                  <option value="client">Client</option>
                </select>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline ${ROLE_CLS[member.role] ?? ''}`}>{member.role}</span>
                {member.role !== 'owner' && (
                  <button onClick={() => removeMember(member.id)} className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors text-xs">✕</button>
                )}
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
  const router = useRouter()
  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/login') }
  const ROLE_CLS = { owner: 'bg-amber-100 text-amber-700', admin: 'bg-violet-100 text-violet-700', technician: 'bg-blue-100 text-blue-700', client: 'bg-slate-100 text-slate-600' }
  return (
    <Section title="My Account" description="Your personal account details.">
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