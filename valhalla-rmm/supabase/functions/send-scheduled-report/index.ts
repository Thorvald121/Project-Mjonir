// @ts-nocheck
// Generates and emails a report for a scheduled_report config.
// Called by pg_cron daily — skips reports not due yet based on frequency.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')

    // Allow manual trigger with a specific report id
    let body = {}
    try { body = await req.json() } catch {}
    const specificId = body.report_id || null

    // Fetch due reports
    const query = supabase.from('scheduled_reports')
      .select('*, organizations(name, company_email)')
      .eq('is_active', true)
    if (specificId) query.eq('id', specificId)
    const { data: reports } = await query

    if (!reports?.length) return ok('no reports due')

    const now    = new Date()
    const due    = specificId
      ? reports
      : reports.filter(r => {
          if (!r.last_sent_at) return true
          const last = new Date(r.last_sent_at)
          if (r.frequency === 'weekly')  return (now - last) >= 7  * 86400000
          if (r.frequency === 'monthly') return (now - last) >= 28 * 86400000
          return false
        })

    const results = await Promise.allSettled(due.map(r => sendReport(r, supabase, RESEND_KEY)))
    const sent = results.filter(r => r.status === 'fulfilled').length
    console.log(`Sent ${sent}/${due.length} reports`)
    return ok(`sent ${sent} reports`)
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function sendReport(report, supabase, resendKey) {
  const org     = report.organizations
  const orgName = org?.name || 'Valhalla RMM'
  const orgId   = report.organization_id

  // Date range
  const now   = new Date()
  const days  = report.frequency === 'weekly' ? 7 : 30
  const start = new Date(now.getTime() - days * 86400000)
  const startIso = start.toISOString()

  // Fetch data for the period
  const [tickets, invoices, timeEntries, monitors] = await Promise.all([
    supabase.from('tickets')
      .select('id,title,status,priority,assigned_to,customer_name,created_at,sla_due_date,first_response_at')
      .eq('organization_id', orgId)
      .gte('created_at', startIso),
    supabase.from('invoices')
      .select('id,invoice_number,customer_name,total,status,amount_paid,issue_date')
      .eq('organization_id', orgId)
      .gte('issue_date', startIso),
    supabase.from('time_entries')
      .select('id,minutes,billable,technician,customer_name,date')
      .eq('organization_id', orgId)
      .gte('date', start.toISOString().slice(0,10)),
    supabase.from('monitors')
      .select('id,name,url,last_status,last_response_ms,ssl_expiry_date')
      .eq('organization_id', orgId),
  ])

  const t  = tickets.data     ?? []
  const inv = invoices.data   ?? []
  const te  = timeEntries.data ?? []
  const mon = monitors.data   ?? []

  // Compute stats
  const openTickets     = t.filter(x => !['resolved','closed'].includes(x.status))
  const resolvedTickets = t.filter(x => ['resolved','closed'].includes(x.status))
  const criticalOpen    = openTickets.filter(x => x.priority === 'critical')
  const slaBreached     = openTickets.filter(x => x.sla_due_date && new Date(x.sla_due_date) < now)
  const totalBillable   = te.filter(x => x.billable).reduce((s, x) => s + (x.minutes || 0), 0)
  const totalRevenue    = inv.filter(x => x.status === 'paid').reduce((s, x) => s + (x.total || 0), 0)
  const outstanding     = inv.filter(x => ['sent','overdue','partial'].includes(x.status))
    .reduce((s, x) => s + Math.max(0, (x.total || 0) - (x.amount_paid || 0)), 0)
  const downsites       = mon.filter(x => x.last_status === 'down')

  // FRT average
  const frtTickets = t.filter(x => x.first_response_at && x.created_at)
  const avgFrtMins = frtTickets.length
    ? Math.round(frtTickets.reduce((s, x) => s + (new Date(x.first_response_at) - new Date(x.created_at)) / 60000, 0) / frtTickets.length)
    : null

  const fmtCur  = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtHrs  = (m) => `${(m / 60).toFixed(1)}h`
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const fmtMins = (m) => m < 60 ? `${m}m` : `${Math.round(m/60)}h ${m%60 > 0 ? m%60+'m' : ''}`.trim()
  const label   = report.frequency === 'weekly' ? 'Weekly' : 'Monthly'
  const period  = `${fmtDate(startIso)} – ${fmtDate(now.toISOString())}`

  // Build ticket rows (top 10 open by priority)
  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
  const topTickets = [...openTickets]
    .sort((a,b) => (PRIORITY_ORDER[a.priority]??3) - (PRIORITY_ORDER[b.priority]??3))
    .slice(0, 10)

  const ticketRows = topTickets.map(x => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;max-width:220px;">${x.title || '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${x.customer_name || '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">
        <span style="background:${x.priority==='critical'?'#fee2e2':x.priority==='high'?'#ffedd5':x.priority==='medium'?'#fef9c3':'#dcfce7'};
          color:${x.priority==='critical'?'#991b1b':x.priority==='high'?'#9a3412':x.priority==='medium'?'#854d0e':'#166534'};
          padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${x.priority}</span>
      </td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${fmtDate(x.created_at)}</td>
    </tr>`).join('')

  // Monitor rows
  const monitorRows = mon.map(x => {
    const sslDays = x.ssl_expiry_date ? Math.ceil((new Date(x.ssl_expiry_date) - now) / 86400000) : null
    return `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${x.name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">
        <span style="background:${x.last_status==='up'?'#dcfce7':'#fee2e2'};color:${x.last_status==='up'?'#166534':'#991b1b'};
          padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${(x.last_status||'pending').toUpperCase()}</span>
      </td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${x.last_response_ms ? x.last_response_ms+'ms' : '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;${sslDays!==null&&sslDays<=30?'color:#dc2626;font-weight:600;':'color:#64748b;'}">
        ${sslDays !== null ? (sslDays <= 0 ? 'EXPIRED' : `${sslDays}d`) : '—'}
      </td>
    </tr>`}).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${label} Report — ${orgName}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

  <!-- Header -->
  <div style="background:#0f172a;padding:24px 32px;border-bottom:4px solid #f59e0b;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <h1 style="color:#f59e0b;margin:0;font-size:20px;font-weight:700;">${orgName}</h1>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">${label} Report — ${period}</p>
      </div>
      <div style="text-align:right;">
        <p style="color:#64748b;font-size:11px;margin:0;">Generated ${fmtDate(now.toISOString())}</p>
      </div>
    </div>
  </div>

  <!-- KPI Grid -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid #f1f5f9;">
    ${[
      { label: 'Tickets Created',  value: t.length,                    color: '#3b82f6' },
      { label: 'Resolved',         value: resolvedTickets.length,      color: '#10b981' },
      { label: 'Still Open',       value: openTickets.length,          color: openTickets.length > 5 ? '#ef4444' : '#f59e0b' },
      { label: 'SLA Breaches',     value: slaBreached.length,          color: slaBreached.length > 0 ? '#ef4444' : '#10b981' },
      { label: 'Billable Hours',   value: fmtHrs(totalBillable),       color: '#8b5cf6' },
      { label: 'Revenue Collected',value: fmtCur(totalRevenue),        color: '#10b981' },
    ].map(k => `
      <div style="padding:20px;border-right:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;text-align:center;">
        <p style="font-size:22px;font-weight:700;color:${k.color};margin:0;">${k.value}</p>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.05em;">${k.label}</p>
      </div>`).join('')}
  </div>

  <div style="padding:24px 32px;">

    ${avgFrtMins !== null ? `
    <!-- FRT + Outstanding -->
    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px;display:flex;gap:16px;">
      <div style="flex:1;text-align:center;">
        <p style="font-size:18px;font-weight:700;color:#3b82f6;margin:0;">${fmtMins(avgFrtMins)}</p>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;text-transform:uppercase;">Avg First Response</p>
      </div>
      <div style="width:1px;background:#e2e8f0;"></div>
      <div style="flex:1;text-align:center;">
        <p style="font-size:18px;font-weight:700;color:${outstanding>0?'#ef4444':'#10b981'};margin:0;">${fmtCur(outstanding)}</p>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;text-transform:uppercase;">Outstanding Balance</p>
      </div>
      ${criticalOpen.length > 0 ? `
      <div style="width:1px;background:#e2e8f0;"></div>
      <div style="flex:1;text-align:center;">
        <p style="font-size:18px;font-weight:700;color:#ef4444;margin:0;">${criticalOpen.length}</p>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;text-transform:uppercase;">Critical Open</p>
      </div>` : ''}
    </div>` : ''}

    ${topTickets.length > 0 ? `
    <!-- Open Tickets -->
    <h2 style="font-size:14px;font-weight:600;color:#1e293b;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f1f5f9;">
      Open Tickets (${openTickets.length} total)
    </h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Title</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Customer</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Priority</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Created</th>
        </tr>
      </thead>
      <tbody>${ticketRows}</tbody>
    </table>` : `<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0;">No open tickets — great work!</p>`}

    ${mon.length > 0 ? `
    <!-- Monitors -->
    <h2 style="font-size:14px;font-weight:600;color:#1e293b;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f1f5f9;">
      Service Status (${downsites.length > 0 ? `<span style="color:#ef4444;">${downsites.length} down</span>` : 'all up'})
    </h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Monitor</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Status</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Response</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">SSL Expiry</th>
        </tr>
      </thead>
      <tbody>${monitorRows}</tbody>
    </table>` : ''}

  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">
      This report was automatically generated by ${orgName} · Powered by Valhalla RMM
    </p>
  </div>
</div>
</body></html>`

  // Send email
  const recipients = Array.isArray(report.recipients) ? report.recipients : [report.recipients]
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:    `${orgName} <support@valhalla-rmm.com>`,
      to:      recipients,
      subject: `${orgName} — ${label} Report (${fmtDate(startIso)} – ${fmtDate(now.toISOString())})`,
      html,
    }),
  })

  // Update last_sent_at
  await supabase.from('scheduled_reports').update({ last_sent_at: now.toISOString() }).eq('id', report.id)
  console.log(`Sent report ${report.id} to ${recipients.join(', ')}`)
}

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}