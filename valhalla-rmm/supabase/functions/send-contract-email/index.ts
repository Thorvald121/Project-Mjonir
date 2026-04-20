// @ts-nocheck
// supabase/functions/send-contract-email/index.ts
// Sends a contract to a client for review via Resend

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL    = Deno.env.get('APP_URL') || 'https://valhalla-rmm.com'

    const { contract_id, to_email, to_name, message } = await req.json()

    if (!contract_id) return json({ error: 'contract_id is required' }, 400)
    if (!to_email)    return json({ error: 'to_email is required' }, 400)

    // Load contract
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('*, organizations(name, company_email, brand_color, logo_url)')
      .eq('id', contract_id)
      .single()

    if (error || !contract) return json({ error: 'Contract not found' }, 404)

    const org       = contract.organizations || {}
    const orgName   = org.name  || 'Valhalla IT'
    const accent    = org.brand_color || '#f59e0b'
    const fmtCur    = (n) => n != null ? `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
    const lbl       = (s) => s?.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''
    const fmtDate   = (d) => d ? new Date(d + (d.length===10?'T00:00:00':'')).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—'

    // Format the message as HTML paragraphs
    const messageHtml = (message || '')
      .split('\n\n').map(p => `<p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">${p.replace(/\n/g,'<br/>')}</p>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:32px auto;padding:0 16px;">

  <!-- Header -->
  <div style="background:#0f172a;padding:24px 28px;border-radius:12px 12px 0 0;border-left:5px solid ${accent};">
    <div style="font-size:20px;font-weight:800;color:#fff;">${orgName}</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:2px;">Contract for Review</div>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    ${to_name ? `<p style="font-size:15px;color:#0f172a;margin:0 0 16px;">Hi ${to_name},</p>` : ''}
    ${messageHtml}

    <!-- Contract summary card -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:8px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px;">Contract Summary</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;">${contract.title}</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="color:#64748b;padding:3px 0;width:120px;">Value</td>
          <td style="font-weight:600;color:#0f172a;">${fmtCur(contract.value)} <span style="font-weight:400;color:#94a3b8;">${lbl(contract.billing_cycle)}</span></td>
        </tr>
        ${contract.start_date ? `<tr><td style="color:#64748b;padding:3px 0;">Start Date</td><td style="color:#0f172a;">${fmtDate(contract.start_date)}</td></tr>` : ''}
        ${contract.end_date   ? `<tr><td style="color:#64748b;padding:3px 0;">End Date</td><td style="color:#0f172a;">${fmtDate(contract.end_date)}</td></tr>` : ''}
        ${contract.auto_renew ? `<tr><td style="color:#64748b;padding:3px 0;">Auto-renew</td><td style="color:#0f172a;">Yes</td></tr>` : ''}
      </table>
      ${contract.document_url ? `
      <div style="margin-top:16px;text-align:center;">
        <a href="${contract.document_url}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:8px;">
          View Contract Document →
        </a>
      </div>` : ''}
    </div>

    ${contract.notes ? `<p style="font-size:13px;color:#64748b;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:16px;">${contract.notes}</p>` : ''}

    <p style="font-size:13px;color:#475569;margin-top:20px;">
      To confirm acceptance, simply reply to this email. If you have any questions or would like to discuss the terms, please don't hesitate to reach out.
    </p>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">
      ${orgName} · <a href="mailto:support@valhalla-it.net" style="color:${accent};">support@valhalla-it.net</a>
    </div>
  </div>
</div>
</body></html>`

    if (!RESEND_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500)

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:     `${orgName} <support@valhalla-it.net>`,
        to:       [to_email],
        reply_to: ['support@valhalla-rmm.com'],
        subject:  `Contract for review: ${contract.title}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return json({ error: 'Failed to send email' }, 500)
    }

    console.log(`Contract email sent to ${to_email} for contract ${contract_id}`)
    return json({ ok: true })

  } catch (err) {
    console.error('Error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}