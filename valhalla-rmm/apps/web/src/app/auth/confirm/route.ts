// apps/web/src/app/auth/confirm/route.ts
// Handles Supabase email confirmation links (invite, recovery, signup)
// Supabase sends users here via redirectTo in the email
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const code       = searchParams.get('code')

  const cookieStore = cookies()
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()                 { return cookieStore.getAll() },
        setAll(cookiesToSet)     { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // Handle PKCE code exchange (newer Supabase flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Successfully exchanged — redirect to portal login which will detect the session
      // and show the set-password form
      const isPortalInvite = searchParams.get('next')?.startsWith('/portal') ||
                             type === 'invite' || type === 'recovery'
      if (isPortalInvite || type === 'invite' || type === 'recovery') {
        return NextResponse.redirect(new URL('/portal/login?verified=1', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Handle token_hash flow
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any })
    if (!error) {
      // For invite/recovery types, go to portal set-password page
      if (type === 'invite' || type === 'recovery' || type === 'signup') {
        return NextResponse.redirect(new URL('/portal/set-password', request.url))
      }
      return NextResponse.redirect(new URL('/portal', request.url))
    }
  }

  // Something went wrong — send to portal login with error flag
  return NextResponse.redirect(new URL('/portal/login?error=link_expired', request.url))
}