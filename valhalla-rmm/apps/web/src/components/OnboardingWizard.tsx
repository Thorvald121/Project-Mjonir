// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Building2, User, Package, Mail, CheckCircle2,
  ChevronRight, ChevronLeft, X, Loader2, Sparkles,
  Phone, Globe, MapPin, DollarSign, Send,
} from 'lucide-react'

const STEPS = [
  { id: 'company',  label: 'Company',  icon: Building2 },
  { id: 'contact',  label: 'Contact',  icon: User      },
  { id: 'plan',     label: 'Plan',     icon: Package   },
  { id: 'invite',   label: 'Invite',   icon: Mail      },
  { id: 'done',     label: 'Done',     icon: CheckCircle2 },
]

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Legal', 'Finance', 'Education',
  'Manufacturing', 'Retail', 'Construction', 'Non-profit', 'Other',
]

const CONTRACT_TYPES = {
  managed:      'Managed Services (MSP)',
  block_hours:  'Block Hours',
  time_material:'Time & Materials',
  project:      'Project Based',
}

const inp = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
const sel = "w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

export default function OnboardingWizard({ onClose, onComplete }: {
  onClose: () => void
  onComplete: (customerId: string) => void
}) {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()
  const [step,    setStep]    = useState(0)
  const [saving,  setSaving]  = useState(false)
  const [orgId,   setOrgId]   = useState<string|null>(null)
  const [plans,   setPlans]   = useState<any[]>([])
  const [created, setCreated] = useState<any>(null) // created customer

  // Form state
  const [company, setCompany] = useState({
    name: '', industry: '', website: '', address: '', notes: '',
    contract_type: 'managed', monthly_rate: '', hourly_rate: '',
  })
  const [contact, setContact] = useState({
    contact_name: '', contact_email: '', contact_phone: '',
  })
  const [planId,    setPlanId]    = useState<string|null>(null)
  const [sendInvite, setSendInvite] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSent,  setInviteSent]  = useState(false)
  const [errors, setErrors] = useState<Record<string,string>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('organization_members').select('organization_id')
        .eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setOrgId(data.organization_id) })
    })
    supabase.from('msp_plans').select('*').order('price').then(({ data }) => setPlans(data ?? []))
  }, [])

  // Sync invite email from contact email
  useEffect(() => {
    if (!inviteEmail) setInviteEmail(contact.contact_email)
  }, [contact.contact_email])

  const validate = () => {
    const errs: Record<string,string> = {}
    if (step === 0 && !company.name.trim()) errs.name = 'Company name is required'
    if (step === 1 && !contact.contact_email.trim()) errs.contact_email = 'Contact email is required'
    if (step === 1 && contact.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.contact_email))
      errs.contact_email = 'Enter a valid email address'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const createCustomer = async () => {
    if (!orgId) return null
    setSaving(true)
    const { data, error } = await supabase.from('customers').insert({
      organization_id: orgId,
      name:            company.name.trim(),
      industry:        company.industry || null,
      website:         company.website  || null,
      address:         company.address  || null,
      notes:           company.notes    || null,
      contract_type:   company.contract_type || null,
      monthly_rate:    company.monthly_rate ? parseFloat(company.monthly_rate) : null,
      hourly_rate:     company.hourly_rate  ? parseFloat(company.hourly_rate)  : null,
      contact_name:    contact.contact_name  || null,
      contact_email:   contact.contact_email || null,
      contact_phone:   contact.contact_phone || null,
      status:          'active',
    }).select('*').single()
    setSaving(false)
    if (error) { setErrors({ name: error.message }); return null }
    return data
  }

  const assignPlan = async (customerId: string) => {
    if (!planId || !orgId) return
    const plan = plans.find(p => p.id === planId)
    if (!plan) return
    await supabase.from('customer_plans').insert({
      organization_id: orgId,
      customer_id:     customerId,
      customer_name:   company.name,
      plan_id:         planId,
      plan_name:       plan.name,
      status:          'active',
      start_date:      new Date().toISOString().slice(0, 10),
    })
  }

  const doInvite = async (customerId: string) => {
    if (!sendInvite || !inviteEmail || !orgId) return
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    await fetch('https://yetrdrgagfovphrerpie.supabase.co/functions/v1/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        email:           inviteEmail,
        role:            'client',
        organization_id: orgId,
        redirect_to:     `${window.location.origin}/auth/confirm`,
        customer_id:     customerId,
      }),
    })
    setInviteSent(true)
  }

  const next = async () => {
    if (!validate()) return

    if (step === 1) {
      // Create customer after contact step
      const cust = await createCustomer()
      if (!cust) return
      setCreated(cust)
      setStep(s => s + 1)
      return
    }

    if (step === 2) {
      // Assign plan
      if (created && planId) await assignPlan(created.id)
      setStep(s => s + 1)
      return
    }

    if (step === 3) {
      // Send invite
      setSaving(true)
      if (created) await doInvite(created.id)
      setSaving(false)
      setStep(s => s + 1)
      return
    }

    setStep(s => s + 1)
  }

  const back = () => { setErrors({}); setStep(s => s - 1) }

  const finish = () => {
    if (created) {
      onComplete(created.id)
      router.push(`/customers/${created.id}`)
    }
    onClose()
  }

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">New Client Onboarding</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < step
            const active = i === step
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center gap-1.5 ${active ? 'opacity-100' : done ? 'opacity-70' : 'opacity-30'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="px-6 py-6 space-y-4 min-h-[320px]">

          {/* Step 0 — Company */}
          {step === 0 && (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Company Name *</p>
                <input value={company.name} onChange={e => setCompany(p => ({...p, name: e.target.value}))}
                  placeholder="Acme Corp" className={inp} autoFocus />
                {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Industry</p>
                  <select value={company.industry} onChange={e => setCompany(p => ({...p, industry: e.target.value}))} className={sel}>
                    <option value="">— Select —</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Contract Type</p>
                  <select value={company.contract_type} onChange={e => setCompany(p => ({...p, contract_type: e.target.value}))} className={sel}>
                    {Object.entries(CONTRACT_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Monthly Rate
                  </p>
                  <input value={company.monthly_rate} onChange={e => setCompany(p => ({...p, monthly_rate: e.target.value}))}
                    type="number" placeholder="0.00" className={inp} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" /> Hourly Rate
                  </p>
                  <input value={company.hourly_rate} onChange={e => setCompany(p => ({...p, hourly_rate: e.target.value}))}
                    type="number" placeholder="0.00" className={inp} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> Website
                </p>
                <input value={company.website} onChange={e => setCompany(p => ({...p, website: e.target.value}))}
                  placeholder="https://acmecorp.com" className={inp} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Address
                </p>
                <input value={company.address} onChange={e => setCompany(p => ({...p, address: e.target.value}))}
                  placeholder="123 Main St, City, State" className={inp} />
              </div>
            </>
          )}

          {/* Step 1 — Contact */}
          {step === 1 && (
            <>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Contact Name
                </p>
                <input value={contact.contact_name} onChange={e => setContact(p => ({...p, contact_name: e.target.value}))}
                  placeholder="Jane Smith" className={inp} autoFocus />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> Email Address *
                </p>
                <input value={contact.contact_email} onChange={e => setContact(p => ({...p, contact_email: e.target.value}))}
                  type="email" placeholder="jane@acmecorp.com" className={inp} />
                {errors.contact_email && <p className="text-xs text-rose-500 mt-1">{errors.contact_email}</p>}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> Phone Number
                </p>
                <input value={contact.contact_phone} onChange={e => setContact(p => ({...p, contact_phone: e.target.value}))}
                  type="tel" placeholder="+1 (555) 000-0000" className={inp} />
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                This contact will be used to send the portal invite and receive ticket notifications.
              </div>
            </>
          )}

          {/* Step 2 — Plan */}
          {step === 2 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Optionally assign an MSP plan to <strong className="text-slate-900 dark:text-white">{company.name}</strong>. You can skip this and assign later.
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                <button onClick={() => setPlanId(null)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${!planId
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No plan — skip this step</p>
                  <p className="text-xs text-slate-400 mt-0.5">Assign a plan later from the customer page</p>
                </button>
                {plans.map(plan => (
                  <button key={plan.id} onClick={() => setPlanId(plan.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${planId === plan.id
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                      <p className="text-sm font-bold text-amber-600">${plan.price}<span className="text-xs font-normal text-slate-400">/{plan.billing_cycle}</span></p>
                    </div>
                    {plan.description && <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>}
                    {plan.features?.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">{plan.features.slice(0,3).join(' · ')}</p>
                    )}
                  </button>
                ))}
                {plans.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No MSP plans created yet — skip and add later.</p>
                )}
              </div>
            </>
          )}

          {/* Step 3 — Invite */}
          {step === 3 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Send <strong className="text-slate-900 dark:text-white">{company.name}</strong> a portal invite so they can log in, view tickets, and submit new requests.
              </p>
              <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <input type="checkbox" id="send-invite" checked={sendInvite} onChange={e => setSendInvite(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-amber-500 flex-shrink-0" />
                <label htmlFor="send-invite" className="cursor-pointer">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Send portal invite email</p>
                  <p className="text-xs text-slate-400 mt-0.5">Client receives an email to set their password and access the portal</p>
                </label>
              </div>
              {sendInvite && (
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Invite email address</p>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    type="email" placeholder="jane@acmecorp.com" className={inp} />
                  <p className="text-xs text-slate-400 mt-1">Defaults to the contact email — change if needed</p>
                </div>
              )}
              {!sendInvite && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-400">
                  You can send the invite later from the customer's detail page.
                </div>
              )}
            </>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{company.name} is ready!</h3>
                <p className="text-sm text-slate-500 mt-1">Client account created successfully.</p>
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300">Customer account created</span>
                </div>
                {planId && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">MSP plan assigned — {plans.find(p=>p.id===planId)?.name}</span>
                  </div>
                )}
                {inviteSent && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300">Portal invite sent to {inviteEmail}</span>
                  </div>
                )}
                {sendInvite && !inviteSent && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <span className="text-slate-400">Invite skipped</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <button onClick={step === 0 ? onClose : back}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {isLast ? (
            <button onClick={finish}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors">
              <Building2 className="w-4 h-4" />
              Go to Customer
            </button>
          ) : (
            <button onClick={next} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === 3 ? (
                <><Send className="w-4 h-4" /> {sendInvite ? 'Send Invite' : 'Skip & Finish'}</>
              ) : step === 2 ? (
                <>{planId ? 'Assign & Continue' : 'Skip'} <ChevronRight className="w-4 h-4" /></>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}