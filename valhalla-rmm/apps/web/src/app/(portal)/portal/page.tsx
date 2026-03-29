// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Shield, Plus, Ticket, CheckCircle2, RefreshCw, ChevronRight,
  X, FileText, CreditCard, AlertCircle, ExternalLink, Monitor,
  AlertTriangle, HardDrive, BookOpen, LogOut, ArrowLeft,
  Paperclip, Send, Loader2, MessageSquare, User, Search, Package,
  Activity, Globe, Moon, Sun,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────
const lbl   = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
const fmtDate = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const fmtDateTime = (d) => { if (!d) return ''; try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:16px 0 6px;">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:16px;font-weight:700;margin:20px 0 8px;">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:18px;font-weight:700;margin:20px 0 10px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:12px;font-family:monospace;">$1</code>')
    .replace(/^- (.+)$/gm,     '<li style="margin-left:16px;list-style:disc;">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin-bottom:10px;">')
    .replace(/\n/g, '<br/>')
}

const STATUS_CLS = {
  open:        'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  waiting:     'bg-violet-100 text-violet-800',
  resolved:    'bg-emerald-100 text-emerald-800',
  closed:      'bg-slate-100 text-slate-600',
}
const PRIORITY_DOT = {
  critical: 'bg-rose-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-400',
  low:      'bg-slate-300',
}
const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"

// ── Ticket Detail ─────────────────────────────────────────────────────────────
function PortalTicketDetail({ ticket, user, orgId, onBack }) {
  const supabase  = createSupabaseBrowserClient()
  const fileRef   = useRef()
  const [comments,    setComments]    = useState([])
  const [comment,     setComment]     = useState('')
  const [attachment,  setAttachment]  = useState(null)
  const [sending,     setSending]     = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('ticket_comments')
        .select('*').eq('ticket_id', ticket.id).eq('is_staff', false)
        .order('created_at', { ascending: true })
      setComments(data ?? [])
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [ticket.id])

  const handleSend = async () => {
    if (!comment.trim()) return
    setSending(true)
    let attachment_url = null, attachment_name = null
    if (attachment) {
      const ext  = attachment.name.split('.').pop()
      const path = `ticket-attachments/${ticket.id}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('attachments').upload(path, attachment)
      if (upErr) {
        console.error('Attachment upload failed:', upErr.message)
      } else if (up) {
        const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
        attachment_url = publicUrl; attachment_name = attachment.name
      }
    }
    await supabase.from('ticket_comments').insert({
      ticket_id:       ticket.id,
      organization_id: orgId,
      author_name:     user.user_metadata?.full_name || user.email,
      author_email:    user.email,
      content:         comment.trim(),
      is_staff:        false,
      source:          'portal',
      attachment_url,
      attachment_name,
    })
    // Re-open if client replies to a resolved/closed/waiting ticket
    if (['waiting', 'resolved', 'closed'].includes(ticket.status)) {
      await supabase.from('tickets').update({ status: 'open' }).eq('id', ticket.id)
    }
    setComment(''); setAttachment(null)
    // Reload comments
    const { data } = await supabase.from('ticket_comments')
      .select('*').eq('ticket_id', ticket.id).eq('is_staff', false).order('created_at', { ascending: true })
    setComments(data ?? [])
    setSending(false)
  }

  const isClosed = ['resolved','closed'].includes(ticket.status)

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to my tickets
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{ticket.title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CLS[ticket.status] ?? ''}`}>{lbl(ticket.status)}</span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">{ticket.priority}</span>
              {ticket.category && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">{ticket.category}</span>}
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>Ticket #{ticket.id?.slice(-6).toUpperCase()}</p>
            <p className="mt-0.5">{fmtDate(ticket.created_at)}</p>
          </div>
        </div>
        {ticket.description && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            {ticket.description}
          </p>
        )}
        {ticket.assigned_to && (
          <p className="mt-3 text-xs text-slate-400">
            Assigned to: <span className="text-slate-700 font-medium">{ticket.assigned_to}</span>
          </p>
        )}
      </div>

      {/* Conversation */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Conversation ({comments.length})
        </h3>
        {comments.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            No messages yet. Add a comment below to get started.
          </div>
        )}
        {comments.map(c => (
          <div key={c.id} className={`flex gap-3 ${c.is_staff ? '' : 'flex-row-reverse'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${c.is_staff ? 'bg-amber-100' : 'bg-slate-700'}`}>
              {c.is_staff ? <Shield className="w-4 h-4 text-amber-600" /> : <User className="w-4 h-4 text-slate-200" />}
            </div>
            <div className={`max-w-[80%] flex flex-col gap-1 ${c.is_staff ? '' : 'items-end'}`}>
              <div className={`rounded-xl px-4 py-3 text-sm shadow-sm ${c.is_staff ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white' : 'bg-slate-700 text-slate-100'}`}>
                <p className={`font-medium text-xs mb-1 ${c.is_staff ? 'text-slate-500' : 'text-slate-400'}`}>{c.is_staff ? `${c.author_name || c.author_email} · Support Team` : (c.author_name || c.author_email)}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{c.content}</p>
                {c.attachment_url && (
                  <a href={c.attachment_url} target="_blank" rel="noreferrer"
                    className={`flex items-center gap-1.5 mt-2 text-xs underline ${c.is_staff ? 'text-amber-600' : 'text-slate-300'}`}>
                    <Paperclip className="w-3 h-3" /> {c.attachment_name || 'Attachment'}
                  </a>
                )}
              </div>
              <p className="text-[11px] text-slate-400 px-1">{fmtDateTime(c.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {!isClosed && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Reply</h3>
          <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Type your message..."
            className={`${inp} resize-none`}
          />
          <div className="flex items-center justify-between">
            <div>
              <input type="file" ref={fileRef} className="hidden" onChange={e => setAttachment(e.target.files[0])} />
              <button onClick={() => fileRef.current.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Paperclip className="w-3.5 h-3.5" />
                {attachment ? attachment.name : 'Attach File'}
              </button>
              {attachment && <button onClick={() => setAttachment(null)} className="ml-2 text-xs text-rose-500 hover:underline">Remove</button>}
            </div>
            <button onClick={handleSend} disabled={!comment.trim() || sending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      )}

      {isClosed && ticket.resolution_notes && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <p className="text-xs font-semibold text-emerald-700 mb-1">Resolution Summary</p>
          <p className="text-sm text-emerald-800 whitespace-pre-wrap break-words">{ticket.resolution_notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Main Portal Page ──────────────────────────────────────────────────────────
export default function PortalPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  const userRef  = useRef(null)
  const orgIdRef = useRef(null)
  const [user,          setUser]          = useState(null)
  const [org,           setOrg]           = useState(null)
  const [orgId,         setOrgId]         = useState(null)
  const [customer,      setCustomer]      = useState(null)
  const [tickets,       setTickets]       = useState([])
  const [invoices,      setInvoices]      = useState([])
  const [devices,       setDevices]       = useState([])
  const [kbArticles,    setKbArticles]    = useState([])
  const [plan,          setPlan]          = useState(null)
  const [portalMonitors,setPortalMonitors]= useState([])
  const [portalTemplates,setPortalTemplates]=useState([])
  const [loading,       setLoading]       = useState(true)
  const [activeTab,     setActiveTab]     = useState('tickets')
  const [dark,          setDark]          = useState(false)

  // Init dark mode from localStorage or system preference
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved === 'dark' || (!saved && prefersDark)
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [deviceFilter,  setDeviceFilter]  = useState('all')
  const [kbSearch,      setKbSearch]      = useState('')
  const [kbArticle,     setKbArticle]     = useState(null)
  const [showForm,      setShowForm]      = useState(false)
  const [selectedTicket,setSelectedTicket]= useState(null)
  const [form,          setForm]          = useState({ title: '', description: '', category: 'other', priority: 'medium' })
  const [submitting,    setSubmitting]    = useState(false)
  const [submitErr,     setSubmitErr]     = useState(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { router.push('/portal/login'); return }
      userRef.current = u
      setUser(u)

      // Get org
      const { data: member } = await supabase.from('organization_members')
        .select('organization_id').eq('user_id', u.id).single()
      if (!member) { setLoading(false); return }
      const currentOrgId = member.organization_id
      orgIdRef.current = currentOrgId
      setOrgId(currentOrgId)

      const { data: orgData } = await supabase.from('organizations')
        .select('id,name,company_email,logo_url,brand_color').eq('id', currentOrgId).single()
      setOrg(orgData)

      // Find customer via customer_contacts table (supports multiple users per customer)
      let cust = null
      const { data: contactRows } = await supabase.from('customer_contacts')
        .select('customer_id').eq('email', u.email).limit(1)
      if (contactRows?.[0]?.customer_id) {
        const { data: custData } = await supabase.from('customers')
          .select('*').eq('id', contactRows[0].customer_id).single()
        if (custData) cust = custData
      } else {
        // Fallback: check customers.contact_email directly
        const { data: byPrimary } = await supabase.from('customers')
          .select('*').eq('contact_email', u.email).limit(1)
        if (byPrimary?.[0]) cust = byPrimary[0]
      }
      setCustomer(cust)

      // Parallel data fetch — use local vars, not state (state updates are async)
      const [t, i, d, kb, cp, mon, tpl] = await Promise.all([
        supabase.from('tickets').select('id,title,status,priority,category,description,created_at,assigned_to,sla_due_date')
          .eq('contact_email', u.email).order('created_at', { ascending: false }).limit(100),
        supabase.from('invoices').select('id,invoice_number,total,status,issue_date,due_date,amount_paid,stripe_payment_url')
          .eq('contact_email', u.email).order('issue_date', { ascending: false }).limit(50),
        cust?.id
          ? supabase.from('inventory_items').select('*').eq('customer_id', cust.id).order('name').limit(100)
          : Promise.resolve({ data: [] }),
        supabase.from('knowledge_articles').select('id,title,content,category,helpful_count,view_count')
          .eq('is_published', true).order('helpful_count', { ascending: false }).limit(50),
        cust?.id
          ? supabase.from('customer_plans').select('*, msp_plans(*)').eq('customer_id', cust.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] }),
        cust?.id
          ? supabase.from('monitors').select('id,name,url,last_status,last_checked_at,last_response_ms,ssl_expiry_date').eq('customer_id', cust.id).order('name')
          : Promise.resolve({ data: [] }),
        supabase.from('ticket_templates').select('id,name,category,priority,description').order('name').limit(20),
      ])

      setTickets(t.data ?? [])
      setInvoices(i.data ?? [])
      setDevices(d.data ?? [])
      setKbArticles(kb.data ?? [])
      setPlan(cp.data?.[0] ?? null)
      setPortalMonitors(mon.data ?? [])
      setPortalTemplates(tpl.data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const handleSubmitTicket = async () => {
    if (!form.title.trim()) { setSubmitErr('Title is required'); return }
    const currentUser  = userRef.current
    const currentOrgId = orgIdRef.current
    if (!currentUser)  { setSubmitErr('Session not ready — please refresh'); return }
    if (!currentOrgId) { setSubmitErr('Organization not found — please refresh'); return }
    setSubmitting(true); setSubmitErr(null)
    const { data: newTicket, error } = await supabase.from('tickets').insert({
      organization_id: currentOrgId,
      title:           form.title.trim(),
      description:     form.description || null,
      priority:        form.priority,
      category:        form.category,
      status:          'open',
      contact_email:   currentUser.email,
      contact_name:    currentUser.user_metadata?.full_name || currentUser.email,
      customer_id:     customer?.id   || null,
      customer_name:   customer?.name || null,
      source:          'portal',
    }).select('id,title,status,priority,category,description,created_at,assigned_to,sla_due_date').single()

    if (error) {
      console.error('Ticket insert error:', error.message)
      setSubmitErr(error.message)
      setSubmitting(false)
      return
    }

    // Add immediately to state and close form
    if (newTicket) {
      setTickets(prev => [newTicket, ...prev])
    }

    // Also do a background reload to sync anything else
    supabase.from('tickets')
      .select('id,title,status,priority,category,description,created_at,assigned_to,sla_due_date')
      .eq('contact_email', currentUser.email)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setTickets(data) })

    setForm({ title: '', description: '', category: 'other', priority: 'medium' })
    setShowForm(false)
    setSubmitting(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/portal/login')
  }

  const openTickets    = tickets.filter(t => !['resolved','closed'].includes(t.status))
  const closedTickets  = tickets.filter(t => ['resolved','closed'].includes(t.status))
  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets
    if (statusFilter === 'open') return openTickets
    return tickets.filter(t => t.status === statusFilter)
  }, [tickets, statusFilter])

  const filteredDevices = useMemo(() =>
    deviceFilter === 'all' ? devices : devices.filter(d => d.status === deviceFilter)
  , [devices, deviceFilter])

  const filteredKb = useMemo(() =>
    kbSearch ? kbArticles.filter(a => a.title.toLowerCase().includes(kbSearch.toLowerCase()) || a.content?.toLowerCase().includes(kbSearch.toLowerCase())) : kbArticles
  , [kbArticles, kbSearch])

  if (loading) return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  )

  if (selectedTicket) return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">{org?.name?.[0] ?? 'V'}</span>
            </div>
            <span className="font-bold text-white text-sm">{org?.name || 'Support Portal'}</span>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <PortalTicketDetail
          ticket={selectedTicket}
          user={user}
          orgId={orgId}
          onBack={() => setSelectedTicket(null)}
        />
      </div>
    </div>
  )

  if (kbArticle) return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">{org?.name?.[0] ?? 'V'}</span>
            </div>
            <span className="font-bold text-white text-sm">{org?.name || 'Support Portal'}</span>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <button onClick={() => setKbArticle(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to knowledge base
        </button>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 capitalize">{kbArticle.category}</span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-3">{kbArticle.title}</h1>
          <div className="mt-4 text-sm text-slate-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(kbArticle.content) }} />
        </div>
      </div>
    </div>
  )

  const TABS = [
    { id: 'tickets',    label: 'Tickets',        icon: Ticket,   badge: null },
    { id: 'devices',    label: 'My Devices',      icon: Monitor,  badge: devices.filter(d => d.warranty_expiry && new Date(d.warranty_expiry) < new Date()).length > 0 ? '!' : null },
    { id: 'invoices',   label: 'Invoices',        icon: FileText, badge: invoices.filter(i => i.status === 'overdue').length > 0 ? '!' : null },
    { id: 'kb',         label: 'Knowledge Base',  icon: BookOpen, badge: null },
    ...(plan      ? [{ id: 'plan',       label: 'My Plan',   icon: Package,   badge: null }] : []),
    ...(portalMonitors.length > 0 ? [{ id: 'monitoring', label: 'Status',    icon: Activity,  badge: portalMonitors.some(m => m.last_status === 'down') ? '!' : null }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: org?.brand_color || '#f59e0b' }}>
              {org?.logo_url
                ? <img src={org.logo_url} alt="logo" className="w-full h-full object-contain" />
                : <span className="text-white font-bold text-sm">{org?.name?.[0] ?? 'V'}</span>
              }
            </div>
            <div>
              <span className="font-bold text-white text-sm">{org?.name || 'Support Portal'}</span>
              {user && <p className="text-xs text-slate-400">{user.email}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowForm(true); setActiveTab('tickets') }}
              style={{ background: org?.brand_color || '#f59e0b' }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-sm font-semibold transition-opacity hover:opacity-90">
              <Plus className="w-4 h-4" /> New Ticket
            </button>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
            <button onClick={toggleDark} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Welcome */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Welcome back, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Submit and track your support requests below.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-700 bg-slate-100 dark:bg-slate-900">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === id ? 'border-amber-500 text-amber-600 bg-white dark:bg-slate-900 rounded-t-lg' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60 rounded-t-lg'}`}>
              <Icon className="w-4 h-4" />
              {label}
              {badge && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />}
            </button>
          ))}
        </div>

        {/* ── TICKETS TAB ────────────────────────────────────────── */}
        {activeTab === 'tickets' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Open',        value: openTickets.filter(t => t.status === 'open').length,        icon: Ticket,       color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100' },
                { label: 'In Progress', value: openTickets.filter(t => t.status === 'in_progress').length, icon: RefreshCw,    color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100' },
                { label: 'Resolved',    value: closedTickets.length,                                       icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 text-center">
                  <div className={`w-9 h-9 rounded-xl border ${bg} flex items-center justify-center mx-auto mb-2`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            {/* New ticket form */}
            {showForm && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border-l-4 border-l-amber-400 border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Submit a New Request</h3>
                  <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
                </div>
                {submitErr && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{submitErr}</p>}
                {portalTemplates.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick Templates</label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {portalTemplates.map(t => (
                        <button key={t.id} onClick={() => setForm(p => ({ ...p, title: t.name, description: t.description || '', category: t.category || p.category, priority: t.priority || p.priority }))}
                          className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-amber-400 hover:text-amber-700 transition-colors bg-white">
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject *</label>
                  <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Brief description of the issue" className={`mt-1 ${inp}`} autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</label>
                  <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    rows={4} placeholder="Describe the issue in detail, including any error messages..." className={`mt-1 ${inp} resize-none`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                    <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={`mt-1 ${inp}`}>
                      {['hardware','software','network','security','account','email','printing','other'].map(c => <option key={c} value={c}>{lbl(c)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</label>
                    <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={`mt-1 ${inp}`}>
                      {['low','medium','high','critical'].map(p => <option key={p} value={p}>{lbl(p)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  <button onClick={handleSubmitTicket} disabled={!form.title.trim() || submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center gap-2">
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                </div>
              </div>
            )}

            {/* Filter + list */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Your Requests</h2>
              <div className="flex gap-1 flex-wrap">
                {['all','open','in_progress','waiting','resolved','closed'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statusFilter === s ? 'bg-amber-500 text-white border-amber-500' : 'text-slate-500 border-slate-200 hover:border-amber-300'}`}>
                    {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : lbl(s)}
                  </button>
                ))}
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No tickets found</p>
                <p className="text-slate-400 text-sm mt-1">
                  {statusFilter === 'all' ? 'Submit a request above when you need help.' : `No ${statusFilter.replace('_',' ')} tickets.`}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map(ticket => (
                  <button key={ticket.id} onClick={() => setSelectedTicket(ticket)}
                    className="w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-300 transition-all p-4 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${PRIORITY_DOT[ticket.priority]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white text-sm truncate group-hover:text-amber-600 transition-colors">{ticket.title}</p>
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[ticket.status] ?? ''}`}>{lbl(ticket.status)}</span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">{ticket.category}</span>
                          </div>
                          {ticket.description && <p className="text-xs text-slate-400 mt-1.5 line-clamp-1">{ticket.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{fmtDate(ticket.created_at)}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DEVICES TAB ────────────────────────────────────────── */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Devices',    value: devices.length, icon: Monitor, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                { label: 'Deployed',          value: devices.filter(d => d.status === 'deployed').length, icon: HardDrive, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
                { label: 'Warranty Alerts',   value: devices.filter(d => { if (!d.warranty_expiry) return false; const days = Math.ceil((new Date(d.warranty_expiry) - new Date()) / 86400000); return days <= 30; }).length, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 text-center">
                  <div className={`w-9 h-9 rounded-xl border ${bg} flex items-center justify-center mx-auto mb-2`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Your Assets</h2>
              <div className="flex gap-1 flex-wrap">
                {['all','deployed','in_stock','maintenance','ordered'].map(s => (
                  <button key={s} onClick={() => setDeviceFilter(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${deviceFilter === s ? 'bg-amber-500 text-white border-amber-500' : 'text-slate-500 border-slate-200 hover:border-amber-300'}`}>
                    {s === 'all' ? 'All' : lbl(s)}
                  </button>
                ))}
              </div>
            </div>

            {filteredDevices.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <Monitor className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">{!customer ? 'No devices linked to your account' : 'No devices found'}</p>
                <p className="text-slate-400 text-sm mt-1">{!customer ? 'Contact your MSP to associate your devices.' : `No ${deviceFilter.replace(/_/g,' ')} devices.`}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDevices.map(device => {
                  const warrantyDays = device.warranty_expiry ? Math.ceil((new Date(device.warranty_expiry) - new Date()) / 86400000) : null
                  const warnExpired  = warrantyDays !== null && warrantyDays < 0
                  const warnExpiring = warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30
                  const STATUS_BG = { deployed: 'bg-blue-100 text-blue-700', in_stock: 'bg-emerald-100 text-emerald-700', maintenance: 'bg-orange-100 text-orange-700', ordered: 'bg-amber-100 text-amber-700', retired: 'bg-slate-100 text-slate-500' }
                  return (
                    <div key={device.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                        <HardDrive className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white text-sm">{device.name}</p>
                            {(device.vendor || device.model) && <p className="text-xs text-slate-400 mt-0.5">{[device.vendor, device.model].filter(Boolean).join(' · ')}</p>}
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BG[device.status] || 'bg-slate-100 text-slate-500'}`}>{lbl(device.status)}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {device.serial_number && <span className="text-[11px] text-slate-400 font-mono">S/N: {device.serial_number}</span>}
                          {device.location      && <span className="text-[11px] text-slate-400">📍 {device.location}</span>}
                          {device.warranty_expiry && (
                            <span className={`text-[11px] font-medium flex items-center gap-1 ${warnExpired ? 'text-rose-600' : warnExpiring ? 'text-amber-600' : 'text-slate-400'}`}>
                              {(warnExpired || warnExpiring) && <AlertTriangle className="w-3 h-3" />}
                              Warranty: {warnExpired ? 'Expired' : warnExpiring ? `${warrantyDays}d left` : fmtDate(device.warranty_expiry)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES TAB ───────────────────────────────────────── */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Your Invoices</h2>
            {invoices.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No invoices yet</p>
                <p className="text-slate-400 text-sm mt-1">Invoices from your MSP will appear here.</p>
              </div>
            ) : invoices.map(inv => {
              const overdue  = inv.status === 'overdue'
              const paid     = inv.status === 'paid'
              const unpaid   = ['sent','overdue','partial'].includes(inv.status)
              const balance  = Math.max(0, (inv.total || 0) - (inv.amount_paid || 0))
              return (
                <div key={inv.id} className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm p-4 flex items-center justify-between gap-4 ${overdue ? 'border-rose-300' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${overdue ? 'bg-rose-100' : paid ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      {overdue ? <AlertCircle className="w-4 h-4 text-rose-600" /> : paid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <CreditCard className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">
                        {inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice'}
                        {inv.due_date && <span className="font-normal text-slate-400 ml-2 text-xs">Due {fmtDate(inv.due_date)}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${overdue ? 'bg-rose-100 text-rose-700' : paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lbl(inv.status)}</span>
                        {inv.issue_date && <span className="text-xs text-slate-400">Issued {fmtDate(inv.issue_date)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">${(inv.total ?? 0).toFixed(2)}</p>
                      {unpaid && balance < (inv.total || 0) && <p className="text-xs text-slate-400">Balance: ${balance.toFixed(2)}</p>}
                    </div>
                    {unpaid && inv.stripe_payment_url && (
                      <a href={inv.stripe_payment_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Pay Now <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {unpaid && !inv.stripe_payment_url && <span className="text-xs text-slate-400 italic">Contact support</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── KNOWLEDGE BASE TAB ─────────────────────────────────── */}
        {activeTab === 'kb' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={kbSearch} onChange={e => setKbSearch(e.target.value)}
                placeholder="Search knowledge base..." className={`${inp} pl-9`} />
            </div>
            {filteredKb.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">{kbSearch ? 'No articles found' : 'No articles published yet'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredKb.map(article => (
                  <button key={article.id} onClick={() => setKbArticle(article)}
                    className="w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-300 transition-all p-4 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-amber-600 transition-colors">{article.title}</p>
                        {article.content && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{article.content}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 capitalize">{article.category}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MY PLAN TAB ─────────────────────────────────────────────── */}
        {activeTab === 'plan' && plan && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border-2 border-amber-200 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Your Current Plan</p>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{plan.plan_name}</h2>
                  {plan.msp_plans?.description && (
                    <p className="text-sm text-slate-500 mt-1">{plan.msp_plans.description}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    ${Number(plan.plan_price || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {plan.msp_plans?.billing_cycle === 'monthly' ? 'per month' :
                     plan.msp_plans?.billing_cycle === 'yearly'  ? 'per year'  :
                     plan.msp_plans?.billing_cycle === 'weekly'  ? 'per week'  : 'one-time'}
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-4">
                Active since {plan.start_date ? new Date(plan.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                {plan.notes && <span className="ml-2">· {plan.notes}</span>}
              </div>
              {plan.msp_plans?.features?.length > 0 && (
                <>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">What's Included</p>
                    <ul className="space-y-2">
                      {plan.msp_plans.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2.5 text-sm text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400 text-center">Questions about your plan? <button onClick={() => { setShowForm(true); setActiveTab('tickets') }} className="text-amber-600 hover:underline">Submit a support ticket</button></p>
          </div>
        )}

        {/* ── STATUS TAB ──────────────────────────────────────────────── */}
        {activeTab === 'monitoring' && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Service Status</h2>
            {portalMonitors.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No monitors configured</p>
              </div>
            ) : portalMonitors.map(m => (
              <div key={m.id} className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${m.last_status === 'down' ? 'border-rose-300' : 'border-slate-200'}`}>
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${m.last_status === 'up' ? 'bg-emerald-500' : m.last_status === 'down' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{m.name}</p>
                  <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-amber-500 flex items-center gap-1 truncate">
                    <Globe className="w-3 h-3 flex-shrink-0" />{m.url}
                  </a>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    m.last_status === 'up'   ? 'bg-emerald-100 text-emerald-700' :
                    m.last_status === 'down' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-500'}`}>
                    {m.last_status ? m.last_status.toUpperCase() : 'Pending'}
                  </span>
                  {m.last_response_ms && <p className="text-[11px] text-slate-400 mt-1">{m.last_response_ms}ms</p>}
                </div>
              </div>
            ))}
            {portalMonitors.some(m => m.last_status === 'down') && (
              <p className="text-xs text-slate-400 text-center">An issue detected? <button onClick={() => { setShowForm(true); setActiveTab('tickets') }} className="text-amber-600 hover:underline">Submit a support ticket</button></p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}