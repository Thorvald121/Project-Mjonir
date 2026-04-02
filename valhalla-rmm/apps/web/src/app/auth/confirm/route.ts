// apps/web/src/app/auth/confirm/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')   // invite | recovery | signup | email
  const code       = searchParams.get('code')   // PKCE flow

  const cookieStore = cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()             { return cookieStore.getAll() },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  let sessionEstablished = false

  // ── PKCE code exchange ─────────────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) sessionEstablished = true
  }

  // ── Token hash flow ────────────────────────────────────────────────────────
  if (!sessionEstablished && token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'invite' | 'recovery' | 'signup' | 'email' | 'magiclink',
    })
    if (!error) sessionEstablished = true
  }

  if (!sessionEstablished) {
    // Link is expired or invalid
    return NextResponse.redirect(`${origin}/portal/login?error=link_expired`)
  }

  // ── Determine where to send the user ──────────────────────────────────────
  // For invite and recovery, always send to set-password
  // For email confirmation (existing user), send to portal
  if (type === 'invite' || type === 'recovery' || type === 'signup') {
    return NextResponse.redirect(`${origin}/portal/set-password`)
  }

  return NextResponse.redirect(`${origin}/portal`)
}