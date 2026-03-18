import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, role, organization_id, redirect_to } = await req.json()

    if (!email || !role || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'email, role, and organization_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if already a member
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_email', email)
      .eq('organization_id', organization_id)
      .single()

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'This user is already a member of your organization.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send Supabase invite email
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect_to ?? `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '')}/invite`,
      data: { organization_id, role }
    })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pre-create org member row so their role is set when they accept
    await supabase.from('organization_members').upsert({
      organization_id,
      user_id:    data.user.id,
      user_email: email,
      role,
    }, { onConflict: 'user_id,organization_id' })

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})