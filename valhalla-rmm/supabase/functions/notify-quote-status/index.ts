import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const payload = await req.json()

    // Supabase database webhooks send { type, table, record, old_record }
    const newRecord = payload.record
    const oldRecord = payload.old_record

    // Only fire when status changes to approved or rejected
    if (!newRecord || !oldRecord) {
      return new Response(JSON.stringify({ skipped: 'no record data' }), { status: 200 })
    }

    const newStatus = newRecord.status
    const oldStatus = oldRecord.status

    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ skipped: 'status unchanged' }), { status: 200 })
    }

    if (!['approved', 'rejected'].includes(newStatus)) {
      return new Response(JSON.stringify({ skipped: 'not an approval event' }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get the organization's admin email
    const { data: org } = await supabase
      .from('organizations')
      .select('company_email, name')
      .eq('id', newRecord.organization_id)
      .single()

    const adminEmail = org?.company_email
    if (!adminEmail) {
      return new Response(JSON.stringify({ skipped: 'no admin email configured' }), { status: 200 })
    }

    const isApproved  = newStatus === 'approved'
    const statusLabel = isApproved ? 'Approved' : 'Declined'
    const statusColor = isApproved ? '#10b981' : '#ef4444'
    const appUrl      = 'https://project-mjonir.vercel.app'

    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f8fafc;">
  <div style="background:#0f172a;padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#f59e0b;margin:0;font-size:20px;">Quote ${statusLabel}</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:14px;">A client has responded to your proposal</p>
  </div>
  <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:120px;">Quote</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${newRecord.quote_number}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Title</td><td style="padding:8px 0;color:#0f172a;">${newRecord.title || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Client</td><td style="padding:8px 0;color:#0f172a;">${newRecord.customer_name}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Total</td><td style="padding:8px 0;font-weight:700;color:#0f172a;">$${Number(newRecord.total || 0).toFixed(2)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Decision</td><td style="padding:8px 0;font-weight:700;color:${statusColor};">${statusLabel}</td></tr>
      ${!isApproved && newRecord.rejected_reason ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;">Reason</td><td style="padding:8px 0;color:#ef4444;font-style:italic;">${newRecord.rejected_reason}</td></tr>` : ''}
    </table>

    ${isApproved
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
           <p style="color:#166534;font-size:14px;margin:0;font-weight:500;">
             ✓ This quote is ready to convert to an invoice. Log in to Valhalla RMM and click the Convert button on this quote.
           </p>
         </div>`
      : `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:16px;margin-bottom:20px;">
           <p style="color:#9f1239;font-size:14px;margin:0;">
             The client declined this quote. Consider following up to understand their concerns and revise the proposal.
           </p>
         </div>`
    }

    <div style="text-align:center;">
      <a href="${appUrl}/quotes" style="display:inline-block;background:#f59e0b;color:#000000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        View Quote in Valhalla RMM
      </a>
    </div>
  </div>
</div>`

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Valhalla RMM <notifications@valhalla-rmm.com>',
        to:      [adminEmail],
        subject: `Quote ${newRecord.quote_number} ${isApproved ? 'Approved' : 'Declined'} - ${newRecord.customer_name}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return new Response(JSON.stringify({ error: err }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true, sent_to: adminEmail }), { status: 200 })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})