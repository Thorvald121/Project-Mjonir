// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const payload   = await req.json()
    const ticket    = payload.record
    const oldTicket = payload.old_record

    // Only fire when status changes TO resolved or closed
    if (!['resolved','closed'].includes(ticket?.status)) return ok('skipped: not resolved')
    if (oldTicket?.status === ticket?.status)             return ok('skipped: status unchanged')
    if (!ticket?.contact_email)                           return ok('skipped: no contact email')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL        = Deno.env.get('APP_URL') || 'https://project-mjonir.vercel.app'

    // Check if survey already sent for this ticket
    const { data: existing } = await supabase.from('csat_responses')
      .select('id').eq('ticket_id', ticket.id).limit(1)
    if (existing?.length > 0) return ok('skipped: already responded')

    // Get org name
    const { data: org } = await supabase.from('organizations')
      .select('name').eq('id', ticket.organization_id).single()

    // Build token — base64url encoded JSON
    const tokenData = {
      ticketId:     ticket.id,
      ticketTitle:  ticket.title,
      orgId:        ticket.organization_id,
      orgName:      org?.name || 'Support Team',
      customerName: ticket.customer_name || '',
      contactEmail: ticket.contact_email,
    }
    const token = btoa(JSON.stringify(tokenData))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    const surveyUrl = `${APP_URL}/csat?token=${token}`

    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;">
    <h2 style="color:#f59e0b;margin:0;font-size:16px;">${org?.name || 'Support Team'}</h2>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">How did we do?</p>
  </div>
  <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#1e293b;font-size:14px;margin:0 0 8px;">Hi ${ticket.contact_name || 'there'},</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;">Your support ticket <strong style="color:#1e293b;">${ticket.title}</strong> has been resolved. We'd love to hear how we did!</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${surveyUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">
        ⭐ Rate Your Experience
      </a>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Takes less than 30 seconds. Your feedback helps us improve.</p>
  </div>
</div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `${org?.name || 'Support Team'} <support@valhalla-rmm.com>`,
        to:      [ticket.contact_email],
        subject: `How did we do? — ${ticket.title}`,
        html,
      }),
    })

    const result = await res.json()
    if (!res.ok) {
      console.error('Resend error:', JSON.stringify(result))
      return ok(`email failed: ${result.message}`)
    }

    console.log('CSAT survey sent to:', ticket.contact_email, 'for ticket:', ticket.id)
    return ok('sent')
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}