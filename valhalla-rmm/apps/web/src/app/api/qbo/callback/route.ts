// @ts-nocheck
// apps/web/src/app/api/qbo/callback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// ── AES-GCM encryption (Web Crypto API — works in Node.js 18+) ────────────────
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

async function encryptToken(plaintext: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(keyHex), { name: 'AES-GCM' }, false, ['encrypt']
  )
  const iv        = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

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
  const { searchParams } = new URL(req.url)
  const code    = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state   = searchParams.get('state')
  const error   = searchParams.get('error')

  if (error) return errorPage('QBO denied access', error)

  const clientId     = process.env.QBO_CLIENT_ID
  const clientSecret = process.env.QBO_CLIENT_SECRET
  const redirectUri  = process.env.QBO_REDIRECT_URI
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encKey       = process.env.QBO_ENCRYPTION_KEY   // optional — tokens stored plaintext if missing
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || 'https://valhalla-rmm.com'

  const missing = [
    !clientId     && 'QBO_CLIENT_ID',
    !clientSecret && 'QBO_CLIENT_SECRET',
    !redirectUri  && 'QBO_REDIRECT_URI',
    !supabaseUrl  && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceKey   && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    return errorPage('Missing Vercel environment variables',
      `Add these in Vercel Dashboard → Settings → Environment Variables:\n\n${missing.map(v => `✗ ${v}`).join('\n')}`)
  }

  if (!code || !realmId) {
    return errorPage('Missing params from QBO', `code: ${code ? '✓' : '✗'}\nrealmId: ${realmId ? '✓' : '✗'}`)
  }

  const cookieStore = cookies()
  const savedState  = cookieStore.get('qbo_oauth_state')?.value
  if (!state || state !== savedState) {
    return errorPage('State mismatch — session may have expired', 'Try connecting again.')
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
    if (!tokenRes.ok) return errorPage(`Token exchange failed (HTTP ${tokenRes.status})`, await tokenRes.text())
    tokens = await tokenRes.json()
  } catch (e) {
    return errorPage('Network error during token exchange', String(e))
  }

  // ── Encrypt tokens before storing ──────────────────────────────────────────
  let accessToken  = tokens.access_token
  let refreshToken = tokens.refresh_token

  if (encKey) {
    try {
      accessToken  = await encryptToken(tokens.access_token, encKey)
      refreshToken = await encryptToken(tokens.refresh_token, encKey)
    } catch (e) {
      console.error('Token encryption failed — storing plaintext as fallback:', e)
      // Fall through and store plaintext — better connected than broken
    }
  }

  // ── Get orgId from session ──────────────────────────────────────────────────
  const supabase = createClient(supabaseUrl!, serviceKey!)
  let orgId: string | null = null

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.includes('auth-token')) continue
    const accessTokenSession = parseSupabaseCookie(cookie.value)
    if (!accessTokenSession) continue
    try {
      const { data: { user } } = await supabase.auth.getUser(accessTokenSession)
      if (user) {
        const { data: member } = await supabase.from('organization_members')
          .select('organization_id').eq('user_id', user.id).single()
        orgId = member?.organization_id ?? null
        if (orgId) break
      }
    } catch { /* try next cookie */ }
  }

  if (!orgId && state?.includes('_')) {
    const candidate = state.split('_').slice(1).join('_')
    if (candidate.length > 30) orgId = candidate
  }

  if (!orgId) {
    return errorPage('Could not identify your organization',
      'Log out of Valhalla RMM, log back in, then try connecting QBO again.')
  }

  // ── Save tokens ─────────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase.from('organizations').update({
    qbo_realm_id:      realmId,
    qbo_access_token:  accessToken,
    qbo_refresh_token: refreshToken,
    qbo_token_expiry:  new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    qbo_connected_at:  new Date().toISOString(),
  }).eq('id', orgId)

  if (updateErr) return errorPage('Failed to save tokens to database', updateErr.message)

  const response = NextResponse.redirect(`${appUrl}/settings?qbo=connected`)
  response.cookies.delete('qbo_oauth_state')
  return response
}
