// @ts-nocheck
// supabase/functions/run-sla-checks/index.ts
// Runs every 15 minutes via cron.
// 1. Finds tickets approaching SLA breach (within 1 hour) → warns assigned tech
// 2. Finds tickets that have breached SLA → emails tech, auto-bumps priority, creates audit entry
// 3. Updates ticket sla_breached_at timestamp so we don't spam on every run
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const PRIORITY_ORDER = { low: 1, medium: 2, high: 3, critical: 4 }
const BUMP_MAP       = { low: 'medium', medium: 'high', high: 'critical' }

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
    const oneHour    = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

    // Fetch all open tickets with an SLA due date set
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id,title,priority,status,assigned_to,customer_name,organization_id,sla_due_date,sla_breached_at,sla_warned_at')
      .not('sla_due_date', 'is', null)
      .not('status', 'in', '("resolved","closed")')
      .order('sla_due_date', { ascending: true })
      .limit(200)

    if (error) throw error
    if (!tickets?.length) return ok('no tickets with SLA due dates')

    // Load all org configs in one query
    const orgIds = [...new Set(tickets.map(t => t.organization_id).filter(Boolean))]
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id,name,sla_config,notification_config,company_email')
      .in('id', orgIds)

    const orgMap = {}
    orgs?.forEach(o => { orgMap[o.id] = o })

    let warned = 0, breached = 0, bumped = 0

    for (const ticket of tickets) {
      const due     = new Date(ticket.sla_due_date)
      const diffMs  = due.getTime() - now.getTime()
      const org     = orgMap[ticket.organization_id]

      // ── Already breached ──────────────────────────────────────────────────
      if (diffMs < 0) {
        const alreadyRecorded = ticket.sla_breached_at !== null

        if (!alreadyRecorded) {
          // First time we've caught this breach
          const updates: any = { sla_breached_at: now.toISOString() }

          // Auto-bump priority (not if already critical)
          if (ticket.priority !== 'critical' && BUMP_MAP[ticket.priority]) {
            updates.priority = BUMP_MAP[ticket.priority]
            bumped++
            console.log(`Bumped priority: ${ticket.title} ${ticket.priority} → ${updates.priority}`)
          }

          await supabase.from('tickets').update(updates).eq('id', ticket.id)

          // Audit log entry
          await supabase.from('audit_log').insert({
            organization_id: ticket.organization_id,
            entity_type:     'ticket',
            entity_id:       ticket.id,
            record_title:    ticket.title,
            action:          'sla_breached',
            changes:         { breached_at: now.toISOString(), priority_bumped: updates.priority ?? null },
            actor_email:     'system',
          }).single()

          // Email the assigned tech
          if (ticket.assigned_to && RESEND_KEY) {
            await sendEmail(RESEND_KEY, {
              to:      ticket.assigned_to,
              subject: `🚨 SLA Breached: ${ticket.title}`,
              html:    buildEmail({
                type:     'breached',
                ticket,
                org,
                appUrl:   APP_URL,
                diffMs,
                newPriority: updates.priority,
              }),
            })
            breached++
          }
        }
        continue
      }

      // ── Approaching breach (within 1 hour) ───────────────────────────────
      if (diffMs < 60 * 60 * 1000) {
        // Only warn once — check sla_warned_at
        const alreadyWarned = ticket.sla_warned_at &&
          (now.getTime() - new Date(ticket.sla_warned_at).getTime()) < 60 * 60 * 1000

        if (!alreadyWarned && ticket.assigned_to && RESEND_KEY) {
          const minutesLeft = Math.round(diffMs / 60000)
          await sendEmail(RESEND_KEY, {
            to:      ticket.assigned_to,
            subject: `⚠️ SLA Warning: ${ticket.title} — ${minutesLeft}m remaining`,
            html:    buildEmail({
              type:     'warning',
              ticket,
              org,
              appUrl:   APP_URL,
              diffMs,
            }),
          })

          await supabase.from('tickets')
            .update({ sla_warned_at: now.toISOString() })
            .eq('id', ticket.id)

          warned++
        }
      }
    }

    const msg = `checked ${tickets.length} tickets: ${warned} warnings sent, ${breached} breach alerts sent, ${bumped} priorities bumped`
    console.log(msg)
    return ok(msg)

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function sendEmail(resendKey, { to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    'Valhalla IT Alerts <support@valhalla-rmm.com>',
        to:      [to],
        subject,
        html,
      }),
    })
    if (!res.ok) console.error('Email send failed:', await res.text())
  } catch (err) {
    console.error('Email error:', err.message)
  }
}

function buildEmail({ type, ticket, org, appUrl, diffMs, newPriority }) {
  const orgName     = org?.name || 'Valhalla IT'
  const isBreached  = type === 'breached'
  const color       = isBreached ? '#dc2626' : '#d97706'
  const icon        = isBreached ? '🚨' : '⚠️'
  const hoursAgo    = isBreached ? Math.abs(Math.round(diffMs / 3600000)) : null
  const minsLeft    = !isBreached ? Math.round(diffMs / 60000) : null
  const priorityMap = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#dc2626' }
  const prioColor   = priorityMap[newPriority || ticket.priority] || '#64748b'

  return `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;border-left:5px solid ${color};">
    <h2 style="color:${color};margin:0;font-size:16px;">${icon} SLA ${isBreached ? 'Breach' : 'Warning'} — ${orgName}</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">
      ${isBreached ? `Breached ${hoursAgo}h ago` : `${minsLeft} minutes remaining`}
    </p>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:15px;font-weight:600;color:#0f172a;margin:0 0 4px;">${ticket.title}</p>
    <p style="font-size:13px;color:#64748b;margin:0 0 16px;">${ticket.customer_name || 'No customer'}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="color:#94a3b8;padding:4px 0;width:130px;">Priority</td>
        <td style="font-weight:600;color:${prioColor};">${(newPriority || ticket.priority).toUpperCase()}${newPriority ? ' (auto-bumped)' : ''}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;padding:4px 0;">SLA Due</td>
        <td style="color:#0f172a;">${new Date(ticket.sla_due_date).toLocaleString('en-US', { month:'short',day:'numeric',hour:'numeric',minute:'2-digit' })}</td>
      </tr>
      <tr>
        <td style="color:#94a3b8;padding:4px 0;">Assigned to</td>
        <td style="color:#0f172a;">${ticket.assigned_to || 'Unassigned'}</td>
      </tr>
    </table>
    <div style="text-align:center;">
      <a href="${appUrl}/tickets/${ticket.id}"
        style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 28px;border-radius:8px;">
        Open Ticket
      </a>
    </div>
  </div>
</div>`
}

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}