// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token, score, comment } = await req.json()

    if (!token || !score) return json({ error: 'token and score required' }, 400)
    if (score < 1 || score > 5) return json({ error: 'score must be 1-5' }, 400)

    let tokenData
    try {
      const padded  = token.replace(/-/g, '+').replace(/_/g, '/')
      const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - padded.length % 4)
      tokenData = JSON.parse(atob(padded + padding))
    } catch {
      return json({ error: 'invalid token' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (tokenData.ticketId) {
      const { data: existing } = await supabase.from('csat_responses')
        .select('id').eq('ticket_id', tokenData.ticketId).limit(1)
      if (existing?.length > 0) return json({ alreadySubmitted: true })
    }

    const { error } = await supabase.from('csat_responses').insert({
      organization_id: tokenData.orgId       || null,
      ticket_id:       tokenData.ticketId    || null,
      ticket_title:    tokenData.ticketTitle  || null,
      customer_name:   tokenData.customerName || null,
      contact_email:   tokenData.contactEmail || null,
      score:           Number(score),
      comment:         comment?.trim()        || null,
    })

    if (error) { console.error('Insert error:', error.message); return json({ error: error.message }, 400) }
    return json({ success: true })
  } catch (err) {
    console.error('Error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  })
}