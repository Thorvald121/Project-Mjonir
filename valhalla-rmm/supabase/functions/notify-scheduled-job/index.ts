// Supabase Edge Function: notify-scheduled-job
// Deploy: supabase functions deploy notify-scheduled-job
// Triggered from ScheduleJobModal after creating a new job with notify_client=true

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'support@valhalla-rmm.com'
const APP_URL        = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://valhalla-rmm.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { job_id } = await req.json()
    if (!job_id) return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch the job
    const { data: job, error: jobErr } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 })
    }

    if (!job.notify_client || !job.customer_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'notify_client=false or no customer' }), { status: 200 })
    }

    // Fetch customer contact email
    const { data: customer } = await supabase
      .from('customers')
      .select('name, email, contact_name')
      .eq('id', job.customer_id)
      .single()

    if (!customer?.email) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No customer email on file' }), { status: 200 })
    }

    // Format dates nicely
    const startDate  = new Date(job.scheduled_start)
    const endDate    = new Date(job.scheduled_end)
    const dateStr    = startDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const startTime  = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const endTime    = endDate.toLocaleTimeString('en-US',   { hour: 'numeric', minute: '2-digit' })

    const jobTypeLabel = {
      on_site:  'On-Site Visit',
      remote:   'Remote Session',
      phone:    'Phone Call',
      meeting:  'Meeting',
    }[job.job_type] || 'Appointment'

    const techName = job.assigned_name || job.assigned_to || 'Your Valhalla IT technician'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:32px;text-align:center;">
            <div style="display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:12px;padding:12px 24px;">
              <span style="color:#f59e0b;font-size:20px;font-weight:700;letter-spacing:-0.5px;">⚡ Valhalla IT</span>
            </div>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;overflow:hidden;">

            <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
              Appointment Confirmation
            </p>
            <h1 style="margin:0 0 24px;color:#f1f5f9;font-size:24px;font-weight:700;line-height:1.3;">
              ${job.title}
            </h1>

            <!-- Details grid -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #334155;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Type</span><br/>
                  <span style="color:#e2e8f0;font-size:15px;font-weight:500;margin-top:4px;display:block;">${jobTypeLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #334155;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Date</span><br/>
                  <span style="color:#e2e8f0;font-size:15px;font-weight:500;margin-top:4px;display:block;">${dateStr}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #334155;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Time</span><br/>
                  <span style="color:#e2e8f0;font-size:15px;font-weight:500;margin-top:4px;display:block;">${startTime} – ${endTime}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #334155;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Technician</span><br/>
                  <span style="color:#e2e8f0;font-size:15px;font-weight:500;margin-top:4px;display:block;">${techName}</span>
                </td>
              </tr>
              ${job.location ? `
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #334155;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Location</span><br/>
                  <span style="color:#e2e8f0;font-size:15px;font-weight:500;margin-top:4px;display:block;">${job.location}</span>
                </td>
              </tr>` : ''}
              ${job.description ? `
              <tr>
                <td style="padding:12px 0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Details</span><br/>
                  <span style="color:#cbd5e1;font-size:14px;margin-top:4px;display:block;line-height:1.6;">${job.description}</span>
                </td>
              </tr>` : ''}
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin-top:8px;">
              <a href="${APP_URL}/portal" style="display:inline-block;background:#f59e0b;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                View in Client Portal →
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:24px;text-align:center;">
            <p style="margin:0;color:#475569;font-size:12px;">
              Questions? Reply to this email or call your Valhalla IT support line.<br/>
              <a href="${APP_URL}/portal" style="color:#64748b;">Valhalla IT Client Portal</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    // Send via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    `Valhalla IT <${FROM_EMAIL}>`,
        to:      [customer.email],
        subject: `Appointment Confirmed: ${job.title} on ${dateStr}`,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('Resend error:', body)
      return new Response(JSON.stringify({ error: 'Email send failed', detail: body }), { status: 500 })
    }

    // Mark client_notified
    await supabase
      .from('scheduled_jobs')
      .update({ client_notified: true })
      .eq('id', job_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notify-scheduled-job error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})