// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const payload   = await req.json()
    const newTicket = payload.record
    const oldTicket = payload.old_record
    const eventType = payload.type

    if (!newTicket) return new Response(JSON.stringify({ skipped: 'no record' }), { status: 200 })

    // Only fire on status changes
    if (eventType === 'UPDATE' && oldTicket?.status === newTicket.status) {
      return new Response(JSON.stringify({ skipped: 'status unchanged' }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 })
    }

    // Load active rules matching this status
    const { data: rules } = await supabase
      .from('email_automation_rules')
      .select('*')
      .eq('organization_id', newTicket.organization_id)
      .eq('is_active', true)
      .eq('trigger_status', newTicket.status)

    if (!rules?.length) {
      return new Response(JSON.stringify({ skipped: 'no matching rules' }), { status: 200 })
    }

    console.log(`Found ${rules.length} rules for status: ${newTicket.status}`)

    const results = []

    for (const rule of rules) {
      // Determine recipient email
      let toEmail = null
      if (rule.recipient_type === 'contact')     toEmail = newTicket.contact_email
      if (rule.recipient_type === 'assigned_to') toEmail = newTicket.assigned_to
      if (rule.recipient_type === 'custom')      toEmail = rule.custom_email

      if (!toEmail) {
        console.log(`Rule "${rule.name}" skipped — no recipient email`)
        await supabase.from('email_automation_log').insert({
          organization_id: newTicket.organization_id,
          rule_id:         rule.id,
          rule_name:       rule.name,
          ticket_id:       newTicket.id,
          ticket_title:    newTicket.title,
          to_email:        null,
          subject:         rule.subject_template,
          status:          'failed',
          error:           'No recipient email on ticket',
        })
        continue
      }

      // Interpolate template variables
      const vars = {
        ticket_title:   newTicket.title         || '',
        contact_name:   newTicket.contact_name  || 'there',
        customer_name:  newTicket.customer_name || '',
        status:         newTicket.status        || '',
        priority:       newTicket.priority      || '',
        assigned_to:    newTicket.assigned_to   || 'your support team',
      }

      const interpolate = (tmpl) =>
        (tmpl || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '')

      const subject = interpolate(rule.subject_template)
      const html    = interpolate(rule.body_template)

      console.log(`Sending rule "${rule.name}" to ${toEmail}`)

      // If delay > 0, we log as "scheduled" — in a real setup this would use pg_cron
      // For now we send immediately regardless of delay
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_API_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'Valhalla IT Support <support@valhalla-it.net>',
          to:      [toEmail],
          subject,
          html,
        }),
      })

      const resData = await res.json()
      const success = res.ok

      await supabase.from('email_automation_log').insert({
        organization_id: newTicket.organization_id,
        rule_id:         rule.id,
        rule_name:       rule.name,
        ticket_id:       newTicket.id,
        ticket_title:    newTicket.title,
        to_email:        toEmail,
        subject,
        status:          success ? 'sent' : 'failed',
        error:           success ? null : JSON.stringify(resData),
      })

      results.push(success ? `sent to ${toEmail}` : `failed for ${toEmail}`)
    }

    return new Response(JSON.stringify({ ok: true, results }), { status: 200 })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})