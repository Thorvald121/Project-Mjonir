// @ts-nocheck
// Checks all active monitors and records results.
// Called by Supabase cron (pg_cron) every 5 minutes.
// Also handles alerting via Resend when a monitor goes down/up.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    const APP_URL    = Deno.env.get('APP_URL') || 'https://project-mjonir.vercel.app'

    // Get all active monitors due for a check
    const { data: monitors } = await supabase
      .from('monitors')
      .select('*, organizations(name, company_email, notification_config)')
      .eq('status', 'active')
      .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - 4 * 60 * 1000).toISOString()}`)
      .limit(50)

    if (!monitors?.length) return ok('no monitors due')

    const results = await Promise.allSettled(monitors.map(monitor => checkMonitor(monitor, supabase, RESEND_KEY, APP_URL)))
    const done = results.filter(r => r.status === 'fulfilled').length

    console.log(`Checked ${done}/${monitors.length} monitors`)
    return ok(`checked ${done} monitors`)
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function checkMonitor(monitor, supabase, resendKey, appUrl) {
  const start = Date.now()
  let status = 'down', statusCode = null, error = null, responseMs = null, sslExpiry = null

  if (monitor.type === 'tcp') {
    // ── TCP port check ─────────────────────────────────────────────────────
    const port = monitor.port || 80
    try {
      const conn = await Promise.race([
        Deno.connect({ hostname: monitor.url, port }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000)),
      ])
      responseMs = Date.now() - start
      conn.close()
      status = 'up'
    } catch (err) {
      responseMs = Date.now() - start
      status = 'down'
      error  = err.message === 'Timeout' ? 'TCP timeout (10s)' : `TCP connect failed: ${err.message}`
    }
  } else if (monitor.type === 'keyword') {
    // ── Keyword check ──────────────────────────────────────────────────────
    try {
      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 15000)
      const res        = await fetch(monitor.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'ValhallaMon/1.0' },
      })
      clearTimeout(timeout)
      responseMs = Date.now() - start
      statusCode = res.status
      if (!res.ok) {
        status = 'down'; error = `HTTP ${res.status}`
      } else {
        const body = await res.text()
        if (monitor.keyword && body.includes(monitor.keyword)) {
          status = 'up'
        } else {
          status = 'down'
          error  = monitor.keyword ? `Keyword "${monitor.keyword}" not found` : 'No keyword configured'
        }
      }
    } catch (err) {
      responseMs = Date.now() - start
      status = 'down'
      error  = err.name === 'AbortError' ? 'Timeout (15s)' : err.message
    }
  } else {
    // ── HTTP/HTTPS check (default) ──────────────────────────────────────────
    try {
      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 15000)
      const res        = await fetch(monitor.url, {
        method:  'HEAD',
        signal:  controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'ValhallaMon/1.0' },
      })
      clearTimeout(timeout)
      responseMs = Date.now() - start
      statusCode = res.status
      status     = res.ok ? 'up' : 'down'
      error      = res.ok ? null : `HTTP ${res.status}`

      // Check SSL expiry if HTTPS
      if (monitor.url.startsWith('https://') && res.ok) {
        try {
          const urlObj   = new URL(monitor.url)
          const certRes  = await fetch(`https://api.certspotter.com/v1/issuances?domain=${urlObj.hostname}&expand=dns_names&expand=issuer&include_subdomains=false`, {
            headers: { 'Accept': 'application/json' }
          })
          if (certRes.ok) {
            const certs = await certRes.json()
            if (certs?.length > 0) {
              const latest = certs.sort((a, b) => new Date(b.not_after).getTime() - new Date(a.not_after).getTime())[0]
              if (latest?.not_after) {
                sslExpiry = new Date(latest.not_after).toISOString().slice(0, 10)
              }
            }
          }
        } catch { /* SSL check is best-effort */ }
      }
    } catch (err) {
      responseMs = Date.now() - start
      status     = 'down'
      error      = err.name === 'AbortError' ? 'Timeout (15s)' : err.message
    }
  }

  // Record check result
  await supabase.from('monitor_checks').insert({
    monitor_id:  monitor.id,
    status,
    response_ms: responseMs,
    status_code: statusCode,
    error,
  })

  const wasDown = monitor.last_status === 'down'
  const isDown  = status === 'down'
  const newFailures = isDown ? (monitor.consecutive_failures || 0) + 1 : 0

  // Update monitor
  const updates = {
    last_status:           status,
    last_checked_at:       new Date().toISOString(),
    last_response_ms:      responseMs,
    consecutive_failures:  newFailures,
    ...(sslExpiry ? { ssl_expiry_date: sslExpiry } : {}),
  }
  await supabase.from('monitors').update(updates).eq('id', monitor.id)

  // Alert on state change (down after 2 consecutive failures, or recovery)
  const org    = monitor.organizations
  const config = (() => { try { return typeof org?.notification_config === 'string' ? JSON.parse(org.notification_config) : (org?.notification_config || {}) } catch { return {} } })()

  if (resendKey && org?.company_email) {
    const shouldAlertDown = isDown  && newFailures === 2 && !wasDown
    const shouldAlertUp   = !isDown && wasDown

    if (shouldAlertDown || shouldAlertUp) {
      const subject = shouldAlertDown
        ? `[DOWN] ${monitor.name} is unreachable`
        : `[RECOVERED] ${monitor.name} is back online`
      const color   = shouldAlertDown ? '#e53e3e' : '#38a169'
      const emoji   = shouldAlertDown ? '🔴' : '🟢'
      const html    = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:16px 24px;border-radius:12px 12px 0 0;border-left:4px solid ${color};">
    <h2 style="color:${color};margin:0;font-size:15px;">${emoji} ${org.name || 'Valhalla RMM'} — Monitor Alert</h2>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:5px 0;font-weight:600;width:120px;">Monitor</td><td style="padding:5px 0;">${monitor.name}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600;">URL</td><td style="padding:5px 0;">${monitor.url}</td></tr>
      <tr><td style="padding:5px 0;font-weight:600;">Status</td><td style="padding:5px 0;color:${color};font-weight:600;">${shouldAlertDown ? 'DOWN' : 'RECOVERED'}</td></tr>
      ${error ? `<tr><td style="padding:5px 0;font-weight:600;">Error</td><td style="padding:5px 0;color:#e53e3e;">${error}</td></tr>` : ''}
      ${monitor.customer_name ? `<tr><td style="padding:5px 0;font-weight:600;">Customer</td><td style="padding:5px 0;">${monitor.customer_name}</td></tr>` : ''}
      <tr><td style="padding:5px 0;font-weight:600;">Time</td><td style="padding:5px 0;">${new Date().toLocaleString()}</td></tr>
    </table>
    <div style="text-align:center;margin:20px 0 8px;">
      <a href="${appUrl}/monitoring" style="background:#f59e0b;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View Dashboard</a>
    </div>
  </div>
</div>`

      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from:    `${org.name || 'Valhalla RMM'} <support@valhalla-rmm.com>`,
          to:      [org.company_email],
          subject,
          html,
        }),
      })
    }
  }
}

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}