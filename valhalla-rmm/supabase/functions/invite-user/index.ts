// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('invite-user called with:', JSON.stringify({ ...body, organization_id: body.organization_id?.slice(0,8) + '...' }))

    const { email, role, organization_id, redirect_to } = body

    if (!email)           return json({ error: 'email is required' }, 400)
    if (!organization_id) return json({ error: 'organization_id is required' }, 400)

    // Use service role key to invite users
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Send invite via Supabase Admin API
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect_to || `${Deno.env.get('SUPABASE_URL').replace('.supabase.co', '')}/invite`,
      data: { role, organization_id },
    })

    if (inviteError) {
      console.error('inviteUserByEmail error:', inviteError.message)
      // If user already exists, that's ok — just ensure the org_member row exists
      if (!inviteError.message.includes('already been registered')) {
        return json({ error: inviteError.message }, 400)
      }
      console.log('User already exists, ensuring org member row...')
    }

    // Upsert organization_members row
    const userId = inviteData?.user?.id

    if (userId) {
      const { error: memberError } = await supabase
        .from('organization_members')
        .upsert({
          user_id:         userId,
          user_email:      email,
          organization_id,
          role:            role || 'client',
        }, { onConflict: 'user_id,organization_id' })

      if (memberError) {
        console.error('member upsert error:', memberError.message)
        // Non-fatal — the invite was still sent
      }
    } else {
      // User already exists — find their ID and upsert
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === email)
      if (existing) {
        await supabase.from('organization_members').upsert({
          user_id:         existing.id,
          user_email:      email,
          organization_id,
          role:            role || 'client',
        }, { onConflict: 'user_id,organization_id' })
      }
    }

    console.log('Invite sent successfully to:', email)
    return json({ ok: true, email })

  } catch (err) {
    console.error('Unhandled error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...{ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }, 'Content-Type': 'application/json' },
  })
}