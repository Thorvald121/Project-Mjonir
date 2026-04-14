// @ts-nocheck
// supabase/functions/ingest-web-form/index.ts
// Receives POST requests from Squarespace contact forms and creates tickets
// Also accepts direct API submissions for future use

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Optional webhook secret for security — set FORM_WEBHOOK_SECRET in Supabase secrets
    const webhookSecret = Deno.env.get('FORM_WEBHOOK_SECRET')
    if (webhookSecret) {
      const provided = req.headers.get('x-webhook-secret')
      if (provided !== webhookSecret) {
        return json({ error: 'Unauthorized' }, 401)
      }
    }

    const body = await req.json()
    console.log('Web form submission received:', JSON.stringify(body).slice(0, 500))

    // ── Normalize fields from different form providers ──────────────────────
    // Supports: Squarespace, direct API, generic contact forms
    const name    = body.name    || body.formData?.name    || body['your-name']    || ''
    const email   = body.email   || body.formData?.email   || body['your-email']   || ''
    const phone   = body.phone   || body.formData?.phone   || body['your-phone']   || ''
    const company = body.company || body.formData?.company || body['your-company'] || ''
    const subject = body.subject || body.formData?.subject || body['your-subject'] || 'Website enquiry'
    const message = body.message || body.formData?.message || body['your-message'] || body.comments || ''
    const service = body.service || body.formData?.service || '' // e.g. "Managed IT", "Cyber Security"

    if (!email && !name) {
      return json({ error: 'Name or email is required' }, 400)
    }

    // ── Get org ─────────────────────────────────────────────────────────────
    const { data: orgs } = await supabase
      .from('organizations').select('id').limit(1)
    const orgId = orgs?.[0]?.id
    if (!orgId) return json({ error: 'No organization found' }, 500)

    // ── Check if this email matches an existing customer ────────────────────
    let customerId   = null
    let customerName = null

    if (email) {
      // Check customer_contacts first
      const { data: contact } = await supabase
        .from('customer_contacts')
        .select('customer_id, customers(id,name)')
        .eq('email', email)
        .maybeSingle()

      if (contact?.customer_id) {
        customerId   = contact.customer_id
        customerName = contact.customers?.name || null
      } else {
        // Check customers.contact_email
        const { data: cust } = await supabase
          .from('customers')
          .select('id,name')
          .eq('contact_email', email)
          .maybeSingle()
        if (cust) {
          customerId   = cust.id
          customerName = cust.name
        }
      }
    }

    // ── Build ticket title ──────────────────────────────────────────────────
    // Use subject if meaningful, otherwise build from name + service
    let title = subject
    if (!title || title.toLowerCase() === 'website enquiry' || title.toLowerCase() === 'contact form submission') {
      if (service) title = `${service} enquiry from ${name || email}`
      else         title = `Website enquiry from ${name || email}`
    }

    // ── Build ticket description ────────────────────────────────────────────
    const descParts = []
    if (name)    descParts.push(`**Name:** ${name}`)
    if (email)   descParts.push(`**Email:** ${email}`)
    if (phone)   descParts.push(`**Phone:** ${phone}`)
    if (company) descParts.push(`**Company:** ${company}`)
    if (service) descParts.push(`**Service interest:** ${service}`)
    if (message) descParts.push(`\n**Message:**\n${message}`)

    const description = descParts.join('\n')

    // ── Create ticket ───────────────────────────────────────────────────────
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        organization_id: orgId,
        title,
        description,
        priority:      'low',
        category:      'other',
        status:        'open',
        source:        'web',
        contact_email: email   || null,
        contact_name:  name    || null,
        customer_id:   customerId   || null,
        customer_name: customerName || company || null,
        tags:          service ? [service.toLowerCase().replace(/\s+/g,'-')] : ['web-enquiry'],
      })
      .select()
      .single()

    if (ticketErr) {
      console.error('Ticket creation error:', ticketErr.message)
      return json({ error: ticketErr.message }, 500)
    }

    console.log('Created web enquiry ticket:', ticket.id, '—', title)

    // ── Send auto-acknowledgement to the enquirer ───────────────────────────
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL    = Deno.env.get('APP_URL') || 'https://valhalla-rmm.com'

    if (RESEND_KEY && email) {
      const ackHtml = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;border-left:5px solid #f59e0b;">
    <h2 style="color:#f59e0b;margin:0;font-size:16px;">Thanks for reaching out!</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Valhalla IT — We'll be in touch shortly</p>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:14px;color:#1e293b;margin:0 0 12px;">Hi ${name || 'there'},</p>
    <p style="font-size:14px;color:#475569;margin:0 0 12px;">
      We've received your enquiry and a member of our team will get back to you as soon as possible — 
      typically within one business day.
    </p>
    ${service ? `<p style="font-size:14px;color:#475569;margin:0 0 12px;">You enquired about: <strong>${service}</strong></p>` : ''}
    <p style="font-size:14px;color:#475569;margin:0 0 20px;">
      Your reference number is <strong style="color:#0f172a;">#${ticket.id.slice(0,8).toUpperCase()}</strong>. 
      Please quote this if you need to follow up.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:0;">
      Valhalla IT · <a href="mailto:support@valhalla-it.net" style="color:#f59e0b;">support@valhalla-it.net</a>
    </p>
  </div>
</div>`

      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'Valhalla IT <support@valhalla-it.net>',
          to:      [email],
          subject: `We received your enquiry — Valhalla IT`,
          html:    ackHtml,
        }),
      }).catch(e => console.error('Ack email failed:', e.message))
    }

    return json({
      ok:        true,
      ticket_id: ticket.id,
      reference: ticket.id.slice(0,8).toUpperCase(),
      message:   'Enquiry received — we\'ll be in touch shortly',
    })

  } catch (err) {
    console.error('Unhandled error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}