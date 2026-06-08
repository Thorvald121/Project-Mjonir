// @ts-nocheck
// apps/web/src/app/api/qbo/connect/route.ts
// Starts the QuickBooks OAuth flow. User hits this URL, gets redirected to Intuit.

import { NextResponse } from 'next/server'

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

export async function GET() {
  const clientId    = process.env.QBO_CLIENT_ID
  const redirectUri = process.env.QBO_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'QBO_CLIENT_ID and QBO_REDIRECT_URI must be set in Vercel env vars' }, { status: 500 })
  }

  const state  = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'com.intuit.quickbooks.accounting',
    state,
  })

  const response = NextResponse.redirect(`${QBO_AUTH_URL}?${params}`)
  // Store state in a short-lived cookie to validate on callback
  response.cookies.set('qbo_oauth_state', state, {
    httpOnly: true,
    secure:   true,
    maxAge:   600, // 10 minutes
    path:     '/',
  })
  return response
}
