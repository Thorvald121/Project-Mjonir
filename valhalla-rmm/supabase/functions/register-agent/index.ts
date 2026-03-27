// @ts-nocheck
// Receives a POST from the asset agent script and upserts an inventory_item.
// Auth: API key passed as ?apikey= query param (the org's anon key is fine,
//       or generate a dedicated key stored in org settings).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const payload = await req.json()
    const {
      org_id,          // Required — the organization UUID
      hostname,        // Machine name
      os,              // e.g. "Windows 11 Pro 23H2"
      os_version,
      cpu,             // e.g. "Intel Core i7-12700K"
      ram_gb,          // number
      disk_gb,         // total disk in GB
      disk_free_gb,    // free disk in GB
      ip_address,
      mac_address,
      serial_number,
      model,           // e.g. "Dell XPS 15 9520"
      manufacturer,
      username,        // logged-in user
      domain,
      customer_id,     // optional — link to a customer
      customer_name,
      agent_version,
    } = payload

    if (!org_id || !hostname) {
      return new Response(JSON.stringify({ error: 'org_id and hostname are required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Verify org exists
    const { data: org } = await supabase.from('organizations').select('id').eq('id', org_id).single()
    if (!org) return new Response(JSON.stringify({ error: 'org not found' }), {
      status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
    })

    const now = new Date().toISOString()

    // Build description from hardware info
    const descParts = []
    if (cpu)     descParts.push(`CPU: ${cpu}`)
    if (ram_gb)  descParts.push(`RAM: ${ram_gb}GB`)
    if (disk_gb) descParts.push(`Disk: ${disk_gb}GB${disk_free_gb ? ` (${disk_free_gb}GB free)` : ''}`)
    if (username) descParts.push(`User: ${username}`)
    if (domain)   descParts.push(`Domain: ${domain}`)
    const description = descParts.join(' | ')

    // Check if device already registered (by hostname + org, or serial if provided)
    let existing = null
    if (serial_number) {
      const { data } = await supabase.from('inventory_items')
        .select('id').eq('organization_id', org_id).eq('serial_number', serial_number).maybeSingle()
      existing = data
    }
    if (!existing) {
      const { data } = await supabase.from('inventory_items')
        .select('id').eq('organization_id', org_id).eq('hostname', hostname).maybeSingle()
      existing = data
    }

    const record = {
      organization_id: org_id,
      name:            hostname,
      hostname,
      description,
      category:        'hardware',
      status:          'in_use',
      model:           model || null,
      manufacturer:    manufacturer || null,
      serial_number:   serial_number || null,
      os:              os || null,
      os_version:      os_version || null,
      cpu:             cpu || null,
      ram_gb:          ram_gb || null,
      disk_gb:         disk_gb || null,
      disk_free_gb:    disk_free_gb || null,
      ip_address:      ip_address || null,
      mac_address:     mac_address || null,
      last_seen_at:    now,
      agent_version:   agent_version || null,
      customer_id:     customer_id || null,
      customer_name:   customer_name || null,
    }

    let result
    if (existing) {
      result = await supabase.from('inventory_items').update(record).eq('id', existing.id).select('id').single()
      console.log(`Updated device: ${hostname} (${existing.id})`)
    } else {
      result = await supabase.from('inventory_items').insert(record).select('id').single()
      console.log(`Registered new device: ${hostname}`)
    }

    if (result.error) throw result.error

    return new Response(JSON.stringify({
      ok:     true,
      action: existing ? 'updated' : 'registered',
      id:     result.data.id,
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})