// supabase/functions/sync-xcitium-devices/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XCITIUM_BASE = 'https://api-gw.itsm-us1.comodo.com/api/v2/itsm'
const PAGE_SIZE    = 100

// ── OS type int → readable string ─────────────────────────────────────────────
// Confirmed from live API response: MacBook Air = os_type 4
function parseOsType(v: number | undefined): string {
  const map: Record<number, string> = {
    1: 'windows',
    2: 'linux',
    3: 'android',
    4: 'macos',
    5: 'ios',
    6: 'apple_tv',
  }
  return map[v ?? -1] ?? 'unknown'
}

// ── AV state from active_components.AV ────────────────────────────────────────
// active_components.AV is an int — 1 = active, 3 = active (observed), 0 = inactive
function parseAvState(v: number | string | undefined): string {
  if (v === null || v === undefined) return 'unknown'
  const n = Number(v)
  if (n >= 1) return 'active'
  if (n === 0) return 'inactive'
  return 'unknown'
}

// ── Patch status from patches_status ──────────────────────────────────────────
function parsePatchStatus(v: number | string | undefined): string {
  if (v === null || v === undefined) return 'unknown'
  const s = String(v)
  if (s === '0') return 'up_to_date'
  if (s === '1') return 'pending'
  if (s === '2') return 'failed'
  return 'unknown'
}

// ── Xcitium POST helper ────────────────────────────────────────────────────────
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

// ── Fetch every device across all pages ───────────────────────────────────────
async function fetchAllDevices(token: string): Promise<unknown[]> {
  const all: unknown[] = []
  let page = 0

  while (true) {
    const json = await xcitiumPost('/devices/search', {
      searchAttributes: [],
      pagination: { page, size: PAGE_SIZE },
      sort: { field: 'name', order: 'asc' },
    }, token)

    // Xcitium wraps the entire response in "$I"
    const inner = json?.['$I'] ?? json
    const items: unknown[] = inner?.data ?? inner?.content ?? inner?.items ?? []
    all.push(...items)

    if (items.length < PAGE_SIZE) break
    page++

    // Hard cap
    if (all.length >= 10_000) break
  }

  return all
}

// ── Main handler ───────────────────────────────────────────────────────────────
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

  // Get organization ID
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

  // Build customer name → id lookup from our DB
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

      // Use UUID as the stable device identifier
      const xcitiumId = (d.uuid ?? d.id) as string | undefined
      if (!xcitiumId) continue

      // Company is a nested object: { name, id, email, ... }
      const company    = d.company as Record<string, unknown> | undefined
      const xcCompany  = (company?.name ?? '') as string
      const customerId = customerMap.get(xcCompany.toLowerCase().trim()) ?? null

      const deviceName = (d.friendly_name ?? d.name ?? 'Unknown Device') as string
      const osType     = parseOsType(d.os_type as number)

      const category =
        osType === 'windows' || osType === 'macos' || osType === 'linux' ? 'workstation'
        : osType === 'ios'   || osType === 'android'                     ? 'mobile'
        : 'other'

      // Serial number is nested under hardware: { serial_number, ... }
      const hardware     = d.hardware as Record<string, unknown> | undefined
      const serialNumber = (hardware?.serial_number ?? xcitiumId) as string

      // was_active_at is a Unix timestamp in seconds
      const wasActiveAt = d.was_active_at as number | undefined
      const lastSeenTs  = wasActiveAt
        ? new Date(wasActiveAt * 1000).toISOString()
        : null

      // is_online is a direct boolean from the API
      const onlineStatus = d.is_online === true ? 'online' : 'offline'

      // AV state is nested under active_components: { AV: int, AG: int, ... }
      const activeComponents = d.active_components as Record<string, unknown> | undefined
      const avState          = parseAvState(activeComponents?.AV as number)

      const patchStatus = parsePatchStatus(d.patches_status as number)

      const payload = {
        organization_id:   orgId,
        customer_id:       customerId,
        xcitium_device_id: String(xcitiumId),
        name:              deviceName,
        serial_number:     serialNumber,
        category,
        vendor:            'Xcitium',
        model:             (d.model ?? '') as string,
        os_type:           osType,
        online_status:     onlineStatus,
        av_state:          avState,
        patch_status:      patchStatus,
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