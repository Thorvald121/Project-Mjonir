// @ts-nocheck
// Runs daily. Checks all registered devices for:
// 1. Disk usage >= 90% (critical) or >= 75% (warning)
// 2. Devices that haven't checked in for 7+ days
// Creates a ticket for each alert if one doesn't already exist.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const now     = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()

    // Fetch all inventory items with agent data
    const { data: devices, error } = await supabase
      .from('inventory_items')
      .select('id,name,hostname,organization_id,customer_id,customer_name,disk_gb,disk_free_gb,ram_gb,last_seen_at,ip_address,os')
      .not('last_seen_at', 'is', null)

    if (error) throw error
    if (!devices?.length) return ok('no registered devices')

    let ticketsCreated = 0

    for (const device of devices) {
      const alerts = []
      const deviceName = device.hostname || device.name || 'Unknown device'

      // --- Disk usage alert ---
      if (device.disk_gb && device.disk_free_gb !== null) {
        const usedPct = Math.round(((device.disk_gb - device.disk_free_gb) / device.disk_gb) * 100)
        if (usedPct >= 90) {
          alerts.push({
            title: `[ALERT] Critical disk usage on ${deviceName} (${usedPct}% full)`,
            priority: 'critical',
            description: `Device: ${deviceName}\nDisk: ${device.disk_free_gb}GB free of ${device.disk_gb}GB (${usedPct}% used)\nIP: ${device.ip_address || '—'}\nOS: ${device.os || '—'}\n\nImmediate action required — disk is nearly full.`,
            alert_key: `disk_critical_${device.id}`,
          })
        } else if (usedPct >= 75) {
          alerts.push({
            title: `[WARNING] High disk usage on ${deviceName} (${usedPct}% full)`,
            priority: 'high',
            description: `Device: ${deviceName}\nDisk: ${device.disk_free_gb}GB free of ${device.disk_gb}GB (${usedPct}% used)\nIP: ${device.ip_address || '—'}\nOS: ${device.os || '—'}\n\nDisk usage is above 75%. Consider cleanup or expansion.`,
            alert_key: `disk_warning_${device.id}`,
          })
        }
      }

      // --- Offline / stale device alert ---
      if (device.last_seen_at && new Date(device.last_seen_at) < new Date(sevenDaysAgo)) {
        const daysOffline = Math.floor((now.getTime() - new Date(device.last_seen_at).getTime()) / 86400000)
        alerts.push({
          title: `[ALERT] Device offline: ${deviceName} (${daysOffline} days)`,
          priority: daysOffline > 14 ? 'high' : 'medium',
          description: `Device: ${deviceName}\nLast seen: ${new Date(device.last_seen_at).toLocaleDateString()}\nIP: ${device.ip_address || '—'}\nOS: ${device.os || '—'}\n\nThis device has not checked in for ${daysOffline} days.`,
          alert_key: `offline_${device.id}`,
        })
      }

      // Create tickets for each alert (skip if open ticket with same alert_key already exists)
      for (const alert of alerts) {
        // Check for existing open ticket with this alert_key
        const { data: existing } = await supabase
          .from('tickets')
          .select('id')
          .eq('organization_id', device.organization_id)
          .eq('source_ref', alert.alert_key)
          .not('status', 'in', '("resolved","closed")')
          .maybeSingle()

        if (existing) {
          console.log(`Skipping ${alert.alert_key} — open ticket already exists`)
          continue
        }

        const { error: ticketErr } = await supabase.from('tickets').insert({
          organization_id: device.organization_id,
          customer_id:     device.customer_id   || null,
          customer_name:   device.customer_name || null,
          title:           alert.title,
          description:     alert.description,
          priority:        alert.priority,
          category:        'hardware',
          status:          'open',
          source:          'system',
          source_ref:      alert.alert_key,
          tags:            ['auto-alert', 'device-health'],
          updated_at:      now.toISOString(),
        })

        if (ticketErr) {
          console.error(`Failed to create ticket for ${alert.alert_key}:`, ticketErr.message)
        } else {
          ticketsCreated++
          console.log(`Created alert ticket: ${alert.title}`)
        }
      }
    }

    return ok(`checked ${devices.length} devices, created ${ticketsCreated} alert tickets`)
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