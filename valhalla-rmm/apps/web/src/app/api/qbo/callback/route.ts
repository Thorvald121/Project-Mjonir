// @ts-nocheck
// apps/web/src/app/api/qbo/callback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

function errorPage(title: string, detail: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:monospace;padding:40px;max-width:600px">
    <h2 style="color:#dc2626">QBO Connection Error</h2>
    <p><strong>${title}</strong></p>
    <pre style="background:#f1f5f9;padding:16px;border-radius:8px;white-space:pre-wrap">${detail}</pre>
    <p style="margin-top:24px"><a href="/api/qbo/connect" style="background:#f59e0b;color:white;padding:8px 16px;border-radius:8px;text-decoration:none">Try connecting again</a></p>
    </body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html' } }
  )
}

// Supabase stores session cookies as "base64-{base64encodedJSON}" in newer versions
function parseSupabaseCookie(raw: string): string | null {
  try {
    let val = decodeURIComponent(raw)
    // Handle base64-encoded format: "base64-eyJ..."
    if (val.startsWith('base64-')) {
      val = Buffer.from(val.slice(7), 'base64').toString('utf-8')
    }
    const parsed = JSON.parse(val)
    // Could be [accessToken, refreshToken] array or { access_token: '...' }
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    if (parsed?.access_token) return parsed.access_token
    return null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code    = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state   = searchParams.get('state')
  const error   = searchParams.get('error')

  if (error) return errorPage('QBO denied access', error)

  // ── Validate env vars ───────────────────────────────────────────────────────
  const clientId     = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  const redirectUri  = process.env.QBO_REDIRECT_URI
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || 'https://valhalla-rmm.com'

  const missing = [
    !clientId     && 'QBO_CLIENT_ID',
    !clientSecret && 'QBO_CLIENT_SECRET',
    !redirectUri  && 'QBO_REDIRECT_URI',
    !supabaseUrl  && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceKey   && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    return errorPage(
      'Missing Vercel environment variables',
      `These must be set in Vercel Dashboard → Settings → Environment Variables:\n\n${missing.map(v => `✗ ${v}`).join('\n')}`
    )
  }

  if (!code || !realmId) {
    return errorPage('Missing params from QBO', `code: ${code ? '✓' : '✗ missing'}\nrealmId: ${realmId ? '✓' : '✗ missing'}`)
  }

  // ── Validate CSRF state ─────────────────────────────────────────────────────
  const cookieStore = cookies()
  const savedState  = cookieStore.get('qbo_oauth_state')?.value
  if (!state || state !== savedState) {
    return errorPage(
      'State mismatch — session may have expired',
      `Try connecting again. State cookies expire after 10 minutes.`
    )
  }

  // ── Exchange code for tokens ────────────────────────────────────────────────
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  let tokens: any
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Accept':        'application/json',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri! }),
    })
    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      return errorPage(`Token exchange failed (HTTP ${tokenRes.status})`, body)
    }
    tokens = await tokenRes.json()
  } catch (e) {
    return errorPage('Network error during token exchange', String(e))
  }

  // ── Get orgId from session cookie ───────────────────────────────────────────
  const supabase = createClient(supabaseUrl!, serviceKey!)
  let orgId: string | null = null

  // Method 1: Parse Supabase auth cookie (handles both JSON and base64 formats)
  const allCookies = cookieStore.getAll()
  for (const cookie of allCookies) {
    if (!cookie.name.includes('auth-token')) continue
    const accessToken = parseSupabaseCookie(cookie.value)
    if (!accessToken) continue
    try {
      const { data: { user } } = await supabase.auth.getUser(accessToken)
      if (user) {
        const { data: member } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()
        orgId = member?.organization_id ?? null
        if (orgId) break
      }
    } catch { /* try next cookie */ }
  }

  // Method 2: Extract orgId encoded in state by connect route ({uuid}_{orgId})
  if (!orgId && state?.includes('_')) {
    const parts = state.split('_')
    // state format from connect route: "{uuid}_{orgId}" where orgId is a UUID
    // UUID is 36 chars, so if parts[1] looks like a UUID, use it
    const candidate = parts.slice(1).join('_')
    if (candidate.length > 30) orgId = candidate
  }

  if (!orgId) {
    const cookieNames = allCookies.map(c => c.name).join('\n')
    return errorPage(
      'Could not identify your organization',
      `No valid session found. Try: log out of Valhalla RMM, log back in, then connect QBO again.\n\nCookies found:\n${cookieNames}`
    )
  }

  // ── Save tokens ─────────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('organizations')
    .update({
      qbo_realm_id:      realmId,
      qbo_access_token:  tokens.access_token,
      qbo_refresh_token: tokens.refresh_token,
      qbo_token_expiry:  new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      qbo_connected_at:  new Date().toISOString(),
    })
    .eq('id', orgId)

  if (updateErr) return errorPage('Failed to save tokens to database', updateErr.message)

  const response = NextResponse.redirect(`${appUrl}/settings?qbo=connected`)
  response.cookies.delete('qbo_oauth_state')
  return response
}
