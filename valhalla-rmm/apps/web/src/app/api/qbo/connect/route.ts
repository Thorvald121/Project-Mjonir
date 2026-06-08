// @ts-nocheck
// apps/web/src/app/api/qbo/connect/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

function parseSupabaseCookie(raw: string): string | null {
  try {
    let val = decodeURIComponent(raw)
    if (val.startsWith('base64-')) {
      val = Buffer.from(val.slice(7), 'base64').toString('utf-8')
    }
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    if (parsed?.access_token) return parsed.access_token
    return null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const clientId    = process.env.QBO_CLIENT_ID
  const redirectUri = process.env.QBO_REDIRECT_URI
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  // ── Validate env vars ───────────────────────────────────────────────────────
  if (!clientId || !redirectUri) {
    return new NextResponse(
      `Missing Vercel env vars:\n${!clientId ? '✗ QBO_CLIENT_ID\n' : ''}${!redirectUri ? '✗ QBO_REDIRECT_URI\n' : ''}\nAdd them in Vercel Dashboard → Settings → Environment Variables.`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  // ── Verify the caller is an authenticated Valhalla user ─────────────────────
  // Blocks anyone who isn't logged in from starting an OAuth flow
  if (!supabaseUrl || !serviceKey) {
    return new NextResponse('Server misconfiguration: missing Supabase credentials', { status: 500 })
  }

  const cookieStore = cookies()
  const supabase    = createClient(supabaseUrl, serviceKey)
  let authenticated = false
  let orgIdSuffix   = ''

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.includes('auth-token')) continue
    const accessToken = parseSupabaseCookie(cookie.value)
    if (!accessToken) continue
    try {
      const { data: { user } } = await supabase.auth.getUser(accessToken)
      if (user) {
        authenticated = true
        // Encode orgId into state so the callback can find the org reliably
        const { data: member } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()
        if (member?.organization_id) {
          orgIdSuffix = `_${member.organization_id}`
        }
      }
    } catch { /* ignore and try next cookie */ }
    break
  }

  if (!authenticated) {
    return new NextResponse('Unauthorized — log in to Valhalla RMM first', { status: 401 })
  }

  // ── Build OAuth redirect ────────────────────────────────────────────────────
  const state  = `${crypto.randomUUID()}${orgIdSuffix}`
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'com.intuit.quickbooks.accounting',
    state,
  })

  const response = NextResponse.redirect(`${QBO_AUTH_URL}?${params}`)
  response.cookies.set('qbo_oauth_state', state, {
    httpOnly: true,
    secure:   true,
    maxAge:   600, // 10 minutes
    path:     '/',
  })
  return response
}
