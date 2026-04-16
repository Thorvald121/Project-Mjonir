// @ts-nocheck
// supabase/functions/run-escalations/index.ts
// Runs every 30 minutes via cron.
// Finds tickets with no staff response after the configured threshold and:
// 1. Auto-bumps priority one level
// 2. Emails the assigned tech (or admin if unassigned)
// 3. Records the escalation in the audit log
// Uses escalated_at column to prevent repeat escalations

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const BUMP_MAP = { low: 'medium', medium: 'high', high: 'critical' }
const PRIORITY_ORDER = { low: 1, medium: 2, high: 3, critical: 4 }

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL    = Deno.env.get('APP_URL') || 'https://valhalla-rmm.com'
    const now        = new Date()

    // ── Load org and escalation config ──────────────────────────────────────
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id,name,sla_config,escalation_config,company_email')
      .limit(1)
    const org = orgs?.[0]
    if (!org) return ok('no org found')

    // sla_config: { critical: 4, high: 8, medium: 24, low: 48 } (hours)
    // escalation_config: { critical: 2, high: 4, medium: 12, low: 24 } (hours without response before escalating)
    // Fall back to half the SLA time if no escalation config set
    const sla = org.sla_config || { critical: 4, high: 8, medium: 24, low: 48 }
    const esc = org.escalation_config || {
      critical: Math.max(1, Math.floor((sla.critical || 4)  / 2)),
      high:     Math.max(2, Math.floor((sla.high     || 8)  / 2)),
      medium:   Math.max(4, Math.floor((sla.medium   || 24) / 2)),
      low:      Math.max(8, Math.floor((sla.low      || 48) / 2)),
    }

    console.log('Escalation thresholds (hours):', JSON.stringify(esc))

    // ── Load admin email for fallback notifications ──────────────────────────
    const { data: admins } = await supabase
      .from('organization_members')
      .select('user_email')
      .eq('organization_id', org.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
    const adminEmail = admins?.[0]?.user_email || org.company_email || null

    // ── Find open tickets that haven't had a staff response ──────────────────
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id,title,priority,status,assigned_to,customer_name,organization_id,created_at,first_response_at,last_customer_reply_at,escalated_at,sla_due_date')
      .eq('organization_id', org.id)
      .not('status', 'in', '("resolved","closed")')
      .not('priority', 'eq', 'critical') // already at max — no point escalating
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) throw error
    if (!tickets?.length) return ok('no eligible tickets')

    let escalated = 0
    let skipped   = 0

    for (const ticket of tickets) {
      const threshold = esc[ticket.priority]
      if (!threshold) { skipped++; continue }

      // Determine how long since last activity requiring a response
      // Use last_customer_reply_at if set (client is waiting), otherwise created_at
      const lastActivity = ticket.last_customer_reply_at
        ? new Date(ticket.last_customer_reply_at)
        : new Date(ticket.created_at)

      const hoursWaiting = (now.getTime() - lastActivity.getTime()) / 3600000

      // Not yet past threshold
      if (hoursWaiting < threshold) { skipped++; continue }

      // Already had a staff response and no new client reply — don't escalate
      if (ticket.first_response_at && !ticket.last_customer_reply_at) { skipped++; continue }

      // Already escalated recently — check escalated_at
      // Don't re-escalate within the same threshold window
      if (ticket.escalated_at) {
        const hoursSinceEscalation = (now.getTime() - new Date(ticket.escalated_at).getTime()) / 3600000
        if (hoursSinceEscalation < threshold) { skipped++; continue }
      }

      // ── Perform escalation ───────────────────────────────────────────────
      const newPriority = BUMP_MAP[ticket.priority]
      if (!newPriority) { skipped++; continue }

      console.log(`Escalating ticket ${ticket.id}: ${ticket.priority} → ${newPriority} (${hoursWaiting.toFixed(1)}h waiting)`)

      // Update ticket
      await supabase.from('tickets').update({
        priority:     newPriority,
        escalated_at: now.toISOString(),
      }).eq('id', ticket.id)

      // Audit log
      await supabase.from('audit_log').insert({
        organization_id: ticket.organization_id,
        table_name:      'tickets',
        record_id:       ticket.id,
        record_title:    ticket.title,
        action:          'UPDATE',
        actor_email:     'system',
        changed_fields:  {
          priority:     { from: ticket.priority, to: newPriority },
          escalated_at: { from: null, to: now.toISOString() },
        },
      })

      // Email notification
      const notifyEmail = ticket.assigned_to || adminEmail
      if (notifyEmail && RESEND_KEY) {
        const hoursStr    = hoursWaiting < 1
          ? `${Math.round(hoursWaiting * 60)} minutes`
          : `${hoursWaiting.toFixed(1)} hours`
        const waitReason  = ticket.last_customer_reply_at
          ? `The client replied ${hoursStr} ago with no staff response`
          : `No response has been sent in ${hoursStr}`
        const prioColors  = { medium: '#f59e0b', high: '#f97316', critical: '#dc2626' }
        const color       = prioColors[newPriority] || '#64748b'

        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'Valhalla IT Alerts <support@valhalla-it.net>',
            to:      [notifyEmail],
            subject: `⬆️ Ticket escalated to ${newPriority.toUpperCase()}: ${ticket.title}`,
            html: `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;border-left:5px solid ${color};">
    <h2 style="color:${color};margin:0;font-size:16px;">⬆️ Ticket Escalated — ${org.name || 'Valhalla IT'}</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Priority bumped to ${newPriority.toUpperCase()}</p>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 4px;">${ticket.title}</p>
    <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${ticket.customer_name || 'No customer'}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="color:#94a3b8;padding:4px 0;width:140px;">Priority</td>
        <td style="font-weight:600;color:${color};">${newPriority.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;padding:4px 0;">Reason</td>
        <td style="color:#0f172a;">${waitReason}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;padding:4px 0;">Assigned to</td>
        <td style="color:#0f172a;">${ticket.assigned_to || 'Unassigned'}</td>
      </tr>
    </table>
    <div style="text-align:center;">
      <a href="${APP_URL}/tickets/${ticket.id}"
        style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 28px;border-radius:8px;">
        Open Ticket
      </a>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:16px;">
      Escalation thresholds can be adjusted in Settings → SLA & Alerts
    </p>
  </div>
</div>`,
          }),
        }).catch(e => console.error('Email failed:', e.message))
      }

      escalated++
    }

    const msg = `checked ${tickets.length} tickets: ${escalated} escalated, ${skipped} skipped`
    console.log(msg)
    return ok(msg)

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