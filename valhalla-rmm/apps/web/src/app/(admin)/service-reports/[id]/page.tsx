// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  ArrowLeft, Printer, Send, Trash2, Mail, Calendar,
  Building2, CheckCircle2, Loader2, X, FileText,
  Ticket, Clock, Activity,
} from 'lucide-react'

function fmt(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function fmtLong(d) {
  if (!d) return '—'
  try { return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

function fmtPeriod(start, end) {
  if (!start || !end) return '—'
  try {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === 1) {
      return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
  } catch { return `${start} – ${end}` }
}

function fmtHrs(mins) {
  if (mins == null) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtResponseTime(mins) {
  if (mins == null) return '—'
  if (mins < 60)   return Math.round(mins) + ' min'
  if (mins < 1440) return (mins / 60).toFixed(1) + ' hr'
  return (mins / 1440).toFixed(1) + ' days'
}

// ── Send Dialog ─────────────────────────────────────────────────────────────
function SendReportDialog({ report, customerEmail, onClose, onSent }) {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail]   = useState(customerEmail || '')
  const [sending, setSending] = useState(false)
  const [sent, setSent]     = useState(false)
  const [err, setErr]       = useState(null)

  const handleSend = async () => {
    if (!email.trim()) { setErr('Email is required'); return }
    setSending(true); setErr(null)

    const { error } = await supabase.functions.invoke('send-service-report', {
      body: { report_id: report.id, to: email.trim() },
    })

    if (error) {
      setErr('Send failed: ' + error.message)
      setSending(false)
      return
    }

    setSending(false)
    setSent(true)
    setTimeout(() => { onSent(); onClose() }, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Send Service Report</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-900 dark:text-white">Report sent!</p>
            <p className="text-sm text-slate-500 mt-1">Emailed to {email}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-sm space-y-1">
              <div className="text-slate-600 dark:text-slate-400"><strong>{report.title}</strong></div>
              <div className="text-xs text-slate-500">{report.customer_name} · {fmtPeriod(report.period_start, report.period_end)}</div>
            </div>
            {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Send To *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
                placeholder="client@company.com"
                className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSend} disabled={!email.trim() || sending}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ServiceReportDetailPage() {
  const params       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createSupabaseBrowserClient()

  const [report,        setReport]        = useState(null)
  const [org,           setOrg]           = useState(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [loading,       setLoading]       = useState(true)
  const [sendOpen,      setSendOpen]      = useState(false)
  const [deleting,      setDeleting]      = useState(false)

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

      const { data: rpt } = await supabase
        .from('service_reports')
        .select('*')
        .eq('id', params.id)
        .single()
      setReport(rpt)

      // Get org branding — select all so we don't fail on missing columns
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', member.organization_id)
        .single()
      setOrg(orgData)

      // Get customer contact email for prefill
      if (rpt?.customer_id) {
        const { data: cust } = await supabase
          .from('customers')
          .select('contact_email')
          .eq('id', rpt.customer_id)
          .single()
        setCustomerEmail(cust?.contact_email || '')
      }

      setLoading(false)

      // If ?send=1, auto-open the send dialog
      if (searchParams.get('send') === '1' && rpt) {
        setTimeout(() => setSendOpen(true), 200)
      }
    }
    init()
  }, [params.id])

  const handleDelete = async () => {
    if (!confirm(`Delete "${report.title}"? This cannot be undone.`)) return
    setDeleting(true)
    const { error } = await supabase.from('service_reports').delete().eq('id', report.id)
    if (error) {
      alert('Delete failed: ' + error.message)
      setDeleting(false)
      return
    }
    router.push('/service-reports')
  }

  const handlePrint = () => window.print()

  if (loading) return (
    <div className="max-w-4xl space-y-4 animate-pulse">
      <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
      <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl" />
    </div>
  )

  if (!report) return (
    <div className="text-center py-20 text-slate-400">
      <p className="text-lg font-medium mb-2">Report not found</p>
      <button onClick={() => router.push('/service-reports')} className="text-amber-500 hover:underline text-sm">← Back to Reports</button>
    </div>
  )

  const data = report.report_data || {}
  const tickets    = data.tickets || []
  const timeEntries = data.time_entries || []
  const accent  = org?.brand_color || '#f59e0b'
  const orgName = org?.name || 'Valhalla IT'
  const orgEmail = org?.email || org?.contact_email || ''

  // Recalculate from snapshot so old saved reports show correct counts
  // (the original save logic undercounted resolved tickets)
  const ticketsResolvedDisplay = tickets.filter(t =>
    ['resolved', 'closed'].includes(t.status)
  ).length

  const ticketsOpenedDisplay = data.tickets_opened ?? tickets.length

  return (
    <>
      {/* Print styles — hide everything except .printable */}
      <style jsx global>{`
        @media print {
          @page { margin: 0.5in; }
          body * { visibility: hidden; }
          .printable, .printable * { visibility: visible; }
          .printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-4xl space-y-5">

        {/* Top action bar — hidden when printing */}
        <div className="no-print space-y-3">
          <button onClick={() => router.push('/service-reports')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Reports
          </button>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                report.status === 'sent'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {report.status === 'sent' ? 'Sent' : 'Draft'}
              </span>
              {report.sent_at && (
                <span className="text-xs text-slate-500">
                  Sent to {report.sent_to} on {fmt(report.sent_at)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Printer className="w-4 h-4" /> Download as PDF
              </button>
              <button onClick={() => setSendOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">
                <Send className="w-4 h-4" /> {report.status === 'sent' ? 'Send Again' : 'Send to Client'}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors disabled:opacity-50">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-400 italic px-1">
            Tip: "Download as PDF" opens your browser's print dialog. Choose <strong>Save as PDF</strong> as the destination.
          </div>
        </div>

        {/* The Report — printable */}
        <div className="printable bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none">

          {/* Header */}
          <div className="px-8 py-8 border-b-4" style={{ borderBottomColor: accent }}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: accent }}>
                  Service Summary
                </p>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white print:text-black">
                  {report.title}
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  Prepared for <strong className="text-slate-700 dark:text-slate-300 print:text-black">{report.customer_name}</strong>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 dark:text-white print:text-black">{orgName}</p>
                {orgEmail && <p className="text-xs text-slate-500 mt-0.5">{orgEmail}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  Report generated {fmt(report.created_at)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Period Covered
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 print:text-black mt-0.5">
                  {fmtPeriod(report.period_start, report.period_end)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Client
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 print:text-black mt-0.5">
                  {report.customer_name}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-8 space-y-8">

            {/* Intro */}
            {report.intro_message && (
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300 print:text-black leading-relaxed whitespace-pre-wrap">
                  {report.intro_message}
                </p>
              </div>
            )}

            {/* At a glance */}
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                At a Glance
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Tickets Resolved', value: ticketsResolvedDisplay,                  icon: CheckCircle2 },
                  { label: 'Tickets Opened',   value: ticketsOpenedDisplay,                    icon: Ticket       },
                  { label: 'Total Hours',      value: fmtHrs(data.total_minutes),              icon: Clock        },
                  { label: 'Avg Response',     value: fmtResponseTime(data.avg_response_min),  icon: Activity     },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center print:border-slate-300">
                    <s.icon className="w-5 h-5 mx-auto mb-2" style={{ color: accent }} />
                    <p className="text-2xl font-bold text-slate-900 dark:text-white print:text-black">{s.value}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket detail */}
            {tickets.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Work Performed ({tickets.length} ticket{tickets.length === 1 ? '' : 's'})
                </h2>
                <div className="space-y-3">
                  {tickets.map((t, idx) => (
                    <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 print:border-slate-300 print:break-inside-avoid">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white print:text-black">{t.title}</h3>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                              {(t.status || 'open').replace('_', ' ')}
                            </span>
                            {t.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-500 capitalize">
                                {t.category}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 print:text-slate-700 leading-relaxed mb-2 line-clamp-3">
                              {t.description}
                            </p>
                          )}
                          {t.resolution_notes && (
                            <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-md print:bg-white print:border-emerald-300">
                              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1">Resolution</p>
                              <p className="text-xs text-emerald-900 dark:text-emerald-300 print:text-emerald-900">{t.resolution_notes}</p>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs space-y-0.5">
                          <p className="text-slate-400">Opened</p>
                          <p className="text-slate-700 dark:text-slate-300 print:text-black font-medium">{fmt(t.created_at)}</p>
                          {t.resolved_at && (
                            <>
                              <p className="text-slate-400 mt-1">Resolved</p>
                              <p className="text-slate-700 dark:text-slate-300 print:text-black font-medium">{fmt(t.resolved_at)}</p>
                            </>
                          )}
                          {(t.time_spent_minutes || 0) > 0 && (
                            <>
                              <p className="text-slate-400 mt-1">Time Spent</p>
                              <p className="font-semibold" style={{ color: accent }}>{fmtHrs(t.time_spent_minutes)}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tickets.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">
                No ticket activity recorded for this period.
              </div>
            )}

            {/* Footer */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-700 print:border-slate-300">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Thank you for trusting <strong className="text-slate-700 dark:text-slate-300 print:text-black">{orgName}</strong> with your IT needs.<br />
                If you have any questions about this report, please reach out{orgEmail ? ` at ${orgEmail}` : ''}.
              </p>
            </div>
          </div>
        </div>
      </div>

      {sendOpen && (
        <SendReportDialog
          report={report}
          customerEmail={customerEmail}
          onClose={() => setSendOpen(false)}
          onSent={async () => {
            const { data } = await supabase.from('service_reports').select('*').eq('id', report.id).single()
            if (data) setReport(data)
          }}
        />
      )}
    </>
  )
}