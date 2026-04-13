// @ts-nocheck
// Fires on ticket_comments INSERT where is_staff = false
// Emails the assigned technician when a client adds a comment
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const payload = await req.json()
    const comment = payload.record
    if (!comment || comment.is_staff === true) return ok('skipped: staff comment')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL    = Deno.env.get('APP_URL') || 'https://project-mjonir.vercel.app'

    // Get ticket + org
    const { data: ticket } = await supabase.from('tickets')
      .select('id,title,assigned_to,customer_name,organization_id').eq('id', comment.ticket_id).single()
    if (!ticket?.assigned_to) return ok('skipped: no assigned tech')

    const { data: org } = await supabase.from('organizations')
      .select('name,notification_config').eq('id', ticket.organization_id).single()

    let config = { customer_reply_push: true }
    if (org?.notification_config) {
      try { config = typeof org.notification_config === 'string' ? JSON.parse(org.notification_config) : org.notification_config } catch {}
    }
    if (!config.customer_reply_push) return ok('skipped: notifications off')

    const orgName = org?.name || 'Valhalla IT'
    const preview = (comment.content || '').slice(0, 120) + ((comment.content || '').length > 120 ? '…' : '')

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    `${orgName} <support@valhalla-it.net>`,
        to:      [ticket.assigned_to],
        subject: `[Client Reply] ${ticket.title}`,
        html:    `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:16px 24px;border-radius:12px 12px 0 0;border-left:4px solid #3b82f6;">
    <h2 style="color:#3b82f6;margin:0;font-size:15px;">${orgName}</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">A client replied to a ticket</p>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:13px;color:#1e293b;font-weight:600;margin:0 0 4px;">${ticket.title}</p>
    <p style="font-size:12px;color:#94a3b8;margin:0 0 16px;">${ticket.customer_name || comment.author_name || 'Client'}</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:12px;font-size:13px;color:#475569;font-style:italic;">"${preview}"</div>
    <div style="text-align:center;margin:20px 0 8px;">
      <a href="${APP_URL}/tickets/${ticket.id}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:8px;">View & Reply</a>
    </div>
  </div>
</div>`,
      }),
    })

    console.log('notify-customer-reply: sent to', ticket.assigned_to)
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