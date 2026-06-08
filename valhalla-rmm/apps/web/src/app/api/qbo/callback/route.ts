// @ts-nocheck
// apps/web/src/app/api/qbo/callback/route.ts
// Intuit redirects here after the user approves access.
// Exchanges the auth code for tokens and stores them on the organization.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const realmId  = searchParams.get('realmId')
  const state    = searchParams.get('state')
  const error    = searchParams.get('error')

  // User denied access
  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=denied`)
  }

  // Validate state to prevent CSRF
  const savedState = req.cookies.get('qbo_oauth_state')?.value
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=error&reason=state_mismatch`)
  }

  if (!code || !realmId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=error&reason=missing_params`)
  }

  // Exchange code for tokens
  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Accept':        'application/json',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('QBO token exchange failed:', body)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=error&reason=token_exchange`)
  }

  const tokens = await tokenRes.json()

  // Save tokens to the organization in Supabase (service role — bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get the current user to find their org
  const authHeader = req.headers.get('cookie') || ''
  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  // Use service role to find the org from the session cookie
  // We'll look up the org by matching the connection window
  // Best approach: get the user from the Supabase session header
  let orgId: string | null = null

  // Try getting user from supabase-auth-token cookie
  const cookieHeader = req.headers.get('cookie') || ''
  const sbToken      = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)?.[1]
  if (sbToken) {
    try {
      const decoded = JSON.parse(decodeURIComponent(sbToken))
      const accessToken = Array.isArray(decoded) ? decoded[0] : decoded?.access_token
      if (accessToken) {
        const { data: { user: u } } = await supabase.auth.getUser(accessToken)
        if (u) {
          const { data: member } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', u.id)
            .single()
          orgId = member?.organization_id ?? null
        }
      }
    } catch (e) {
      console.error('Error parsing session cookie:', e)
    }
  }

  if (!orgId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=error&reason=no_org`)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  const { error: updateErr } = await supabase
    .from('organizations')
    .update({
      qbo_realm_id:      realmId,
      qbo_access_token:  tokens.access_token,
      qbo_refresh_token: tokens.refresh_token,
      qbo_token_expiry:  expiresAt.toISOString(),
      qbo_connected_at:  new Date().toISOString(),
    })
    .eq('id', orgId)

  if (updateErr) {
    console.error('Failed to save QBO tokens:', updateErr)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=error&reason=save_failed`)
  }

  const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?qbo=connected`)
  response.cookies.delete('qbo_oauth_state')
  return response
}
