// supabase/functions/sync-xcitium-devices/index.ts
// DEBUG VERSION - logs raw Xcitium response so we can fix the field mapping

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const XCITIUM_BASE = 'https://api-gw.itsm-us1.comodo.com/api/v2/itsm'

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

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const token = Deno.env.get('XCITIUM_API_TOKEN')
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'XCITIUM_API_TOKEN secret is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Fire a single page-1 search and return the entire raw response
    // so we can see exactly what Xcitium sends back
    const raw = await xcitiumPost('/devices/search', {
      searchAttributes: [],
      pagination: { page: 0, size: 5 },
      sort: { field: 'name', order: 'asc' },
    }, token)

    // Return the raw response directly — top-level keys and
    // the first device object so we can see the field names
    return new Response(JSON.stringify({
      debug:         true,
      top_level_keys: Object.keys(raw),
      total_field:   raw?.total ?? raw?.totalElements ?? raw?.count ?? raw?.totalCount ?? 'not found',
      first_device:  (raw?.data ?? raw?.content ?? raw?.items ?? raw?.devices ?? raw?.result ?? [])[0] ?? 'no devices in any known array key',
      raw_truncated: JSON.stringify(raw).slice(0, 2000),
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})