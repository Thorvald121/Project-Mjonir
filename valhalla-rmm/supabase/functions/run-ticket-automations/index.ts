// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const payload = await req.json()

    const newTicket = payload.record
    const oldTicket = payload.old_record
    const eventType = payload.type // INSERT or UPDATE

    console.log('Webhook fired:', eventType, 'ticket:', newTicket?.id, 'org:', newTicket?.organization_id, 'status:', newTicket?.status)

    if (!newTicket) {
      return new Response(JSON.stringify({ skipped: 'no record' }), { status: 200 })
    }

    if (!newTicket.organization_id) {
      console.log('No organization_id on ticket - cannot match rules')
      return new Response(JSON.stringify({ skipped: 'no organization_id on ticket' }), { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { data: rules, error: rulesError } = await supabase
      .from('ticket_automation_rules')
      .select('*')
      .eq('organization_id', newTicket.organization_id)
      .eq('is_active', true)

    console.log('Rules found:', rules?.length ?? 0, rulesError ? 'error: ' + rulesError.message : '')

    if (rulesError || !rules || rules.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no active rules', org: newTicket.organization_id }), { status: 200 })
    }

    const results = []

    for (const rule of rules) {
      console.log('Checking rule:', rule.name, 'trigger:', rule.trigger_type, '/', rule.trigger_status)

      let triggered = false

      if (rule.trigger_type === 'created') {
        triggered = eventType === 'INSERT'

      } else if (rule.trigger_type === 'status_change') {
        triggered = Boolean(
          rule.trigger_status &&
          newTicket.status === rule.trigger_status &&
          (!oldTicket || oldTicket.status !== rule.trigger_status)
        )
        console.log('status_change check: new=', newTicket.status, 'old=', oldTicket?.status, 'target=', rule.trigger_status, 'triggered=', triggered)

      } else if (rule.trigger_type === 'priority_set') {
        triggered = Boolean(
          rule.trigger_priority &&
          newTicket.priority === rule.trigger_priority &&
          (!oldTicket || oldTicket.priority !== rule.trigger_priority)
        )

      } else if (rule.trigger_type === 'unassigned_duration') {
        triggered = eventType === 'UPDATE' && !newTicket.assigned_to

      } else if (rule.trigger_type === 'sla_breach_imminent') {
        if (newTicket.sla_due_date && !['resolved', 'closed'].includes(newTicket.status)) {
          const diff = new Date(newTicket.sla_due_date).getTime() - Date.now()
          triggered = diff > 0 && diff < 2 * 60 * 60 * 1000
        }
      }

      if (!triggered) {
        console.log('Rule not triggered:', rule.name)
        continue
      }

      if (rule.condition_category && newTicket.category !== rule.condition_category) {
        console.log('Category filter failed:', newTicket.category, '!=', rule.condition_category)
        continue
      }
      if (rule.condition_customer_id && newTicket.customer_id !== rule.condition_customer_id) {
        console.log('Customer filter failed')
        continue
      }

      console.log('Executing action:', rule.action_type, 'for rule:', rule.name)

      if (rule.action_type === 'assign_to') {
        if (!rule.action_assign_to) continue
        if (!newTicket.assigned_to || eventType === 'INSERT') {
          await supabase.from('tickets').update({ assigned_to: rule.action_assign_to }).eq('id', newTicket.id)
          results.push('assigned_to: ' + rule.action_assign_to)
        }

      } else if (rule.action_type === 'set_priority') {
        if (!rule.action_priority || newTicket.priority === rule.action_priority) continue
        await supabase.from('tickets').update({ priority: rule.action_priority }).eq('id', newTicket.id)
        results.push('set_priority: ' + rule.action_priority)

      } else if (rule.action_type === 'set_status') {
        if (!rule.action_status || newTicket.status === rule.action_status) continue
        await supabase.from('tickets').update({ status: rule.action_status }).eq('id', newTicket.id)
        results.push('set_status: ' + rule.action_status)

      } else if (rule.action_type === 'add_tag') {
        if (!rule.action_tag) continue
        const currentTags = Array.isArray(newTicket.tags) ? newTicket.tags : []
        if (!currentTags.includes(rule.action_tag)) {
          await supabase.from('tickets').update({ tags: [...currentTags, rule.action_tag] }).eq('id', newTicket.id)
          results.push('add_tag: ' + rule.action_tag)
        }

      } else if (
        rule.action_type === 'send_email_notification' ||
        rule.action_type === 'send_email_client'
      ) {
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
        if (!RESEND_API_KEY) {
          console.log('No RESEND_API_KEY configured')
          continue
        }

        const to = rule.action_type === 'send_email_client'
          ? newTicket.contact_email
          : rule.action_email_to

        console.log('Sending email to:', to)

        if (!to) {
          console.log('No recipient email - skipping')
          continue
        }

        const vars = {
          ticket_title:  newTicket.title         || '',
          customer_name: newTicket.customer_name  || '',
          priority:      newTicket.priority       || '',
          assigned_to:   newTicket.assigned_to    || 'Unassigned',
          status:        newTicket.status         || '',
          ticket_id:     newTicket.id             || '',
        }

        const interpolate = (tmpl) =>
          (tmpl || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '{{' + key + '}}')

        const subject  = interpolate(rule.action_email_subject) || ('Ticket Update: ' + newTicket.title)
        const bodyText = interpolate(rule.action_email_body) || (
          'Ticket "' + newTicket.title + '" has been updated.\n\n' +
          'Status: ' + newTicket.status + '\n' +
          'Priority: ' + newTicket.priority + '\n' +
          'Assigned To: ' + (newTicket.assigned_to || 'Unassigned')
        )

        const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:10px 10px 0 0;">
    <h1 style="color:#f59e0b;margin:0;font-size:18px;">Ticket Automation</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">${newTicket.title}</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#475569;font-size:14px;white-space:pre-wrap;">${bodyText.replace(/\n/g, '<br>')}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
    <table style="width:100%;font-size:13px;">
      <tr><td style="color:#64748b;padding:4px 0;width:100px;">Status</td><td style="color:#0f172a;">${newTicket.status}</td></tr>
      <tr><td style="color:#64748b;padding:4px 0;">Priority</td><td style="color:#0f172a;">${newTicket.priority}</td></tr>
      <tr><td style="color:#64748b;padding:4px 0;">Assigned To</td><td style="color:#0f172a;">${newTicket.assigned_to || 'Unassigned'}</td></tr>
      <tr><td style="color:#64748b;padding:4px 0;">Customer</td><td style="color:#0f172a;">${newTicket.customer_name || '—'}</td></tr>
    </table>
    <p style="color:#94a3b8;font-size:11px;margin-top:20px;">Sent by Valhalla RMM Ticket Automations</p>
  </div>
</div>`

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + RESEND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'Valhalla RMM <notifications@valhalla-rmm.com>',
            to:      [to],
            subject,
            html,
          }),
        })

        const resendBody = await resendRes.json()
        console.log('Resend response:', resendRes.status, JSON.stringify(resendBody))

        if (resendRes.ok) {
          results.push('email_sent: ' + to)
        } else {
          results.push('email_FAILED: ' + to + ' - ' + JSON.stringify(resendBody))
        }
      }
    }

    console.log('Actions completed:', results)
    return new Response(JSON.stringify({ ok: true, actions: results }), { status: 200 })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})