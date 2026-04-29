// supabase/functions/sync-xcitium-devices/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XCITIUM_BASE = 'https://api-gw.itsm-us1.comodo.com/api/v2/itsm'
const PAGE_SIZE    = 100

// ── OS type int → readable string ────────────────────────────────────────────
function parseOsType(v: number | undefined): string {
  const map: Record<number, string> = {
    1: 'windows',
    2: 'linux',
    3: 'macos',
    4: 'android',
    5: 'ios',
    6: 'apple_tv',
  }
  return map[v ?? -1] ?? 'unknown'
}

// ── Online status int → string ────────────────────────────────────────────────
function parseOnlineStatus(v: number | string | undefined): string {
  if (v === 1 || v === 'ONLINE' || v === 'online') return 'online'
  return 'offline'
}

// ── AV state → string ─────────────────────────────────────────────────────────
function parseAvState(v: number | string | undefined): string {
  if (v === null || v === undefined) return 'unknown'
  const s = String(v).toLowerCase()
  if (s === '1' || s === 'active' || s === 'running') return 'active'
  if (s === '0' || s === 'inactive' || s === 'stopped') return 'inactive'
  if (s === 'not_installed' || s === '2') return 'not_installed'
  return s
}

// ── Patch status → string ─────────────────────────────────────────────────────
function parsePatchStatus(v: number | string | undefined): string {
  if (v === null || v === undefined) return 'unknown'
  const s = String(v).toLowerCase()
  if (s === '0' || s === 'up_to_date' || s === 'compliant') return 'up_to_date'
  if (s === '1' || s === 'pending') return 'pending'
  if (s === '2' || s === 'failed') return 'failed'
  return 'unknown'
}

// ── Xcitium POST helper ───────────────────────────────────────────────────────
async function xcitiumPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${XCITIUM_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `CONESSO ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Xcitium ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Fetch every device across all pages ──────────────────────────────────────
async function fetchAllDevices(token: string): Promise<unknown[]> {
  const all: unknown[] = []
  let page = 0

  while (true) {
    const json = await xcitiumPost('/devices/search', {
      searchAttributes: [],
      pagination: { page, size: PAGE_SIZE },
      sort: { field: 'name', order: 'asc' },
    }, token)

    // Xcitium may wrap results in data, content, or items depending on version
    const items: unknown[] = json?.data ?? json?.content ?? json?.items ?? []
    all.push(...items)

    // Last page reached
    if (items.length < PAGE_SIZE) break
    page++

    // Hard cap at 10,000 devices as a safety measure
    if (all.length >= 10_000) break
  }

  return all
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const token = Deno.env.get('XCITIUM_API_TOKEN')
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'XCITIUM_API_TOKEN secret is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get this deployment's organization ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single()

  if (!org) {
    return new Response(
      JSON.stringify({ error: 'No organization found in database' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const orgId = org.id

  // Build a lookup map of customer name → customer id from our own DB
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('organization_id', orgId)

  const customerMap = new Map<string, string>()
  for (const c of customers ?? []) {
    customerMap.set((c.name as string).toLowerCase().trim(), c.id as string)
  }

  try {
    const devices = await fetchAllDevices(token)
    const now     = new Date().toISOString()
    let upserted  = 0
    let errors    = 0

    for (const raw of devices) {
      const d = raw as Record<string, unknown>

      // Device ID — Xcitium may call this id, deviceId, or device_id
      const xcitiumId = (d.id ?? d.deviceId ?? d.device_id) as string | undefined
      if (!xcitiumId) continue

      // Company name from Xcitium — try several field name variants
      const xcCompanyRaw = (d.companyName ?? d.company_name ?? d.company ?? '') as string
      const customerId   = customerMap.get(xcCompanyRaw.toLowerCase().trim()) ?? null

      const deviceName = (d.name ?? d.deviceName ?? d.device_name ?? 'Unknown Device') as string
      const osType     = parseOsType(d.osType as number)

      const category =
        osType === 'windows' || osType === 'macos' || osType === 'linux' ? 'workstation'
        : osType === 'ios'   || osType === 'android'                     ? 'mobile'
        : 'other'

      // Last seen timestamp — try several field name variants
      const lastSeenRaw = d.lastOnlineTime ?? d.last_online_time ?? d.lastSeen ?? d.last_seen ?? null
      const lastSeenTs  = lastSeenRaw
        ? new Date(lastSeenRaw as string | number).toISOString()
        : null

      // Serial number — fall back to xcitiumId so the column is never blank
      const serialNumber = (d.serialNumber ?? d.serial_number ?? d.sn ?? xcitiumId) as string

      const payload = {
        organization_id:   orgId,
        customer_id:       customerId,
        xcitium_device_id: xcitiumId,
        name:              deviceName,
        serial_number:     serialNumber,
        category,
        vendor:            'Xcitium',
        os_type:           osType,
        online_status:     parseOnlineStatus(d.onlineStatus as number),
        av_state:          parseAvState(d.avState),
        patch_status:      parsePatchStatus(d.patchesStatus),
        last_seen_xcitium: lastSeenTs,
        xcitium_synced_at: now,
        status:            'deployed',
        source:            'xcitium_api',
      }

      const { error } = await supabase
        .from('inventory_items')
        .upsert(payload, { onConflict: 'xcitium_device_id', ignoreDuplicates: false })

      if (error) {
        console.error(`Failed to upsert device ${xcitiumId} (${deviceName}):`, error.message)
        errors++
      } else {
        upserted++
      }
    }

    const result = {
      ok:        true,
      total:     devices.length,
      upserted,
      errors,
      synced_at: now,
    }

    console.log('sync-xcitium-devices complete:', result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-xcitium-devices fatal error:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})