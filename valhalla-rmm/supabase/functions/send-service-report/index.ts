// Supabase Edge Function: send-service-report
// Deploy: supabase functions deploy send-service-report --project-ref yetrdrgagfovphrerpie
// Sends a branded HTML email summary of a service report to the client

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'support@valhalla-rmm.com'
const APP_URL        = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://valhalla-rmm.com'

// ── CORS headers — required on EVERY response, including preflight ───────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age':       '86400',
}

function fmtHrs(mins: number | null | undefined) {
  if (!mins) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtResponseTime(mins: number | null | undefined) {
  if (mins == null) return '—'
  if (mins < 60)   return Math.round(mins) + ' min'
  if (mins < 1440) return (mins / 60).toFixed(1) + ' hr'
  return (mins / 1440).toFixed(1) + ' days'
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try {
    const date = new Date(d.includes('T') ? d : d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

function fmtPeriod(start: string, end: string) {
  try {
    const s = new Date(start + 'T00:00:00')
    const e = new Date(end + 'T00:00:00')
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === 1) {
      return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    return `${s.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
  } catch { return `${start} – ${end}` }
}

// JSON response with CORS attached
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────
  // Browsers send OPTIONS before POST cross-origin. MUST return 204 with
  // full CORS headers, no body, no Content-Type issues.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { report_id, to } = await req.json()
    if (!report_id || !to) {
      return jsonResponse({ error: 'report_id and to are required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: report, error: rErr } = await supabase
      .from('service_reports')
      .select('*')
      .eq('id', report_id)
      .single()

    if (rErr || !report) {
      return jsonResponse({ error: 'Report not found' }, 404)
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', report.organization_id)
      .single()

    const orgName  = org?.name  || 'Valhalla IT'
    const orgEmail = org?.email || org?.contact_email || ''
    const accent   = org?.brand_color || '#f59e0b'

    const data = report.report_data || {}
    const tickets: any[] = data.tickets || []

    // Recalculate resolved count from saved tickets so old reports show
    // correct numbers in the email even if the snapshot stored 0
    const ticketsResolvedDisplay = tickets.filter(t =>
      ['resolved', 'closed'].includes(t.status)
    ).length
    const ticketsOpenedDisplay = data.tickets_opened ?? tickets.length

    const ticketRowsHtml = tickets.map((t, idx) => `
      <tr>
        <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px;">
            #${idx + 1} &nbsp; ${t.title || 'Untitled'}
          </div>
          ${t.description ? `<div style="font-size:12px;color:#64748b;line-height:1.5;margin-bottom:6px;">${String(t.description).slice(0, 240)}${t.description.length > 240 ? '…' : ''}</div>` : ''}
          ${t.resolution_notes ? `
          <div style="margin-top:6px;padding:8px 10px;background:#ecfdf5;border-left:3px solid #10b981;border-radius:4px;">
            <div style="font-size:10px;font-weight:700;color:#047857;text-transform:uppercase;letter-spacing:.05em;">Resolution</div>
            <div style="font-size:12px;color:#065f46;margin-top:2px;">${t.resolution_notes}</div>
          </div>` : ''}
          <div style="font-size:11px;color:#94a3b8;margin-top:6px;">
            <span style="background:#f1f5f9;padding:2px 8px;border-radius:10px;text-transform:capitalize;">${(t.status || 'open').replace('_', ' ')}</span>
            ${t.category ? `&nbsp; · &nbsp; <span style="text-transform:capitalize;">${t.category}</span>` : ''}
          </div>
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap;">
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">Opened</div>
          <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;">${fmtDate(t.created_at)}</div>
          ${t.resolved_at ? `
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">Resolved</div>
            <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;">${fmtDate(t.resolved_at)}</div>
          ` : ''}
          ${t.time_spent_minutes ? `
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">Time</div>
            <div style="font-size:13px;font-weight:700;color:${accent};">${fmtHrs(t.time_spent_minutes)}</div>
          ` : ''}
        </td>
      </tr>
    `).join('')

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <tr>
          <td style="padding:32px 32px 28px;border-bottom:4px solid ${accent};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px;">Service Summary</div>
                  <div style="font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${report.title}</div>
                  <div style="font-size:13px;color:#64748b;margin-top:8px;">Prepared for <strong style="color:#334155;">${report.customer_name}</strong></div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">${orgName}</div>
                  ${orgEmail ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${orgEmail}</div>` : ''}
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;">
              <tr>
                <td style="width:50%;">
                  <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Period Covered</div>
                  <div style="font-size:14px;font-weight:600;color:#334155;margin-top:2px;">${fmtPeriod(report.period_start, report.period_end)}</div>
                </td>
                <td style="width:50%;">
                  <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Client</div>
                  <div style="font-size:14px;font-weight:600;color:#334155;margin-top:2px;">${report.customer_name}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${report.intro_message ? `
        <tr>
          <td style="padding:24px 32px 8px;">
            <div style="font-size:14px;color:#475569;line-height:1.6;white-space:pre-wrap;">${report.intro_message}</div>
          </td>
        </tr>` : ''}

        <tr>
          <td style="padding:24px 32px 8px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:16px;">At a Glance</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${[
                  { label: 'Tickets Resolved', value: ticketsResolvedDisplay },
                  { label: 'Tickets Opened',   value: ticketsOpenedDisplay },
                  { label: 'Total Hours',      value: fmtHrs(data.total_minutes) },
                  { label: 'Avg Response',     value: fmtResponseTime(data.avg_response_min) },
                ].map(s => `
                  <td style="width:25%;padding:0 4px;">
                    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 8px;text-align:center;">
                      <div style="font-size:22px;font-weight:700;color:#0f172a;line-height:1.1;">${s.value}</div>
                      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-top:4px;">${s.label}</div>
                    </div>
                  </td>
                `).join('')}
              </tr>
            </table>
          </td>
        </tr>

        ${tickets.length > 0 ? `
        <tr>
          <td style="padding:28px 32px 16px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:14px;">
              Work Performed (${tickets.length} ticket${tickets.length === 1 ? '' : 's'})
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              ${ticketRowsHtml}
            </table>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:28px 32px;text-align:center;color:#94a3b8;font-size:13px;">
            No ticket activity recorded for this period.
          </td>
        </tr>`}

        <tr>
          <td style="padding:28px 32px 32px;border-top:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:12px;color:#94a3b8;line-height:1.6;">
              Thank you for trusting <strong style="color:#475569;">${orgName}</strong> with your IT needs.<br />
              ${orgEmail ? `Questions? Reply to this email or contact us at <a href="mailto:${orgEmail}" style="color:${accent};text-decoration:none;">${orgEmail}</a>.` : 'Questions? Reply to this email.'}
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    const subject = `${orgName} — Service Summary: ${fmtPeriod(report.period_start, report.period_end)}`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${orgName} <${FROM_EMAIL}>`,
        to:      [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('Resend error:', body)
      return jsonResponse({ error: 'Email send failed', detail: body }, 500)
    }

    await supabase
      .from('service_reports')
      .update({
        status:  'sent',
        sent_to: to,
        sent_at: new Date().toISOString(),
      })
      .eq('id', report_id)

    return jsonResponse({ success: true })

  } catch (err) {
    console.error('send-service-report error:', err)
    return jsonResponse({ error: String(err) }, 500)
  }
})